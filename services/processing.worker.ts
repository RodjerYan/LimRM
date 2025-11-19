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
import { parseRussianAddress, getRegionFromFallback } from './addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';
// FIX: The user wants CIS logic separated. Import the main city map to build a CIS-specific city list.
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';


// --- START OF HYBRID LOGIC IMPLEMENTATION ---

// Helper sets and functions for the new hybrid CIS/RF region detection logic.

const CIS_REGIONS = new Set([
    'Республика Абхазия',
    'Республика Беларусь',
    'Республика Казахстан',
    'Кыргызская Республика',
    'Республика Молдова',
    'Республика Таджикистан',
    'Туркменистан',
    'Республика Узбекистан',
    'Азербайджан',
    'Армения'
]);

// Create a pre-sorted list of only CIS cities for a high-priority check.
const CIS_CITIES_SORTED = Object.keys(REGION_BY_CITY_WITH_INDEXES)
    .filter(city => CIS_REGIONS.has(REGION_BY_CITY_WITH_INDEXES[city].region))
    .sort((a, b) => b.length - a.length);

/**
 * A specialized function that ONLY checks for CIS cities in the distributor's name.
 * This acts as a high-priority "fast path" to correctly identify CIS regions
 * without being affected by the logic intended for Russian regions.
 * @param distributor The distributor name string.
 * @returns A region/city object if a CIS city is found, otherwise null.
 */
