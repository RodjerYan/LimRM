
import * as xlsx from 'xlsx';
import { parse as PapaParse, type ParseResult, type ParseMeta } from 'papaparse';
import { 
    AggregatedDataRow, 
    OkbDataRow, 
    WorkerMessage, 
    PotentialClient, 
    WorkerResultPayload, 
    MapPoint, 
    CoordsCache,
    EnrichedParsedAddress,
    UnidentifiedRow,
} from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../utils/dataUtils';
import { getDistanceKm } from '../utils/analytics';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Map<string, MapPoint> } };

type OkbCoordIndex = Map<string, { lat: number; lon: number }>;
type CommonProcessArgs = {
    okbData: OkbDataRow[];
    cacheData: CoordsCache;
    postMessage: PostMessageFn;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determines the Canonical Region Name for a given data row (Sales or OKB).
 */
const getCanonicalRegion = (row: any): string => {
    // 1. Search for relevant columns. Priority: Subject > Region > Oblast
    const subjectValue = findValueInRow(row, ['субъект', 'subject', 'регион', 'region', 'область']);

    if (subjectValue && subjectValue.trim()) {
        const cleanVal = subjectValue.trim();
        
        // Initial cleaning: lower case, normalize e, replace punctuation with space
        let lowerVal = cleanVal.toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[.,]/g, ' ')
            .replace(/\s+/g, ' ');

        // Strict Normalization: Remove 'г', 'г.', 'гор', 'гор.', 'город' prefixes and suffixes
        const normalized = lowerVal
            .replace(/^(г|гор|город)[.\s]+/g, '') 
            .replace(/\s+(г|гор|город)$/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Explicit check for Orel/Orel variations to ensure mapping to Orlovskaya Oblast
        if (["орел", "орёл", "orel"].includes(normalized)) {
            return "Орловская область";
        }

        // Direct mapping check against known variations.
        if (REGION_KEYWORD_MAP[normalized]) {
            return REGION_KEYWORD_MAP[normalized];
        }

        // Priority 2: Keyword search
        for (const [key, standardName] of Object.entries(REGION_KEYWORD_MAP)) {
            if (normalized.startsWith(key)) {
                return standardName;
            }
            if (lowerVal.includes(key)) {
                return standardName;
            }
        }
        
        return standardizeRegion(cleanVal);
    }

    // 2. Fallback: Parse the address string ONLY if region column is missing.
    const address = findAddressInRow(row);
    const distributor = findValueInRow(row, ['дистрибьютор']);
    
    if (address || distributor) {
        try {
            const parsed = parseRussianAddress(address || '', distributor);
            if (parsed.region && parsed.region !== 'Регион не определен') {
                return standardizeRegion(parsed.region);
            }
        } catch (e) { /* ignore */ }
    }

    // 3. Final Fallback: Check keywords in address directly if parsing failed
    if (address) {
        const lowerAddr = address.toLowerCase();
        for (const [key, standardName] of Object.entries(REGION_KEYWORD_MAP)) {
            if (lowerAddr.includes(key)) {
                return standardName;
            }
        }
    }

    return 'Регион не определен';
};


const createOkbCoordIndex = (okbData: OkbDataRow[]): OkbCoordIndex => {
    const coordIndex: OkbCoordIndex = new Map();
    if (!okbData) return coordIndex;

    for (const row of okbData) {
        const address = findAddressInRow(row);
        const lat = row.lat;
        const lon = row.lon;
        
        if (address && lat && lon && !isNaN(lat) && !isNaN(lon)) {
            const normalized = normalizeAddress(address);
            if (normalized && !coordIndex.has(normalized)) {
                coordIndex.set(normalized, { lat, lon });
            }
        }
    }
    return coordIndex;
};

/**
 * Optimized: Finds potential clients from a pre-filtered list of OKB rows for a specific region.
 * Uses Geo-Radius matching (150m) and robust string normalization to exclude existing clients.
 */
function findPotentialClients(
    regionOkbRows: OkbDataRow[] | undefined, 
    activeClientsInRegion: MapPoint[] | undefined
): PotentialClient[] {
    if (!regionOkbRows || regionOkbRows.length === 0) return [];

    const potential: PotentialClient[] = [];
    
    // Prepare lookups for Active Clients in this region
    const activeAddressSet = new Set<string>();
    const activeCoords: { lat: number, lon: number }[] = [];

    if (activeClientsInRegion) {
        activeClientsInRegion.forEach(c => {
            activeAddressSet.add(normalizeAddress(c.address));
            if (c.lat && c.lon) {
                activeCoords.push({ lat: c.lat, lon: c.lon });
            }
        });
    }

    // Iterate OKB rows
    for (const okbRow of regionOkbRows) {
        const okbAddress = findAddressInRow(okbRow) || '';
        if (!okbAddress) continue;

        let isMatch = false;

        // 1. Geo-Radius Match (if OKB has coords): Check if within 150m (0.15km) of any active client
        if (okbRow.lat && okbRow.lon && !isNaN(okbRow.lat) && !isNaN(okbRow.lon)) {
            for (const activeCoord of activeCoords) {
                const dist = getDistanceKm(okbRow.lat, okbRow.lon, activeCoord.lat, activeCoord.lon);
                if (dist < 0.15) { 
                    isMatch = true;
                    break;
                }
            }
        }

        // 2. String Match (if no geo match found or possible): Check normalized string
        if (!isMatch) {
            const normalizedOkb = normalizeAddress(okbAddress);
            if (activeAddressSet.has(normalizedOkb)) {
                isMatch = true;
            }
        }

        // If no match found in Active Clients, this is a Potential Client
        if (!isMatch) {
            const client: PotentialClient = {
                name: findValueInRow(okbRow, ['наименование', 'клиент']) || 'Без названия',
                address: okbAddress,
                type: findValueInRow(okbRow, ['вид деятельности', 'тип']) || 'н/д',
            };
            if(okbRow.lat && okbRow.lon) {
                client.lat = okbRow.lat;
                client.lon = okbRow.lon;
            }
            potential.push(client);
        }
        
        if (potential.length >= 200) break; // Limit potential list per region for performance
    }
    return potential;
}


const findClientNameHeader = (headers: string[]): string | undefined => {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    const priorityTerms = [
        'название магазина limkorm', 
        'название клиента', 
        'наименование клиента', 
        'контрагент', 
        'клиент', 
        'уникальное наименование товара'
    ];
    
    for (const term of priorityTerms) {
        const foundIndex = lowerHeaders.findIndex(h => h.includes(term));
        if (foundIndex !== -1) return headers[foundIndex];
    }
    
    const nameColumns = headers.filter(h => h.toLowerCase().trim().includes('наименование'));
    if (nameColumns.length > 0) {
        const cleanNameColumn = nameColumns.find(h => {
            const lH = h.toLowerCase().trim();
            return !lH.includes('номенклатур') && !lH.includes('товар') && !lH.includes('продук');
        });
        return cleanNameColumn || nameColumns[0];
    }
    
    return undefined;
};


self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[], cacheData: CoordsCache }>) => {
    const { file, okbData, cacheData } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        const commonArgs = { okbData, cacheData, postMessage };
        if (file.name.toLowerCase().endsWith('.csv')) {
            await processCsv(file, commonArgs);
        } else {
            await processXlsx(file, commonArgs);
        }
    } catch (error) {
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};

