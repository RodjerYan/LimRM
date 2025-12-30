
import * as xlsx from 'xlsx';
import { 
    AggregatedDataRow, 
    OkbDataRow, 
    WorkerMessage, 
    MapPoint, 
    CoordsCache,
    UnidentifiedRow,
    WorkerResultPayload
} from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../utils/dataUtils';

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
let state_cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string; isInvalid?: boolean; comment?: string }>();
let state_processedRowsCount = 0;
let state_lastEmitCount = 0;
let state_lastCheckpointCount = 0;

const CHECKPOINT_THRESHOLD = 15000;

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

// Функция безопасного парсинга чисел (удаляет пробелы, NBSP и обрабатывает запятые)
const parseCleanFloat = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    
    const strVal = String(val);
    // 1. Удаляем все виды пробелов (обычные, неразрывные и т.д.)
    // 2. Заменяем запятую на точку
    const cleaned = strVal.replace(/[\s\u00A0]/g, '').replace(',', '.');
    
    const floatVal = parseFloat(cleaned);
    return isNaN(floatVal) ? 0 : floatVal;
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

// Функция инкрементального ABC-анализа
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

function initStream({ okbData, cacheData }: { okbData: OkbDataRow[], cacheData: CoordsCache }, postMessage: PostMessageFn) {
    state_aggregatedData = {};
    state_uniquePlottableClients = new Map();
    state_unidentifiedRows = [];
    state_headers = [];
    state_processedRowsCount = 0;
    state_lastEmitCount = 0;
    state_lastCheckpointCount = 0;
    state_okbCoordIndex = createOkbCoordIndex(okbData);
    state_okbByRegion = {};
    state_okbRegionCounts = {};
    
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
        Object.values(cacheData).flat().forEach(item => {
            if (item.address && !item.isDeleted) {
                state_cacheAddressMap.set(normalizeAddress(item.address), { 
                    lat: item.lat, lon: item.lon, originalAddress: item.address, isInvalid: item.isInvalid, comment: item.comment 
                });
            }
        });
    }

    // Мгновенно отправляем инициализацию с данными ОКБ
    postMessage({ 
        type: 'result_init', 
        payload: { 
            okbRegionCounts: state_okbRegionCounts,
            totalUnidentified: 0 
        } 
    });
    
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Связь установлена. Начало индексации...' } });
}

function processChunk(payload: { rawData: any[][], isFirstChunk: boolean, fileName?: string }, postMessage: PostMessageFn) {
    const { rawData, isFirstChunk } = payload;
    
    let jsonData: any[] = [];
    if (isFirstChunk || state_headers.length === 0) {
        const hRow = rawData.findIndex(row => row.some(cell => String(cell || '').toLowerCase().includes('адрес')));
        const actualHRow = hRow === -1 ? 0 : hRow;
        state_headers = rawData[actualHRow].map(h => String(h || '').trim());
        jsonData = rawData.slice(actualHRow + 1).map(row => {
            const obj: any = {};
            state_headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
            return obj;
        });
        state_clientNameHeader = state_headers.find(h => normalizeHeaderKey(h).includes('наименование'));
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
        
        let rm = findManagerValue(row, ['рм', 'региональный менеджер'], []);
        if (!rm) rm = 'Unknown_RM';

        const rawAddr = findAddressInRow(row);
        if (!rawAddr) continue;

        let channel = findValueInRow(row, ['канал продаж', 'тип тт', 'сегмент']);
        if (!channel || channel.length < 2) channel = 'Не определен';

        const brand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Без бренда';
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';

        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        const cacheEntry = state_cacheAddressMap.get(normAddr);
        
        const isCityFound = parsed.city !== 'Город не определен';
        const reg = getCanonicalRegion(row) || parsed.region;
        const isRegionFound = reg !== 'Регион не определен';

        if (!isCityFound && !isRegionFound && !cacheEntry) {
            state_unidentifiedRows.push({ rm, rowData: row, originalIndex: state_processedRowsCount });
            continue;
        }

        const groupKey = `${reg}-${rm}-${brand}-${packaging}`.toLowerCase();
        if (!state_aggregatedData[groupKey]) {
            state_aggregatedData[groupKey] = {
                key: groupKey, 
                clientName: `${reg}: ${brand}`, 
                brand: brand, 
                packaging: packaging, 
                rm, 
                city: parsed.city,
                region: reg, 
                fact: 0, 
                potential: 0, 
                growthPotential: 0, 
                growthPercentage: 0,
                clients: new Map(),
            };
        }

        const weightRaw = findValueInRow(row, ['вес', 'количество', 'факт', 'объем', 'продажи', 'отгрузки', 'кг', 'тонн']);
        const weight = parseCleanFloat(weightRaw);
        
        state_aggregatedData[groupKey].fact += weight;

        if (!state_uniquePlottableClients.has(normAddr)) {
            const okb = state_okbCoordIndex.get(normAddr);
            state_uniquePlottableClients.set(normAddr, {
                key: normAddr,
                lat: cacheEntry?.lat || okb?.lat,
                lon: cacheEntry?.lon || okb?.lon,
                status: 'match',
                name: String(row[state_clientNameHeader || ''] || 'ТТ'),
                address: rawAddr, 
                city: parsed.city, 
                region: reg, 
                rm, 
                brand: brand, 
                packaging: packaging,
                type: channel,
                originalRow: row, 
                fact: 0,
                abcCategory: 'C'
            });
        }
        
        const pt = state_uniquePlottableClients.get(normAddr);
        if (pt) {
            pt.fact = (pt.fact || 0) + weight;
            state_aggregatedData[groupKey].clients.set(normAddr, pt);
        }
    }
    
    // --- CHECKPOINT LOGIC ---
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
        
        // Also emit regular visual chunk so UI updates smoothly
        state_lastEmitCount = state_processedRowsCount;
    }
    else if (state_processedRowsCount - state_lastEmitCount > 5000) {
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

    const currentProgress = Math.min(98, 10 + (state_processedRowsCount / 100000) * 85);
    postMessage({ type: 'progress', payload: { percentage: currentProgress, message: `Потоковая передача: ${state_processedRowsCount.toLocaleString()} строк...` } });
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
    else if (msg.type === 'FINALIZE_STREAM') await finalizeStream(self.postMessage);
};
