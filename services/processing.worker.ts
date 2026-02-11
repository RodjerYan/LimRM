
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

// Counters
let state_seenRowsCount = 0;      // Total items (groups/rows) iterated from source
let state_processedRowsCount = 0; // Total clients/rows actually added to aggregation
let state_lastEmitCount = 0;
let state_lastCheckpointCount = 0;

// Filter State - Now using Day Granularity (YYYY-MM-DD)
let state_filterStart: string | null = null; 
let state_filterEnd: string | null = null;

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
    if (n.includes('wildberries') || n.includes('вайлдберриз') || n.includes('ozon') || n.includes('озон') || n.includes('яндекс') || n.includes('интернет') || n.includes('e-com') || n.includes('маркетплейс')) return 'Интернет-канал';
    if (n.includes('питомник') || n.includes('заводчик') || n.includes('клуб ') || n.includes('п-к') || n.includes('приют') || n.includes('кинолог')) return 'Бридер канал';
    if (n.includes('вет') || n.includes('клиника') || n.includes('госпиталь') || n.includes('врач') || n.includes('аптека')) return 'Ветеринарный канал';
    if (n.includes('ашан') || n.includes('лента') || n.includes('магнит') || n.includes('пятерочка') || n.includes('перекресток') || n.includes('окей') || n.includes('метро') || n.includes('гипермаркет') || n.includes('супермаркет')) return 'FMCG';
    if (n.includes('ип ') || n.includes('зоо') || n.includes('магазин') || n.includes('лавка') || n.includes('корм')) return 'Зоо розница';
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

