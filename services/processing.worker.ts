
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
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

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
let state_unidentifiedKeySet = new Set<string>(); // NEW: Dedup set for unidentified rows
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

// INLINE HELPER: Robust value finding to ensure we don't miss columns due to import caching
const findValueInRowLocal = (row: any, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    
    // 1. Exact match (fast)
    for (const keyword of keywords) {
        const k = normalizeHeaderKey(keyword);
        const exactKey = rowKeys.find(rKey => normalizeHeaderKey(rKey) === k);
        if (exactKey && row[exactKey] != null) return String(row[exactKey]);
    }

    // 2. Partial match (slower but covers "Адрес (доставки)" etc)
    for (const keyword of keywords) {
        const k = normalizeHeaderKey(keyword);
        const boundaryKey = rowKeys.find(rKey => {
            const normRKey = normalizeHeaderKey(rKey);
            return normRKey.includes(k);
        });
        if (boundaryKey && row[boundaryKey] != null) return String(row[boundaryKey]);
    }
    return '';
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
    // Replace comma with dot, remove spaces (including non-breaking)
    const cleaned = strVal.replace(/[\s\u00A0]/g, '').replace(',', '.');
    const floatVal = parseFloat(cleaned);
    return isNaN(floatVal) ? 0 : floatVal;
};

