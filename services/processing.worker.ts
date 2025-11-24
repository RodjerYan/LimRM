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
} from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow, recoverRegion, haversineDistance } from '../utils/dataUtils';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Map<string, MapPoint> } };

// FIX: Define the CommonProcessArgs type to resolve "Cannot find name 'CommonProcessArgs'".
// This type consolidates the arguments passed between different file processing functions within the worker.
type CommonProcessArgs = {
    okbData: OkbDataRow[];
    cacheData: CoordsCache;
    postMessage: PostMessageFn;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- NEW: Coordinate-based matching ---
const MATCH_RADIUS_KM = 0.5; // 500 meters
const GRID_CELL_SIZE = 0.01; // Approx 1.1km at equator, good for city-level density

type OkbSpatialIndex = Map<string, OkbDataRow[]>;
type OkbAddressIndex = Map<string, OkbDataRow>;

/**
 * Builds a spatial grid index and a normalized address index for fast lookups in the OKB data.
 */
const buildOkbIndices = (okbData: OkbDataRow[]): { spatialIndex: OkbSpatialIndex, addressIndex: OkbAddressIndex } => {
    const spatialIndex: OkbSpatialIndex = new Map();
    const addressIndex: OkbAddressIndex = new Map();

    if (!okbData) return { spatialIndex, addressIndex };

    for (const row of okbData) {
        // Address Index
        const address = findAddressInRow(row);
        if (address) {
            const normalized = normalizeAddress(address);
            if (normalized && !addressIndex.has(normalized)) {
                addressIndex.set(normalized, row);
            }
        }

        // Spatial Index
        const lat = row.lat;
        const lon = row.lon;
        if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
            const cellX = Math.floor(lon / GRID_CELL_SIZE);
            const cellY = Math.floor(lat / GRID_CELL_SIZE);
            const key = `${cellX}_${cellY}`;
            if (!spatialIndex.has(key)) {
                spatialIndex.set(key, []);
            }
            spatialIndex.get(key)!.push(row);
        }
    }
    return { spatialIndex, addressIndex };
};

/**
 * Finds the closest OKB point to a given coordinate within a search radius.
 */
