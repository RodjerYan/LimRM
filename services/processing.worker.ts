import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, ParsedAddress, WorkerResultPayload, MapPoint } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
import { normalizeAddressForSearch } from '../utils/dataUtils';
import { getCoordinatesFromAddress, delay } from './geoService';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };
type CoordsCache = Map<string, { lat: number; lon: number } | null>;

/**
 * A robust helper function to find an address value within a data row.
 * It searches for keys in a prioritized order, using both exact and partial matches.
 * @param row The data row object.
 * @returns The found address string or null.
 */
const findAddressInRow = (row: { [key: string]: any }): string | null => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    const prioritizedKeys = ['адрес тт limkorm', 'юридический адрес', 'адрес'];

    for (const pKey of prioritizedKeys) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }

    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    
    const fallbackKey = rowKeys.find(key => key.toLowerCase().includes('город') || key.toLowerCase().includes('регион'));
    if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);

    return null;
};


/**
 * Determines the address and region for a given row using local parsing.
 * @param row The data row from the file.
 * @param addressCache A cache to store results for identical addresses.
 * @returns A promise that resolves to the parsed address information.
 */
const getAddressInfoForRow = async (row: { [key: string]: any }, addressCache: Map<string, ParsedAddress>): Promise<ParsedAddress> => {
    const primaryAddress = findAddressInRow(row);
    if (!primaryAddress) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }
    
    if (addressCache.has(primaryAddress)) {
        return addressCache.get(primaryAddress)!;
    }

    const parsed = await parseRussianAddress(primaryAddress);
    addressCache.set(primaryAddress, parsed);
    return parsed;
};

/**
 * Pre-processes OKB data into a Map for efficient lookups by region.
 * @param okbData - The raw OKB data array.
 * @returns A Map where keys are normalized region names and values are arrays of OKB rows.
 */
const prepareOkbData = (okbData: OkbDataRow[]): Map<string, OkbDataRow[]> => {
    const okbByRegion = new Map<string, OkbDataRow[]>();
    if (!okbData) return okbByRegion;
    for (const row of okbData) {
        const regionKey = findValueInRow(row, ['регион'])
        const region = standardizeRegion(regionKey);
        if (region && region !== 'Регион не определен') {
            if (!okbByRegion.has(region)) {
                okbByRegion.set(region, []);
            }
            okbByRegion.get(region)!.push(row);
        }
    }
    return okbByRegion;
};

const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        // Use trim() to handle potential whitespace in header names
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword));
        if (foundKey && row[foundKey]) {
            return String(row[foundKey]);
        }
    }
    return '';
};

/**
 * Finds potential clients from the OKB data for a given region, excluding existing clients.
 */
