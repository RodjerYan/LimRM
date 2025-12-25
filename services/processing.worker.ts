
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

let state_aggregatedData: AggregationMap = {};
let state_uniquePlottableClients = new Map<string, MapPoint>();
let state_unidentifiedRows: UnidentifiedRow[] = [];
let state_headers: string[] = [];
let state_clientNameHeader: string | undefined = undefined;
let state_okbCoordIndex: OkbCoordIndex = new Map();
let state_okbByRegion: Record<string, OkbDataRow[]> = {};
let state_okbRegionCounts: { [key: string]: number } = {};
let state_cacheAddressMap = new Map<string, { lat?: number; lon?: number; isInvalid?: boolean; comment?: string }>();
let state_processedRowsCount = 0;

const normalizeHeaderKey = (key: string): string => {
    if (!key) return '';
    return String(key).toLowerCase().replace(/[\r\n\t\s\u00A0]/g, '').trim();
};

const isValidManagerValue = (val: string): boolean => {
    if (!val) return false;
    const v = String(val).trim().toLowerCase();
    const stopWords = ['нет специализации', 'нет', 'корм', 'кошек', 'собак'];
    return !stopWords.some(w => v.includes(w)) && v.length >= 2;
};

const getCanonicalRegion = (row: any): string => {
    const subjectValue = findValueInRow(row, ['субъект', 'регион', 'region', 'область']);
    if (subjectValue && subjectValue.trim()) {
        const cleanVal = subjectValue.trim();
        let lowerVal = cleanVal.toLowerCase().replace(/ё/g, 'е').replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
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

function initStream({ okbData, cacheData }: { okbData: OkbDataRow[], cacheData: CoordsCache }, postMessage: PostMessageFn) {
    state_aggregatedData = {};
    state_uniquePlottableClients = new Map();
    state_unidentifiedRows = [];
    state_headers = [];
    state_processedRowsCount = 0;
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
                    lat: item.lat, lon: item.lon, isInvalid: item.isInvalid, comment: item.comment 
                });
            }
        });
    }
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Инициализация...' } });
}

function processChunk(payload: { rawData: any[][], isFirstChunk: boolean, fileName?: string }, postMessage: PostMessageFn) {
    const { rawData, isFirstChunk } = payload;
    
    if (isFirstChunk || state_headers.length === 0) {
        const hRow = rawData.findIndex(row => row.some(cell => String(cell || '').toLowerCase().includes('адрес')));
        const actualHRow = hRow === -1 ? 0 : hRow;
        state_headers = rawData[actualHRow].map(h => String(h || '').trim());
        state_clientNameHeader = state_headers.find(h => normalizeHeaderKey(h).includes('наименование'));
    }

    const jsonData = isFirstChunk 
        ? rawData.slice(state_headers.length > 0 ? 1 : 0) 
        : rawData;

    for (let i = 0; i < jsonData.length; i++) {
        const rawRow = jsonData[i];
        const row: any = {};
        state_headers.forEach((h, idx) => { if (h) row[h] = rawRow[idx]; });
        
        state_processedRowsCount++;
        
        let rm = findValueInRow(row, ['рм', 'региональный менеджер']);
        if (!isValidManagerValue(rm)) rm = 'Не указан';

        const rawAddr = findAddressInRow(row);
        if (!rawAddr) continue;

        const clientName = String(row[state_clientNameHeader || ''] || 'ТТ').trim();
        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        
        // КЛЮЧЕВОЙ ФИКС: Уникальность ТТ = Адрес + Клиент
        const clientUid = `${normAddr}_${clientName.toLowerCase().replace(/[^a-zа-я0-9]/g, '')}`;
        
        const cacheEntry = state_cacheAddressMap.get(normAddr);
        const reg = getCanonicalRegion(row) || parsed.region;

        if (parsed.city === 'Город не определен' && reg === 'Регион не определен' && !cacheEntry) {
            state_unidentifiedRows.push({ rm, rowData: row, originalIndex: state_processedRowsCount });
            continue;
        }

        const groupKey = `${reg}-${rm}`.toLowerCase();
        if (!state_aggregatedData[groupKey]) {
            state_aggregatedData[groupKey] = {
                key: groupKey, clientName: reg, brand: 'Все', packaging: 'Все', rm, city: parsed.city,
                region: reg, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Map(),
            };
        }

        const weight = parseFloat(String(findValueInRow(row, ['вес', 'количество']) || '0').replace(',', '.'));
        if (!isNaN(weight)) state_aggregatedData[groupKey].fact += weight;

        if (!state_uniquePlottableClients.has(clientUid)) {
            const okb = state_okbCoordIndex.get(normAddr);
            state_uniquePlottableClients.set(clientUid, {
                key: clientUid,
                lat: cacheEntry?.lat || okb?.lat,
                lon: cacheEntry?.lon || okb?.lon,
                status: 'match',
                name: clientName,
                address: rawAddr, city: parsed.city, region: reg, rm, brand: 'Все', packaging: 'Все',
                type: findValueInRow(row, ['канал продаж', 'тип']),
                originalRow: row, fact: 0,
                comment: cacheEntry?.comment
            });
        }
        
        const pt = state_uniquePlottableClients.get(clientUid);
        if (pt) {
            pt.fact = (pt.fact || 0) + (isNaN(weight) ? 0 : weight);
            state_aggregatedData[groupKey].clients.set(clientUid, pt);
        }
    }
    
    // Прогресс более реалистичный (базируется на ожидаемом объеме в 220к строк)
    const currentProgress = Math.min(98, 5 + (state_processedRowsCount / 250000) * 90);
    postMessage({ type: 'progress', payload: { percentage: currentProgress, message: `Загружено ТТ: ${state_uniquePlottableClients.size} (строк: ${state_processedRowsCount})` } });
}

async function finalizeStream(postMessage: PostMessageFn) {
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

    const finalData = Object.values(state_aggregatedData).map(item => ({
        ...item,
        clients: Array.from(item.clients.values())
    }));

    const result: WorkerResultPayload = {
        aggregatedData: finalData,
        unidentifiedRows: state_unidentifiedRows,
        okbRegionCounts: state_okbRegionCounts,
        totalRowsProcessed: state_processedRowsCount
    };

    postMessage({ type: 'result_finished', payload: result });
}

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'INIT_STREAM') initStream(msg.payload, self.postMessage);
    else if (msg.type === 'PROCESS_CHUNK') processChunk(msg.payload, self.postMessage);
    else if (msg.type === 'FINALIZE_STREAM') await finalizeStream(self.postMessage);
};