const findOkbMatchByCoords = (lat: number, lon: number, spatialIndex: OkbSpatialIndex): OkbDataRow | null => {
    const cellX = Math.floor(lon / GRID_CELL_SIZE);
    const cellY = Math.floor(lat / GRID_CELL_SIZE);
    
    let bestMatch: OkbDataRow | null = null;
    let minDistance = Infinity;

    // Search in a 3x3 grid around the target cell to account for edge cases
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const key = `${cellX + dx}_${cellY + dy}`;
            const candidates = spatialIndex.get(key);
            if (candidates) {
                for (const candidate of candidates) {
                    if (candidate.lat && candidate.lon) {
                        const distance = haversineDistance(lat, lon, candidate.lat, candidate.lon);
                        if (distance < minDistance) {
                            minDistance = distance;
                            bestMatch = candidate;
                        }
                    }
                }
            }
        }
    }

    if (bestMatch && minDistance <= MATCH_RADIUS_KM) {
        return bestMatch;
    }

    return null;
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
    
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация данных ОКБ...' } });
    const { spatialIndex, addressIndex } = buildOkbIndices(okbData);
    
    const okbRegionCounts: { [key: string]: number } = {};
    if (okbData) {
        postMessage({ type: 'progress', payload: { percentage: 8, message: 'Агрегация ОКБ по регионам...' } });
        for (const row of okbData) {
            const address = findAddressInRow(row);
            const distributor = findValueInRow(row, ['дистрибьютор']);
            const parsed = parseRussianAddress(address || '', distributor);
            let region = parsed.region;

            if (region === 'Регион не определен') {
                const rawRegionCol = findValueInRow(row, ['регион', 'область']);
                const cityCol = findValueInRow(row, ['город']);
                const recovered = recoverRegion(rawRegionCol, cityCol);
                if (recovered !== 'Регион не определен') region = recovered;
            }
            
            const normRegion = standardizeRegion(region).trim();
            if (normRegion && normRegion !== 'Регион не определен') {
                okbRegionCounts[normRegion] = (okbRegionCounts[normRegion] || 0) + 1;
            }
        }
    }

    // --- CACHE INITIALIZATION with Redirects ---
    const cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string }>();
    const cacheRedirectMap = new Map<string, string>(); // normalizedOld -> normalizedTarget
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
                    const historyEntries = String(item.history).split(/\r?\n|\s*\|\|\s*/).map(s => s.trim()).filter(Boolean);
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

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rm = findValueInRow(row, ['рм']);

        if (i > 0 && i % 5000 === 0) {
            const percentage = 10 + Math.round((i / jsonData.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработка: ${i.toLocaleString('ru-RU')}...` } });
        }
        
        let clientAddress = findAddressInRow(row);
        const distributor = findValueInRow(row, ['дистрибьютор', 'дистрибьютер']);
        if ((!clientAddress || clientAddress.trim() === '') && (!distributor || distributor.trim() === '')) continue;
        if (!rm) {
            unidentifiedRows.push({ rm: 'РМ не указан', rowData: row, originalIndex: i });
            continue;
        }

        if (clientAddress) {
            let normalizedRaw = normalizeAddress(clientAddress);
            if (deletedAddresses.has(normalizedRaw)) continue;
            if (cacheRedirectMap.has(normalizedRaw)) {
                const newNormalizedTarget = cacheRedirectMap.get(normalizedRaw)!;
                const targetEntry = cacheAddressMap.get(newNormalizedTarget);
                if (targetEntry) clientAddress = targetEntry.originalAddress || clientAddress;
                if (deletedAddresses.has(newNormalizedTarget)) continue;
            }
        }

        const parsedAddressFromFile = parseRussianAddress(clientAddress || '', distributor);
        let finalAddress = parsedAddressFromFile.finalAddress;
        const normalizedFinalAddress = normalizeAddress(finalAddress);

        let matchedOkb: OkbDataRow | null = null;
        let regionForAggregation: string;

        let akbLat: number | undefined, akbLon: number | undefined;
        const cacheEntry = cacheAddressMap.get(normalizedFinalAddress);
        if (cacheEntry?.lat && cacheEntry?.lon) {
            akbLat = cacheEntry.lat;
            akbLon = cacheEntry.lon;
        }

        if (akbLat && akbLon) {
            matchedOkb = findOkbMatchByCoords(akbLat, akbLon, spatialIndex);
        }
        
        if (!matchedOkb) {
            matchedOkb = addressIndex.get(normalizedFinalAddress) || null;
        }
        
        if (matchedOkb) {
            const okbAddress = findAddressInRow(matchedOkb);
            const okbDistributor = findValueInRow(matchedOkb, ['дистрибьютор']);
            regionForAggregation = parseRussianAddress(okbAddress || '', okbDistributor).region;
        } else {
            regionForAggregation = parsedAddressFromFile.region;
        }

        if (regionForAggregation === 'Регион не определен') {
            unidentifiedRows.push({ rm, rowData: row, originalIndex: i });
            continue;
        }
        
        const weight = parseFloat(String(findValueInRow(row, ['вес']) || '0').replace(/\s/g, '').replace(',', '.'));
        if (isNaN(weight)) continue;
        
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
        const brand = findValueInRow(row, ['торговая марка']);
        const key = `${regionForAggregation}-${brand}-${rm}`.toLowerCase();
        
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${regionForAggregation} (${brand})`, brand, rm, city: parsedAddressFromFile.city,
                region: regionForAggregation, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Map<string, MapPoint>(),
            };
        }
        aggregatedData[key].fact += weight;

        if (hasPotentialColumn) {
            const potential = parseFloat(String(findValueInRow(row, ['потенциал']) || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }

        if (!uniquePlottableClients.has(normalizedFinalAddress)) {
            let lat: number | undefined = akbLat, lon: number | undefined = akbLon;
            let isCached = !!(cacheEntry?.lat && cacheEntry?.lon);
            let displayAddress = cacheEntry?.originalAddress || finalAddress;

            if (!lat || !lon) {
                const okbMatch = addressIndex.get(normalizedFinalAddress);
                if (okbMatch?.lat && okbMatch?.lon) {
                    lat = okbMatch.lat;
                    lon = okbMatch.lon;
                } else if (finalAddress && !isCached) {
                    if (!newAddressesToCache[rm]) newAddressesToCache[rm] = [];
                    if (!newAddressesToCache[rm].some(item => item.address === finalAddress)) {
                         newAddressesToCache[rm].push({ address: finalAddress });
                    }
                    if (!addressesToGeocode[rm]) addressesToGeocode[rm] = [];
                    if (!addressesToGeocode[rm].includes(finalAddress)) {
                        addressesToGeocode[rm].push(finalAddress);
                    }
                }
            }
            
            uniquePlottableClients.set(normalizedFinalAddress, {
                key: normalizedFinalAddress, lat, lon, isCached, status: 'match', name: clientName,
                address: displayAddress, city: parsedAddressFromFile.city, region: regionForAggregation, 
                rm, brand, type: findValueInRow(row, ['канал продаж']), contacts: findValueInRow(row, ['контакты']),
                originalRow: row, fact: weight, 
            });
        } else {
             const existing = uniquePlottableClients.get(normalizedFinalAddress);
             if (existing) existing.fact = (existing.fact || 0) + weight;
        }
        
        const mapPointForGroup = uniquePlottableClients.get(normalizedFinalAddress);
        if (mapPointForGroup) aggregatedData[key].clients.set(mapPointForGroup.key, mapPointForGroup);
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
            client.abcCategory = percentage <= 0.80 ? 'A' : (percentage <= 0.95 ? 'B' : 'C');
        });
    }

    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Завершение расчетов...' } });
    const existingClientsForPotentialSearch = new Set(plottableActiveClients.map(client => normalizeAddress(client.address)));

    const finalData: AggregatedDataRow[] = Object.values(aggregatedData).map(item => {
        let potential = item.potential;
        if (!hasPotentialColumn) potential = item.fact * 1.15;
        else if (potential < item.fact) potential = item.fact;
        return {
            ...item, potential,
            growthPotential: Math.max(0, potential - item.fact),
            growthPercentage: potential > 0 ? (Math.max(0, potential - item.fact) / potential) * 100 : 0,
            potentialClients: findPotentialClients(item.region, existingClientsForPotentialSearch, okbData),
            clients: Array.from(item.clients.values()) 
        };
    });

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
