import * as xlsx from 'xlsx';
import * as Papa from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, WorkerResultPayload, MapPoint } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
import { normalizeAddressForSearch } from '../utils/dataUtils';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };
type OkbAddressIndex = Map<string, { lat: number; lon: number }>;


// --- NEW: Synonym-based Header Recognition System ---

const ADDRESS_SYNONYMS = ['адрес', 'юрадрес', 'юр. адрес', 'адрес доставки', 'юридический адрес', 'адрес тт'];
const CLIENT_NAME_SYNONYMS = ['наименование клиента', 'контрагент', 'клиент', 'наименование', 'торговая точка', 'тт'];
const WEIGHT_SYNONYMS = ['вес', 'масса', 'объем', 'объём', 'количество', 'кол-во', 'факт'];
const BRAND_SYNONYMS = ['торговая марка', 'бренд', 'тм'];
const RM_SYNONYMS = ['рм', 'региональный менеджер', 'менеджер'];
const POTENTIAL_SYNONYMS = ['потенциал'];
const CLIENT_TYPE_SYNONYMS = ['вид деятельности', 'тип клиента', 'канал продаж'];
const CONTACTS_SYNONYMS = ['контакты', 'телефон', 'контакт'];

/**
 * Finds the actual header name from a list of headers based on a prioritized list of synonyms.
 * @param headers The list of headers from the uploaded file.
 * @param synonyms A list of lowercase strings to look for.
 * @returns The found header name or null if not found.
 */
const findHeader = (headers: string[], synonyms: string[]): string | null => {
    const lowerHeaders = headers.map(h => (h || '').toLowerCase().trim());
    for (const synonym of synonyms) {
        const foundHeader = headers[lowerHeaders.findIndex(lh => lh.includes(synonym))];
        if (foundHeader) {
            return foundHeader;
        }
    }
    return null;
};

// --- End of new system ---


/**
 * Creates a fast lookup map (index) from the OKB data. This version is optimized for fuzzy matching
 * by creating two types of keys for each address: a full one and one without numbers.
 * @param okbData The raw OKB data.
 * @returns A Map where keys are normalized addresses and values are coordinate objects.
 */
const createOkbAddressIndex = (okbData: OkbDataRow[]): OkbAddressIndex => {
    const addressMap: OkbAddressIndex = new Map();
    if (!okbData) return addressMap;
    const okbAddressHeader = findHeader(Object.keys(okbData[0] || {}), ADDRESS_SYNONYMS);

    for (const row of okbData) {
        const address = okbAddressHeader ? String(row[okbAddressHeader] || '') : null;
        if (address && row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
            const coords = { lat: row.lat, lon: row.lon };
            const primaryKey = normalizeAddressForSearch(address);
            if (primaryKey && !addressMap.has(primaryKey)) {
                addressMap.set(primaryKey, coords);
            }
            if (primaryKey) {
                const secondaryKey = primaryKey.replace(/\d/g, '').replace(/\s+/g, ' ').trim();
                if (secondaryKey && secondaryKey !== primaryKey && secondaryKey.length > 5 && !addressMap.has(secondaryKey)) {
                    addressMap.set(secondaryKey, coords);
                }
            }
        }
    }
    return addressMap;
};

/**
 * Finds potential clients from the OKB data for a given region, excluding existing clients.
 */
