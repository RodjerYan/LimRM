import * as xlsx from 'xlsx';
import { parse as PapaParse, type ParseResult, type ParseMeta } from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, WorkerResultPayload, MapPoint } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
// FIX: Import the new, centralized address processing functions.
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };
// FIX: Define more specific types for the coordinate indexes for clarity and type safety.
type CoordByInnIndex = Map<string, { lat: number; lon: number }>;
type CoordByAddressIndex = Map<string, { lat: number; lon: number }>;


/**
 * Creates fast lookup maps (indexes) from the OKB data for both INN and normalized address.
 * This is a critical performance optimization and improves matching reliability.
 * @param okbData The raw OKB data from Google Sheets.
 * @returns An object containing two maps: one for INN-based lookups and one for address-based lookups.
 */
const createOkbIndexes = (okbData: OkbDataRow[]): { coordByInn: CoordByInnIndex; coordByAddress: CoordByAddressIndex } => {
    const coordByInn: CoordByInnIndex = new Map();
    const coordByAddress: CoordByAddressIndex = new Map();
    if (!okbData) return { coordByInn, coordByAddress };

    for (const row of okbData) {
        const inn = findValueInRow(row, ['инн'])?.trim();
        const address = findAddressInRow(row);
        const lat = row.lat;
        const lon = row.lon;
        
        // Only index rows that have valid coordinates.
        if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
            const coords = { lat, lon };

            // Populate the INN index.
            if (inn && !coordByInn.has(inn)) {
                coordByInn.set(inn, coords);
            }

            // Populate the address index.
            if (address) {
                const normalized = normalizeAddress(address);
                if (normalized && !coordByAddress.has(normalized)) {
                    coordByAddress.set(normalized, coords);
                }
            }
        }
    }
    return { coordByInn, coordByAddress };
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
        // USE CENTRALIZED FUNCTION
        const okbAddress = findAddressInRow(okbRow) || '';
        // USE CENTRALIZED FUNCTION
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
    
    // --- STAGE 1: CREATE OKB COORDINATE INDEXES (INN & ADDRESS) ---
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация координат из ОКБ...' } });
    const { coordByInn, coordByAddress } = createOkbIndexes(okbData);
    postMessage({ type: 'progress', payload: { percentage: 10, message: `Найдено ${coordByInn.size} ИНН и ${coordByAddress.size} адресов с координатами.` } });

    // --- STAGE 2: PROCESS & AGGREGATE SALES DATA (CPU-BOUND, NO NETWORK) ---
    const aggregatedData: AggregationMap = {};
    const plottableActiveClients: MapPoint[] = [];
    const plottedKeys = new Set<string>(); // To avoid duplicate map points

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // --- 1. Data Extraction ---
        const clientInn = findValueInRow(row, ['инн'])?.trim();
        const clientAddress = findAddressInRow(row);
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : findValueInRow(row, ['уникальное наименование товара']) || 'Без названия';

        // --- 2. Coordinate Resolution (INN-first approach) ---
        let lat: number | null = null;
        let lon: number | null = null;
        let coordsSource: 'file' | 'okb_inn' | 'okb_address' | 'none' = 'none';

        // Priority 1: Check for explicit lat/lon columns in the uploaded file row.
        const latVal = findValueInRow(row, ['широта', 'lat']);
        const lonVal = findValueInRow(row, ['долгота', 'lon', 'lng']);
        if (latVal && lonVal) {
            const parsedLat = parseFloat(String(latVal).replace(',', '.').trim());
            const parsedLon = parseFloat(String(lonVal).replace(',', '.').trim());
            if (!isNaN(parsedLat) && !isNaN(parsedLon) && parsedLat >= -90 && parsedLat <= 90 && parsedLon >= -180 && parsedLon <= 180) {
                lat = parsedLat;
                lon = parsedLon;
                coordsSource = 'file';
            }
        }
        
        // Priority 2: If no coords in file, use the highly reliable INN index.
        if (coordsSource === 'none' && clientInn) {
            const okbCoords = coordByInn.get(clientInn);
            if (okbCoords) {
                lat = okbCoords.lat;
                lon = okbCoords.lon;
                coordsSource = 'okb_inn';
            }
        }
        
        // Priority 3: Fallback to the less reliable address index if INN fails.
        if (coordsSource === 'none' && clientAddress) {
            const normalizedAddress = normalizeAddress(clientAddress);
            const okbCoords = coordByAddress.get(normalizedAddress);
            if (okbCoords) {
                lat = okbCoords.lat;
                lon = okbCoords.lon;
                coordsSource = 'okb_address';
            }
        }

        // --- 3. Plotting Logic ---
        if (coordsSource !== 'none' && lat !== null && lon !== null) {
            // Use INN for key if available, otherwise address, otherwise coordinates.
            const plotKey = clientInn || (clientAddress ? normalizeAddress(clientAddress) : `${lat.toFixed(5)},${lon.toFixed(5)}`);
            
            if (!plottedKeys.has(plotKey)) {
                let correctedLon = lon;
                if (correctedLon < -100) {
                    correctedLon += 360;
                }

                plottableActiveClients.push({
                    key: `${lat}-${lon}-${i}`,
                    lat: lat,
                    lon: correctedLon,
                    status: 'match',
                    name: clientName,
                    address: clientAddress || `Координаты из ОКБ: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
                    type: findValueInRow(row, ['канал продаж']),
                    contacts: findValueInRow(row, ['контакты']),
                });
                plottedKeys.add(plotKey);
            }
        }

        // --- 4. Aggregation Logic ---
        const region = parseRussianAddress(clientAddress || '').region;
        const brand = findValueInRow(row, ['торговая марка']);
        const rm = findValueInRow(row, ['рм']);
        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        
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
            const potential = parseFloat(String(findValueInRow(row, ['потенциал']) || '0').replace(/\s/g, '').replace(',', '.'));
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
}.