
import * as XLSX from 'xlsx';
import { 
    WorkerMessage, 
    WorkerResultPayload,
    AggregatedDataRow,
    MapPoint,
    UnidentifiedRow,
    OkbDataRow,
    CoordsCache
} from '../types';
import { parseRussianAddress } from './addressParser';
import { normalizeAddress, recoverRegion } from '../utils/dataUtils';
import { enrichDataWithSmartPlan } from './planning/integration';

// Helper to read file as ArrayBuffer
const readFile = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
    });
};

// Helper to normalize array of arrays (from Cloud) to array of objects
function normalizeSheetData(data: any[][]): any[] {
    if (!data || data.length < 2) return [];
    const headers = data[0].map(h => String(h || '').trim());
    const rows = data.slice(1);
    return rows.map(row => {
        const obj: any = {};
        headers.forEach((h, i) => {
            if (h) obj[h] = row[i];
        });
        return obj;
    });
}

/**
 * Optimized helper to find the best matching key from headers ONCE.
 */
function detectColumnKey(sampleRow: any, keywords: string[]): string | undefined {
    if (!sampleRow) return undefined;
    const keys = Object.keys(sampleRow);
    // 1. Try Exact Match
    for (const kw of keywords) {
        const match = keys.find(k => k.toLowerCase().trim() === kw);
        if (match) return match;
    }
    // 2. Try Partial Match
    for (const kw of keywords) {
        const match = keys.find(k => k.toLowerCase().trim().includes(kw));
        if (match) return match;
    }
    return undefined;
}

// Helper variables for background tasks accumulation
let newAddressesToCache: Record<string, { address: string }[]> = {};
let addressesToGeocode: Record<string, string[]> = {};

// Typed payload interface to fix implicit any errors
interface ProcessPayload {
    file?: File;
    rawSheetData?: any[][];
    cacheData: CoordsCache;
    okbData: OkbDataRow[];
}

