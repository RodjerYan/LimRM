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
} from '../../types';
import { parseRussianAddress } from './addressParser';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../../utils/dataUtils';
import { REGION_BY_CITY_MAP } from '../../utils/addressMappings';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Map<string, MapPoint> } };

type OkbCoordIndex = Map<string, { lat: number; lon: number }>;
type CommonProcessArgs = {
    okbData: OkbDataRow[];
    cacheData: CoordsCache;
    postMessage: PostMessageFn;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Universal Region Normalization (RF + CIS) ---
const normalizeRegionString = (input: string): string => {
    if (!input) return 'Регион не определен';
    
    let s = input.toLowerCase().replace(/\u00A0/g, ' ').replace(/ё/g, 'е').trim();
    
    // 1. Check if the "Region" string is actually a known city (e.g. "Орел" -> "Орловская область")
    // This handles cases where the user puts the capital city in the Subject column.
    if (REGION_BY_CITY_MAP[s]) {
        return REGION_BY_CITY_MAP[s];
    }

    // Remove "г.", "город" prefixes/words
    s = s.replace(/^г\.\s*/i, '').replace(/\s+г\.\s*/i, ' ').replace(/\bгород\b/gi, '');

    // General replacements for RF and CIS (UA, BY, KZ, UZ, KG, AM, MD, GE)
    s = s
        .replace(/\bобл\.?$/i, ' область')
        .replace(/\bвобл\.?$/i, ' область')     // Belarus: вобласць
        .replace(/\bоблыс(ы|ь)?$/i, ' область') // Kazakhstan: облысы
        .replace(/\bвилоят(ы)?$/i, ' область')  // Uzbekistan: вилоят
        .replace(/\bобл(?:аст|ь)?s?$/i, ' область')
        .replace(/\bр-?н\.?$/i, ' район')
        .replace(/\bрайон\b$/i, ' район')
        .replace(/\bаудан(ы)?$/i, ' район')     // Kazakhstan: ауданы
        .replace(/\bтуман(ы)?$/i, ' район')     // Uzbekistan: тумани
        .replace(/\bоблусу?$/i, ' область')     // Kyrgyzstan: облусу
        .replace(/\bмарз$/i, ' область')        // Armenia: марз
        .replace(/^raionul\s+/i, '')            // Moldova: raionul
        .replace(/\s+raion$/i, ' район')        // Moldova
        .replace(/\bмхаре$/i, ' край')          // Georgia: mkhare
        ;

    // Remove extra characters and double spaces
    s = s.replace(/[^а-я0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim();

    // Capitalize each word
    return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

/**
 * Determines the Canonical Region Name for a given data row (Object-based for OKB).
 * Fallback logic primarily for OKB which is parsed as objects.
 */
const getCanonicalRegionForObject = (row: any): string => {
    let region = findValueInRow(row, [
        'субъект', 'subject', 'субъект рф', 'subj',
        'регион', 'область', 'region', 'province',
        'облыс', 'области', 'вилоят', 'viloyat',
        'марз', 'raion'
    ]);

    if (!region) return 'Регион не определен';
    return normalizeRegionString(String(region).trim());
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

// Helper to find column index by keywords
const findColumnIndex = (headers: string[], keywords: string[], excludeKeywords: string[] = []): number => {
    const lowerHeaders = headers.map(h => String(h).toLowerCase().trim());
    
    // 1. Exact matches
    for (const keyword of keywords) {
        const idx = lowerHeaders.findIndex(h => h === keyword && !excludeKeywords.some(ex => h.includes(ex)));
        if (idx !== -1) return idx;
    }

    // 2. Partial matches
    for (const keyword of keywords) {
        const idx = lowerHeaders.findIndex(h => h.includes(keyword) && !excludeKeywords.some(ex => h.includes(ex)));
        if (idx !== -1) return idx;
    }
    
    return -1;
};

// Helper to find Address column index with priority
const findAddressColumnIndex = (headers: string[]): number => {
    const lowerHeaders = headers.map(h => String(h).toLowerCase().trim());
    
    // Priority 1: Specific known headers
    const priority = ['адрес тт limkorm', 'юридический адрес', 'адрес'];
    for (const p of priority) {
        const idx = lowerHeaders.indexOf(p);
        if (idx !== -1) return idx;
    }

    // Priority 2: Contains 'адрес' but not manager
    const idxAddr = lowerHeaders.findIndex(h => h.includes('адрес') && !h.includes('менеджер'));
    if (idxAddr !== -1) return idxAddr;

    // Priority 3: Fallback
    return lowerHeaders.findIndex(h => 
        (h.includes('город') || h.includes('регион')) && 
        !h.includes('субъект') && 
        !h.includes('менеджер') && 
        !h.includes('код')
    );
};


self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[], cacheData: CoordsCache }>) => {
    const { file, okbData, cacheData } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        const commonArgs = { okbData, cacheData, postMessage };
        // Both processors now return raw 2D arrays (Array of Arrays)
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

async function processFile(rows: any[][], { okbData, cacheData, postMessage }: CommonProcessArgs) {
    if (rows.length < 2) throw new Error('Файл пуст или не содержит данных.');

    const headers = rows[0].map(h => String(h || ''));
    
    // Identify Column Indices
    
    // Region Column Detection: Prioritize explicit keywords
    // We look for headers like "Субъект", "Регион", "Oblast", "Region", "Subject".
    // We exclude "Код", "Code", "Менеджер", "Manager" to avoid false positives.
    let idxRegion = findColumnIndex(headers, ['субъект', 'регион', 'область', 'region', 'subject'], ['код', 'code', 'менеджер', 'manager']);
    
    // Fallback: If dynamic search fails, default to index 1 (Column B), BUT with safety checks
    if (idxRegion === -1 && headers.length > 1) {
        const colBHeader = headers[1].toLowerCase();
        // Safety check: Don't default to Col B if it looks like Brand or Client or something else known
        if (!colBHeader.includes('бренд') && !colBHeader.includes('brand') && !colBHeader.includes('клиент') && !colBHeader.includes('контрагент')) {
             idxRegion = 1; 
        }
    }
    
    const idxWeight = findColumnIndex(headers, ['вес', 'факт', 'продажи']);
    if (idxWeight === -1) throw new Error('Не найдена колонка "Вес" (или Факт).');

    const idxPotential = findColumnIndex(headers, ['потенциал']);
    const idxClientName = findColumnIndex(headers, ['наименование клиента', 'контрагент', 'клиент', 'партнер'], ['менеджер']);
    const idxBrand = findColumnIndex(headers, ['торговая марка', 'бренд']);
    const idxRM = findColumnIndex(headers, ['рм', 'региональный', 'менеджер']);
    const idxAddress = findAddressColumnIndex(headers);
    const idxDistributor = findColumnIndex(headers, ['дистрибьютор', 'дистрибьютер']);
    const idxType = findColumnIndex(headers, ['канал продаж', 'тип', 'вид деятельности']);
    const idxContacts = findColumnIndex(headers, ['контакты', 'телефон']);

    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация данных...' } });
    const okbCoordIndex = createOkbCoordIndex(okbData);
    
    // --- PRE-PROCESS OKB BY REGION (Object-based logic for OKB) ---
    const okbByRegion = new Map<string, { row: OkbDataRow, address: string }[]>();
    const okbRegionCounts: { [key: string]: number } = {};

    if (okbData) {
        okbData.forEach(row => {
            const canonicalRegion = getCanonicalRegionForObject(row);
            if (canonicalRegion && canonicalRegion !== 'Регион не определен') {
                okbRegionCounts[canonicalRegion] = (okbRegionCounts[canonicalRegion] || 0) + 1;
                
                if (!okbByRegion.has(canonicalRegion)) {
                    okbByRegion.set(canonicalRegion, []);
                }
                const address = findAddressInRow(row) || '';
                okbByRegion.get(canonicalRegion)!.push({ row, address });
            }
        });
    }
    
    console.log('OKB regions counts:', okbRegionCounts);

    // --- CACHE INITIALIZATION ---
    const cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string }>();
    const cacheRedirectMap = new Map<string, string>();
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
                if (!cacheAddressMap.has(normalizedTarget)) {
                    cacheAddressMap.set(normalizedTarget, { lat: item.lat, lon: item.lon, originalAddress: item.address });
                }
                if (item.history) {
                    const historyEntries = String(item.history).replace(/\u00A0/g, ' ').split(/\r?\n|\s*\|\|\s*/).map(s => s.trim()).filter(Boolean);
                    for (const entry of historyEntries) {
                        const oldAddrRaw = entry.split('[')[0].trim();
                        if (!oldAddrRaw) continue;
                        const normalizedOld = normalizeAddress(oldAddrRaw);
                        if (normalizedOld && normalizedOld !== normalizedTarget) {
                            cacheRedirectMap.set(normalizedOld, normalizedTarget);
                        }
                    }
                }
            }
        }
    }
    postMessage({ type: 'progress', payload: { percentage: 10, message: `Кэш обработан: ${cacheAddressMap.size} записей.` } });

    const aggregatedData: AggregationMap = {};
    const uniquePlottableClients = new Map<string, MapPoint>();
    const newAddressesToCache: { [rmName: string]: { address: string }[] } = {};
    const addressesToGeocode: { [rmName: string]: string[] } = {};
    const unidentifiedRows: UnidentifiedRow[] = [];

    // Start loop from index 1 (skip header)
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // Safe Access via Index
        const rawRM = idxRM !== -1 ? row[idxRM] : undefined;
        const rm = rawRM ? String(rawRM).trim() : '';

        if (i > 0 && i % 5000 === 0) {
            const percentage = 10 + Math.round((i / rows.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработка: ${i.toLocaleString('ru-RU')}...` } });
        }
        
        let clientAddress = idxAddress !== -1 ? String(row[idxAddress] || '').trim() : '';
        const distributor = idxDistributor !== -1 ? String(row[idxDistributor] || '').trim() : '';

        // Skip empty rows
        if (!clientAddress && !distributor) continue;

        // Reconstruct object for Unidentified Modal to allow editing (best effort)
        const rowObject: any = {};
        headers.forEach((h, idx) => rowObject[h] = row[idx]);

        if (!rm) {
            unidentifiedRows.push({ rm: 'РМ не указан', rowData: rowObject, originalIndex: i });
            continue;
        }

        // --- REDIRECT LOGIC ---
        if (clientAddress) {
            let normalizedRaw = normalizeAddress(clientAddress);
            if (deletedAddresses.has(normalizedRaw)) continue;
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

        const parsedAddress: EnrichedParsedAddress = parseRussianAddress(clientAddress, distributor);
        
        if (parsedAddress.city === 'Город не определен') {
            unidentifiedRows.push({ rm, rowData: rowObject, originalIndex: i });
            continue;
        }

        const finalAddress = parsedAddress.finalAddress;
        
        // DYNAMIC REGION EXTRACTION
        // Try to get the region from the found index.
        // If not found (idxRegion == -1), use 'Регион не определен'.
        let regionForAggregation = 'Регион не определен';
        if (idxRegion !== -1 && row[idxRegion]) {
             regionForAggregation = normalizeRegionString(String(row[idxRegion]));
        }
        
        const groupNameForAggregation = (parsedAddress.city !== 'Город не определен') ? parsedAddress.city : regionForAggregation;
        
        const rawWeight = String(row[idxWeight] || '0').replace(/\s/g, '').replace(',', '.');
        const weight = parseFloat(rawWeight);
        if (isNaN(weight)) continue;

        const clientName = (idxClientName !== -1 && row[idxClientName]) ? String(row[idxClientName]) : 'Без названия';
        const brand = (idxBrand !== -1 && row[idxBrand]) ? String(row[idxBrand]) : 'Unknown';

        const key = `${regionForAggregation}-${brand}-${rm}`.toLowerCase();
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${regionForAggregation} (${brand})`, brand, rm, city: groupNameForAggregation,
                region: regionForAggregation, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Map<string, MapPoint>(),
            };
        }
        aggregatedData[key].fact += weight;

        if (idxPotential !== -1) {
            const potential = parseFloat(String(row[idxPotential] || '0').replace(/\s/g, '').replace(',', '.'));
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
                if (cacheEntry.originalAddress) displayAddress = cacheEntry.originalAddress;
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
                region: regionForAggregation,
                rm, brand,
                type: (idxType !== -1) ? String(row[idxType] || '') : '',
                contacts: (idxContacts !== -1) ? String(row[idxContacts] || '') : '',
                originalRow: rowObject, // Store the object version for display in modals
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
            if (percentage <= 0.80) client.abcCategory = 'A';
            else if (percentage <= 0.95) client.abcCategory = 'B';
            else client.abcCategory = 'C';
        });
    }

    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Завершение расчетов...' } });
    const existingClientsForPotentialSearch = new Set(plottableActiveClients.map(client => normalizeAddress(client.address)));

    const finalData: AggregatedDataRow[] = [];
    
    for (const item of Object.values(aggregatedData)) {
        let potential = item.potential;
        if (idxPotential === -1) potential = item.fact * 1.15;
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
    // Use header: 1 to get Array of Arrays. This guarantees index-based access (Col B = index 1).
    const rows: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    await processFile(rows, args);
}


async function processCsv(file: File, args: CommonProcessArgs) {
    args.postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла CSV...' } });
    
    const parsePromise = new Promise<any[][]>((resolve, reject) => {
        PapaParse(file, {
            header: false, // Force Array of Arrays
            skipEmptyLines: true,
            complete: (results: ParseResult<any>) => {
                if (results.errors.length > 0) console.warn('CSV parsing errors:', results.errors);
                resolve(results.data);
            },
            error: (error: Error) => reject(error)
        });
    });

    try {
        const rows = await parsePromise;
        if (!rows || rows.length === 0) throw new Error("CSV файл пуст или не удалось его прочитать.");
        await processFile(rows, args);
    } catch (error) {
        throw new Error(`Failed to parse CSV file: ${(error as Error).message}`);
    }
}