function getCisRegionFromDistributor(distributor: string): { region: string; city: string } | null {
    if (!distributor) return null;
    const normalized = distributor.toLowerCase().replace(/[()]/g, ' ');

    for (const cityName of CIS_CITIES_SORTED) {
        // Use word boundaries to ensure a clean match (e.g., finds "минск" but not "минский")
        const regex = new RegExp(`\\b${cityName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
        if (regex.test(normalized)) {
            const cityData = REGION_BY_CITY_WITH_INDEXES[cityName];
            return {
                region: cityData.region,
                city: cityName.charAt(0).toUpperCase() + cityName.slice(1), // Simple capitalization
            };
        }
    }
    return null;
}

// --- END OF HYBRID LOGIC IMPLEMENTATION ---


type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients' | 'originalRows'> & { clients: Set<string>, originalRows: { [key: string]: any }[] } };
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

const REGION_KEYWORDS_SORTED = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);

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

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const clientAddress = findAddressInRow(row);
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
        const brand = findValueInRow(row, ['торговая марка']);
        const rm = findValueInRow(row, ['рм']);

        if (!clientAddress || !rm) continue;

        // --- HYBRID REGION DETECTION LOGIC ---
        let finalRegion: string | null = null;
        let finalCity: string | null = null;
        let correctedClientAddress = clientAddress;

        // PRIORITY 0: Special high-priority check for CIS countries in the distributor name.
        const distributor = findValueInRow(row, ['дистрибьютор', 'дистрибутор']);
        const cisResult = getCisRegionFromDistributor(distributor);
        if (cisResult) {
            finalRegion = cisResult.region;
            finalCity = cisResult.city;
            // Enrich the address for better consistency if the city isn't already there.
            if (finalCity && !clientAddress.toLowerCase().includes(finalCity.toLowerCase())) {
                correctedClientAddress = `${finalCity}, ${clientAddress}`;
            }
        }

        // If it's NOT a CIS case, proceed with the standard logic that works well for Russia.
        if (!finalRegion) {
            // STANDARD LOGIC FOR RF
            // 1. Parse main address string for a known city.
            const initialParse = parseRussianAddress(clientAddress);
            if (initialParse.region !== 'Регион не определен') {
                finalRegion = initialParse.region;
                finalCity = initialParse.city;
            }

            // 2. If address parsing fails, use a strict keyword search.
            if (!finalRegion) {
                const normalizedAddressForKeyword = clientAddress.toLowerCase().replace(/[^а-я0-9\s-]/g, ' ');
                for (const keyword of REGION_KEYWORDS_SORTED) {
                    try {
                        const regex = new RegExp(`\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
                        if (regex.test(normalizedAddressForKeyword)) {
                            finalRegion = REGION_KEYWORD_MAP[keyword];
                            break;
                        }
                    } catch (e) {
                        console.error(`Invalid regex for keyword: ${keyword}`, e);
                    }
                }
            }
            
            // 3. Last resort for RF: check distributor for ANY city (e.g. "ООО Ромашка (Воронеж)").
            if (!finalRegion) {
                const fallbackResult = getRegionFromFallback(distributor); // Checks all cities
                if (fallbackResult) {
                    finalRegion = fallbackResult.region;
                    finalCity = fallbackResult.city;
                }
            }
        }
        
        // --- End of Hybrid Logic ---

        finalRegion = standardizeRegion(finalRegion);
        if (finalRegion === 'Регион не определен') {
            finalRegion = "Неопределенные адреса";
        }

        if (!finalCity || finalCity === 'Город не определен') {
            finalCity = (finalRegion !== 'Неопределенные адреса') ? finalRegion : 'Неопределенный город';
        }
        
        const groupName = finalCity;
        const normalizedAddress = normalizeAddress(correctedClientAddress);
        
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
                if (!newAddressesToCache[rm]) {
                    newAddressesToCache[rm] = [];
                }
                if (!newAddressesToCache[rm].some(item => item.address === correctedClientAddress)) {
                    newAddressesToCache[rm].push({ address: correctedClientAddress });
                }
            }

            uniquePlottableClients.set(normalizedAddress, {
                key: normalizedAddress,
                lat, lon, isCached,
                status: 'match',
                name: clientName,
                address: correctedClientAddress,
                city: groupName,
                region: finalRegion,
                rm, brand,
                type: findValueInRow(row, ['канал продаж']),
                contacts: findValueInRow(row, ['контакты']),
            });
        }
        
        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        if (isNaN(weight) || finalRegion === "Неопределенные адреса") continue;

        const key = `${groupName}-${brand}-${rm}`.toLowerCase();
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${groupName} (${brand})`, brand, rm, city: groupName,
                region: finalRegion, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Set<string>(),
                originalRows: []
            };
        }
        aggregatedData[key].fact += weight;
        aggregatedData[key].clients.add(correctedClientAddress || clientName);
        aggregatedData[key].originalRows.push(row);

        if (hasPotentialColumn) {
            const potential = parseFloat(String(findValueInRow(row, ['потенциал']) || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }
        
        if (i > 0 && i % 5000 === 0) {
            const percentage = 10 + Math.round((i / jsonData.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработка: ${i.toLocaleString('ru-RU')}...` } });
        }
    }
    
    // Add unidentified rows to the aggregation
    jsonData.forEach(row => {
        const clientAddress = findAddressInRow(row);
        const rm = findValueInRow(row, ['рм']);
        if (!clientAddress || !rm) return;
        
        let regionDetermined = false;
        const initialParse = parseRussianAddress(clientAddress);
        if (initialParse.region !== 'Регион не определен') {
            regionDetermined = true;
        } else {
            const distributor = findValueInRow(row, ['дистрибьютор', 'дистрибутор']);
            const fallbackResult = getRegionFromFallback(distributor);
            if (fallbackResult) {
                regionDetermined = true;
            }
        }
        
        if (!regionDetermined) {
             const key = `unidentified-${clientAddress}-${rm}`.toLowerCase();
             if (!aggregatedData[key]) {
                 aggregatedData[key] = {
                     key,
                     clientName: findValueInRow(row, ['наименование клиента', 'контрагент', 'клиент']) || clientAddress,
                     brand: findValueInRow(row, ['торговая марка']) || 'Без бренда',
                     rm: rm || 'Неизвестный РМ',
                     city: "Неопределенный город",
                     region: "Неопределенные адреса",
                     fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                     clients: new Set([clientAddress]),
                     originalRows: [row]
                 };
             }
        }
    });

    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Завершение расчетов...' } });
    const plottableActiveClients = Array.from(uniquePlottableClients.values());
    const finalData: AggregatedDataRow[] = [];
    const existingClientsForPotentialSearch = new Set(plottableActiveClients.map(client => normalizeAddress(client.address)));

    for (const item of Object.values(aggregatedData)) {
        let potential = item.potential;
        if (!hasPotentialColumn && item.region !== "Неопределенные адреса") potential = item.fact * 1.15;
        else if (potential < item.fact) potential = item.fact;
        
        finalData.push({
            ...item, potential,
            growthPotential: Math.max(0, potential - item.fact),
            growthPercentage: potential > 0 ? (Math.max(0, potential - item.fact) / potential) * 100 : 0,
            potentialClients: findPotentialClients(item.region, existingClientsForPotentialSearch, okbData),
            clients: Array.from(item.clients),
            originalRows: item.originalRows
        });
    }

    const resultPayload: WorkerResultPayload = { aggregatedData: finalData, plottableActiveClients };
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