// Main Worker Event Listener
self.onmessage = async (event: MessageEvent) => {
    const { type, payload } = event.data;

    if (type === 'process') {
        // Explicitly cast payload to typed interface
        const { file, rawSheetData, cacheData, okbData } = payload as ProcessPayload;
        
        try {
            // Reset background task accumulators
            newAddressesToCache = {};
            addressesToGeocode = {};

            postMessage({ type: 'progress', payload: { percentage: 5, message: 'Чтение данных...' } });

            let rawRows: any[] = [];

            // 1. Load Data
            if (file) {
                try {
                    const buffer = await readFile(file);
                    const workbook = XLSX.read(buffer, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                } catch (e) {
                    throw new Error('Ошибка чтения Excel файла. Проверьте формат.');
                }
            } else if (rawSheetData) {
                rawRows = normalizeSheetData(rawSheetData);
            } else {
                throw new Error('Нет данных для обработки');
            }

            if (rawRows.length === 0) {
                throw new Error('Файл пуст или не содержит данных.');
            }

            // --- PERFORMANCE OPTIMIZATION: DETECT COLUMNS ONCE ---
            postMessage({ type: 'progress', payload: { percentage: 10, message: 'Анализ структуры файла...' } });
            
            const sampleRow = rawRows[0];
            const colMap = {
                clientName: detectColumnKey(sampleRow, ['наименование', 'клиент', 'партнер', 'контрагент', 'name']),
                address: detectColumnKey(sampleRow, ['адрес тт limkorm', 'фактический адрес', 'юридический адрес', 'адрес', 'address']), // Prioritize specific keys
                rm: detectColumnKey(sampleRow, ['рм', 'менеджер', 'manager', 'responsible', 'сотрудник']),
                brand: detectColumnKey(sampleRow, ['бренд', 'brand', 'торговая марка', 'тм']),
                packaging: detectColumnKey(sampleRow, ['фасовка', 'упаковка', 'вид упаковки', 'вес', 'packaging']),
                distributor: detectColumnKey(sampleRow, ['дистрибьютор', 'поставщик', 'distributor']),
                type: detectColumnKey(sampleRow, ['канал', 'тип', 'вид деятельности', 'type', 'категория']),
                fact: detectColumnKey(sampleRow, ['факт', 'продажи', 'sales', 'объем', 'вес нетто', 'количество']),
                potential: detectColumnKey(sampleRow, ['потенциал', 'план', 'potential']),
                region: detectColumnKey(sampleRow, ['регион', 'область', 'субъект', 'region']),
                city: detectColumnKey(sampleRow, ['город', 'сити', 'city']),
                contacts: detectColumnKey(sampleRow, ['контакты', 'телефон', 'email'])
            };

            // Fallback for address if strict detection failed: look for generic 'город' if specific address col missing
            if (!colMap.address) {
                 colMap.address = detectColumnKey(sampleRow, ['город', 'сити', 'населенный пункт']); 
            }

            postMessage({ type: 'progress', payload: { percentage: 15, message: 'Индексация базы OKB...' } });

            // 2. Index OKB for fast lookup
            // Create a Map of normalized addresses from OKB for O(1) matching
            const okbAddressIndex = new Map<string, { lat: number, lon: number }>();
            const okbCoordSet = new Set<string>(); // For region stats calculation
            
            // Helper for normalization
            const getNormKey = (addr: string) => normalizeAddress(addr);

            if (okbData && Array.isArray(okbData)) {
                // Optimization: Find OKB address column once
                // We know OKB structure is fixed usually, but let's be safe. 
                // Note: OKBDataRow type has 'Юридический адрес' as optional, but we can assume keys.
                
                // Pre-scan keys from the first row if available
                const okbSample = okbData[0] || {};
                const okbKeys = Object.keys(okbSample);
                const okbAddrKey = okbKeys.find(k => k.toLowerCase().includes('адрес')) || 'Юридический адрес';

                for (const row of okbData) {
                    if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                        // Index by normalized address
                        const addr = row[okbAddrKey] || row['Адрес'] || '';
                        if (addr) {
                            const normKey = getNormKey(String(addr));
                            if (normKey) okbAddressIndex.set(normKey, { lat: row.lat, lon: row.lon });
                        }
                        
                        // Index coordinates for "Active in OKB" check
                        okbCoordSet.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`);
                    }
                }
            }

            postMessage({ type: 'progress', payload: { percentage: 30, message: 'Анализ адресов и геокодирование...' } });

            // 3. Process Rows
            const aggregatedMap = new Map<string, AggregatedDataRow>();
            const plottableActiveClients: MapPoint[] = [];
            const unidentifiedRows: UnidentifiedRow[] = [];
            
            // Helper to collect data for cache updates
            const addToCacheQueue = (rm: string, address: string) => {
                if (!newAddressesToCache[rm]) newAddressesToCache[rm] = [];
                newAddressesToCache[rm].push({ address });
            };
            
            const addToGeocodeQueue = (rm: string, address: string) => {
                if (!addressesToGeocode[rm]) addressesToGeocode[rm] = [];
                addressesToGeocode[rm].push(address);
            };

            // Optimization: Memoize address parsing results
            const addressParseCache = new Map<string, { region: string, city: string, finalAddress: string }>();

            const totalRows = rawRows.length;

            for (let i = 0; i < totalRows; i++) {
                const row = rawRows[i];
                if (i % 2000 === 0) { // Update progress less frequently to save IO time
                    const progress = 30 + Math.floor((i / totalRows) * 40); // 30% to 70%
                    postMessage({ type: 'progress', payload: { percentage: progress, message: `Обработка строки ${i} из ${totalRows}...` } });
                }

                // Extract fields using pre-calculated map (O(1))
                const clientName = (colMap.clientName ? row[colMap.clientName] : '') || 'Неизвестный клиент';
                const rawAddress = (colMap.address ? row[colMap.address] : '');
                const rmName = (colMap.rm ? row[colMap.rm] : '') || 'Не назначен';
                const brand = (colMap.brand ? row[colMap.brand] : '') || 'Прочее';
                const packaging = (colMap.packaging ? row[colMap.packaging] : '') || 'Не указана';
                const distributor = (colMap.distributor ? row[colMap.distributor] : '');
                const type = (colMap.type ? row[colMap.type] : '') || 'Розница';
                const regionCol = (colMap.region ? row[colMap.region] : '');
                const cityCol = (colMap.city ? row[colMap.city] : '');
                const contacts = (colMap.contacts ? row[colMap.contacts] : '');
                
                // Parse Numbers
                let fact = 0;
                if (colMap.fact) {
                    const val = String(row[colMap.fact]).replace(',', '.').replace(/[^0-9.-]/g, ''); // Faster regex
                    fact = parseFloat(val) || 0;
                }
                
                let potential = 0;
                if (colMap.potential) {
                    const val = String(row[colMap.potential]).replace(',', '.').replace(/[^0-9.-]/g, '');
                    potential = parseFloat(val) || 0;
                }

                // Skip completely empty rows
                if (!rawAddress && clientName === 'Неизвестный клиент' && fact === 0) continue;

                // --- ADDRESS PROCESSING ---
                let lat: number | undefined;
                let lon: number | undefined;
                let status: 'match' | 'potential' = 'potential';
                let isCached = false;
                let isGeocoding = false;
                let finalCity = '';
                let finalRegion = '';
                let normalizedAddrKey = '';

                if (rawAddress) {
                    // 1. Parse & Normalize (With Memoization)
                    const parseKey = `${rawAddress}|${distributor}`;
                    let parsed = addressParseCache.get(parseKey);
                    
                    if (!parsed) {
                        parsed = parseRussianAddress(rawAddress, distributor);
                        addressParseCache.set(parseKey, parsed);
                    }
                    
                    // Recover Region
                    // If region column exists in file, use it to aid recovery
                    finalRegion = regionCol ? recoverRegion(regionCol, parsed.city) : parsed.region;
                    finalCity = cityCol || parsed.city; // Prefer explicit city col if avail
                    
                    const addressForMatching = parsed.finalAddress || rawAddress;
                    normalizedAddrKey = getNormKey(addressForMatching);

                    // 2. Cache Lookup
                    const rmCache = cacheData[rmName];
                    let cachedRecord = null;
                    
                    if (rmCache) {
                        // O(N) search in cache array - this is unavoidable unless we index cache too.
                        // Given cache size per RM is usually small (<1000), it's acceptable.
                        // Optimization: Try exact normalized match first
                        cachedRecord = rmCache.find(c => getNormKey(c.address) === normalizedAddrKey);
                        
                        // If no match, check history
                        if (!cachedRecord) {
                             cachedRecord = rmCache.find(c => c.history && c.history.includes(rawAddress)); 
                        }
                    }

                    if (cachedRecord) {
                        if (cachedRecord.lat && cachedRecord.lon && !cachedRecord.isDeleted) {
                            lat = cachedRecord.lat;
                            lon = cachedRecord.lon;
                            status = 'match';
                            isCached = true;
                        } else if (cachedRecord.isInvalid) {
                            // Valid record but explicitly marked as invalid address, treat as cached but no coords
                            isCached = true; 
                        }
                    } else {
                        // 3. OKB Lookup (Fallback)
                        const okbMatch = okbAddressIndex.get(normalizedAddrKey);
                        if (okbMatch) {
                            lat = okbMatch.lat;
                            lon = okbMatch.lon;
                            status = 'match';
                            addToCacheQueue(rmName, addressForMatching);
                        } else {
                            // 4. Not in Cache, Not in OKB -> Needs Geocoding
                            addToCacheQueue(rmName, addressForMatching);
                            addToGeocodeQueue(rmName, addressForMatching);
                            isGeocoding = true;
                        }
                    }
                } else {
                    // No address
                    finalRegion = regionCol ? recoverRegion(regionCol, '') : 'Регион не определен';
                    finalCity = cityCol || 'Город не определен';
                }

                // --- AGGREGATION ---
                // Group Key: RM + Region + ClientName + Brand + Packaging
                const groupKey = `${rmName}|${finalRegion}|${clientName}|${brand}|${packaging}`;
                
                if (!aggregatedMap.has(groupKey)) {
                    aggregatedMap.set(groupKey, {
                        key: groupKey,
                        rm: rmName,
                        clientName: clientName,
                        brand: brand,
                        packaging: packaging,
                        city: finalCity,
                        region: finalRegion,
                        fact: 0,
                        potential: 0,
                        growthPotential: 0,
                        growthPercentage: 0,
                        clients: []
                    });
                }

                const group = aggregatedMap.get(groupKey)!;
                group.fact += fact;
                group.potential += potential;

                // Add to client list for map plotting
                const clientPoint: MapPoint = {
                    key: normalizedAddrKey || `unknown-${i}`,
                    lat, lon, status,
                    name: clientName,
                    address: rawAddress || 'Адрес не указан',
                    city: finalCity,
                    region: finalRegion,
                    rm: rmName,
                    brand: brand,
                    packaging: packaging,
                    type: type,
                    contacts: contacts,
                    originalRow: row,
                    fact: fact, 
                    abcCategory: 'C', 
                    isCached,
                    isGeocoding
                };

                group.clients.push(clientPoint);
                if (lat && lon) {
                    plottableActiveClients.push(clientPoint);
                }

                // Collect Unidentified
                if (!lat || !lon) {
                    if (rawAddress && !isGeocoding && !isCached) {
                         // Only report if it wasn't sent for geocoding and wasn't found in cache
                         unidentifiedRows.push({ rm: rmName, rowData: row, originalIndex: i });
                    } else if (!rawAddress) {
                         unidentifiedRows.push({ rm: rmName, rowData: row, originalIndex: i });
                    }
                }
            }

            postMessage({ type: 'progress', payload: { percentage: 75, message: 'Финальный расчет метрик...' } });

            // 4. Final Calculations & ABC Analysis
            const aggregatedData = Array.from(aggregatedMap.values());
            
            // Fast ABC Analysis
            // Sort active clients once
            plottableActiveClients.sort((a, b) => (b.fact || 0) - (a.fact || 0));
            const totalVolume = plottableActiveClients.reduce((sum, c) => sum + (c.fact || 0), 0);
            let runningSum = 0;
            
            // Single pass for ABC
            for (const c of plottableActiveClients) {
                const currentFact = c.fact || 0;
                runningSum += currentFact;
                const percentage = totalVolume > 0 ? runningSum / totalVolume : 1;
                if (percentage <= 0.8) c.abcCategory = 'A';
                else if (percentage <= 0.95) c.abcCategory = 'B';
                else c.abcCategory = 'C';
            }

            // Calculate Growth/Potential for rows
            for (const row of aggregatedData) {
                if (row.potential <= row.fact) {
                    row.potential = row.fact * 1.15; 
                }
                row.growthPotential = Math.max(0, row.potential - row.fact);
                row.growthPercentage = row.fact > 0 ? (row.growthPotential / row.fact) * 100 : 0;
            }

            // Calculate Region Counts for OKB stats
            // Optimize: Iterate OKB data directly if needed, but we already have `okbData`
            const okbRegionCounts: { [key: string]: number } = {};
            // Let's assume standard keys for OKB to avoid repeated lookups
            // We'll scan first row again if needed, or iterate blindly if schema varies.
            // Using a simple sampling or iteration if okbData is huge might be needed,
            // but for 10-20k rows it's fast enough.
            if (okbData && okbData.length > 0) {
                // Find correct Region key in OKB
                const okbSample = okbData[0];
                const okbKeys = Object.keys(okbSample);
                const okbRegionKey = okbKeys.find(k => k.toLowerCase().includes('регион')) || 'Регион';

                for (const row of okbData) {
                    const region = row[okbRegionKey];
                    if (region) {
                        okbRegionCounts[region] = (okbRegionCounts[region] || 0) + 1;
                    }
                }
            }

            // Apply Smart Plan Enrichment
            const enrichedData = enrichDataWithSmartPlan(aggregatedData, okbRegionCounts, 15, okbCoordSet);

            // Construct result payload
            const result: WorkerResultPayload = {
                aggregatedData: enrichedData,
                plottableActiveClients,
                unidentifiedRows,
                okbRegionCounts,
                dateRange: undefined 
            };

            // --- BACKGROUND TASKS PROCESSING ---
            const newAddressRMs = Object.keys(newAddressesToCache);
            if (newAddressRMs.length > 0) {
                postMessage({ type: 'progress', payload: { percentage: 90, message: 'Синхронизация кэша...', isBackground: true } });
                for (const rmName of newAddressRMs) {
                    try {
                        postMessage({ 
                            type: 'background', 
                            payload: { 
                                type: 'cache-update', 
                                payload: { rmName, rows: newAddressesToCache[rmName] } 
                            } 
                        });
                    } catch (e) { console.error(`Failed to add to cache for ${rmName}:`, e); }
                }
            }

            const geocodeRMs = Object.keys(addressesToGeocode);
            if (geocodeRMs.length > 0) {
                postMessage({ type: 'progress', payload: { percentage: 95, message: 'Запуск фонового геокодирования...', isBackground: true } });
                for (const rmName of geocodeRMs) {
                    const addresses = addressesToGeocode[rmName];
                    postMessage({
                        type: 'background',
                        payload: {
                            type: 'geocode-request',
                            payload: { rmName, addresses }
                        }
                    });
                }
            }

            postMessage({ type: 'result', payload: result });

        } catch (error) {
            console.error(error);
            postMessage({ type: 'error', payload: (error as Error).message });
        }
    }
};

// Helper for type safety in postMessage
function postMessage(message: WorkerMessage) {
    self.postMessage(message);
}