// --- UPDATED DATE PARSER (YYYY-MM-DD) ---
const parseDayKey = (val: any): string | null => {
    if (!val) return null;
    
    // Excel Serial Number
    if (typeof val === 'number') {
        if (val > 20000 && val < 60000) { 
             const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
             const y = dateObj.getFullYear();
             const m = String(dateObj.getMonth() + 1).padStart(2, '0');
             const d = String(dateObj.getDate()).padStart(2, '0');
             return `${y}-${m}-${d}`;
        }
        return null;
    }
    const str = String(val).trim();
    
    // Matches YYYY-MM-DD or YYYY.MM.DD
    let match = str.match(/^(\d{4})[\.\-/](\d{2})[\.\-/](\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    
    // Matches DD.MM.YYYY
    match = str.match(/^(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    
    return null;
};

// Helper to extract YYYY-MM from YYYY-MM-DD
const getMonthFromDay = (dayKey: string): string => {
    return dayKey.slice(0, 7);
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
    state_seenRowsCount = totalRowsProcessed || 0;
    state_lastEmitCount = state_seenRowsCount;
    state_lastCheckpointCount = state_seenRowsCount;
    state_okbCoordIndex = createOkbCoordIndex(okbData);
    state_okbByRegion = {};
    state_okbRegionCounts = {};
    
    // Apply Filters - Expecting YYYY-MM-DD
    state_filterStart = startDate || null;
    state_filterEnd = endDate || null;
    
    console.log(`[Worker] Init Stream. Full Load. Filter (Daily): ${state_filterStart} - ${state_filterEnd}`);
    
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
                state_aggregatedData[row.key] = { ...rest, clients: new Map() };
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
        if (restoredUnidentified) state_unidentifiedRows = [...restoredUnidentified];
    }

    postMessage({ 
        type: 'result_init', 
        payload: { okbRegionCounts: state_okbRegionCounts, totalUnidentified: state_unidentifiedRows.length } 
    });
    
    let statusMsg = totalRowsProcessed ? `Восстановление сессии: ${totalRowsProcessed} строк...` : 'Связь установлена. Готов к обработке...';
    postMessage({ type: 'progress', payload: { percentage: 5, message: statusMsg, totalProcessed: state_processedRowsCount } });
}

function restoreChunk(payload: { chunkData: any[] }, postMessage: PostMessageFn) {
    const rows = payload.chunkData;
    if (!Array.isArray(rows)) {
        console.error("restoreChunk: Invalid data format", rows);
        return;
    }

    const dirtyGroups = new Set<string>();
    let restoredClientsCount = 0;

    rows.forEach(item => {
        let clientsToProcess: any[] = [];
        if (item.clients && Array.isArray(item.clients)) clientsToProcess = item.clients;
        else clientsToProcess = [item];

        clientsToProcess.forEach(client => {
            restoredClientsCount++; 
            
            let clientFact = typeof client.fact === 'number' ? client.fact : 0;
            
            let safeKey = client.key;
            if (!safeKey) {
                const addr = client.address || 'unknown';
                const name = client.name || client.clientName || 'unknown';
                const normAddr = normalizeAddress(addr);
                const normName = name.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
                safeKey = `${normAddr}#${normName}`;
            }
            
            // Preserve dailyFact if present, otherwise rely on monthlyFact or just fact
            const filteredClient = { ...client, key: safeKey, fact: clientFact };
            
            const reg = filteredClient.region || 'Не определен';
            const rm = filteredClient.rm || 'Не указан';
            const brand = filteredClient.brand || 'Без бренда';
            const packaging = filteredClient.packaging || 'Не указана';
            const groupKey = `${reg}-${rm}-${brand}-${packaging}`.toLowerCase();

            if (!state_aggregatedData[groupKey]) {
                state_aggregatedData[groupKey] = {
                    __rowId: generateRowId(),
                    key: groupKey,
                    clientName: `${reg}: ${brand}`,
                    brand, packaging, rm, region: reg, 
                    city: filteredClient.city || 'Не определен',
                    fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0, 
                    monthlyFact: {},
                    dailyFact: {},
                    clients: new Map()
                };
            }

            const group = state_aggregatedData[groupKey];
            
            // IDEMPOTENT UPDATE
            group.clients.set(safeKey, filteredClient);
            state_uniquePlottableClients.set(safeKey, filteredClient);
            
            dirtyGroups.add(groupKey);
        });
    });

    // RECALCULATE DIRTY GROUPS TO PREVENT DOUBLE COUNTING
    dirtyGroups.forEach(gKey => {
        const grp = state_aggregatedData[gKey];
        if (!grp) return;

        let newFact = 0;
        const newMonthly: Record<string, number> = {};
        const newDaily: Record<string, number> = {};

        grp.clients.forEach(c => {
            newFact += (c.fact || 0);
            
            // Re-aggregate Daily Facts
            if (c.dailyFact) {
                Object.entries(c.dailyFact).forEach(([day, v]) => {
                    const normDay = parseDayKey(day) || day; // Ensure standardized YYYY-MM-DD
                    newDaily[normDay] = (newDaily[normDay] || 0) + (v as number);
                    
                    // Also populate monthly for compatibility
                    const monthKey = getMonthFromDay(normDay);
                    newMonthly[monthKey] = (newMonthly[monthKey] || 0) + (v as number);
                });
            } 
            // Fallback: If only Monthly Fact exists (legacy snapshots)
            else if (c.monthlyFact) {
                Object.entries(c.monthlyFact).forEach(([m, v]) => {
                    const normKey = m.length > 7 ? getMonthFromDay(m) : m; // Basic normalization
                    newMonthly[normKey] = (newMonthly[normKey] || 0) + (v as number);
                });
            }
        });

        grp.fact = newFact;
        grp.monthlyFact = newMonthly;
        grp.dailyFact = newDaily;
        grp.potential = newFact * 1.15;
        grp.growthPotential = Math.max(0, grp.potential - newFact);
    });

    state_seenRowsCount += rows.length; 
    state_processedRowsCount += restoredClientsCount; 
    
    if (state_seenRowsCount - state_lastEmitCount > UI_UPDATE_THRESHOLD) {
        state_lastEmitCount = state_seenRowsCount;
        const currentProgress = Math.min(98, 10 + (state_seenRowsCount / 200000) * 85); 
        postMessage({ 
            type: 'progress', 
            payload: { percentage: currentProgress, message: `Синхронизация снимка: ${state_processedRowsCount.toLocaleString()}...`, totalProcessed: state_processedRowsCount } 
        });
    }
}

function processChunk(payload: { rawData: any[], isFirstChunk: boolean, fileName?: string, isObjectMode?: boolean, objectKind?: 'POINT_SNAPSHOT' | 'RAW_ROWS' }, postMessage: PostMessageFn) {
    const { rawData, isFirstChunk, isObjectMode, objectKind } = payload;
    if (!rawData || rawData.length === 0) return;
    
    // --- SPECIAL HANDLING FOR FLAT POINT SNAPSHOTS ---
    if (objectKind === 'POINT_SNAPSHOT') {
        const normCoord = (v: any): number | undefined => {
            if (v === null || v === undefined) return undefined;
            if (typeof v === 'string' && v.toLowerCase().includes('не найден')) return undefined;
            const n = parseCleanFloat(v);
            return (n !== 0) ? n : undefined;
        };

        const parseNum = (v: any): number => {
            if (!v) return 0;
            return parseCleanFloat(v);
        };

        for (const p of rawData) {
            state_seenRowsCount++;
            state_processedRowsCount++;

            // Extract basic fields
            const region = String(p.region ?? 'Регион не определен');
            const rm = String(p.rm ?? 'Unknown_RM');
            const brand = String(p.brand ?? 'Без бренда');
            const packaging = String(p.packaging ?? 'Не указана'); 
            const type = String(p.type ?? detectChannelByName(p.name || ''));
            const city = String(p.city ?? 'Город не определен');

            const groupKey = `${region}-${rm}-${brand}-${packaging}`.toLowerCase();

            // Ensure group exists
            if (!state_aggregatedData[groupKey]) {
                state_aggregatedData[groupKey] = {
                    __rowId: generateRowId(),
                    key: groupKey, 
                    clientName: `${region}: ${brand}`, 
                    brand: brand, 
                    packaging: packaging, 
                    rm, 
                    city: city, 
                    region: region, 
                    fact: 0,
                    monthlyFact: {},
                    dailyFact: {},
                    potential: 0, 
                    growthPotential: 0, 
                    growthPercentage: 0, 
                    clients: new Map(),
                };
            }

            // Client data
            const addrKey = String(p.key || p.address || '').trim(); // Fallback to address if key missing
            if (!addrKey) continue;

            const lat = normCoord(p.lat);
            const lon = normCoord(p.lng ?? p.lon); // Handle lng/lon variance
            const fact = parseNum(p.fact);

            // Update Group Totals
            const group = state_aggregatedData[groupKey];
            group.fact += fact;

            // Add client to map
            group.clients.set(addrKey, {
                key: addrKey,
                name: String(p.name ?? 'ТТ'),
                address: String(p.address ?? ''),
                city,
                region,
                rm,
                brand,
                packaging,
                type,
                lat,
                lon,
                fact,
                status: 'match',
                originalRow: p,
                monthlyFact: p.monthlyFact || {},
                dailyFact: p.dailyFact || {},
                abcCategory: 'C' // Will be re-calculated
            });
            
            // Add to unique map for visualization
            if (!state_uniquePlottableClients.has(addrKey)) {
                state_uniquePlottableClients.set(addrKey, group.clients.get(addrKey)!);
            }
        }
        
        // Skip standard processing for this chunk
        const currentProgress = Math.min(98, 10 + (state_seenRowsCount / 3500000) * 85); 
        postMessage({ type: 'progress', payload: { percentage: currentProgress, message: `Потоковая обработка: ${state_processedRowsCount.toLocaleString()}...`, totalProcessed: state_processedRowsCount } });
        return;
    }
    
    // --- STANDARD PROCESSING (Raw Rows) ---
    let jsonData: any[] = [];
    let headerOffset = 0;

    if (isObjectMode) {
        // Direct object array (already parsed JSON)
        jsonData = rawData;

        // Try to infer headers from the first valid object for robust key lookup later
        if (jsonData.length > 0 && state_headers.length === 0) {
             const firstObj = jsonData[0];
             if (typeof firstObj === 'object') {
                 state_headers = Object.keys(firstObj);
                 const normHeaders = state_headers.map(h => ({ original: h, norm: normalizeHeaderKey(h) }));
                 const clientHeader = normHeaders.find(h => h.norm.includes('названиеклиента') || h.norm.includes('наименованиеклиента') || h.norm.includes('клиент') || h.norm.includes('контрагент') || h.norm.includes('партнер'));
                 
                 if (clientHeader) state_clientNameHeader = clientHeader.original;
                 else {
                     const nameHeader = normHeaders.find(h => h.norm.includes('наименование') && !h.norm.includes('товар') && !h.norm.includes('продук'));
                     state_clientNameHeader = nameHeader ? nameHeader.original : undefined;
                 }
             }
        }
    } else {
        // Standard Array-of-Arrays (Excel Row) processing
        if (isFirstChunk || state_headers.length === 0) {
            const hRow = rawData.findIndex(row => Array.isArray(row) && row.some((cell: any) => String(cell || '').toLowerCase().includes('адрес')));
            const actualHRow = hRow === -1 ? 0 : hRow;
            if (!rawData[actualHRow]) return;

            headerOffset = actualHRow + 1;
            state_headers = rawData[actualHRow].map((h: any) => String(h || '').trim());
            jsonData = rawData.slice(actualHRow + 1).map(row => {
                const obj: any = {};
                state_headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
                return obj;
            });
            
            const normHeaders = state_headers.map(h => ({ original: h, norm: normalizeHeaderKey(h) }));
            const clientHeader = normHeaders.find(h => h.norm.includes('названиеклиента') || h.norm.includes('наименованиеклиента') || h.norm.includes('клиент') || h.norm.includes('контрагент') || h.norm.includes('партнер'));
            
            if (clientHeader) state_clientNameHeader = clientHeader.original;
            else {
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
    }

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        state_seenRowsCount++; 
        
        const dateRaw = findValueInRow(row, ['дата', 'период', 'месяц', 'date', 'period', 'day']);
        
        // PARSE DAY KEY (YYYY-MM-DD)
        let dayKey = parseDayKey(dateRaw);
        const finalDayKey = dayKey || 'unknown';

        // STRICT DATE FILTERING (DAILY PRECISION)
        if (finalDayKey !== 'unknown') {
            if (state_filterStart && finalDayKey < state_filterStart) continue;
            if (state_filterEnd && finalDayKey > state_filterEnd) continue;
        }
        
        const rawAddr = findAddressInRow(row);
        if (!rawAddr) continue;
        const cleanAddr = String(rawAddr).trim();
        if (cleanAddr.length < 4) continue;
        if (/^[-.,\s0-9]+$/.test(cleanAddr)) continue;
        const lowerAddr = cleanAddr.toLowerCase();
        if (['нет', 'не указан', 'неизвестно', 'unknown', 'none', 'пусто'].includes(lowerAddr)) continue;

        // Passed filters -> Increment processed count
        state_processedRowsCount++;

        let clientName = String(row[state_clientNameHeader || ''] || '').trim();
        if (!clientName || clientName.length < 2) clientName = cleanAddr || 'Без названия';

        const lowerName = clientName.toLowerCase();
        if (lowerName.includes('итого') || lowerName.includes('всего') || lowerName.includes('total') || lowerName.includes('grand total')) continue;

        let rm = findManagerValue(row, ['рм', 'региональный менеджер'], []);
        if (!rm) rm = 'Unknown_RM';

        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        const cacheEntry = state_cacheAddressMap.get(normAddr);

        if (cacheEntry && cacheEntry.isDeleted) continue;

        let channel = findValueInRow(row, ['канал продаж', 'тип тт', 'сегмент']);
        if (!channel || channel.length < 2) channel = detectChannelByName(clientName);

        const rawBrand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Без бренда';
        const brands = rawBrand.split(/[,;|\r\n]+/).map((b: string) => b.trim()).filter((b: string) => b.length > 0);
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';
        
        const isCityFound = parsed.city !== 'Город не определен';
        const reg = getCanonicalRegion(row) || parsed.region;
        const isRegionFound = reg !== 'Регион не определен';

        if (!isCityFound && !isRegionFound && !cacheEntry) {
            // For Object Mode, rawData[i] IS the object. For Array mode, rawData[i] is array, we might need headerOffset.
            // Simplified: Store the computed object 'row' which is standardized.
            state_unidentifiedRows.push({ rm, rowData: row, originalIndex: state_seenRowsCount, rawArray: isObjectMode ? [] : (rawData[i + headerOffset] || []) });
        }

        const weightRaw = findValueInRow(row, ['вес', 'количество', 'факт', 'объем', 'продажи', 'отгрузки', 'кг', 'тонн']);
        const totalWeight = parseCleanFloat(weightRaw);
        const weightPerBrand = brands.length > 0 ? totalWeight / brands.length : 0;
        
        const normName = clientName.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
        const uniqueClientKey = (normName.length > 2 && normName !== 'тт') ? `${normAddr}#${normName}` : normAddr;

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
                    dailyFact: {},
                    potential: 0, 
                    growthPotential: 0, 
                    growthPercentage: 0, 
                    clients: new Map(),
                };
            }

            // ACCUMULATE
            state_aggregatedData[groupKey].fact += weightPerBrand;
            
            // Daily Fact
            if (!state_aggregatedData[groupKey].dailyFact) state_aggregatedData[groupKey].dailyFact = {};
            state_aggregatedData[groupKey].dailyFact[finalDayKey] = (state_aggregatedData[groupKey].dailyFact[finalDayKey] || 0) + weightPerBrand;
            
            // Monthly Fact (Legacy/Overview support)
            const monthKey = getMonthFromDay(finalDayKey);
            if (!state_aggregatedData[groupKey].monthlyFact) state_aggregatedData[groupKey].monthlyFact = {};
            state_aggregatedData[groupKey].monthlyFact[monthKey] = (state_aggregatedData[groupKey].monthlyFact[monthKey] || 0) + weightPerBrand;

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
                    dailyFact: {},
                    abcCategory: 'C'
                });
            }
            
            const pt = state_uniquePlottableClients.get(uniqueClientKey);
            if (pt) {
                pt.fact = (pt.fact || 0) + weightPerBrand;
                
                // Client Level Daily
                if (!pt.dailyFact) pt.dailyFact = {};
                pt.dailyFact[finalDayKey] = (pt.dailyFact[finalDayKey] || 0) + weightPerBrand;
                
                // Client Level Monthly
                if (!pt.monthlyFact) pt.monthlyFact = {};
                pt.monthlyFact[monthKey] = (pt.monthlyFact[monthKey] || 0) + weightPerBrand;
                
                state_aggregatedData[groupKey].clients.set(uniqueClientKey, pt);
            }
        }
    }
    
    if (state_seenRowsCount % 10000 === 0) console.log(`⚙️ [Worker] Seen ${state_seenRowsCount} rows, Processed ${state_processedRowsCount}...`);
    
    // Checkpoints based on SEEN count to ensure consistent UI updates
    if (state_seenRowsCount - state_lastCheckpointCount >= CHECKPOINT_THRESHOLD) {
        state_lastCheckpointCount = state_seenRowsCount;
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
        state_lastEmitCount = state_seenRowsCount;
    }
    else if (state_seenRowsCount - state_lastEmitCount > UI_UPDATE_THRESHOLD) {
        state_lastEmitCount = state_seenRowsCount;
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
            payload: { data: partialData, totalProcessed: state_processedRowsCount }
        });
    }

    // Progress percentage
    const currentProgress = Math.min(98, 10 + (state_seenRowsCount / 3500000) * 85); 
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

    console.log(`[Worker] Finalize. Aggregated Groups: ${finalData.length}, Total Clients: ${state_uniquePlottableClients.size}, Seen: ${state_seenRowsCount}`);

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