// Strict check for "Unidentified" status text
const isSpecificErrorMarker = (v: any): boolean => {
    if (!v) return false;
    const s = String(v).toLowerCase().trim();
    // Only return true if the value explicitly contains error keywords
    return s.includes('не определен') || s.includes('не определён') || s.includes('некорректный');
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
    
    const str = String(val).replace(/['"]/g, '').trim();
    if (!str) return null;
    
    let match = str.match(/^(20\d{2})[\.\-/](\d{1,2})[\.\-/](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    
    match = str.match(/^(\d{1,2})[\.\-/](\d{1,2})[\.\-/](20\d{2})/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    
    return null;
};

const getMonthFromDay = (dayKey: string): string => {
    return dayKey.slice(0, 7);
};

const getCanonicalRegion = (row: any): string => {
    const subjectValue = findValueInRowLocal(row, ['субъект', 'регион', 'область']);
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

const getValueFuzzy = (obj: any, keys: string[]) => {
    for (const k of keys) {
        if (obj[k] !== undefined) return obj[k];
    }
    const objKeys = Object.keys(obj);
    for (const k of keys) {
        const lowerK = k.toLowerCase();
        const found = objKeys.find(ok => ok.toLowerCase() === lowerK);
        if (found) return obj[found];
    }
    for (const k of keys) {
        const lowerK = k.toLowerCase();
        const found = objKeys.find(ok => ok.toLowerCase().includes(lowerK));
        if (found) return obj[found];
    }
    return undefined;
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
    state_unidentifiedKeySet = new Set();
    state_headers = [];
    state_processedRowsCount = totalRowsProcessed || 0;
    state_seenRowsCount = totalRowsProcessed || 0;
    state_lastEmitCount = state_seenRowsCount;
    state_lastCheckpointCount = state_seenRowsCount;
    state_okbCoordIndex = createOkbCoordIndex(okbData);
    state_okbByRegion = {};
    state_okbRegionCounts = {};
    
    state_filterStart = startDate || null;
    state_filterEnd = endDate || null;
    
    console.log(`[Worker] Init Stream. Filter: ${state_filterStart} - ${state_filterEnd}`);
    
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
    }

    // FIX #2: Always process restoredUnidentified, regardless of restoredData presence
    // This ensures we clean up old errors even if data arrays were weirdly empty
    if (restoredUnidentified) {
        const hasValidCoordsRowLocal = (row: any) => {
            const latRaw = findValueInRowLocal(row, ['широта', 'lat', 'ldt', 'latitude', 'geo_lat', 'y', 'lat_clean']);
            const lonRaw = findValueInRowLocal(row, ['долгота', 'lon', 'lng', 'longitude', 'geo_lon', 'x', 'lon_clean']);
            const lat = parseCleanFloat(latRaw);
            const lon = parseCleanFloat(lonRaw);
            return lat !== 0 && lon !== 0;
        };

        // Strict cleanup: Filter out rows that actually have numeric coordinates now
        state_unidentifiedRows = restoredUnidentified.filter(u => !hasValidCoordsRowLocal(u.rowData));

        // Re-populate dedup set from valid errors only
        state_unidentifiedRows.forEach(row => {
            const normAddr = normalizeAddress(findAddressInRow(row.rowData) || '');
            const clientName = findValueInRowLocal(row.rowData, ['name', 'client', 'наименование']) || '';
            const dedupKey = `${normAddr}#${clientName.toLowerCase().replace(/[^a-zа-я0-9]/g, '')}`;
            state_unidentifiedKeySet.add(dedupKey);
        });
    }

    postMessage({ 
        type: 'result_init', 
        payload: { okbRegionCounts: state_okbRegionCounts, totalUnidentified: state_unidentifiedRows.length } 
    });
    
    let statusMsg = totalRowsProcessed ? `Восстановление сессии: ${totalRowsProcessed} строк...` : 'Связь установлена. Готов к обработке...';
    postMessage({ type: 'progress', payload: { percentage: 5, message: statusMsg, totalProcessed: state_processedRowsCount } });
}

function restoreChunk(payload: { chunkData: any, progress?: number }, postMessage: PostMessageFn) {
    const raw = payload.chunkData;
    const rows = Array.isArray(raw) 
        ? raw 
        : (raw && Array.isArray(raw.aggregatedData) ? raw.aggregatedData : []);

    if (!Array.isArray(rows) || rows.length === 0) {
        console.error("restoreChunk: Invalid data format", raw);
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
            const rawDate = getValueFuzzy(client, ['sale_date', 'saleDate', 'date', 'period', 'day', 'дата', 'дата документа']);
            const dayKey = parseDayKey(rawDate) || 'unknown';
            
            const existingDaily = client.dailyFact || {};
            const finalDailyFact = { ...existingDaily };
            if (Object.keys(finalDailyFact).length === 0 && dayKey !== 'unknown' && clientFact !== 0) {
                finalDailyFact[dayKey] = clientFact;
            }

            const filteredClient = { 
                ...client, 
                key: safeKey, 
                fact: clientFact,
                dailyFact: finalDailyFact
            };
            
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
            group.clients.set(safeKey, filteredClient);
            state_uniquePlottableClients.set(safeKey, filteredClient);
            dirtyGroups.add(groupKey);
        });
    });

    dirtyGroups.forEach(gKey => {
        const grp = state_aggregatedData[gKey];
        if (!grp) return;

        let newFact = 0;
        const newMonthly: Record<string, number> = {};
        const newDaily: Record<string, number> = {};

        grp.clients.forEach(c => {
            newFact += (c.fact || 0);
            if (c.dailyFact) {
                Object.entries(c.dailyFact).forEach(([day, v]) => {
                    const normDay = parseDayKey(day) || day; 
                    newDaily[normDay] = (newDaily[normDay] || 0) + (v as number);
                    const monthKey = getMonthFromDay(normDay);
                    newMonthly[monthKey] = (newMonthly[monthKey] || 0) + (v as number);
                });
            } else if (c.monthlyFact) {
                Object.entries(c.monthlyFact).forEach(([m, v]) => {
                    const normKey = m.length > 7 ? getMonthFromDay(m) : m;
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
        
        // Use passed progress or fallback to formula
        const currentProgress = payload.progress ?? Math.min(98, 10 + (state_seenRowsCount / 200000) * 85);
        
        postMessage({ 
            type: 'progress', 
            payload: { percentage: currentProgress, message: `Синхронизация снимка: ${state_processedRowsCount.toLocaleString()}...`, totalProcessed: state_processedRowsCount } 
        });
    }
}

function processChunk(payload: { rawData: any[], isFirstChunk: boolean, fileName?: string, isObjectMode?: boolean, objectKind?: 'POINT_SNAPSHOT' | 'RAW_ROWS', progress?: number }, postMessage: PostMessageFn) {
    const { rawData, isFirstChunk, isObjectMode, objectKind, progress } = payload;
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

        const points: any[] = [];
        for (const item of rawData) {
            if (item && Array.isArray(item.aggregatedData)) {
                points.push(...item.aggregatedData);
            } else {
                points.push(item);
            }
        }

        for (const p of points) {
            state_seenRowsCount++;
            state_processedRowsCount++;

            const region = String(p.region ?? 'Регион не определен');
            const rm = String(p.rm ?? 'Unknown_RM');
            const brand = String(p.brand ?? 'Без бренда');
            const packaging = String(p.packaging ?? 'Не указана'); 
            const type = String(p.type ?? detectChannelByName(p.name || ''));
            const city = String(p.city ?? 'Город не определен');

            const rawDate = getValueFuzzy(p, [
                'sale_date', 'saleDate',
                'date', 'period', 'day', 
                'дата', 'период', 
                'дата документа', 'датадокумента', 'дата_документа'
            ]);
            const dayKey = parseDayKey(rawDate) || 'unknown';
            const monthKey = dayKey !== 'unknown' ? getMonthFromDay(dayKey) : 'unknown';

            const groupKey = `${region}-${rm}-${brand}-${packaging}`.toLowerCase();

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

            const addrKey = String(p.key || p.address || '').trim(); 
            if (!addrKey) continue;

            const lat = normCoord(p.lat);
            const lon = normCoord(p.lng ?? p.lon);
            const rawFact = getValueFuzzy(p, ['fact', 'weight', 'volume', 'amount', 'количество', 'вес', 'объем']);
            const fact = parseNum(rawFact);

            const group = state_aggregatedData[groupKey];
            group.fact += fact;
            
            if (!group.dailyFact) group.dailyFact = {};
            if (dayKey !== 'unknown') {
                group.dailyFact[dayKey] = (group.dailyFact[dayKey] || 0) + fact;
            }
            if (!group.monthlyFact) group.monthlyFact = {};
            if (monthKey !== 'unknown') {
                group.monthlyFact[monthKey] = (group.monthlyFact[monthKey] || 0) + fact;
            }

            if (!group.clients.has(addrKey)) {
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
                    fact: 0,
                    status: 'match',
                    originalRow: p,
                    monthlyFact: {},
                    dailyFact: {},
                    abcCategory: 'C' 
                });
            }

            const client = group.clients.get(addrKey)!;
            client.fact = (client.fact || 0) + fact;
            
            if (!client.dailyFact) client.dailyFact = {};
            if (dayKey !== 'unknown') {
                client.dailyFact[dayKey] = (client.dailyFact[dayKey] || 0) + fact;
            }
            if (!client.monthlyFact) client.monthlyFact = {};
            if (monthKey !== 'unknown') {
                client.monthlyFact[monthKey] = (client.monthlyFact[monthKey] || 0) + fact;
            }
            
            if (!state_uniquePlottableClients.has(addrKey)) {
                state_uniquePlottableClients.set(addrKey, client);
            }
        }
        
        // Use passed progress or fallback to formula
        const currentProgress = progress ?? Math.min(98, 10 + (state_seenRowsCount / 3500000) * 85);
        
        postMessage({ type: 'progress', payload: { percentage: currentProgress, message: `Потоковая обработка: ${state_processedRowsCount.toLocaleString()}...`, totalProcessed: state_processedRowsCount } });
        return;
    }
    
    // --- STANDARD PROCESSING (Raw Rows) ---
    let jsonData: any[] = [];
    let headerOffset = 0;

    if (isObjectMode) {
        jsonData = rawData;
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
        
        const dateRaw = findValueInRowLocal(row, ['дата', 'период', 'месяц', 'date', 'period', 'day', 'sale_date']);
        let dayKey = parseDayKey(dateRaw);
        const finalDayKey = dayKey || 'unknown';

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

        state_processedRowsCount++;

        let clientName = String(row[state_clientNameHeader || ''] || '').trim();
        if (!clientName || clientName.length < 2) clientName = cleanAddr || 'Без названия';

        const lowerName = clientName.toLowerCase();
        if (lowerName.includes('итого') || lowerName.includes('всего') || lowerName.includes('total') || lowerName.includes('grand total')) continue;

        let rm = findManagerValue(row, ['рм', 'региональный менеджер'], []);
        if (!rm) rm = 'Unknown_RM';

        // --- COORDINATE EXTRACTION ---
        const latRaw = findValueInRowLocal(row, ['широта', 'lat', 'ldt', 'latitude', 'широта (lat)', 'geo_lat', 'y', 'lat_clean']);
        const lonRaw = findValueInRowLocal(row, ['долгота', 'lon', 'lng', 'longitude', 'долгота (lon)', 'geo_lon', 'x', 'lon_clean']);
        
        const rowLat = parseCleanFloat(latRaw);
        const rowLon = parseCleanFloat(lonRaw);
        const hasRowCoords = (rowLat !== 0) && (rowLon !== 0);

        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        const cacheEntry = state_cacheAddressMap.get(normAddr);

        if (cacheEntry && cacheEntry.isDeleted) continue;
        
        const okb = state_okbCoordIndex.get(normAddr);

        // FIX #1 & #2: Strict Coordinate Logic
        // Priority: Explicit Row Coords > Cache > OKB Lookup
        // Use nullish coalescing (??) to correctly handle 0/null vs undefined
        const effectiveLatRaw = hasRowCoords ? rowLat : (cacheEntry?.lat ?? okb?.lat);
        const effectiveLonRaw = hasRowCoords ? rowLon : (cacheEntry?.lon ?? okb?.lon);

        // Ensure we strictly have numbers
        const nLat = typeof effectiveLatRaw === 'number' ? effectiveLatRaw : parseCleanFloat(effectiveLatRaw);
        const nLon = typeof effectiveLonRaw === 'number' ? effectiveLonRaw : parseCleanFloat(effectiveLonRaw);

        // Valid if numbers are finite and non-zero
        const hasAnyCoords = !isNaN(nLat) && !isNaN(nLon) && nLat !== 0 && nLon !== 0;

        // "Unidentified" means we tried everything (Row, Cache, OKB) and still have no coords,
        // AND the original row had an error text marker.
        const isUnidentifiedByText = isSpecificErrorMarker(latRaw) || isSpecificErrorMarker(lonRaw);

        if (!hasAnyCoords && isUnidentifiedByText) {
            const dedupKey = `${normAddr}#${(clientName || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '')}`;
            if (!state_unidentifiedKeySet.has(dedupKey)) {
                state_unidentifiedKeySet.add(dedupKey);
                state_unidentifiedRows.push({
                    rm,
                    rowData: row,
                    originalIndex: state_seenRowsCount,
                    rawArray: isObjectMode ? [] : (rawData[i + headerOffset] || [])
                });
            }
        }

        let channel = findValueInRowLocal(row, ['канал продаж', 'тип тт', 'сегмент']);
        if (!channel || channel.length < 2) channel = detectChannelByName(clientName);

        const rawBrand = findValueInRowLocal(row, ['торговая марка', 'бренд']) || 'Без бренда';
        const brands = rawBrand.split(/[,;|\r\n]+/).map((b: string) => b.trim()).filter((b: string) => b.length > 0);
        const packaging = findValueInRowLocal(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';
        
        const reg = getCanonicalRegion(row) || parsed.region;

        const weightRaw = findValueInRowLocal(row, ['вес', 'количество', 'факт', 'объем', 'продажи', 'отгрузки', 'кг', 'тонн']);
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

            state_aggregatedData[groupKey].fact += weightPerBrand;
            
            if (!state_aggregatedData[groupKey].dailyFact) state_aggregatedData[groupKey].dailyFact = {};
            if (finalDayKey !== 'unknown') {
                state_aggregatedData[groupKey].dailyFact[finalDayKey] = (state_aggregatedData[groupKey].dailyFact[finalDayKey] || 0) + weightPerBrand;
            }
            
            const monthKey = getMonthFromDay(finalDayKey);
            if (!state_aggregatedData[groupKey].monthlyFact) state_aggregatedData[groupKey].monthlyFact = {};
            if (monthKey !== 'unknown') {
                state_aggregatedData[groupKey].monthlyFact[monthKey] = (state_aggregatedData[groupKey].monthlyFact[monthKey] || 0) + weightPerBrand;
            }

            if (!state_uniquePlottableClients.has(uniqueClientKey)) {
                state_uniquePlottableClients.set(uniqueClientKey, {
                    key: uniqueClientKey,
                    lat: hasAnyCoords ? nLat : undefined,
                    lon: hasAnyCoords ? nLon : undefined,
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
                
                if (!pt.dailyFact) pt.dailyFact = {};
                if (finalDayKey !== 'unknown') {
                    pt.dailyFact[finalDayKey] = (pt.dailyFact[finalDayKey] || 0) + weightPerBrand;
                }
                
                if (!pt.monthlyFact) pt.monthlyFact = {};
                if (monthKey !== 'unknown') {
                    pt.monthlyFact[monthKey] = (pt.monthlyFact[monthKey] || 0) + weightPerBrand;
                }
                
                state_aggregatedData[groupKey].clients.set(uniqueClientKey, pt);
            }
        }
    }
    
    if (state_seenRowsCount % 10000 === 0) console.log(`⚙️ [Worker] Seen ${state_seenRowsCount} rows, Processed ${state_processedRowsCount}...`);
    
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

    // Use passed progress or fallback to formula
    const currentProgress = progress ?? Math.min(98, 10 + (state_seenRowsCount / 3500000) * 85); 
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
