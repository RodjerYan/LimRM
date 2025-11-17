import * as xlsx from 'xlsx';
import { parse as PapaParse, type ParseResult, type ParseMeta } from 'papaparse';
import { 
    AggregatedDataRow, 
    OkbDataRow, 
    WorkerMessage, 
    PotentialClient, 
    WorkerResultPayload, 
    MapPoint, 
    CoordsCache 
} from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };
type OkbCoordIndex = Map<string, { lat: number; lon: number }>;
type CommonProcessArgs = {
    okbData: OkbDataRow[];
    cacheData: CoordsCache;
    postMessage: PostMessageFn;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


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


const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword));
        if (foundKey && row[foundKey]) {
            return String(row[foundKey]);
        }
    }
    return '';
};

function findPotentialClients(region: string, existingClients: Set<string>, okbData: OkbDataRow[]): PotentialClient[] {
    if (!okbData) return [];
    
    const potentialForRegion = okbData.filter(row => {
        const regionKey = findValueInRow(row, ['регион']);
        const standardized = standardizeRegion(regionKey);
        return standardized === region;
    });
    
    if (potentialForRegion.length === 0) return [];

    const potential: PotentialClient[] = [];
    for (const okbRow of potentialForRegion) {
        const okbAddress = findAddressInRow(okbRow) || '';
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
    
    const cacheAddressMap = new Map<string, { lat?: number; lon?: number }>();
    if (cacheData) {
        for (const rm of Object.keys(cacheData)) {
            for (const item of cacheData[rm]) {
                if (item.address) {
                    const normalized = normalizeAddress(item.address);
                    if (!cacheAddressMap.has(normalized)) {
                        cacheAddressMap.set(normalized, { lat: item.lat, lon: item.lon });
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
    
    const GARBAGE_PREFIXES_MAP: Record<string, string> = {
        'нижний новгород': 'Нижегородская область',
        'москва': 'Москва',
        'санкт-петербург': 'Санкт-Петербург'
    };

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        let clientAddress = findAddressInRow(row);
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
        const brand = findValueInRow(row, ['торговая марка']);
        const rm = findValueInRow(row, ['рм']);

        if (!clientAddress || !rm) continue;
        
        // --- NEW, ROBUST ADDRESS CLEANING LOGIC ---
        // This logic detects if an address string starts with a common "garbage" city/prefix
        // but also contains keywords for a completely different region later in the string.
        // If so, it strips the garbage prefix. This handles dirty data like
        // "Нижний Новгород, Республика Беларусь, Брест..." and "Нижний Новгород, Башкортостан...".
        const lowerAddress = clientAddress.toLowerCase().trim();
        for (const prefix of Object.keys(GARBAGE_PREFIXES_MAP)) {
            if (lowerAddress.startsWith(prefix + ',') || lowerAddress.startsWith(prefix + ' ')) {
                const garbageRegion = GARBAGE_PREFIXES_MAP[prefix];
                const restOfString = lowerAddress.substring(prefix.length);

                const containsOtherRegion = Object.keys(REGION_KEYWORD_MAP).some(key => {
                    const regionInRest = REGION_KEYWORD_MAP[key];
                    return restOfString.includes(key) && regionInRest !== garbageRegion;
                });

                if (containsOtherRegion) {
                    const match = clientAddress.match(new RegExp(`^${prefix}[, ]\\s*`, 'i'));
                    if (match) {
                        clientAddress = clientAddress.substring(match[0].length).trim();
                        break; // Prefix removed, stop checking for others.
                    }
                }
            }
        }
        // --- END ADDRESS CLEANING LOGIC ---

        const finalClientAddress = clientAddress;
        const normalizedAddress = normalizeAddress(finalClientAddress);
        
        // --- Logic for plottable points (run only once per unique address) ---
        if (!uniquePlottableClients.has(normalizedAddress)) {
            let lat: number | undefined;
            let lon: number | undefined;
            let isCached = false;

            const cacheEntry = cacheAddressMap.get(normalizedAddress);

            if (cacheEntry && cacheEntry.lat && cacheEntry.lon) {
                lat = cacheEntry.lat;
                lon = cacheEntry.lon;
                isCached = true;
            } else {
                if (!newAddressesToCache[rm]) newAddressesToCache[rm] = [];
                if (!newAddressesToCache[rm].some(item => item.address === finalClientAddress)) {
                    newAddressesToCache[rm].push({ address: finalClientAddress });
                }

                const okbEntry = okbCoordIndex.get(normalizedAddress);
                if (okbEntry) {
                    lat = okbEntry.lat;
                    lon = okbEntry.lon;
                } else if (cacheEntry && (!cacheEntry.lat || !cacheEntry.lon)) {
                    if (!addressesToGeocode[rm]) addressesToGeocode[rm] = [];
                    if (!addressesToGeocode[rm].includes(finalClientAddress)) {
                        addressesToGeocode[rm].push(finalClientAddress);
                    }
                }
            }

            // --- NEW, ROBUST COORDINATE VALIDATION AND CORRECTION ---
            if (typeof lat !== 'undefined' && typeof lon !== 'undefined') {
                let tempLat = lat;
                let tempLon = lon;
        
                // Rule 1: Check for swapped lat/lon. An invalid latitude is the best clue.
                if (Math.abs(tempLat) > 90 && Math.abs(tempLon) <= 180) {
                    [tempLat, tempLon] = [tempLon, tempLat]; // Swap them
                }
                
                // Rule 2: Clamp latitude to the valid [-90, 90] range as a failsafe.
                tempLat = Math.max(-90, Math.min(90, tempLat));
        
                // Rule 3: Correct obviously wrong longitudes for the Russia/CIS context.
                // If latitude is in the northern hemisphere (typical for this app's data) and longitude is negative,
                // it's almost certainly a data entry error (a stray minus sign).
                if (tempLat > 40 && tempLon < 0) {
                    tempLon = Math.abs(tempLon);
                }
        
                lat = tempLat;
                lon = tempLon;
            }

            const parsedAddress = parseRussianAddress(row, finalClientAddress);
            const region = parsedAddress.region;
            const groupName = (parsedAddress.city !== 'Город не определен') ? parsedAddress.city : region;

            uniquePlottableClients.set(normalizedAddress, {
                key: normalizedAddress,
                lat, lon, isCached,
                status: 'match',
                name: clientName,
                address: finalClientAddress,
                city: groupName,
                region, rm, brand,
                type: findValueInRow(row, ['канал продаж']),
                contacts: findValueInRow(row, ['контакты']),
            });
        }
        
        // --- Aggregation logic (runs for every row) ---
        const parsedForAggregation = parseRussianAddress(row, finalClientAddress);
        const regionForAggregation = parsedForAggregation.region;
        const groupNameForAggregation = (parsedForAggregation.city !== 'Город не определен') ? parsedForAggregation.city : regionForAggregation;

        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        if (isNaN(weight) || regionForAggregation === 'Регион не определен') continue;

        const key = `${regionForAggregation}-${brand}-${rm}`.toLowerCase();
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${regionForAggregation} (${brand})`, brand, rm, city: groupNameForAggregation,
                region: regionForAggregation, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Set<string>(),
            };
        }
        aggregatedData[key].fact += weight;
        aggregatedData[key].clients.add(finalClientAddress || clientName);

        if (hasPotentialColumn) {
            const potential = parseFloat(String(findValueInRow(row, ['потенциал']) || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }
        
        if (i > 0 && i % 5000 === 0) {
            const percentage = 10 + Math.round((i / jsonData.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработка: ${i.toLocaleString('ru-RU')}...` } });
        }
    }
    
    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Завершение расчетов...' } });
    const plottableActiveClients = Array.from(uniquePlottableClients.values());
    const existingClientsForPotentialSearch = new Set(plottableActiveClients.map(client => normalizeAddress(client.address)));

    const finalData: AggregatedDataRow[] = [];
    for (const item of Object.values(aggregatedData)) {
        let potential = item.potential;
        if (!hasPotentialColumn) potential = item.fact * 1.15;
        else if (potential < item.fact) potential = item.fact;
        
        finalData.push({
            ...item, potential,
            growthPotential: Math.max(0, potential - item.fact),
            growthPercentage: potential > 0 ? (Math.max(0, potential - item.fact) / potential) * 100 : 0,
            potentialClients: findPotentialClients(item.region, existingClientsForPotentialSearch, okbData),
            clients: Array.from(item.clients) 
        });
    }

    const resultPayload: WorkerResultPayload = { aggregatedData: finalData, plottableActiveClients };
    postMessage({ type: 'result', payload: resultPayload });

    // --- BACKGROUND TASKS ---
    const newAddressRMs = Object.keys(newAddressesToCache);
    if (newAddressRMs.length > 0) {
        // FIX: Add 'percentage' property to satisfy the WorkerProgressPayload type.
        postMessage({ type: 'progress', payload: { percentage: 99, message: 'Добавление новых адресов в кэш...', isBackground: true } });
        for (const rmName of newAddressRMs) {
            try {
                await fetch('/api/add-to-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rmName, rows: newAddressesToCache[rmName] }) });
            } catch (e) { console.error(`Failed to add to cache for ${rmName}:`, e); }
        }
    }

    const geocodeRMs = Object.keys(addressesToGeocode);
    if (geocodeRMs.length > 0) {
        // FIX: Add 'percentage' property to satisfy the WorkerProgressPayload type.
        postMessage({ type: 'progress', payload: { percentage: 99, message: 'Запуск геокодирования...', isBackground: true } });
        for (const rmName of geocodeRMs) {
            const updates: { address: string, lat: number, lon: number }[] = [];
            const addresses = addressesToGeocode[rmName];
            for (let i = 0; i < addresses.length; i++) {
                const address = addresses[i];
                // FIX: Add 'percentage' property to satisfy the WorkerProgressPayload type.
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
                // FIX: Add 'percentage' property to satisfy the WorkerProgressPayload type.
                postMessage({ type: 'progress', payload: { percentage: 99, message: `Обновление ${updates.length} координат для ${rmName}...`, isBackground: true } });
                try {
                     await fetch('/api/update-coords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rmName, updates }) });
                } catch (e) { console.error(`Failed to update coords for ${rmName}:`, e); }
            }
        }
    }
    // FIX: Add 'percentage' property to satisfy the WorkerProgressPayload type.
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