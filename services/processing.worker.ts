import * as xlsx from 'xlsx';
import { parse as PapaParse, type ParseResult, type ParseMeta } from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, WorkerResultPayload, MapPoint } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
// FIX: Import the new, centralized address processing functions.
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };
type OkbAddressIndex = Map<string, { lat: number; lon: number }>;


/**
 * Creates a fast lookup map (index) from the OKB data, storing only entries with valid coordinates.
 * @param okbData The raw OKB data.
 * @returns A Map where keys are normalized addresses and values are coordinate objects.
 */
const createOkbAddressIndex = (okbData: OkbDataRow[]): OkbAddressIndex => {
    const addressMap: OkbAddressIndex = new Map();
    if (!okbData) return addressMap;

    for (const row of okbData) {
        // USE CENTRALIZED FUNCTION
        const address = findAddressInRow(row);
        // CRITICAL CHANGE: Only index addresses that HAVE valid coordinates.
        if (address && row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
            // USE CENTRALIZED FUNCTION
            const normalized = normalizeAddress(address);
            if (normalized && !addressMap.has(normalized)) { // Keep first entry in case of duplicates
                addressMap.set(normalized, { lat: row.lat, lon: row.lon });
            }
        }
    }
    return addressMap;
};


/**
 * A robust helper to find a value in a case-insensitive representation of a row.
 * @param iRow A row object where all keys are lowercased.
 * @param keywords An array of lowercase keywords to search for.
 * @returns The found value or an empty string.
 */
