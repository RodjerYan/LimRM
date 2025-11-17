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

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const initialClientAddress = findAddressInRow(row);
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
        const brand = findValueInRow(row, ['торговая марка']);
        const rm = findValueInRow(row, ['рм']);

        if (!initialClientAddress || !rm) continue;
        
        // --- Final, Simplified Address Processing Logic ---
        // This logic directly implements the core requirement:
        // ONLY add the city from the distributor column if the address column itself does not contain a city.
        
        let finalAddress = initialClientAddress;
        let finalParsedAddress = parseRussianAddress(finalAddress);

        // Check if the parser failed to find a city in the original address.
        if (finalParsedAddress.city === 'Город не определен') {
            const distributor = findValueInRow(row, ['дистрибьютор', 'дистрибутор']);
            if (distributor) {
                const match = distributor.match(/\(([^)]+)\)/); // Extract text from parentheses
                if (match && match[1]) {
                    const cityFromDistRaw = match[1];
                    const cityFromDistClean = cityFromDistRaw.toLowerCase().replace(/\b(г|город)\.?\s*/g, '').trim();

                    if (cityFromDistClean && REGION_BY_CITY_WITH_INDEXES[cityFromDistClean]) {
                        const cityToPrepend = cityFromDistRaw.replace(/\b(г|город)\.?\s*/gi, '').trim();
                        finalAddress = `${cityToPrepend}, ${finalAddress}`;
                        
                        // Re-parse the address now that it's been enriched.
                        finalParsedAddress = parseRussianAddress(finalAddress);
                    }
                }
            }
        }
        
        const normalizedAddress = normalizeAddress(finalAddress);
        
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
                if (!newAddressesToCache[rm].some(item => item.address === finalAddress)) {
                    newAddressesToCache[rm].push({ address: finalAddress });
                }

                const okbEntry = okbCoordIndex.get(normalizedAddress);
                if (okbEntry) {
                    lat = okbEntry.lat;
                    lon = okbEntry.lon;
                } else if (cacheEntry && (!cacheEntry.lat || !cacheEntry.lon)) {
                    if (!addressesToGeocode[rm]) addressesToGeocode[rm] = [];
                    if (!addressesToGeocode[rm].includes(finalAddress)) {
                        addressesToGeocode[rm].push(finalAddress);
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
                if (tempLat > 40 && tempLon < 0) {
                    tempLon = Math.abs(tempLon);
                }
        
                lat = tempLat;
                lon = tempLon;
            }

            const region = finalParsedAddress.region;
            const groupName = (finalParsedAddress.city !== 'Город не определен') ? finalParsedAddress.city : region;

            uniquePlottableClients.set(normalizedAddress, {
                key: normalizedAddress,
                lat, lon, isCached,
                status: 'match',
                name: clientName,
                address: finalAddress,
                city: groupName,
                region, rm, brand,
                type: findValueInRow(row, ['канал продаж']),
                contacts: findValueInRow(row, ['контакты']),
            });
        }
        
        // --- Aggregation logic (runs for every row) ---
        const regionForAggregation = finalParsedAddress.region;
        const groupNameForAggregation = (finalParsedAddress.city !== 'Город не определен') ? finalParsedAddress.city : regionForAggregation;

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
        aggregatedData[key].clients.add(finalAddress || clientName);

        if (hasPotentialColumn) {
            const potential = parseFloat(String(findValueInRow(row, ['потенциал']) || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) {
                aggregatedData[key].potential += potential;
            }
        }
        
        if ((i + 1) % Math.floor(jsonData.length / 80) === 0) {
            await sleep(1);
            postMessage({ type: 'progress', payload: { percentage: 10 + (i / jsonData.length) * 80, message: 'Анализ данных...' } });
        }
    }

    postMessage({ type: 'progress', payload: { percentage: 90, message: 'Финализация...' } });

    // Final calculations
    const finalData: AggregatedDataRow[] = Object.values(aggregatedData).map(item => {
        const potential = item.potential > 0 ? item.potential : item.fact * 2;
        const growthPotential = Math.max(0, potential - item.fact);
        const growthPercentage = potential > 0 ? (growthPotential / potential) * 100 : 0;
        
        const existingClientsSet = new Set(Array.from(item.clients).map(c => normalizeAddress(c)));
        const potentialClients = findPotentialClients(item.region, existingClientsSet, okbData);

        return {
            ...item,
            potential,
            growthPotential,
            growthPercentage,
            potentialClients,
            clients: Array.from(item.clients),
        };
    });

    const plottableActiveClients = Array.from(uniquePlottableClients.values());

    const resultPayload: WorkerResultPayload = {
        aggregatedData: finalData,
        plottableActiveClients: plottableActiveClients,
    };
    
    postMessage({ type: 'result', payload: resultPayload });
}


async function processXlsx(file: File, commonArgs: CommonProcessArgs) {
    commonArgs.postMessage({ type: 'progress', payload: { percentage: 1, message: 'Чтение файла XLSX...' } });
    const arrayBuffer = await file.arrayBuffer();
    const workbook = xlsx.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const headers: string[] = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    await processFile(jsonData, headers, commonArgs);
}

async function processCsv(file: File, commonArgs: CommonProcessArgs) {
    commonArgs.postMessage({ type: 'progress', payload: { percentage: 1, message: 'Чтение файла CSV...' } });
    
    // FIX: Explicitly type the Promise as Promise<void> to match the signature of the `resolve` function,
    // which is called without arguments, thus resolving a type mismatch error.
    return new Promise<void>((resolve, reject) => {
        PapaParse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: ParseResult<any>, file: File) => {
                const headers = results.meta.fields || [];
                await processFile(results.data, headers, commonArgs);
                resolve();
            },
            error: (error: Error, file: File) => {
                reject(error);
            }
        });
    });
}
