
import { 
    AggregatedDataRow, 
    OkbDataRow, 
    WorkerMessage, 
    MapPoint, 
    CoordsCache,
    UnidentifiedRow,
} from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../utils/dataUtils';

// Helper for Unique IDs
const generateRowId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Map<string, MapPoint> } };
type OkbCoordIndex = Map<string, { lat: number; lon: number }>;

// --- WORKER STATE ---
let state_aggregatedData: AggregationMap = {};
let state_uniquePlottableClients = new Map<string, MapPoint>();
let state_unidentifiedRows: UnidentifiedRow[] = [];
let state_headers: string[] = [];
let state_clientNameHeader: string | undefined = undefined;
let state_okbCoordIndex: OkbCoordIndex = new Map();
let state_okbByRegion: Record<string, OkbDataRow[]> = {};
let state_okbRegionCounts: { [key: string]: number } = {};
let state_cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string; isInvalid?: boolean; comment?: string; isDeleted?: boolean; }>();
let state_processedRowsCount = 0;
let state_lastEmitCount = 0;
let state_lastCheckpointCount = 0;

// Filter State
let state_filterStartDate: number | null = null;
let state_filterEndDate: number | null = null;

const CHECKPOINT_THRESHOLD = 50000; 
const UI_UPDATE_THRESHOLD = 20000;

const normalizeHeaderKey = (key: string): string => {
    if (!key) return '';
    return String(key).toLowerCase().replace(/[\r\n\t\s\u00A0]/g, '').trim();
};

const isValidManagerValue = (val: string): boolean => {
    if (!val) return false;
    const v = String(val).trim().toLowerCase();
    const stopWords = ['нет специализации', 'нет', 'для ', 'без ', 'корм', 'кошек', 'собак', 'стерилиз', 'чувствител', 'пород', 'weight', 'adult', 'junior', 'kitten', 'puppy', 'специализ', 'продук', 'товар'];
    return !stopWords.some(w => v.includes(w)) && v.length >= 2;
};

const findManagerValue = (row: any, strictKeys: string[], looseKeys: string[]): string => {
    const rowKeys = Object.keys(row);
    const targetStrict = strictKeys.map(normalizeHeaderKey);
    for (const key of rowKeys) {
        if (targetStrict.includes(normalizeHeaderKey(key))) {
             const val = String(row[key] || '');
             if (isValidManagerValue(val)) return val;
        }
    }
    return '';
};

// --- NEW: Channel Auto-Detection Logic ---
const detectChannelByName = (name: string): string => {
    const n = name.toLowerCase();
    
    // 1. Internet / Marketplace
    if (n.includes('wildberries') || n.includes('вайлдберриз') || n.includes('ozon') || n.includes('озон') || n.includes('яндекс') || n.includes('интернет') || n.includes('e-com') || n.includes('маркетплейс')) {
        return 'Интернет-канал';
    }
    
    // 2. Breeder / Kennel
    if (n.includes('питомник') || n.includes('заводчик') || n.includes('клуб ') || n.includes('п-к') || n.includes('приют') || n.includes('кинолог')) {
        return 'Бридер канал';
    }

    // 3. Vet
    if (n.includes('вет') || n.includes('клиника') || n.includes('госпиталь') || n.includes('врач') || n.includes('аптека')) {
        return 'Ветеринарный канал';
    }

    // 4. FMCG / Chains (Major ones)
    if (n.includes('ашан') || n.includes('лента') || n.includes('магнит') || n.includes('пятерочка') || n.includes('перекресток') || n.includes('окей') || n.includes('метро') || n.includes('гипермаркет') || n.includes('супермаркет')) {
        return 'FMCG';
    }

    // 5. Zoo Retail (Default for IP and standard names)
    if (n.includes('ип ') || n.includes('зоо') || n.includes('магазин') || n.includes('лавка') || n.includes('корм')) {
        return 'Зоо розница';
    }

    return 'Не определен';
};

const parseCleanFloat = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    
    const strVal = String(val);
    const cleaned = strVal.replace(/[\s\u00A0]/g, '').replace(',', '.');
    
    const floatVal = parseFloat(cleaned);
    return isNaN(floatVal) ? 0 : floatVal;
};