function findPotentialClients(
    region: string,
    existingClients: Set<string>,
    okbData: OkbDataRow[],
    headers: { address: string | null; clientName: string | null; type: string | null; }
): PotentialClient[] {
    if (!okbData || !headers.address || !headers.clientName) return [];
    
    const potentialForRegion = okbData.filter(row => {
        const regionKey = Object.keys(row).find(k => k.toLowerCase().includes('регион'));
        const standardized = regionKey ? standardizeRegion(String(row[regionKey])) : '';
        return standardized === region;
    });
    
    if (potentialForRegion.length === 0) return [];

    const potential: PotentialClient[] = [];
    for (const okbRow of potentialForRegion) {
        const okbAddress = String(okbRow[headers.address] || '');
        const normalizedOkbAddress = normalizeAddressForSearch(okbAddress);
        
        if (okbAddress && !existingClients.has(normalizedOkbAddress)) {
            const client: PotentialClient = {
                name: String(okbRow[headers.clientName]) || 'Без названия',
                address: okbAddress,
                type: headers.type ? String(okbRow[headers.type]) || 'н/д' : 'н/д',
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
    
    // --- STAGE 1: INTELLIGENT HEADER DETECTION ---
    postMessage({ type: 'progress', payload: { percentage: 2, message: 'Анализ заголовков файла...' } });
    const headerMap = {
        address: findHeader(headers, ADDRESS_SYNONYMS),
        clientName: findHeader(headers, CLIENT_NAME_SYNONYMS),
        weight: findHeader(headers, WEIGHT_SYNONYMS),
        brand: findHeader(headers, BRAND_SYNONYMS),
        rm: findHeader(headers, RM_SYNONYMS),
        potential: findHeader(headers, POTENTIAL_SYNONYMS),
        clientType: findHeader(headers, CLIENT_TYPE_SYNONYMS),
        contacts: findHeader(headers, CONTACTS_SYNONYMS),
    };

    // --- NEW: VALIDATION ---
    if (!headerMap.address) throw new Error("Не удалось найти колонку с адресом. Проверьте, что она называется 'Адрес', 'Юридический адрес' или подобным образом.");
    if (!headerMap.weight) throw new Error("Не удалось найти обязательную колонку с весом продаж. Проверьте, что она называется 'Вес', 'Масса', 'Количество' или 'Факт'.");
    
    // --- FIX: Client name is now optional. If not found, address will be used instead. ---
    if (!headerMap.clientName) {
        postMessage({ type: 'error', payload: "Колонка 'Наименование клиента' не найдена. Вместо нее будет использоваться адрес." });
        headerMap.clientName = headerMap.address;
    }

    if (!headerMap.brand) postMessage({ type: 'error', payload: "Колонка 'Бренд' не найдена, данные будут сгруппированы без учета бренда." });
    if (!headerMap.rm) postMessage({ type: 'error', payload: "Колонка 'РМ' не найдена, данные будут сгруппированы без учета РМ." });


    // --- STAGE 2: CREATE OKB COORDINATE INDEX (VERY FAST) ---
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация координат из ОКБ...' } });
    const okbCoordIndex = createOkbAddressIndex(okbData);
    postMessage({ type: 'progress', payload: { percentage: 10, message: `Найдено ${okbCoordIndex.size} ключей адресов с координатами.` } });

    // --- STAGE 3: PROCESS & AGGREGATE SALES DATA (CPU-BOUND, NO NETWORK) ---
    const aggregatedData: AggregationMap = {};
    const plottableActiveClients: MapPoint[] = [];
    const plottedAddresses = new Set<string>();

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        const clientAddress = String(row[headerMap.address!] || '');
        
        // --- Plotting Logic ---
        if (clientAddress && !plottedAddresses.has(clientAddress)) {
            const normalizedAddress = normalizeAddressForSearch(clientAddress);
            let coords = okbCoordIndex.get(normalizedAddress);
            if (!coords && normalizedAddress) {
                const noNumbersNormalized = normalizedAddress.replace(/\d/g, '').replace(/\s+/g, ' ').trim();
                if (noNumbersNormalized && noNumbersNormalized.length > 5) {
                    coords = okbCoordIndex.get(noNumbersNormalized);
                }
            }
            if (coords) {
                plottableActiveClients.push({
                    key: `${coords.lat}-${coords.lon}-${i}`,
                    lat: coords.lat,
                    lon: coords.lon,
                    status: 'match',
                    // Now correctly uses clientName which might be the address
                    name: String(row[headerMap.clientName!] || 'Без названия'),
                    address: clientAddress,
                    type: headerMap.clientType ? String(row[headerMap.clientType] || '') : 'н/д',
                    contacts: headerMap.contacts ? String(row[headerMap.contacts] || '') : undefined,
                });
                plottedAddresses.add(clientAddress);
            }
        }

        // --- Aggregation Logic ---
        const region = parseRussianAddress(clientAddress || '').region;
        const brand = headerMap.brand ? String(row[headerMap.brand] || 'Без бренда') : 'Без бренда';
        const rm = headerMap.rm ? String(row[headerMap.rm] || 'Без РМ') : 'Без РМ';
        const weight = parseFloat(String(row[headerMap.weight!] || '0').replace(/\s/g, '').replace(',', '.'));
        
        // This correctly uses the clientName header, which now falls back to the address header if the original client name is missing.
        const clientDisplayValue = String(row[headerMap.clientName!] || 'Без названия');

        if (isNaN(weight) || region === 'Регион не определен' || !rm || !brand) continue;

        const key = `${region}-${brand}-${rm}`.toLowerCase();
        if (!aggregatedData[key]) {
            const city = parseRussianAddress(clientAddress || '').city;
            aggregatedData[key] = {
                key, clientName: `${region} (${brand})`, brand, rm, city: city || region,
                region: region, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Set<string>(),
            };
        }
        aggregatedData[key].fact += weight;
        aggregatedData[key].clients.add(clientDisplayValue);

        if (headerMap.potential) {
            const potential = parseFloat(String(row[headerMap.potential] || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }
        
        if (i > 0 && i % 10000 === 0) {
            const percentage = 10 + Math.round((i / jsonData.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработка: ${i.toLocaleString('ru-RU')} / ${jsonData.length.toLocaleString('ru-RU')}...` } });
        }
    }
    
    // --- STAGE 4: FINAL CALCULATIONS (FAST) ---
    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Завершение расчетов...' } });
    const finalData: AggregatedDataRow[] = [];
    const aggregatedValues = Object.values(aggregatedData);
    const existingClientsForPotentialSearch = new Set(jsonData.map(row => normalizeAddressForSearch(row[headerMap.address!])));

    const okbHeaders = {
        address: findHeader(Object.keys(okbData[0] || {}), ADDRESS_SYNONYMS),
        clientName: findHeader(Object.keys(okbData[0] || {}), CLIENT_NAME_SYNONYMS),
        type: findHeader(Object.keys(okbData[0] || {}), CLIENT_TYPE_SYNONYMS),
    };

    for (const item of aggregatedValues) {
        let potential = item.potential;
        if (!headerMap.potential) {
            potential = item.fact * 1.15; 
        } else if (potential < item.fact) {
            potential = item.fact; 
        }
        
        const growthPotential = Math.max(0, potential - item.fact);
        const growthPercentage = potential > 0 ? (growthPotential / potential) * 100 : 0;
        
        const potentialClients = findPotentialClients(item.region, existingClientsForPotentialSearch, okbData, okbHeaders);
        
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