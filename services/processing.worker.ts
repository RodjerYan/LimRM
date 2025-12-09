
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
import { normalizeAddress, findValueInRow, findAddressInRow, recoverRegion } from '../utils/dataUtils';
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

            postMessage({ type: 'progress', payload: { percentage: 15, message: 'Индексация базы OKB...' } });

            // 2. Index OKB for fast lookup
            // Create a Set of normalized addresses from OKB for O(1) matching
            // And a Map for Coordinate lookup
            const okbAddressIndex = new Map<string, { lat: number, lon: number }>();
            const okbCoordSet = new Set<string>(); // For region stats calculation
            
            if (okbData && Array.isArray(okbData)) {
                for (const row of okbData) {
                    if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                        // Index by normalized address
                        const addr = findAddressInRow(row);
                        if (addr) {
                            const normKey = normalizeAddress(addr);
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

            const totalRows = rawRows.length;

            for (let i = 0; i < totalRows; i++) {
                const row = rawRows[i];
                if (i % 500 === 0) {
                    const progress = 30 + Math.floor((i / totalRows) * 40); // 30% to 70%
                    postMessage({ type: 'progress', payload: { percentage: progress, message: `Обработка строки ${i} из ${totalRows}...` } });
                }

                // Extract fields using fuzzy matching
                const clientName = findValueInRow(row, ['наименование', 'клиент', 'партнер', 'контрагент', 'name']) || 'Неизвестный клиент';
                const rawAddress = findAddressInRow(row);
                const rmName = findValueInRow(row, ['рм', 'менеджер', 'manager', 'responsible']) || 'Не назначен';
                const brand = findValueInRow(row, ['бренд', 'brand', 'торговая марка', 'тм']) || 'Прочее';
                const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки', 'вес', 'packaging']) || 'Не указана';
                const distributor = findValueInRow(row, ['дистрибьютор', 'поставщик', 'distributor']);
                const type = findValueInRow(row, ['канал', 'тип', 'вид деятельности', 'type']) || 'Розница';
                
                // Parse Numbers
                let fact = parseFloat(String(findValueInRow(row, ['факт', 'продажи', 'sales', 'объем', 'вес нетто'])).replace(',', '.').replace(/\s/g, ''));
                if (isNaN(fact)) fact = 0;
                
                let potential = parseFloat(String(findValueInRow(row, ['потенциал', 'план', 'potential'])).replace(',', '.').replace(/\s/g, ''));
                if (isNaN(potential)) potential = 0;

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
                    // 1. Parse & Normalize
                    const parsed = parseRussianAddress(rawAddress, distributor);
                    
                    // Recover Region if missing or use Excel column if available
                    const regionCol = findValueInRow(row, ['регион', 'область', 'субъект', 'region']);
                    finalRegion = regionCol ? recoverRegion(regionCol, parsed.city) : parsed.region;
                    finalCity = parsed.city;
                    
                    const addressForMatching = parsed.finalAddress || rawAddress;
                    normalizedAddrKey = normalizeAddress(addressForMatching);

                    // 2. Cache Lookup
                    const rmCache = cacheData[rmName];
                    let cachedRecord = null;
                    
                    if (rmCache) {
                        // Try exact normalized match first
                        cachedRecord = rmCache.find(c => normalizeAddress(c.address) === normalizedAddrKey);
                        
                        // If no match, check history (if user renamed it)
                        if (!cachedRecord) {
                             cachedRecord = rmCache.find(c => c.history && c.history.includes(rawAddress)); // Simple check, ideally normalize history too
                        }
                    }

                    if (cachedRecord) {
                        if (cachedRecord.lat && cachedRecord.lon && !cachedRecord.isDeleted) {
                            lat = cachedRecord.lat;
                            lon = cachedRecord.lon;
                            status = 'match';
                            isCached = true;
                        } else if (cachedRecord.isInvalid) {
                            // Explicitly marked as invalid/not found in cache
                            isCached = true; 
                        }
                        // If in cache but no coords, it might be waiting for update or manual edit
                    } else {
                        // 3. OKB Lookup (Fallback)
                        const okbMatch = okbAddressIndex.get(normalizedAddrKey);
                        if (okbMatch) {
                            lat = okbMatch.lat;
                            lon = okbMatch.lon;
                            status = 'match';
                            // It's a match, but not in our specific RM cache yet. 
                            // We can choose to add it to cache for future consistency or leave it.
                            // Let's add it to cache to "claim" it.
                            addToCacheQueue(rmName, addressForMatching);
                        } else {
                            // 4. Not in Cache, Not in OKB -> Needs Geocoding
                            // Mark for background processing
                            addToCacheQueue(rmName, addressForMatching); // Add placeholder
                            addToGeocodeQueue(rmName, addressForMatching); // Request geocoding
                            isGeocoding = true;
                        }
                    }
                } else {
                    // No address
                    finalRegion = findValueInRow(row, ['регион', 'область', 'субъект']) || 'Регион не определен';
                    finalCity = findValueInRow(row, ['город', 'сити']) || 'Город не определен';
                }

                // --- AGGREGATION ---
                // Group Key: RM + Region + ClientName + Brand + Packaging
                // We group by "Client Group" logic usually, but here we need granular rows for the table.
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
                    contacts: findValueInRow(row, ['контакты', 'телефон', 'email']),
                    originalRow: row, // Keep ref for editing
                    fact: fact, // Individual point fact
                    abcCategory: 'C', // Placeholder, calculated later
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
                         // Logic: if it wasn't geocoding and wasn't cached (or cached as invalid), it's unidentified
                         unidentifiedRows.push({ rm: rmName, rowData: row, originalIndex: i });
                    } else if (!rawAddress) {
                         unidentifiedRows.push({ rm: rmName, rowData: row, originalIndex: i });
                    }
                }
            }

            postMessage({ type: 'progress', payload: { percentage: 75, message: 'Финальный расчет метрик...' } });

            // 4. Final Calculations & ABC Analysis
            const aggregatedData = Array.from(aggregatedMap.values());
            
            // Calculate ABC for all clients globally or per RM? usually global or per aggregation.
            // Let's do simple ABC on the `plottableActiveClients` for visualization
            const sortedClients = [...plottableActiveClients].sort((a, b) => (b.fact || 0) - (a.fact || 0));
            const totalVolume = sortedClients.reduce((sum, c) => sum + (c.fact || 0), 0);
            let runningSum = 0;
            sortedClients.forEach(c => {
                const currentFact = c.fact || 0;
                runningSum += currentFact;
                const percentage = totalVolume > 0 ? runningSum / totalVolume : 1;
                if (percentage <= 0.8) c.abcCategory = 'A';
                else if (percentage <= 0.95) c.abcCategory = 'B';
                else c.abcCategory = 'C';
            });

            // Calculate Growth/Potential for rows
            aggregatedData.forEach(row => {
                // If potential is 0 or less than fact, assume 15% growth default
                if (row.potential <= row.fact) {
                    row.potential = row.fact * 1.15; 
                }
                row.growthPotential = Math.max(0, row.potential - row.fact);
                row.growthPercentage = row.fact > 0 ? (row.growthPotential / row.fact) * 100 : 0;
            });

            // Calculate Region Counts for OKB stats
            // We use the okbData passed in payload
            const okbRegionCounts: { [key: string]: number } = {};
            if (okbData) {
                okbData.forEach((row: OkbDataRow) => {
                    const region = findValueInRow(row, ['регион', 'область', 'субъект']);
                    if (region) {
                        // Standardize region name if possible, or use raw
                        const stdRegion = region; // Simplified, ideally use recoverRegion
                        okbRegionCounts[stdRegion] = (okbRegionCounts[stdRegion] || 0) + 1;
                    }
                });
            }

            // Apply Smart Plan Enrichment
            // This adds the 'planMetric' to each row based on the PlanningEngine logic
            const enrichedData = enrichDataWithSmartPlan(aggregatedData, okbRegionCounts, 15, okbCoordSet);

            // Construct result payload
            const result: WorkerResultPayload = {
                aggregatedData: enrichedData,
                plottableActiveClients,
                unidentifiedRows,
                okbRegionCounts,
                dateRange: undefined // TODO: extract from filename or headers if needed
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