// Helper to parse date into YYYY-MM format
const parseDateKey = (val: any): string | null => {
    if (!val) return null;
    
    if (typeof val === 'number') {
        if (val > 20000 && val < 60000) { 
             const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
             const month = String(dateObj.getMonth() + 1).padStart(2, '0');
             return `${dateObj.getFullYear()}-${month}`;
        }
        return null;
    }

    const str = String(val).trim();
    
    let match = str.match(/^(\d{4})[\.\-/](\d{2})/);
    if (match) return `${match[1]}-${match[2]}`;

    match = str.match(/^(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}`;
    
    return null;
};

// Helper to parse raw date value into timestamp for comparison
const parseRawDateToTimestamp = (val: any): number | null => {
    if (!val) return null;
    
    // Excel Serial Number
    if (typeof val === 'number') {
        // Excel base date: Dec 30, 1899
        if (val > 20000 && val < 60000) { 
             const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
             return dateObj.getTime();
        }
        return null;
    }

    const str = String(val).trim();
    
    // ISO-like YYYY-MM-DD
    let match = str.match(/^(\d{4})[\.\-/](\d{2})[\.\-/](\d{2})/);
    if (match) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])).getTime();
    }

    // Russian DD.MM.YYYY
    match = str.match(/^(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})/);
    if (match) {
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1])).getTime();
    }
    
    // Fallback: Monthly YYYY-MM
    match = str.match(/^(\d{4})[\.\-/](\d{2})/);
    if (match) {
        // Default to first day of month
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1).getTime();
    }

    return null;
};

const getCanonicalRegion = (row: any): string => {
    const subjectValue = findValueInRow(row, ['субъект', 'регион', 'область']);
    if (subjectValue && subjectValue.trim()) {
        const cleanVal = subjectValue.trim();
        let lowerVal = cleanVal.toLowerCase().replace(/ё/g, 'е').replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
        if (["орел", "орёл", "orel"].includes(lowerVal.trim())) return "Орловская область";
        for (const [key, standardName] of Object.entries(REGION_KEYWORD_MAP)) {
            if (lowerVal.includes(key)) return standardName;
        }
        return standardizeRegion(cleanVal);
    }
    return 'Регион не определен';
};

const createOkbCoordIndex = (okbData: OkbDataRow[]): OkbCoordIndex => {
    const coordIndex: OkbCoordIndex = new Map();
    if (!okbData) return coordIndex;
    for (const row of okbData) {
        const address = findAddressInRow(row);
        if (address && row.lat && row.lon) {
            coordIndex.set(normalizeAddress(address), { lat: row.lat, lon: row.lon });
        }
    }
    return coordIndex;
};

function performIncrementalAbc() {
    const allClients = Array.from(state_uniquePlottableClients.values());
    allClients.sort((a, b) => (b.fact || 0) - (a.fact || 0));
    
    const totalVolume = allClients.reduce((sum, c) => sum + (c.fact || 0), 0);
    let runningSum = 0;

    allClients.forEach(client => {
        runningSum += (client.fact || 0);
        const pct = totalVolume > 0 ? (runningSum / totalVolume) * 100 : 100;
        if (pct <= 80) client.abcCategory = 'A';
        else if (pct <= 95) client.abcCategory = 'B';
        else client.abcCategory = 'C';
    });
}

function initStream({ okbData, cacheData, totalRowsProcessed, restoredData, restoredUnidentified, startDate, endDate }: { 
    okbData: OkbDataRow[], 
    cacheData: CoordsCache, 
    totalRowsProcessed?: number,
    restoredData?: AggregatedDataRow[],
    restoredUnidentified?: UnidentifiedRow[],
    startDate?: string,
    endDate?: string
}, postMessage: PostMessageFn) {
    state_aggregatedData = {};
    state_uniquePlottableClients = new Map();
    state_unidentifiedRows = [];
    state_headers = [];
    
    state_processedRowsCount = totalRowsProcessed || 0;
    state_lastEmitCount = state_processedRowsCount;
    state_lastCheckpointCount = state_processedRowsCount;
    
    state_okbCoordIndex = createOkbCoordIndex(okbData);
    state_okbByRegion = {};
    state_okbRegionCounts = {};
    
    // Init Date Filters with logging
    state_filterStartDate = startDate ? new Date(startDate).getTime() : null;
    state_filterEndDate = endDate ? new Date(endDate).getTime() : null;
    
    console.log(`[Worker] Init Stream. Date Filter: ${startDate} (${state_filterStartDate}) - ${endDate} (${state_filterEndDate})`);
    
    if (okbData) {
        okbData.forEach(row => {
            const reg = getCanonicalRegion(row);
            if (reg !== 'Регион не определен') {
                state_okbRegionCounts[reg] = (state_okbRegionCounts[reg] || 0) + 1;
                if (!state_okbByRegion[reg]) state_okbByRegion[reg] = [];
                state_okbByRegion[reg].push(row);
            }
        });
    }

    state_cacheAddressMap = new Map();
    if (cacheData) {
        Object.values(cacheData).flat().forEach((item: any) => {
            if (item.address) {
                state_cacheAddressMap.set(normalizeAddress(item.address), { 
                    lat: item.lat, lon: item.lon, originalAddress: item.address, isInvalid: item.isInvalid, comment: item.comment, isDeleted: item.isDeleted
                });
            }
        });
    }

    if (restoredData && restoredData.length > 0) {
        restoredData.forEach(row => {
            const { clients, ...rest } = row;
            if (!state_aggregatedData[row.key]) {
                state_aggregatedData[row.key] = {
                    ...rest,
                    clients: new Map()
                };
            }
            if (Array.isArray(clients)) {
                clients.forEach(client => {
                    if (!state_uniquePlottableClients.has(client.key)) {
                        state_uniquePlottableClients.set(client.key, client);
                    }
                    state_aggregatedData[row.key].clients.set(client.key, client);
                });
            }
        });
        
        if (restoredUnidentified) {
            state_unidentifiedRows = [...restoredUnidentified];
        }
    }

    postMessage({ 
        type: 'result_init', 
        payload: { 
            okbRegionCounts: state_okbRegionCounts,
            totalUnidentified: state_unidentifiedRows.length 
        } 
    });
    
    let statusMsg = totalRowsProcessed 
        ? `Восстановление сессии: ${totalRowsProcessed} строк...` 
        : 'Связь установлена. Готов к обработке...';
        
    if (state_filterStartDate || state_filterEndDate) {
        statusMsg += ` (Фильтр: ${startDate || '...'} - ${endDate || '...'})`;
    }
        
    postMessage({ type: 'progress', payload: { percentage: 5, message: statusMsg, totalProcessed: state_processedRowsCount } });
}

function restoreChunk(payload: { chunkData: AggregatedDataRow[] }, postMessage: PostMessageFn) {
    const rows = payload.chunkData;
    if (!Array.isArray(rows)) {
        console.error("restoreChunk received invalid data:", rows);
        return;
    }

    let debugLogOnce = false;

    rows.forEach(aggRow => {
        // Hydrate clients map
        const clientMap = new Map<string, MapPoint>();
        let newRowFact = 0;

        if (aggRow.clients && Array.isArray(aggRow.clients)) {
            aggRow.clients.forEach(client => {
                let clientFact = client.fact || 0;
                
                // --- APPLY DATE FILTER ---
                if (state_filterStartDate || state_filterEndDate) {
                    // Only filter if monthlyFact exists
                    if (client.monthlyFact && Object.keys(client.monthlyFact).length > 0) {
                        clientFact = 0;
                        let hasDataInRange = false;
                        
                        // DEBUG: Log sample dates to understand mismatch
                        if (!debugLogOnce) {
                            console.log('[Worker] Sample monthlyFact keys:', Object.keys(client.monthlyFact));
                            debugLogOnce = true;
                        }

                        Object.entries(client.monthlyFact).forEach(([dateStr, val]) => {
                            // dateStr is YYYY-MM
                            const parts = dateStr.split(/[-.]/); // Handle '-' or '.'
                            if (parts.length >= 2) {
                                const year = parseInt(parts[0]);
                                const month = parseInt(parts[1]) - 1; // 0-based month
                                
                                const ts = new Date(year, month, 1).getTime();
                                
                                let inRange = true;
                                if (state_filterStartDate && ts < state_filterStartDate) inRange = false;
                                // Loose comparison for end date (include entire end month)
                                if (state_filterEndDate) {
                                    const endDateObj = new Date(state_filterEndDate);
                                    // If timestamp is strictly after end filter
                                    if (ts > state_filterEndDate) inRange = false;
                                }
                                
                                if (inRange) {
                                    clientFact += (val as number);
                                    hasDataInRange = true;
                                }
                            }
                        });
                    } 
                    // Fallback: If no monthlyFact, assume data falls within range OR exclude?
                    // Safe approach: If user filters, and we have NO date breakdown, we usually exclude to be safe, 
                    // OR include if we assume the whole dataset belongs to the period.
                    // CURRENT LOGIC: Exclude if breakdown missing but filter active.
                    else {
                        clientFact = 0; // Exclude legacy/undated records when filtered
                    }
                }

                // If filtering is OFF, include everything. If ON, only include if fact > 0
                const shouldInclude = (!state_filterStartDate && !state_filterEndDate) || clientFact > 0;

                if (shouldInclude) {
                    const filteredClient = { ...client, fact: clientFact };
                    clientMap.set(client.key, filteredClient);
                    newRowFact += clientFact;

                    // Update Global Client Map
                    if (!state_uniquePlottableClients.has(client.key)) {
                        state_uniquePlottableClients.set(client.key, filteredClient);
                    }
                }
            });
        }

        // Only add row if it has active clients after filtering
        if (clientMap.size > 0) {
            if (!state_aggregatedData[aggRow.key]) {
                const { clients, ...rest } = aggRow;
                state_aggregatedData[aggRow.key] = {
                    ...rest,
                    fact: newRowFact, // Updated Fact
                    potential: newRowFact * 1.15, // Recalc Potential based on new Fact
                    clients: clientMap
                };
            } else {
                // Merge (Rare case for snapshot, but good for safety)
                const existing = state_aggregatedData[aggRow.key];
                existing.fact += newRowFact;
                clientMap.forEach((v, k) => existing.clients.set(k, v));
            }
        }
    });

    state_processedRowsCount += rows.length;
    
    // Debounced Progress Update
    if (state_processedRowsCount - state_lastEmitCount > UI_UPDATE_THRESHOLD) {
        state_lastEmitCount = state_processedRowsCount;
        const currentProgress = Math.min(98, 10 + (state_processedRowsCount / 200000) * 85); 
        postMessage({ 
            type: 'progress', 
            payload: { 
                percentage: currentProgress, 
                message: `Синхронизация снимка: ${state_processedRowsCount.toLocaleString()}...`, 
                totalProcessed: state_processedRowsCount 
            } 
        });
    }
}

function processChunk(payload: { rawData: any[][], isFirstChunk: boolean, fileName?: string }, postMessage: PostMessageFn) {
    const { rawData, isFirstChunk } = payload;
    
    // CRITICAL FIX: Guard against empty chunks
    if (!rawData || rawData.length === 0) {
        return;
    }
    
    let jsonData: any[] = [];
    let headerOffset = 0;

    if (isFirstChunk || state_headers.length === 0) {
        const hRow = rawData.findIndex(row => Array.isArray(row) && row.some(cell => String(cell || '').toLowerCase().includes('адрес')));
        const actualHRow = hRow === -1 ? 0 : hRow;
        
        // CRITICAL FIX: Guard against missing header row
        if (!rawData[actualHRow]) {
            console.warn("Skipping chunk: Header row not found or chunk is malformed.");
            return;
        }

        headerOffset = actualHRow + 1;
        state_headers = rawData[actualHRow].map(h => String(h || '').trim());
        jsonData = rawData.slice(actualHRow + 1).map(row => {
            const obj: any = {};
            state_headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
            return obj;
        });
        
        const normHeaders = state_headers.map(h => ({ original: h, norm: normalizeHeaderKey(h) }));
        
        const clientHeader = normHeaders.find(h => 
            h.norm.includes('названиеклиента') || 
            h.norm.includes('наименованиеклиента') || 
            h.norm.includes('клиент') || 
            h.norm.includes('контрагент') ||
            h.norm.includes('партнер')
        );
        
        if (clientHeader) {
            state_clientNameHeader = clientHeader.original;
        } else {
            const nameHeader = normHeaders.find(h => h.norm.includes('наименование') && !h.norm.includes('товар') && !h.norm.includes('продук'));
            state_clientNameHeader = nameHeader ? nameHeader.original : undefined;
        }
        
    } else {
        jsonData = rawData.map(row => {
            const obj: any = {};
            state_headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
            return obj;
        });
    }

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        state_processedRowsCount++;
        
        // --- DATE FILTERING ---
        if (state_filterStartDate || state_filterEndDate) {
            const dateRaw = findValueInRow(row, ['дата', 'период', 'месяц', 'date', 'period', 'day']);
            if (dateRaw) {
                const rowTime = parseRawDateToTimestamp(dateRaw);
                if (rowTime !== null) {
                    if (state_filterStartDate && rowTime < state_filterStartDate) continue;
                    if (state_filterEndDate && rowTime > state_filterEndDate) continue;
                }
            }
        }
        
        const rawAddr = findAddressInRow(row);
        
        // --- DATA QUALITY GATE ---
        if (!rawAddr) continue;
        const cleanAddr = String(rawAddr).trim();
        if (cleanAddr.length < 4) continue;
        if (/^[-.,\s0-9]+$/.test(cleanAddr)) continue;
        const lowerAddr = cleanAddr.toLowerCase();
        if (['нет', 'не указан', 'неизвестно', 'unknown', 'none', 'пусто'].includes(lowerAddr)) continue;

        let clientName = String(row[state_clientNameHeader || ''] || '').trim();
        if (!clientName || clientName.length < 2) {
             clientName = cleanAddr || 'Без названия';
        }

        const lowerName = clientName.toLowerCase();
        if (lowerName.includes('итого') || lowerName.includes('всего') || lowerName.includes('total') || lowerName.includes('grand total')) {
            continue;
        }

        let rm = findManagerValue(row, ['рм', 'региональный менеджер'], []);
        if (!rm) rm = 'Unknown_RM';

        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        const cacheEntry = state_cacheAddressMap.get(normAddr);

        if (cacheEntry && cacheEntry.isDeleted) {
            continue;
        }

        let channel = findValueInRow(row, ['канал продаж', 'тип тт', 'сегмент']);
        if (!channel || channel.length < 2) {
            channel = detectChannelByName(clientName);
        }

        const rawBrand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Без бренда';
        const brands = rawBrand.split(/[,;|\r\n]+/).map(b => b.trim()).filter(b => b.length > 0);
        
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';
        
        const isCityFound = parsed.city !== 'Город не определен';
        const reg = getCanonicalRegion(row) || parsed.region;
        const isRegionFound = reg !== 'Регион не определен';

        if (!isCityFound && !isRegionFound && !cacheEntry) {
            const rawRowIndex = isFirstChunk ? (i + headerOffset) : i;
            const rawArray = rawData[rawRowIndex] || [];

            state_unidentifiedRows.push({ 
                rm, 
                rowData: row, 
                originalIndex: state_processedRowsCount,
                rawArray: rawArray 
            });
        }

        const weightRaw = findValueInRow(row, ['вес', 'количество', 'факт', 'объем', 'продажи', 'отгрузки', 'кг', 'тонн']);
        const totalWeight = parseCleanFloat(weightRaw);
        
        const weightPerBrand = brands.length > 0 ? totalWeight / brands.length : 0;

        const dateRaw = findValueInRow(row, ['дата', 'период', 'месяц', 'date', 'period', 'day']);
        const dateKey = parseDateKey(dateRaw) || 'unknown';

        const normName = clientName.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
        const uniqueClientKey = (normName.length > 2 && normName !== 'тт') 
            ? `${normAddr}#${normName}` 
            : normAddr;

        for (const brand of brands) {
            const groupKey = `${reg}-${rm}-${brand}-${packaging}`.toLowerCase();
            
            if (!state_aggregatedData[groupKey]) {
                state_aggregatedData[groupKey] = {
                    __rowId: generateRowId(),
                    key: groupKey, 
                    clientName: `${reg}: ${brand}`, 
                    brand: brand, 
                    packaging: packaging, 
                    rm, 
                    city: parsed.city,
                    region: reg, 
                    fact: 0,
                    monthlyFact: {},
                    potential: 0, 
                    growthPotential: 0, 
                    growthPercentage: 0, 
                    clients: new Map(),
                };
            }

            state_aggregatedData[groupKey].fact += weightPerBrand;
            
            if (!state_aggregatedData[groupKey].monthlyFact) state_aggregatedData[groupKey].monthlyFact = {};
            state_aggregatedData[groupKey].monthlyFact[dateKey] = (state_aggregatedData[groupKey].monthlyFact[dateKey] || 0) + weightPerBrand;

            if (!state_uniquePlottableClients.has(uniqueClientKey)) {
                const okb = state_okbCoordIndex.get(normAddr);
                
                const latRaw = findValueInRow(row, ['широта', 'lat', 'latitude', 'широта (lat)', 'geo_lat', 'y']);
                const lonRaw = findValueInRow(row, ['долгота', 'lon', 'lng', 'longitude', 'долгота (lon)', 'geo_lon', 'x']);
                const rowLat = latRaw ? parseCleanFloat(latRaw) : undefined;
                const rowLon = lonRaw ? parseCleanFloat(lonRaw) : undefined;
                
                const effectiveLat = (rowLat && rowLat !== 0) ? rowLat : (cacheEntry?.lat || okb?.lat);
                const effectiveLon = (rowLon && rowLon !== 0) ? rowLon : (cacheEntry?.lon || okb?.lon);

                state_uniquePlottableClients.set(uniqueClientKey, {
                    key: uniqueClientKey,
                    lat: effectiveLat,
                    lon: effectiveLon,
                    status: 'match',
                    name: clientName, 
                    address: rawAddr, 
                    city: parsed.city, 
                    region: reg, 
                    rm, 
                    brand: brand, 
                    packaging: packaging, 
                    type: channel,
                    originalRow: row, 
                    fact: 0,
                    monthlyFact: {},
                    abcCategory: 'C'
                });
            }
            
            const pt = state_uniquePlottableClients.get(uniqueClientKey);
            if (pt) {
                pt.fact = (pt.fact || 0) + weightPerBrand;
                if (!pt.monthlyFact) pt.monthlyFact = {};
                pt.monthlyFact[dateKey] = (pt.monthlyFact[dateKey] || 0) + weightPerBrand;
                
                state_aggregatedData[groupKey].clients.set(uniqueClientKey, pt);
            }
        }
    }
    
    // Explicit Log every 10k rows
    if (state_processedRowsCount % 10000 === 0) {
        console.log(`⚙️ [Worker] Processed ${state_processedRowsCount} rows...`);
    }
    
    if (state_processedRowsCount - state_lastCheckpointCount >= CHECKPOINT_THRESHOLD) {
        state_lastCheckpointCount = state_processedRowsCount;
        performIncrementalAbc();
        const checkpointData = Object.values(state_aggregatedData).map(item => ({
            ...item,
            potential: item.fact * 1.15,
            growthPotential: item.fact * 0.15,
            growthPercentage: 15,
            clients: Array.from(item.clients.values())
        }));
        postMessage({
            type: 'CHECKPOINT',
            payload: {
                aggregatedData: checkpointData,
                unidentifiedRows: state_unidentifiedRows,
                okbRegionCounts: state_okbRegionCounts,
                totalRowsProcessed: state_processedRowsCount
            }
        });
        state_lastEmitCount = state_processedRowsCount;
    }
    else if (state_processedRowsCount - state_lastEmitCount > UI_UPDATE_THRESHOLD) {
        state_lastEmitCount = state_processedRowsCount;
        performIncrementalAbc();
        const partialData = Object.values(state_aggregatedData).map(item => ({
            ...item,
            potential: item.fact * 1.15,
            growthPotential: item.fact * 0.15,
            growthPercentage: 15,
            clients: Array.from(item.clients.values())
        }));
        postMessage({ 
            type: 'result_chunk_aggregated', 
            payload: {
                data: partialData,
                totalProcessed: state_processedRowsCount
            }
        });
    }

    const currentProgress = Math.min(98, 10 + (state_processedRowsCount / 3500000) * 85); 
    postMessage({ type: 'progress', payload: { percentage: currentProgress, message: `Потоковая обработка: ${state_processedRowsCount.toLocaleString()}...`, totalProcessed: state_processedRowsCount } });
}

async function finalizeStream(postMessage: PostMessageFn) {
    performIncrementalAbc();

    const finalData = Object.values(state_aggregatedData).map(item => ({
        ...item,
        potential: item.fact * 1.15,
        growthPotential: item.fact * 0.15,
        growthPercentage: 15,
        clients: Array.from(item.clients.values())
    }));

    postMessage({ 
        type: 'result_finished', 
        payload: {
            aggregatedData: finalData,
            unidentifiedRows: state_unidentifiedRows,
            okbRegionCounts: state_okbRegionCounts,
            totalRowsProcessed: state_processedRowsCount
        }
    });
}

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'INIT_STREAM') initStream(msg.payload, self.postMessage);
    else if (msg.type === 'PROCESS_CHUNK') processChunk(msg.payload, self.postMessage);
    else if (msg.type === 'RESTORE_CHUNK') restoreChunk(msg.payload, self.postMessage);
    else if (msg.type === 'FINALIZE_STREAM') await finalizeStream(self.postMessage);
};