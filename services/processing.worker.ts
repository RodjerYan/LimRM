
import * as xlsx from 'xlsx';
import { parse as PapaParse, type ParseResult, type ParseMeta } from 'papaparse';
import { 
    AggregatedDataRow, 
    OkbDataRow, 
    WorkerMessage, 
    PotentialClient, 
    MapPoint, 
    CoordsCache,
    EnrichedParsedAddress,
    UnidentifiedRow,
    WorkerInputInit,
    WorkerInputChunk,
    WorkerInputFinalize,
    WorkerInputAck
} from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../utils/dataUtils';
import { getDistanceKm } from '../utils/analytics';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Map<string, MapPoint> } };
type OkbCoordIndex = Map<string, { lat: number; lon: number }>;

// --- WORKER STATE ---
let state_aggregatedData: AggregationMap = {};
let state_uniquePlottableClients = new Map<string, MapPoint>();
let state_newAddressesToCache: { [rmName: string]: { address: string }[] } = {};
let state_addressesToGeocode: { [rmName: string]: string[] } = {};
let state_unidentifiedRows: UnidentifiedRow[] = [];
let state_headers: string[] = [];
let state_forcedRmHeader: string | undefined;
let state_forcedDmHeader: string | undefined;
let state_hasPotentialColumn = false;
let state_clientNameHeader: string | undefined = undefined;
let state_okbCoordIndex: OkbCoordIndex = new Map();
let state_okbByRegion: Record<string, OkbDataRow[]> = {};
let state_okbRegionCounts: { [key: string]: number } = {};
let state_cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string; isInvalid?: boolean; comment?: string }>();
let state_cacheRedirectMap = new Map<string, string>(); 
let state_deletedAddresses = new Set<string>();
let state_processedRowsCount = 0;
let state_dateRange: string | undefined = undefined;

const pendingAcks = new Set<string>();

const waitForAck = (id: string, timeoutMs = 30000) => {
    pendingAcks.add(id);
    return new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const interval = setInterval(() => {
            if (!pendingAcks.has(id)) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - started > timeoutMs) {
                pendingAcks.delete(id);
                clearInterval(interval);
                reject(new Error(`ACK timeout ${id}`));
            }
        }, 50);
    });
};

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
                    lat: item.lat, lon: item.lon, originalAddress: item.address, isInvalid: item.isInvalid, comment: item.comment 
                });
            }
        });
    }
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Инициализация...' } });
}

function processChunk(payload: { rawData: any[][], isFirstChunk: boolean, fileName?: string }, postMessage: PostMessageFn) {
    const { rawData, isFirstChunk, fileName } = payload;
    
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
        let rm = findManagerValue(row, ['рм', 'региональный менеджер'], []);
        if (!rm) rm = 'Unknown_RM';

        const rawAddr = findAddressInRow(row);
        if (!rawAddr) continue;

        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        const cacheEntry = state_cacheAddressMap.get(normAddr);
        
        const isCityFound = parsed.city !== 'Город не определен';
        const reg = getCanonicalRegion(row) || parsed.region;
        const isRegionFound = reg !== 'Регион не определен';

        if (!isCityFound && !isRegionFound && !cacheEntry) {
            state_unidentifiedRows.push({ rm, rowData: row, originalIndex: state_processedRowsCount + i });
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

        if (!state_uniquePlottableClients.has(normAddr)) {
            const okb = state_okbCoordIndex.get(normAddr);
            state_uniquePlottableClients.set(normAddr, {
                key: normAddr,
                lat: cacheEntry?.lat || okb?.lat,
                lon: cacheEntry?.lon || okb?.lon,
                status: 'match',
                name: String(row[state_clientNameHeader || ''] || 'ТТ'),
                address: rawAddr, city: parsed.city, region: reg, rm, brand: 'Все', packaging: 'Все',
                type: 'Retail', originalRow: row, fact: weight
            });
        }
        
        const pt = state_uniquePlottableClients.get(normAddr);
        if (pt) state_aggregatedData[groupKey].clients.set(normAddr, pt);
    }
    state_processedRowsCount += jsonData.length;
}

async function finalizeStream(postMessage: PostMessageFn) {
    const finalData = Object.values(state_aggregatedData).map(item => ({
        ...item,
        potential: item.fact * 1.15,
        growthPotential: item.fact * 0.15,
        growthPercentage: 15,
        clients: Array.from(item.clients.values())
    }));

    postMessage({ type: 'result_init', payload: { okbRegionCounts: state_okbRegionCounts, totalUnidentified: state_unidentifiedRows.length } });
    postMessage({ type: 'result_chunk_aggregated', payload: finalData });
    postMessage({ type: 'result_chunk_unidentified', payload: state_unidentifiedRows });
    postMessage({ type: 'result_finished' });
}

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'INIT_STREAM') initStream(msg.payload, self.postMessage);
    else if (msg.type === 'PROCESS_CHUNK') processChunk(msg.payload, self.postMessage);
    else if (msg.type === 'FINALIZE_STREAM') await finalizeStream(self.postMessage);
    else if (msg.type === 'ACK') pendingAcks.delete(msg.payload.batchId);
};
