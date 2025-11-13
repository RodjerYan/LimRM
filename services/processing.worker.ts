import * as xlsx from 'xlsx';
import { parse as PapaParse, type ParseResult, type ParseMeta } from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, WorkerResultPayload, MapPoint, GeoCache } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };
type CoordByAddressIndex = Map<string, { lat: number; lon: number }>;
type SimplifiedCoordIndex = Map<string, { lat: number; lon: number; originalAddress: string }>;

const createOkbIndexes = (okbData: OkbDataRow[]): { coordByAddress: CoordByAddressIndex; coordByAddressSimplified: SimplifiedCoordIndex } => {
    const coordByAddress: CoordByAddressIndex = new Map();
    const coordByAddressSimplified: SimplifiedCoordIndex = new Map();

    if (!okbData) return { coordByAddress, coordByAddressSimplified };

    for (const row of okbData) {
        const address = findAddressInRow(row);
        const lat = row.lat;
        const lon = row.lon;
        
        if (address && lat && lon && !isNaN(lat) && !isNaN(lon)) {
            const coords = { lat, lon };
            const strictNormalized = normalizeAddress(address, { simplify: false });
            const simplifiedNormalized = normalizeAddress(address, { simplify: true });

            if (strictNormalized && !coordByAddress.has(strictNormalized)) {
                coordByAddress.set(strictNormalized, coords);
            }
            
            if (simplifiedNormalized && simplifiedNormalized !== strictNormalized) {
                 if (!coordByAddressSimplified.has(simplifiedNormalized)) {
                    coordByAddressSimplified.set(simplifiedNormalized, { ...coords, originalAddress: address });
                }
            }
        }
    }
    return { coordByAddress, coordByAddressSimplified };
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

self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[], geoCache: GeoCache }>) => {
    const { file, okbData, geoCache } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        const commonArgs = { okbData, geoCache, postMessage };
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
    geoCache: GeoCache;
    postMessage: PostMessageFn;
}

async function processFile(jsonData: any[], headers: string[], { okbData, geoCache, postMessage }: CommonProcessArgs) {
    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');

    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase().includes('потенциал'));
    if (!headers.some(h => (h || '').toLowerCase().includes('вес'))) throw new Error('Файл должен содержать колонку "Вес".');
    const clientNameHeader = findClientNameHeader(headers);
    
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация координат из ОКБ...' } });
    const { coordByAddress, coordByAddressSimplified } = createOkbIndexes(okbData);
    postMessage({ type: 'progress', payload: { percentage: 10, message: `Найдено ${coordByAddress.size} адресов с координатами.` } });

    const aggregatedData: AggregationMap = {};
    const plottableActiveClients: MapPoint[] = [];
    const addressesToGeocodeSet = new Set<string>();

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        const clientAddress = findAddressInRow(row);
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : findValueInRow(row, ['уникальное наименование товара']) || 'Без названия';
        const brand = findValueInRow(row, ['торговая марка']);
        const rm = findValueInRow(row, ['рм']);

        let lat: number | undefined = undefined;
        let lon: number | undefined = undefined;
        let accuracy: MapPoint['accuracy'] = 'exact';

        // Priority 1: Check for explicit lat/lon columns in the uploaded file row.
        const latVal = findValueInRow(row, ['широта', 'lat']);
        const lonVal = findValueInRow(row, ['долгота', 'lon', 'lng']);
        if (latVal && lonVal) {
            const parsedLat = parseFloat(String(latVal).replace(',', '.').trim());
            const parsedLon = parseFloat(String(lonVal).replace(',', '.').trim());
            if (!isNaN(parsedLat) && !isNaN(parsedLon) && parsedLat >= -90 && parsedLat <= 90 && parsedLon >= -180 && parsedLon <= 180) {
                lat = parsedLat;
                lon = parsedLon;
                accuracy = 'exact';
            }
        }
        
        if (lat === undefined && clientAddress) {
            // Priority 2: Check local geocoding cache
            const cachedCoords = geoCache[clientAddress];
            if (cachedCoords) {
                lat = cachedCoords.lat;
                lon = cachedCoords.lon;
                accuracy = 'geocoded';
            } else {
                // Priority 3: Match by address using OKB indexes
                const strictNormalized = normalizeAddress(clientAddress);
                const simplifiedNormalized = normalizeAddress(clientAddress, { simplify: true });
                
                let okbCoords = coordByAddress.get(strictNormalized) ||
                                (simplifiedNormalized !== strictNormalized ? coordByAddress.get(simplifiedNormalized) : undefined) ||
                                coordByAddressSimplified.get(strictNormalized) ||
                                (simplifiedNormalized !== strictNormalized ? coordByAddressSimplified.get(simplifiedNormalized) : undefined);

                if (okbCoords) {
                    lat = okbCoords.lat;
                    lon = okbCoords.lon;
                    accuracy = 'exact';
                } else {
                    // If not found anywhere locally, add to the geocoding queue
                    addressesToGeocodeSet.add(clientAddress);
                }
            }
        }

        const parsedAddress = parseRussianAddress(clientAddress || '');
        const region = parsedAddress.region;
        const parsedCity = parsedAddress.city;
        const groupName = (parsedCity !== 'Город не определен') ? parsedCity : region;

        plottableActiveClients.push({
            key: `${clientAddress || 'client'}-${i}`,
            lat,
            lon,
            accuracy,
            name: clientName,
            address: clientAddress || `Адрес не указан`,
            city: groupName,
            region: region,
            rm: rm,
            brand: brand,
            type: findValueInRow(row, ['канал продаж']),
            contacts: findValueInRow(row, ['контакты']),
        });

        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        const clientDisplayValue = clientAddress || clientName;

        if (isNaN(weight) || region === 'Регион не определен') continue;

        const key = `${region}-${brand}-${rm}`.toLowerCase();
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${region} (${brand})`, brand, rm, city: groupName,
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
        plottableActiveClients,
        addressesToGeocode: Array.from(addressesToGeocodeSet)
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