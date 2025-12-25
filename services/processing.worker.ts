
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
type OkbCoordIndex = Map<string, { lat: number; lon: number }>;

// --- WORKER STATE ---
let state_aggregatedData = new Map<string, AggregatedDataRow>();
let state_uniquePlottableClients = new Map<string, MapPoint>();
let state_unidentifiedRows: UnidentifiedRow[] = [];
let state_headers: string[] = [];
let state_clientNameHeader: string | undefined = undefined;
let state_okbCoordIndex: OkbCoordIndex = new Map();
let state_okbRegionCounts: { [key: string]: number } = {};
let state_cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string; isInvalid?: boolean; comment?: string }>();
let state_processedRowsCount = 0;

const normalizeHeaderKey = (key: string): string => {
    if (!key) return '';
    return String(key).toLowerCase().replace(/[\r\n\t\s\u00A0]/g, '').trim();
};

const findManagerValue = (row: any, strictKeys: string[]): string => {
    const rowKeys = Object.keys(row);
    const targetStrict = strictKeys.map(normalizeHeaderKey);
    for (const key of rowKeys) {
        if (targetStrict.includes(normalizeHeaderKey(key))) {
             const val = String(row[key] || '').trim();
             if (val && val.length > 1) return val;
        }
    }
    return '';
};

const getCanonicalRegion = (row: any): string => {
    const subjectValue = findValueInRow(row, ['субъект', 'регион', 'область']);
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

function initStream({ okbData, cacheData }: { okbData: OkbDataRow[], cacheData: CoordsCache }, postMessage: PostMessageFn) {
    state_aggregatedData = new Map();
    state_uniquePlottableClients = new Map();
    state_unidentifiedRows = [];
    state_headers = [];
    state_processedRowsCount = 0;
    state_okbRegionCounts = {};
    
    if (okbData) {
        okbData.forEach(row => {
            const reg = getCanonicalRegion(row);
            if (reg !== 'Регион не определен') {
                state_okbRegionCounts[reg] = (state_okbRegionCounts[reg] || 0) + 1;
            }
        });
        
        state_okbCoordIndex = new Map();
        for (const row of okbData) {
            const address = findAddressInRow(row);
            if (address && row.lat && row.lon) {
                state_okbCoordIndex.set(normalizeAddress(address), { lat: row.lat, lon: row.lon });
            }
        }
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
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Инициализация...' } });
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
        
        const rawAddr = findAddressInRow(row);
        if (!rawAddr) continue;

        const rm = findManagerValue(row, ['рм', 'региональный менеджер']) || 'Не закреплен';
        const brand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Без бренда';
        const packaging = findValueInRow(row, ['фасовка', 'упаковка']) || 'Не указана';
        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        const reg = getCanonicalRegion(row) || parsed.region;
        
        const cacheEntry = state_cacheAddressMap.get(normAddr);
        const isCityFound = parsed.city !== 'Город не определен';
        const isRegionFound = reg !== 'Регион не определен';

        if (!isCityFound && !isRegionFound && !cacheEntry) {
            state_unidentifiedRows.push({ rm, rowData: row, originalIndex: state_processedRowsCount });
            continue;
        }

        // Ключ агрегации теперь включает Бренд для детального дашборда
        const groupKey = `${reg}-${rm}-${brand}`.toLowerCase();
        if (!state_aggregatedData.has(groupKey)) {
            state_aggregatedData.set(groupKey, {
                key: groupKey, 
                clientName: reg, 
                brand: brand, 
                packaging: packaging, 
                rm: rm, 
                city: parsed.city,
                region: reg, 
                fact: 0, 
                potential: 0, 
                growthPotential: 0, 
                growthPercentage: 0,
                clients: [],
            });
        }

        const weight = parseFloat(String(findValueInRow(row, ['вес', 'количество']) || '0').replace(',', '.'));
        const rowFact = isNaN(weight) ? 0 : weight;
        state_aggregatedData.get(groupKey)!.fact += rowFact;

        if (!state_uniquePlottableClients.has(normAddr)) {
            const okb = state_okbCoordIndex.get(normAddr);
            state_uniquePlottableClients.set(normAddr, {
                key: normAddr,
                lat: cacheEntry?.lat || okb?.lat,
                lon: cacheEntry?.lon || okb?.lon,
                status: 'match',
                name: String(row[state_clientNameHeader || ''] || 'ТТ'),
                address: rawAddr, city: parsed.city, region: reg, rm, brand: brand, packaging: packaging,
                type: findValueInRow(row, ['канал продаж', 'тип']) || 'Розница',
                originalRow: row, fact: 0,
                abcCategory: 'C'
            });
        }
        
        const pt = state_uniquePlottableClients.get(normAddr)!;
        pt.fact = (pt.fact || 0) + rowFact;
        state_aggregatedData.get(groupKey)!.clients.push(pt);
    }
    
    postMessage({ type: 'progress', payload: { percentage: 50, message: `Обработано ${state_processedRowsCount} строк...` } });
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

    const result: WorkerResultPayload = {
        aggregatedData: Array.from(state_aggregatedData.values()),
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