const getValueFromInsensitiveRow = (iRow: { [key: string]: any }, keywords: string[]): string => {
    for (const key of keywords) {
        const val = iRow[key];
        if (val !== undefined && val !== null && val !== '') {
            return String(val);
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
    
    // Helper to find value within OKB row, as its structure is known
    const findValueInOkbRow = (row: OkbDataRow, keywords: string[]): string => {
        const rowKeys = Object.keys(row);
        for (const keyword of keywords) {
            const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword));
            if (foundKey && row[foundKey]) {
                return String(row[foundKey]);
            }
        }
        return '';
    };

    const potentialForRegion = okbData.filter(row => {
        const regionKey = findValueInOkbRow(row, ['регион']);
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
                name: findValueInOkbRow(okbRow, ['наименование', 'клиент']) || 'Без названия',
                address: okbAddress,
                type: findValueInOkbRow(okbRow, ['вид деятельности', 'тип']) || 'н/д',
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
    
    const lowerHeaders = headers.map(h => (h || '').toLowerCase());
    const hasPotentialColumn = lowerHeaders.some(h => h.includes('потенциал'));
    if (!lowerHeaders.some(h => h.includes('вес'))) throw new Error('Файл должен содержать колонку "Вес".');
    
    // --- STAGE 1: CREATE OKB COORDINATE INDEX (VERY FAST) ---
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация координат из ОКБ...' } });
    const okbCoordIndex = createOkbAddressIndex(okbData);
    postMessage({ type: 'progress', payload: { percentage: 10, message: `Найдено ${okbCoordIndex.size} адресов с координатами.` } });

    // --- STAGE 2: PROCESS & AGGREGATE SALES DATA (CPU-BOUND, NO NETWORK) ---
    const aggregatedData: AggregationMap = {};
    const plottableActiveClients: MapPoint[] = [];
    const plottedKeys = new Set<string>(); // To avoid duplicate map points

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Create a case-insensitive version of the row for robust key access
        const iRow: { [key: string]: any } = {};
        for (const key in row) {
            iRow[key.toLowerCase().trim()] = row[key];
        }

        // --- 1. Data Extraction ---
        const clientAddress = findAddressInRow(row) || '';
        const clientName = getValueFromInsensitiveRow(iRow, ['наименование клиента', 'контрагент', 'клиент', 'уникальное наименование товара']) || 'Без названия';

        // --- 2. Coordinate Resolution ---
        let lat: number | null = null;
        let lon: number | null = null;
        let coordsSource: 'file' | 'okb' | 'none' = 'none';
        
        const latVal = getValueFromInsensitiveRow(iRow, ['широта', 'lat', 'latitude', 'широта (lat)']);
        const lonVal = getValueFromInsensitiveRow(iRow, ['долгота', 'lon', 'lng', 'longitude', 'долгота (lon)']);
        
        if (latVal && lonVal) {
            let parsedLat = parseFloat(String(latVal).replace(',', '.').replace(/[^\d.-]/g, ''));
            let parsedLon = parseFloat(String(lonVal).replace(',', '.').replace(/[^\d.-]/g, ''));
            if (Math.abs(parsedLat) > 90 && Math.abs(parsedLon) <= 90) {
                [parsedLat, parsedLon] = [parsedLon, parsedLat];
            }
            if (!isNaN(parsedLat) && !isNaN(parsedLon) && Math.abs(parsedLat) <= 90 && Math.abs(parsedLon) <= 180) {
                lat = parsedLat;
                lon = parsedLon;
                coordsSource = 'file';
            }
        }
        
        if (coordsSource === 'none' && clientAddress) {
            const normalizedAddress = normalizeAddress(clientAddress);
            const okbCoords = okbCoordIndex.get(normalizedAddress);
            if (okbCoords) {
                lat = okbCoords.lat;
                lon = okbCoords.lon;
                coordsSource = 'okb';
            }
        }

        // --- 3. Plotting Logic ---
        if (coordsSource !== 'none' && lat !== null && lon !== null) {
            let plotKey = normalizeAddress(`${clientName} ${clientAddress}`);
            if (!plotKey) {
                plotKey = `${lat.toFixed(5)},${lon.toFixed(5)}-${i}`;
            }
            
            if (!plottedKeys.has(plotKey)) {
                plottableActiveClients.push({
                    key: plotKey,
                    lat: lat,
                    lon: lon,
                    status: 'match',
                    name: clientName,
                    address: clientAddress || `Координаты из файла: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
                    type: getValueFromInsensitiveRow(iRow, ['канал продаж']),
                    contacts: getValueFromInsensitiveRow(iRow, ['контакты']),
                });
                plottedKeys.add(plotKey);
            }
        }

        // --- 4. Aggregation Logic ---
        const region = parseRussianAddress(clientAddress || '').region;
        const brand = getValueFromInsensitiveRow(iRow, ['торговая марка', 'бренд']);
        const rm = getValueFromInsensitiveRow(iRow, ['рм']);
        const weightStr = getValueFromInsensitiveRow(iRow, ['вес', 'факт', 'объем']);
        const weight = parseFloat(weightStr.replace(/\s/g, '').replace(',', '.'));
        
        const clientDisplayValue = clientAddress || clientName;

        if (isNaN(weight) || region === 'Регион не определен') continue;

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

        if (hasPotentialColumn) {
            const potentialStr = getValueFromInsensitiveRow(iRow, ['потенциал']);
            const potential = parseFloat(potentialStr.replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }
        
        if (i > 0 && i % 10000 === 0) {
            const percentage = 10 + Math.round((i / jsonData.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработка: ${i.toLocaleString('ru-RU')} / ${jsonData.length.toLocaleString('ru-RU')}...` } });
        }
    }
    
    // --- STAGE 3: FINAL CALCULATIONS (FAST) ---
    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Завершение расчетов...' } });
    const finalData: AggregatedDataRow[] = [];
    const aggregatedValues = Object.values(aggregatedData);
    const existingClientsForPotentialSearch = new Set(jsonData.map(row => normalizeAddress(findAddressInRow(row))));

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
    
    const parsePromise = new Promise<{ data: any[], meta: ParseMeta }>((resolve, reject) => {
        PapaParse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: ParseResult<any>) => {
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