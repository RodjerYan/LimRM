
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
let state_filterStart: string | null = null; // YYYY-MM
let state_filterEnd: string | null = null;   // YYYY-MM

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
    
    // Apply Filters
    state_filterStart = startDate ? String(startDate).slice(0, 7) : null;
    state_filterEnd = endDate ? String(endDate).slice(0, 7) : null;
    
    console.log(`[Worker] Init Stream. Full Load. Filter: ${state_filterStart} - ${state_filterEnd}`);
    
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

    rows.forEach(item => {
        let clientsToProcess: any[] = [];
        
        if (item.clients && Array.isArray(item.clients)) {
            clientsToProcess = item.clients;
        } else {
            clientsToProcess = [item];
        }

        clientsToProcess.forEach(client => {
            // Restore Raw Data. Do NOT filter by date here.
            // The UI will filter based on monthlyFact.
            let clientFact = typeof client.fact === 'number' ? client.fact : 0;
            
            let safeKey = client.key;
            if (!safeKey) {
                const addr = client.address || 'unknown';
                const name = client.name || client.clientName || 'unknown';
                const normAddr = normalizeAddress(addr);
                const normName = name.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
                safeKey = `${normAddr}#${normName}`;
            }
            
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
                    brand, 
                    packaging, 
                    rm, 
                    region: reg, 
                    city: filteredClient.city || 'Не определен',
                    fact: 0,
                    potential: 0, 
                    growthPotential: 0, 
                    growthPercentage: 0, 
                    clients: new Map()
                };
            }

            const group = state_aggregatedData[groupKey];
            
            if (group.clients.has(safeKey)) {
                const existing = group.clients.get(safeKey)!;
                // Merge Facts
                existing.fact = (existing.fact || 0) + clientFact;
                // Merge Monthly Facts
                if (filteredClient.monthlyFact) {
                    if (!existing.monthlyFact) existing.monthlyFact = {};
                    Object.entries(filteredClient.monthlyFact).forEach(([k, v]) => {
                        existing.monthlyFact![k] = (existing.monthlyFact![k] || 0) + (v as number);
                    });
                }
            } else {
                group.clients.set(safeKey, filteredClient);
            }
            
            group.fact += clientFact;
            group.potential = group.fact * 1.15; 

            if (!state_uniquePlottableClients.has(safeKey)) {
                state_uniquePlottableClients.set(safeKey, filteredClient);
            }
        });
    });

    state_processedRowsCount += rows.length;
    
    if (state_processedRowsCount - state_lastEmitCount > UI_UPDATE_THRESHOLD) {
        state_lastEmitCount = state_processedRowsCount;
        const currentProgress = Math.min(98, 10 + (state_processedRowsCount / 200000) * 85); 
        postMessage({ 
            type: 'progress', 
            payload: { percentage: currentProgress, message: `Синхронизация снимка: ${state_processedRowsCount.toLocaleString()}...`, totalProcessed: state_processedRowsCount } 
        });
    }
}

function processChunk(payload: { rawData: any[][], isFirstChunk: boolean, fileName?: string }, postMessage: PostMessageFn) {
    const { rawData, isFirstChunk } = payload;
    if (!rawData || rawData.length === 0) return;
    
    let jsonData: any[] = [];
    let headerOffset = 0;

    if (isFirstChunk || state_headers.length === 0) {
        const hRow = rawData.findIndex(row => Array.isArray(row) && row.some(cell => String(cell || '').toLowerCase().includes('адрес')));
        const actualHRow = hRow === -1 ? 0 : hRow;
        
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
        const clientHeader = normHeaders.find(h => h.norm.includes('названиеклиента') || h.norm.includes('наименованиеклиента') || h.norm.includes('клиент') || h.norm.includes('контрагент') || h.norm.includes('партнер'));
        
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
        
        const dateRaw = findValueInRow(row, ['дата', 'период', 'месяц', 'date', 'period', 'day']);
        let dateKey = parseDateKey(dateRaw);
        const finalDateKey = dateKey || 'unknown';

        // --- STRICT DATE FILTERING ---
        // Exclude rows outside the selected range
        if (finalDateKey !== 'unknown') {
            if (state_filterStart && finalDateKey < state_filterStart) continue;
            if (state_filterEnd && finalDateKey > state_filterEnd) continue;
        }
        
        const rawAddr = findAddressInRow(row);
        if (!rawAddr) continue;
        const cleanAddr = String(rawAddr).trim();
        if (cleanAddr.length < 4) continue;
        if (/^[-.,\s0-9]+$/.test(cleanAddr)) continue;
        const lowerAddr = cleanAddr.toLowerCase();
        if (['нет', 'не указан', 'неизвестно', 'unknown', 'none', 'пусто'].includes(lowerAddr)) continue;

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
        const brands = rawBrand.split(/[,;|\r\n]+/).map(b => b.trim()).filter(b => b.length > 0);
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';
        
        const isCityFound = parsed.city !== 'Город не определен';
        const reg = getCanonicalRegion(row) || parsed.region;
        const isRegionFound = reg !== 'Регион не определен';

        if (!isCityFound && !isRegionFound && !cacheEntry) {
            const rawRowIndex = isFirstChunk ? (i + headerOffset) : i;
            const rawArray = rawData[rawRowIndex] || [];
            state_unidentifiedRows.push({ rm, rowData: row, originalIndex: state_processedRowsCount, rawArray: rawArray });
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
                    potential: 0, 
                    growthPotential: 0, 
                    growthPercentage: 0, 
                    clients: new Map(),
                };
            }

            state_aggregatedData[groupKey].fact += weightPerBrand;
            if (!state_aggregatedData[groupKey].monthlyFact) state_aggregatedData[groupKey].monthlyFact = {};
            state_aggregatedData[groupKey].monthlyFact[finalDateKey] = (state_aggregatedData[groupKey].monthlyFact[finalDateKey] || 0) + weightPerBrand;

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
                pt.monthlyFact[finalDateKey] = (pt.monthlyFact[finalDateKey] || 0) + weightPerBrand;
                state_aggregatedData[groupKey].clients.set(uniqueClientKey, pt);
            }
        }
    }
    
    if (state_processedRowsCount % 10000 === 0) console.log(`⚙️ [Worker] Processed ${state_processedRowsCount} rows...`);
    
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
            payload: { data: partialData, totalProcessed: state_processedRowsCount }
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

    console.log(`[Worker] Finalize. Aggregated Groups: ${finalData.length}, Total Clients: ${state_uniquePlottableClients.size}`);

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
