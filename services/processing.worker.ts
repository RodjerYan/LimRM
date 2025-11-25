
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
import { standardizeRegion, REGION_BY_CITY_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow, recoverRegion } from '../utils/dataUtils';

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
 * This ensures that "Орёл", "г. Орел", "Орловская обл." all map to "Орловская область".
 */
const getCanonicalRegion = (row: any): string => {
    // 1. Priority: Look for explicit "Subject"/"Region" column data.
    // CRITICAL UPDATE: 'субъект'/'subject' moved to index 0 to prioritize column B as requested.
    // Explicitly exclude columns with 'менеджер' or 'manager' to prevent false positives.
    // Added 'субъект рф' to the list.
    const rawRegionCol = findValueInRow(row, 
        ['субъект', 'subject', 'субъект рф', 'регион', 'область', 'край', 'республика', 'region'],
        ['менеджер', 'manager', 'код', 'code'] 
    );
    const cityCol = findValueInRow(row, ['город', 'населенный пункт', 'city', 'town', 'нас. пункт', 'нас пункт']);
    
    // Attempt recovery from explicit columns first
    let region = recoverRegion(rawRegionCol, cityCol);
    
    // 2. Fallback: If explicit columns failed, try parsing the full address string.
    // This is critical for files where "Region" column is missing or empty, but "Address" contains it.
    if (region === 'Регион не определен') {
        const address = findAddressInRow(row);
        const distributor = findValueInRow(row, ['дистрибьютор']);
        try {
            const parsed = parseRussianAddress(address || '', distributor);
            region = parsed.region;
            
            // 3. Nested Fallback: If address parser found a city but not a region, try mapping that city.
            if (region === 'Регион не определен' && parsed.city !== 'Город не определен') {
                 let cityKey = parsed.city.toLowerCase().trim();
                 // Clean city key from prefixes to match map keys
                 cityKey = cityKey.replace(/^(г\.|город|пгт|пос\.|с\.|село|дер\.|д\.)\s*/, '').trim();
                 cityKey = cityKey.replace(/ё/g, 'е');
                 if (cityKey && REGION_BY_CITY_MAP[cityKey]) {
                     region = REGION_BY_CITY_MAP[cityKey];
                 }
            }
        } catch (e) { /* ignore */ }
    }

    return standardizeRegion(region);
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

// Optimized to use pre-grouped map instead of filtering full array every time
function findPotentialClients(
    region: string, 
    existingClients: Set<string>, 
    okbByRegion: Map<string, { row: OkbDataRow, address: string }[]>
): PotentialClient[] {
    const potentialForRegion = okbByRegion.get(region);
    if (!potentialForRegion || potentialForRegion.length === 0) return [];

    const potential: PotentialClient[] = [];
    for (const { row: okbRow, address: okbAddress } of potentialForRegion) {
        const normalizedOkbAddress = normalizeAddress(okbAddress);
        
        if (okbAddress && !existingClients.has(normalizedOkbAddress)) {
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
        if (potential.length >= 200) break; 
    }
    return potential;
}


const findClientNameHeader = (headers: string[]): string | undefined => {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    const priorityTerms = ['наименование клиента', 'контрагент', 'клиент', 'уникальное наименование товара'];
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
    
    // --- PRE-PROCESS OKB BY REGION (OPTIMIZATION) ---
    // Group OKB rows by canonical region once to avoid O(N*M) complexity in findPotentialClients
    const okbByRegion = new Map<string, { row: OkbDataRow, address: string }[]>();
    const okbRegionCounts: { [key: string]: number } = {};

    if (okbData) {
        okbData.forEach(row => {
            const canonicalRegion = getCanonicalRegion(row);
            if (canonicalRegion && canonicalRegion !== 'Регион не определен') {
                okbRegionCounts[canonicalRegion] = (okbRegionCounts[canonicalRegion] || 0) + 1;
                
                if (!okbByRegion.has(canonicalRegion)) {
                    okbByRegion.set(canonicalRegion, []);
                }
                // Cache address lookup as well
                const address = findAddressInRow(row) || '';
                okbByRegion.get(canonicalRegion)!.push({ row, address });
            }
        });
    }

    // --- CACHE INITIALIZATION with Redirects ---
    const cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string }>();
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
                    cacheAddressMap.set(normalizedTarget, { lat: item.lat, lon: item.lon, originalAddress: item.address });
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
        if (clientAddress) {
            let normalizedRaw = normalizeAddress(clientAddress);

            // 1. Check if explicitly deleted
            if (deletedAddresses.has(normalizedRaw)) continue;

            // 2. Check for Redirect (History)
            if (cacheRedirectMap.has(normalizedRaw)) {
                const newNormalizedTarget = cacheRedirectMap.get(normalizedRaw)!;
                const targetEntry = cacheAddressMap.get(newNormalizedTarget);
                
                if (targetEntry) {
                    // Redirect found! Swap to the NEW canonical address immediately.
                    // This ensures that even if the file has the Old Address, we process it as the New Address.
                    clientAddress = targetEntry.originalAddress || clientAddress;
                    normalizedRaw = newNormalizedTarget;
                } else {
                    // Fallback: we have a redirect target key but missing full entry (rare).
                    // We proceed with the key to ensure grouping matches the new entity.
                    normalizedRaw = newNormalizedTarget;
                }

                // Re-check delete status on the *new* address
                if (deletedAddresses.has(normalizedRaw)) continue;
            }
        }

        const parsedAddress: EnrichedParsedAddress = parseRussianAddress(clientAddress || '', distributor);
        
        if (parsedAddress.city === 'Город не определен') {
            unidentifiedRows.push({ rm, rowData: row, originalIndex: i });
            continue;
        }

        const finalAddress = parsedAddress.finalAddress;
        // USE CANONICAL REGION HERE TO MATCH OKB
        const regionForAggregation = getCanonicalRegion(row);
        const groupNameForAggregation = (parsedAddress.city !== 'Город не определен') ? parsedAddress.city : regionForAggregation;
        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
        const brand = findValueInRow(row, ['торговая марка']);

        if (isNaN(weight)) continue;
        
        const key = `${regionForAggregation}-${brand}-${rm}`.toLowerCase();
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${regionForAggregation} (${brand})`, brand, rm, city: groupNameForAggregation,
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
        const normalizedFinalAddress = normalizeAddress(finalAddress);

        if (!uniquePlottableClients.has(normalizedFinalAddress)) {
            let lat: number | undefined;
            let lon: number | undefined;
            let isCached = false;
            
            let displayAddress = finalAddress;

            const cacheEntry = cacheAddressMap.get(normalizedFinalAddress);

            if (cacheEntry && cacheEntry.lat && cacheEntry.lon) {
                lat = cacheEntry.lat;
                lon = cacheEntry.lon;
                isCached = true;
                if (cacheEntry.originalAddress) {
                    displayAddress = cacheEntry.originalAddress;
                }
            } else {
                if (!newAddressesToCache[rm]) newAddressesToCache[rm] = [];
                if (finalAddress && !newAddressesToCache[rm].some(item => item.address === finalAddress)) {
                    newAddressesToCache[rm].push({ address: finalAddress });
                }

                const okbEntry = okbCoordIndex.get(normalizedFinalAddress);
                if (okbEntry) {
                    lat = okbEntry.lat;
                    lon = okbEntry.lon;
                } else if (finalAddress && !isCached) {
                    if (!addressesToGeocode[rm]) addressesToGeocode[rm] = [];
                    if (!addressesToGeocode[rm].includes(finalAddress)) {
                        addressesToGeocode[rm].push(finalAddress);
                    }
                }
            }
            
            uniquePlottableClients.set(normalizedFinalAddress, {
                key: normalizedFinalAddress,
                lat, lon, isCached,
                status: 'match',
                name: clientName,
                address: displayAddress, 
                city: parsedAddress.city,
                region: regionForAggregation, // Ensure individual points also use canonical region
                rm, brand,
                type: findValueInRow(row, ['канал продаж']),
                contacts: findValueInRow(row, ['контакты']),
                originalRow: row,
                fact: weight, 
            });
        } else {
             const existing = uniquePlottableClients.get(normalizedFinalAddress);
             if (existing) {
                 existing.fact = (existing.fact || 0) + weight;
             }
        }
        
        const mapPointForGroup = uniquePlottableClients.get(normalizedFinalAddress);
        if (mapPointForGroup) {
            aggregatedData[key].clients.set(mapPointForGroup.key, mapPointForGroup);
        }
    }

    postMessage({ type: 'progress', payload: { percentage: 90, message: 'ABC-анализ клиентов...' } });
    
    const plottableActiveClients = Array.from(uniquePlottableClients.values());
    
    const totalFact = plottableActiveClients.reduce((sum, client) => sum + (client.fact || 0), 0);
    if (totalFact > 0) {
        plottableActiveClients.sort((a, b) => (b.fact || 0) - (a.fact || 0));
        
        let runningTotal = 0;
        plottableActiveClients.forEach(client => {
            runningTotal += (client.fact || 0);
            const percentage = runningTotal / totalFact;
            
            if (percentage <= 0.80) {
                client.abcCategory = 'A';
            } else if (percentage <= 0.95) {
                client.abcCategory = 'B';
            } else {
                client.abcCategory = 'C';
            }
        });
    }

    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Завершение расчетов...' } });
    const existingClientsForPotentialSearch = new Set(plottableActiveClients.map(client => normalizeAddress(client.address)));

    const finalData: AggregatedDataRow[] = [];
    // NOTE: This loop was previously O(N*M) causing the hang.
    // Now it uses O(1) map lookup for regions inside findPotentialClients.
    for (const item of Object.values(aggregatedData)) {
        let potential = item.potential;
        if (!hasPotentialColumn) potential = item.fact * 1.15;
        else if (potential < item.fact) potential = item.fact;
        
        finalData.push({
            ...item, potential,
            growthPotential: Math.max(0, potential - item.fact),
            growthPercentage: potential > 0 ? (Math.max(0, potential - item.fact) / potential) * 100 : 0,
            potentialClients: findPotentialClients(item.region, existingClientsForPotentialSearch, okbByRegion),
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
