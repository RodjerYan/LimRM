import * as xlsx from 'xlsx';
import * as Papa from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, ParsedAddress, WorkerResultPayload, MapPoint } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
import { normalizeAddressForSearch } from '../utils/dataUtils';
import { getCoordinatesFromAddress, delay } from './geoService';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };
type OkbAddressMap = Map<string, { lat: number; lon: number } | null>;

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
 * Creates a fast lookup map (index) from the OKB data.
 * @param okbData The raw OKB data.
 * @returns A Map where keys are normalized addresses and values are coordinates.
 */
const createOkbAddressIndex = (okbData: OkbDataRow[]): OkbAddressMap => {
    const addressMap: OkbAddressMap = new Map();
    if (!okbData) return addressMap;

    for (const row of okbData) {
        const address = findAddressInRow(row);
        if (address) {
            const normalized = normalizeAddressForSearch(address);
            if (normalized && !addressMap.has(normalized)) { // Keep first entry in case of duplicates
                if (row.lat && row.lon) {
                    addressMap.set(normalized, { lat: row.lat, lon: row.lon });
                } else {
                    addressMap.set(normalized, null); // Mark that address exists but has no coords
                }
            }
        }
    }
    return addressMap;
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
    okbData: OkbDataRow[]
): PotentialClient[] {
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
 * A multi-stage algorithm to reliably find the header for the client's name.
 * @param headers An array of header strings from the file.
 * @returns The determined client name header string, or undefined if none found.
 */
const findClientNameHeader = (headers: string[]): string | undefined => {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    const priorityTerms = ['наименование клиента', 'контрагент', 'клиент'];
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


self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        const commonArgs = { okbData, postMessage };
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

interface CommonProcessArgs {
    okbData: OkbDataRow[];
    postMessage: PostMessageFn;
}

async function processFile(jsonData: any[], headers: string[], { okbData, postMessage }: CommonProcessArgs) {
    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');

    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase().includes('потенциал'));
    if (!headers.some(h => (h || '').toLowerCase().includes('вес'))) throw new Error('Файл должен содержать колонку "Вес".');
    const clientNameHeader = findClientNameHeader(headers);

    const aggregatedData: AggregationMap = {};
    const addressCache = new Map<string, ParsedAddress>();
    const plottableActiveClients: MapPoint[] = [];

    // --- STAGE 1: CREATE OKB INDEX (VERY FAST) ---
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация ОКБ для быстрого поиска...' } });
    const okbAddressIndex = createOkbAddressIndex(okbData);

    // --- STAGE 2: FAST MATCHING & QUEUING FOR GEOCODING (FAST) ---
    postMessage({ type: 'progress', payload: { percentage: 15, message: 'Этап 1: Сопоставление адресов...' } });
    const uniqueSalesAddresses = [...new Set(jsonData.map(findAddressInRow).filter(Boolean) as string[])];
    const coordsCache: Map<string, { lat: number, lon: number } | null> = new Map();
    const addressesToGeocode = new Set<string>();

    for (let i = 0; i < uniqueSalesAddresses.length; i++) {
        const address = uniqueSalesAddresses[i];
        const normalized = normalizeAddressForSearch(address);
        
        if (okbAddressIndex.has(normalized)) {
            const coords = okbAddressIndex.get(normalized);
            // Only add if coords exist in OKB. If they don't, we respect that and don't geocode.
            if (coords) {
                coordsCache.set(address, coords);
            }
        } else {
            // Address is not in OKB at all, queue it for external geocoding
            addressesToGeocode.add(address);
        }

        if (i % 100 === 0) {
            const percentage = 15 + Math.round((i / uniqueSalesAddresses.length) * 30);
            postMessage({ type: 'progress', payload: { percentage, message: `Сопоставление: ${i} / ${uniqueSalesAddresses.length} адресов` } });
        }
    }

    // --- STAGE 3: SELECTIVE GEOCODING (CAN BE SLOW, BUT ONLY FOR NEW CLIENTS) ---
    const osmList = Array.from(addressesToGeocode);
    if (osmList.length > 0) {
        postMessage({ type: 'progress', payload: { percentage: 45, message: `Этап 2: Геокодирование ${osmList.length} новых адресов...` } });
        for (let i = 0; i < osmList.length; i++) {
            const address = osmList[i];
            await delay(1100); // Respect Nominatim's usage policy
            const coords = await getCoordinatesFromAddress(address);
            if (coords) {
                coordsCache.set(address, coords);
            }
            const percentage = 45 + Math.round(((i + 1) / osmList.length) * 30);
            postMessage({ type: 'progress', payload: { percentage, message: `Геокодирование (OSM): ${i + 1} / ${osmList.length}` } });
        }
    }
    
    // --- STAGE 4: DATA AGGREGATION & PLOTTING (FAST) ---
    postMessage({ type: 'progress', payload: { percentage: 75, message: 'Этап 3: Агрегация данных и подготовка карты...' } });
    
    const plottedAddresses = new Set<string>(); // To avoid duplicate points on the map for the same address

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const clientAddress = findAddressInRow(row);
        
        // --- Plotting Logic ---
        if (clientAddress && !plottedAddresses.has(clientAddress)) {
            if (coordsCache.has(clientAddress)) {
                const coords = coordsCache.get(clientAddress);
                 if (coords) {
                    const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : findValueInRow(row, ['уникальное наименование товара']) || 'Без названия';
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
                    plottedAddresses.add(clientAddress);
                }
            }
        }

        // --- Aggregation Logic ---
        const parsedAddress = await getAddressInfoForRow(row, addressCache);
        const region = parsedAddress.region;
        const brand = findValueInRow(row, ['торговая марка']);
        const rm = findValueInRow(row, ['рм']);
        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        
        const clientNameForGroup = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : findValueInRow(row, ['уникальное наименование товара']) || 'Без названия';
        const clientDisplayValue = clientAddress || clientNameForGroup;

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

        if(i % 5000 === 0) {
            const percentage = 75 + Math.round((i / jsonData.length) * 20);
            postMessage({ type: 'progress', payload: { percentage, message: `Агрегация: ${i.toLocaleString('ru-RU')} строк...` } });
        }
    }
    
    // --- STAGE 5: FINAL CALCULATIONS (FAST) ---
    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Завершение расчетов...' } });
    const finalData: AggregatedDataRow[] = [];
    const aggregatedValues = Object.values(aggregatedData);
    const existingClientsForPotentialSearch = new Set(jsonData.map(row => normalizeAddressForSearch(findAddressInRow(row))));

    for (const item of aggregatedValues) {
        let potential = item.potential;
        if (!hasPotentialColumn) {
            potential = item.fact * 1.15; 
        } else if (potential < item.fact) {
            potential = item.fact; 
        }
        
        const growthPotential = Math.max(0, potential - item.fact);
        const growthPercentage = potential > 0 ? (growthPotential / potential) * 100 : 0;
        
        const potentialClients = findPotentialClients(item.region, existingClientsForPotentialSearch, okbData);
        
        finalData.push({
            ...item,
            potential,
            growthPotential,
            growthPercentage,
            potentialClients,
            clients: Array.from(item.clients) 
        });
    }

    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершено!' } });
    const resultPayload: WorkerResultPayload = { 
        aggregatedData: finalData, 
        plottableActiveClients 
    };
    postMessage({ type: 'result', payload: resultPayload });
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
    
    const parsePromise = new Promise<{ data: any[], meta: Papa.ParseMeta }>((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    console.warn('CSV parsing errors:', results.errors);
                }
                resolve({ data: results.data, meta: results.meta });
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    });

    try {
        const { data: jsonData, meta } = await parsePromise;
        if (!jsonData || jsonData.length === 0) {
             throw new Error("CSV файл пуст или не удалось его прочитать.");
        }
        const headers = meta.fields || Object.keys(jsonData[0] || {});
        await processFile(jsonData, headers, args);
    } catch (error) {
        throw new Error(`Failed to parse CSV file: ${(error as Error).message}`);
    }
}