function findPotentialClients(
    region: string,
    existingClients: Set<string>,
    okbByRegion: Map<string, OkbDataRow[]>
): PotentialClient[] {
    const potentialForRegion = okbByRegion.get(region) || [];
    if (potentialForRegion.length === 0) return [];

    const potential: PotentialClient[] = [];
    for (const okbRow of potentialForRegion) {
        const okbAddress = findAddressInRow(okbRow) || '';
        const normalizedOkbAddress = normalizeAddressForSearch(okbAddress);
        
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


/**
 * Processes the final aggregated data to calculate growth metrics and find potential clients.
 */
const finalizeProcessing = async (
    aggregatedData: AggregationMap,
    okbByRegion: Map<string, OkbDataRow[]>,
    hasPotentialColumn: boolean,
    postMessage: PostMessageFn
): Promise<AggregatedDataRow[]> => {
    
    postMessage({ type: 'progress', payload: { percentage: 90, message: 'Расчет потенциала и поиск клиентов...' } });
    
    const finalData: AggregatedDataRow[] = [];
    const aggregatedValues = Object.values(aggregatedData);

    for (const item of aggregatedValues) {
        let potential = item.potential;
        if (!hasPotentialColumn) {
            potential = item.fact * 1.15; 
        } else if (potential < item.fact) {
            potential = item.fact; 
        }
        
        const growthPotential = Math.max(0, potential - item.fact);
        const growthPercentage = potential > 0 ? (growthPotential / potential) * 100 : 0;
        
        const potentialClients = findPotentialClients(item.region, item.clients, okbByRegion);
        
        finalData.push({
            ...item,
            potential,
            growthPotential,
            growthPercentage,
            potentialClients,
            clients: Array.from(item.clients) 
        });
    }
    return finalData;
};

/**
 * A multi-stage algorithm to reliably find the header for the client's name.
 * It prioritizes specific headers, then looks for "clean" generic headers,
 * and finally falls back to the first available generic header to prevent failure.
 * @param headers An array of header strings from the file.
 * @returns The determined client name header string, or undefined if none found.
 */
const findClientNameHeader = (headers: string[]): string | undefined => {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    // 1. Highest priority: specific, unambiguous terms.
    const priorityTerms = ['наименование клиента', 'контрагент', 'клиент'];
    for (const term of priorityTerms) {
        const foundIndex = lowerHeaders.findIndex(h => h.includes(term));
        if (foundIndex !== -1) {
            return headers[foundIndex];
        }
    }
    
    // 2. Medium priority: find a 'наименование' column, but exclude product-related ones.
    const nameColumns = headers.filter(h => h.toLowerCase().trim().includes('наименование'));

    if (nameColumns.length > 0) {
        const cleanNameColumn = nameColumns.find(h => {
            const lH = h.toLowerCase().trim();
            return !lH.includes('номенклатур') && !lH.includes('товар') && !lH.includes('продук');
        });
        
        // If a "clean" one is found, use it. Otherwise, fall back to the first one found.
        return cleanNameColumn || nameColumns[0];
    }
    
    // If no 'наименование' column, return undefined.
    return undefined;
};

// Common processing logic for both XLSX and CSV
// FIX: Added okbData to the function signature to make the raw OKB data available for processing.
async function processData(jsonData: any[], okbData: OkbDataRow[], okbByRegion: Map<string, OkbDataRow[]>, postMessage: PostMessageFn, headers: string[]) {
    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');
    
    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase().includes('потенциал'));
    if (!headers.some(h => (h || '').toLowerCase().includes('вес'))) throw new Error('Файл должен содержать колонку "Вес".');
    
    const clientNameHeader = findClientNameHeader(headers);
    const aggregatedData: AggregationMap = {};
    const addressCache = new Map<string, ParsedAddress>();
    const coordsCache: CoordsCache = new Map();
    const plottableActiveClients: MapPoint[] = [];

    // --- Pass 1: Match against OKB and identify addresses needing geocoding ---
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Сопоставление с ОКБ...' } });
    const okbAddressMap = new Map<string, OkbDataRow>();
    // FIX: This loop now correctly uses the passed `okbData` array, resolving the 'Cannot find name' error.
    for (const row of okbData) {
        const address = findAddressInRow(row);
        if (address) {
            okbAddressMap.set(normalizeAddressForSearch(address), row);
        }
    }

    const addressesToGeocode = new Set<string>();
    for (const row of jsonData) {
        const clientAddress = findAddressInRow(row);
        if (!clientAddress) continue;
        const normalizedAddress = normalizeAddressForSearch(clientAddress);
        const okbMatch = okbAddressMap.get(normalizedAddress);

        if (okbMatch && okbMatch.lat && okbMatch.lon) {
            coordsCache.set(clientAddress, { lat: okbMatch.lat, lon: okbMatch.lon });
        } else {
            addressesToGeocode.add(clientAddress);
        }
    }
    postMessage({ type: 'progress', payload: { percentage: 20, message: `Найдено ${coordsCache.size} адресов в ОКБ.` } });

    // --- Pass 2: Geocode remaining addresses via OSM ---
    const uniqueAddressesToGeocode = Array.from(addressesToGeocode);
    if (uniqueAddressesToGeocode.length > 0) {
        postMessage({ type: 'progress', payload: { percentage: 25, message: `Запрос координат для ${uniqueAddressesToGeocode.length} новых адресов (OSM)...` } });
        for (let i = 0; i < uniqueAddressesToGeocode.length; i++) {
            const address = uniqueAddressesToGeocode[i];
            if (!coordsCache.has(address)) {
                await delay(1100); // Respect Nominatim's usage policy: max 1 request per second.
                const coords = await getCoordinatesFromAddress(address);
                coordsCache.set(address, coords);
            }
            const percentage = 25 + Math.round(((i + 1) / uniqueAddressesToGeocode.length) * 35);
            postMessage({ type: 'progress', payload: { percentage, message: `Геокодирование (OSM): ${i + 1} / ${uniqueAddressesToGeocode.length}` } });
        }
    }
    
    // --- Pass 3: Aggregate data and create plottable points ---
    postMessage({ type: 'progress', payload: { percentage: 65, message: 'Агрегация данных...' } });
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const clientAddress = findAddressInRow(row);
        const parsedAddress = await getAddressInfoForRow(row, addressCache);

        const region = parsedAddress.region;
        const brand = findValueInRow(row, ['торговая марка']);
        const rm = findValueInRow(row, ['рм']);
        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : findValueInRow(row, ['уникальное наименование товара']) || 'Без названия';
        const clientDisplayValue = clientAddress || clientName;

        if (clientAddress) {
            const coords = coordsCache.get(clientAddress);
            if (coords) {
                 plottableActiveClients.push({
                    key: `${coords.lat}-${coords.lon}-${i}`,
                    lat: coords.lat,
                    lon: coords.lon,
                    status: 'match',
                    name: clientName,
                    address: clientAddress,
                    type: findValueInRow(row, ['канал продаж']),
                    contacts: findValueInRow(row, ['контакты']),
                });
            }
        }

        if (isNaN(weight) || region === 'Регион не определен') continue;

        const key = `${region}-${brand}-${rm}`.toLowerCase();
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${region} (${brand})`, brand, rm, city: parsedAddress.city || region,
                region: region, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Set<string>(),
            };
        }
        aggregatedData[key].fact += weight;
        aggregatedData[key].clients.add(clientDisplayValue);

        if (hasPotentialColumn) {
            const potential = parseFloat(String(findValueInRow(row, ['потенциал']) || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }

        if(i % 100 === 0) {
            const percentage = 65 + Math.round((i / jsonData.length) * 25);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i} из ${jsonData.length} строк...` } });
        }
    }

    const finalData = await finalizeProcessing(aggregatedData, okbByRegion, hasPotentialColumn, postMessage);
    
    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
    const resultPayload: WorkerResultPayload = { 
        aggregatedData: finalData, 
        plottableActiveClients 
    };
    postMessage({ type: 'result', payload: resultPayload });
}

self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        const okbByRegion = prepareOkbData(okbData);
        if (file.name.toLowerCase().endsWith('.csv')) {
            postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла CSV...' } });
            const fileContent = await file.text();
            // FIX: Refactored Papa.parse to use its `complete` callback within a Promise.
            // This resolves a TypeScript type inference issue that caused compilation errors.
            const parsedCsv = await new Promise<Papa.ParseResult<any>>((resolve) => {
                Papa.parse(fileContent, {
                    header: true,
                    skipEmptyLines: true,
                    trimHeaders: true,
                    complete: (results) => {
                        resolve(results);
                    },
                });
            });
            await processData(parsedCsv.data, okbData, okbByRegion, postMessage, parsedCsv.meta.fields || []);
        } else {
            postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла XLSX...' } });
            const data = await file.arrayBuffer();
            const workbook = xlsx.read(data, { type: 'array', cellDates: false, cellNF: false });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
            const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
            await processData(jsonData, okbData, okbByRegion, postMessage, headers);
        }
    } catch (error) {
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};