async function processFile(jsonData: any[], headers: string[], { okbData, cacheData, postMessage }: CommonProcessArgs) {
    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');

    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase().includes('потенциал'));
    if (!headers.some(h => (h || '').toLowerCase().includes('вес'))) throw new Error('Файл должен содержать колонку "Вес".');
    const clientNameHeader = findClientNameHeader(headers);
    
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация данных...' } });
    const okbCoordIndex = createOkbCoordIndex(okbData);
    
    // --- PRE-GROUP OKB BY REGION ---
    const okbRegionCounts: { [key: string]: number } = {};
    const okbByRegion: Record<string, OkbDataRow[]> = {};

    if (okbData) {
        okbData.forEach(row => {
            const canonicalRegion = getCanonicalRegion(row);
            if (canonicalRegion && canonicalRegion !== 'Регион не определен') {
                okbRegionCounts[canonicalRegion] = (okbRegionCounts[canonicalRegion] || 0) + 1;
                
                if (!okbByRegion[canonicalRegion]) {
                    okbByRegion[canonicalRegion] = [];
                }
                okbByRegion[canonicalRegion].push(row);
            }
        });
    }

    // --- CACHE INITIALIZATION with Redirects ---
    const cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string; isInvalid?: boolean }>();
    const cacheRedirectMap = new Map<string, string>(); // normalizedOld -> normalizedTarget
    const deletedAddresses = new Set<string>();

    if (cacheData) {
        for (const rm of Object.keys(cacheData)) {
            for (const item of cacheData[rm]) {
                if (!item.address) continue;

                const normalizedTarget = normalizeAddress(item.address);

                if (item.isDeleted) {
                    deletedAddresses.add(normalizedTarget);
                    continue;
                }

                // Store canonical entry
                if (!cacheAddressMap.has(normalizedTarget)) {
                    cacheAddressMap.set(normalizedTarget, { 
                        lat: item.lat, 
                        lon: item.lon, 
                        originalAddress: item.address,
                        isInvalid: item.isInvalid
                    });
                }

                // Parse history for redirects
                if (item.history) {
                    const historyEntries = String(item.history)
                        .replace(/\u00A0/g, ' ')
                        .replace(/&nbsp;/g, ' ')
                        .split(/\r?\n|\s*\|\|\s*|<br\s*\/?>/i)
                        .map(s => s.trim())
                        .filter(Boolean);

                    for (const entry of historyEntries) {
                        const oldAddrRaw = entry.split('[')[0].trim();
                        if (!oldAddrRaw) continue;
                        
                        const normalizedOld = normalizeAddress(oldAddrRaw);
                        // If the old address matches the current canonical one, it's not a redirect, just a variant/duplicate
                        if (normalizedOld && normalizedOld !== normalizedTarget) {
                            cacheRedirectMap.set(normalizedOld, normalizedTarget);
                        }
                    }
                }
            }
        }
    }
    console.log('[CACHE LOAD] addresses=', cacheAddressMap.size, 'redirects=', cacheRedirectMap.size, 'deleted=', deletedAddresses.size);
    postMessage({ type: 'progress', payload: { percentage: 10, message: `Кэш обработан: ${cacheAddressMap.size} записей.` } });

    const aggregatedData: AggregationMap = {};
    const uniquePlottableClients = new Map<string, MapPoint>();
    const newAddressesToCache: { [rmName: string]: { address: string }[] } = {};
    const addressesToGeocode: { [rmName: string]: string[] } = {};
    const unidentifiedRows: UnidentifiedRow[] = [];

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rm = findValueInRow(row, ['рм']);

        if (i > 0 && i % 5000 === 0) {
            const percentage = 10 + Math.round((i / jsonData.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработка: ${i.toLocaleString('ru-RU')}...` } });
        }
        
        let clientAddress = findAddressInRow(row);
        const distributor = findValueInRow(row, ['дистрибьютор', 'дистрибьютер']);
        if ((!clientAddress || clientAddress.trim() === '') && (!distributor || distributor.trim() === '')) continue;
        if (!rm) {
            unidentifiedRows.push({ rm: 'РМ не указан', rowData: row, originalIndex: i });
            continue;
        }

        // --- REDIRECT & DELETE LOGIC ---
        let normalizedRaw = clientAddress ? normalizeAddress(clientAddress) : '';
        if (clientAddress) {
            // 1. Check if explicitly deleted
            if (deletedAddresses.has(normalizedRaw)) continue;

            // 2. Check for Redirect (History)
            if (cacheRedirectMap.has(normalizedRaw)) {
                const newNormalizedTarget = cacheRedirectMap.get(normalizedRaw)!;
                const targetEntry = cacheAddressMap.get(newNormalizedTarget);
                
                if (targetEntry) {
                    clientAddress = targetEntry.originalAddress || clientAddress;
                    normalizedRaw = newNormalizedTarget;
                } else {
                    normalizedRaw = newNormalizedTarget;
                }

                if (deletedAddresses.has(normalizedRaw)) continue;
            }
        }

        // 1. Determine Canonical Region from columns FIRST
        const regionFromColumns = getCanonicalRegion(row);
        
        // 2. Parse Address
        const parsedAddress: EnrichedParsedAddress = parseRussianAddress(clientAddress || '', distributor);
        
        // 3. Check Cache availability
        // We re-use normalizedRaw which is derived from the (potentially redirected) clientAddress
        const cacheEntry = cacheAddressMap.get(normalizedRaw);
        
        // Check if the cached entry is explicitly invalid (e.g. "Не найдено" in sheet)
        if (cacheEntry && cacheEntry.isInvalid) {
             unidentifiedRows.push({ rm, rowData: row, originalIndex: i });
             continue;
        }

        // Validation Logic: Accept row if we have City OR Region OR Cache
        const isCityFound = parsedAddress.city !== 'Город не определен';
        const isRegionFound = regionFromColumns !== 'Регион не определен' || (parsedAddress.region !== 'Регион не определен');
        const isCached = !!(cacheEntry && cacheEntry.lat !== undefined && cacheEntry.lon !== undefined);

        // Reject only if we know NOTHING about location and have no cached coordinates
        // Reverted the strict check for cache. Now we allow rows if we at least know the Region/City, 
        // even if coordinates are missing (they will just not show on map but appear in charts).
        if (!isCityFound && !isRegionFound && !isCached) {
            unidentifiedRows.push({ rm, rowData: row, originalIndex: i });
            continue;
        }

        const regionForAggregation = regionFromColumns !== 'Регион не определен' ? regionFromColumns : parsedAddress.region;
        // If city is unknown but we proceed (due to Region or Cache), default group name to Region or generic fallback
        const groupNameForAggregation = isCityFound ? parsedAddress.city : (regionForAggregation !== 'Регион не определен' ? regionForAggregation : 'Неопределенный город');
        
        // We use the enriched final address for display if available, otherwise the potentially redirected one
        const finalAddress = parsedAddress.finalAddress || clientAddress || '';
        
        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
        const brand = findValueInRow(row, ['торговая марка']) || 'Бренд не указан';
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';

        if (isNaN(weight)) continue;
        
        // Updated Key to include Packaging
        const key = `${regionForAggregation}-${brand}-${packaging}-${rm}`.toLowerCase();
        
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${regionForAggregation} (${brand} - ${packaging})`, brand, packaging, rm, city: groupNameForAggregation,
                region: regionForAggregation, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Map<string, MapPoint>(),
            };
        }
        aggregatedData[key].fact += weight;

        if (hasPotentialColumn) {
            const potential = parseFloat(String(findValueInRow(row, ['потенциал']) || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }

        // --- Map Point Logic ---
        // We rely on normalizedRaw for cache lookup consistency
        
        // Use normalizedRaw as key to avoid duplicates if finalAddress varies slightly but means the same
        if (!uniquePlottableClients.has(normalizedRaw)) {
            let lat: number | undefined;
            let lon: number | undefined;
            let isCachedFlag = false;
            
            let displayAddress = finalAddress;

            if (isCached && cacheEntry) {
                lat = cacheEntry.lat;
                lon = cacheEntry.lon;
                isCachedFlag = true;
                if (cacheEntry.originalAddress) {
                    displayAddress = cacheEntry.originalAddress;
                }
            } else {
                if (!newAddressesToCache[rm]) newAddressesToCache[rm] = [];
                // Cache the display address for future consistency
                if (finalAddress && !newAddressesToCache[rm].some(item => item.address === finalAddress)) {
                    newAddressesToCache[rm].push({ address: finalAddress });
                }

                const okbEntry = okbCoordIndex.get(normalizedRaw);
                if (okbEntry) {
                    lat = okbEntry.lat;
                    lon = okbEntry.lon;
                } else if (finalAddress && !isCachedFlag) {
                    if (!addressesToGeocode[rm]) addressesToGeocode[rm] = [];
                    if (!addressesToGeocode[rm].includes(finalAddress)) {
                        addressesToGeocode[rm].push(finalAddress);
                    }
                }
            }
            
            uniquePlottableClients.set(normalizedRaw, {
                key: normalizedRaw,
                lat, lon, isCached: isCachedFlag,
                status: 'match',
                name: clientName,
                address: displayAddress, 
                city: groupNameForAggregation,
                region: regionForAggregation, 
                rm, brand, packaging,
                type: findValueInRow(row, ['канал продаж']),
                contacts: findValueInRow(row, ['контакты']),
                originalRow: row,
                fact: weight, 
            });
        } else {
             const existing = uniquePlottableClients.get(normalizedRaw);
             if (existing) {
                 existing.fact = (existing.fact || 0) + weight;
             }
        }
        
        const mapPointForGroup = uniquePlottableClients.get(normalizedRaw);
        if (mapPointForGroup) {
            aggregatedData[key].clients.set(mapPointForGroup.key, mapPointForGroup);
        }
    }

    postMessage({ type: 'progress', payload: { percentage: 90, message: 'ABC-анализ клиентов...' } });
    
    const plottableActiveClients = Array.from(uniquePlottableClients.values());
    
    // Calculate ABC categories
    const totalFact = plottableActiveClients.reduce((sum, client) => sum + (client.fact || 0), 0);
    if (totalFact > 0) {
        plottableActiveClients.sort((a, b) => (b.fact || 0) - (a.fact || 0));
        let runningTotal = 0;
        plottableActiveClients.forEach(client => {
            runningTotal += (client.fact || 0);
            const percentage = runningTotal / totalFact;
            if (percentage <= 0.80) client.abcCategory = 'A';
            else if (percentage <= 0.95) client.abcCategory = 'B';
            else client.abcCategory = 'C';
        });
    }

    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Анализ пересечений с ОКБ...' } });
    
    // Group Active Clients by Region for efficient matching
    const activeClientsByRegion = new Map<string, MapPoint[]>();
    plottableActiveClients.forEach(c => {
        if (!activeClientsByRegion.has(c.region)) activeClientsByRegion.set(c.region, []);
        activeClientsByRegion.get(c.region)!.push(c);
    });
    
    // Cache for potential clients to avoid re-calculating for the same region multiple times
    const potentialClientsCache = new Map<string, PotentialClient[]>();

    const finalData: AggregatedDataRow[] = [];
    for (const item of Object.values(aggregatedData)) {
        let potential = item.potential;
        if (!hasPotentialColumn) potential = item.fact * 1.15;
        else if (potential < item.fact) potential = item.fact;
        
        // OPTIMIZATION: Memoize potential clients lookup
        let regionPotentialClients = potentialClientsCache.get(item.region);
        if (!regionPotentialClients) {
            // Pass both the OKB rows for this region AND the Active Clients for this region
            const activeInRegion = activeClientsByRegion.get(item.region);
            regionPotentialClients = findPotentialClients(okbByRegion[item.region], activeInRegion);
            potentialClientsCache.set(item.region, regionPotentialClients);
        }

        finalData.push({
            ...item, potential,
            growthPotential: Math.max(0, potential - item.fact),
            growthPercentage: potential > 0 ? (Math.max(0, potential - item.fact) / potential) * 100 : 0,
            potentialClients: regionPotentialClients,
            clients: Array.from(item.clients.values()) 
        });
    }

    const resultPayload: WorkerResultPayload = { aggregatedData: finalData, plottableActiveClients, unidentifiedRows, okbRegionCounts };
    postMessage({ type: 'result', payload: resultPayload });

    // --- BACKGROUND TASKS ---
    const newAddressRMs = Object.keys(newAddressesToCache);
    if (newAddressRMs.length > 0) {
        postMessage({ type: 'progress', payload: { percentage: 99, message: 'Добавление новых адресов в кэш...', isBackground: true } });
        for (const rmName of newAddressRMs) {
            try {
                await fetch('/api/add-to-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rmName, rows: newAddressesToCache[rmName] }) });
            } catch (e) { console.error(`Failed to add to cache for ${rmName}:`, e); }
        }
    }

    const geocodeRMs = Object.keys(addressesToGeocode);
    if (geocodeRMs.length > 0) {
        postMessage({ type: 'progress', payload: { percentage: 99, message: 'Запуск геокодирования...', isBackground: true } });
        for (const rmName of geocodeRMs) {
            const updates: { address: string, lat: number, lon: number }[] = [];
            const addresses = addressesToGeocode[rmName];
            for (let i = 0; i < addresses.length; i++) {
                const address = addresses[i];
                postMessage({ type: 'progress', payload: { percentage: 99, message: `Геокодирование (${i + 1}/${addresses.length}): ${address.substring(0, 30)}...`, isBackground: true } });
                
                let coords: { lat: number, lon: number } | null = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const response = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
                        if (response.ok) {
                            coords = await response.json();
                            break;
                        }
                    } catch (e) { console.error(`Geocode attempt ${attempt} failed for ${address}:`, e); }
                    if (attempt < 3) await sleep(5000);
                }
                if (coords) updates.push({ address, ...coords });
            }

            if (updates.length > 0) {
                postMessage({ type: 'progress', payload: { percentage: 99, message: `Обновление ${updates.length} координат для ${rmName}...`, isBackground: true } });
                try {
                     await fetch('/api/update-coords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rmName, updates }) });
                } catch (e) { console.error(`Failed to update coords for ${rmName}:`, e); }
            }
        }
    }
    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Фоновые задачи завершены.', isBackground: true } });
}


async function processXlsx(file: File, args: CommonProcessArgs) {
    args.postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла XLSX...' } });
    const data = await file.arrayBuffer();
    const workbook = xlsx.read(data, { type: 'array', cellDates: false, cellNF: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
    const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
    
    await processFile(jsonData, headers, args);
}


async function processCsv(file: File, args: CommonProcessArgs) {
    args.postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла CSV...' } });
    
    const parsePromise = new Promise<{ data: any[], meta: ParseMeta }>((resolve, reject) => {
        PapaParse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: ParseResult<any>) => {
                if (results.errors.length > 0) console.warn('CSV parsing errors:', results.errors);
                resolve({ data: results.data, meta: results.meta });
            },
            error: (error: Error) => reject(error)
        });
    });

    try {
        const { data: jsonData, meta } = await parsePromise;
        if (!jsonData || jsonData.length === 0) throw new Error("CSV файл пуст или не удалось его прочитать.");
        const headers = meta.fields || Object.keys(jsonData[0] || {});
        await processFile(jsonData, headers, args);
    } catch (error) {
        throw new Error(`Failed to parse CSV file: ${(error as Error).message}`);
    }
}