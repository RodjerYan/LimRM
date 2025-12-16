
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
    WorkerInputFinalize
} from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../utils/dataUtils';
import { getDistanceKm } from '../utils/analytics';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Map<string, MapPoint> } };

type OkbCoordIndex = Map<string, { lat: number; lon: number }>;

// --- WORKER STATE ---
// These variables persist between messages to allow chunked processing
let state_aggregatedData: AggregationMap = {};
let state_uniquePlottableClients = new Map<string, MapPoint>();
let state_newAddressesToCache: { [rmName: string]: { address: string }[] } = {};
let state_addressesToGeocode: { [rmName: string]: string[] } = {};
let state_unidentifiedRows: UnidentifiedRow[] = [];
let state_headers: string[] = [];
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isValidManagerValue = (val: string): boolean => {
    if (!val) return false;
    const v = String(val).trim().toLowerCase();
    const stopWords = ['нет специализации', 'нет', 'для ', 'без ', 'корм', 'кошек', 'собак', 'стерилиз', 'чувствител', 'пород', 'weight', 'adult', 'junior', 'kitten', 'puppy', 'специализ', 'продук', 'товар'];
    if (stopWords.some(w => v.includes(w))) return false;
    if (v.length < 5) return false;
    if (!/[a-zа-яё]{2,}/i.test(v)) return false;
    return true;
};

const findManagerValue = (row: any, strictKeys: string[], looseKeys: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const key of rowKeys) {
        const k = key.toLowerCase().trim();
        const isStrict = strictKeys.some(s => {
             const sLower = s.toLowerCase();
             return k === sLower || k === sLower + '.' || k === sLower + ':' || k === sLower + ' фио' || k === sLower + ' name';
        });
        if (isStrict) {
            const val = String(row[key] || '');
            if (isValidManagerValue(val)) return val;
        }
    }
    for (const key of rowKeys) {
        const k = key.toLowerCase().trim();
        if (looseKeys.some(s => k.includes(s.toLowerCase())) && !k.includes('product') && !k.includes('category') && !k.includes('brand') && !k.includes('sales') && !k.includes('field') && !k.includes('area')) {
            const val = String(row[key] || '');
            if (isValidManagerValue(val)) return val;
        }
    }
    return '';
};

const getCanonicalRegion = (row: any): string => {
    const subjectValue = findValueInRow(row, ['субъект', 'subject', 'регион', 'region', 'область']);
    if (subjectValue && subjectValue.trim()) {
        const cleanVal = subjectValue.trim();
        let lowerVal = cleanVal.toLowerCase().replace(/ё/g, 'е').replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
        const normalized = lowerVal.replace(/^(г|гор|город)[.\s]+/g, '').replace(/\s+(г|гор|город)$/g, '').replace(/\s+/g, ' ').trim();
        if (["орел", "орёл", "orel"].includes(normalized)) return "Орловская область";
        if (REGION_KEYWORD_MAP[normalized]) return REGION_KEYWORD_MAP[normalized];
        for (const [key, standardName] of Object.entries(REGION_KEYWORD_MAP)) {
            if (normalized.startsWith(key)) return standardName;
            if (lowerVal.includes(key)) return standardName;
        }
        return standardizeRegion(cleanVal);
    }
    const address = findAddressInRow(row);
    const distributor = findValueInRow(row, ['дистрибьютор']);
    if (address || distributor) {
        try {
            const parsed = parseRussianAddress(address || '', distributor);
            if (parsed.region && parsed.region !== 'Регион не определен') return standardizeRegion(parsed.region);
        } catch (e) { /* ignore */ }
    }
    if (address) {
        const lowerAddr = address.toLowerCase();
        for (const [key, standardName] of Object.entries(REGION_KEYWORD_MAP)) {
            if (lowerAddr.includes(key)) return standardName;
        }
    }
    return 'Регион не определен';
};

const createOkbCoordIndex = (okbData: OkbDataRow[]): OkbCoordIndex => {
    const coordIndex: OkbCoordIndex = new Map();
    if (!okbData) return coordIndex;
    for (const row of okbData) {
        const address = findAddressInRow(row);
        const lat = row.lat;
        const lon = row.lon;
        if (address && lat && lon && !isNaN(lat) && !isNaN(lon)) {
            const normalized = normalizeAddress(address);
            if (normalized && !coordIndex.has(normalized)) coordIndex.set(normalized, { lat, lon });
        }
    }
    return coordIndex;
};

function findPotentialClients(regionOkbRows: OkbDataRow[] | undefined, activeClientsInRegion: MapPoint[] | undefined): PotentialClient[] {
    if (!regionOkbRows || regionOkbRows.length === 0) return [];
    const potential: PotentialClient[] = [];
    const activeAddressSet = new Set<string>();
    const activeCoords: { lat: number, lon: number }[] = [];
    if (activeClientsInRegion) {
        activeClientsInRegion.forEach(c => {
            activeAddressSet.add(normalizeAddress(c.address));
            if (c.lat && c.lon) activeCoords.push({ lat: c.lat, lon: c.lon });
        });
    }
    for (const okbRow of regionOkbRows) {
        const okbAddress = findAddressInRow(okbRow) || '';
        if (!okbAddress) continue;
        let isMatch = false;
        if (okbRow.lat && okbRow.lon && !isNaN(okbRow.lat) && !isNaN(okbRow.lon)) {
            for (const activeCoord of activeCoords) {
                const dist = getDistanceKm(okbRow.lat, okbRow.lon, activeCoord.lat, activeCoord.lon);
                if (dist < 0.15) { isMatch = true; break; }
            }
        }
        if (!isMatch) {
            const normalizedOkb = normalizeAddress(okbAddress);
            if (activeAddressSet.has(normalizedOkb)) isMatch = true;
        }
        if (!isMatch) {
            const client: PotentialClient = {
                name: findValueInRow(okbRow, ['наименование', 'клиент']) || 'Без названия',
                address: okbAddress,
                type: findValueInRow(okbRow, ['вид деятельности', 'тип']) || 'н/д',
            };
            if(okbRow.lat && okbRow.lon) { client.lat = okbRow.lat; client.lon = okbRow.lon; }
            potential.push(client);
        }
        if (potential.length >= 200) break;
    }
    return potential;
}

const findClientNameHeader = (headers: string[]): string | undefined => {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    const priorityTerms = ['название магазина limkorm', 'название клиента', 'наименование клиента', 'контрагент', 'клиент', 'уникальное наименование товара'];
    for (const term of priorityTerms) {
        const foundIndex = lowerHeaders.findIndex(h => h.includes(term));
        if (foundIndex !== -1) return headers[foundIndex];
    }
    const nameColumns = headers.filter(h => h.toLowerCase().trim().includes('наименование'));
    if (nameColumns.length > 0) {
        const cleanNameColumn = nameColumns.find(h => {
            const lH = h.toLowerCase().trim();
            return !lH.includes('номенклатур') && !lH.includes('товар') && !lH.includes('продук');
        });
        return cleanNameColumn || nameColumns[0];
    }
    return undefined;
};

const parseDateValue = (val: any): number | null => {
    if (!val) return null;
    if (typeof val === 'number') {
        if (val > 30000 && val < 60000) {
            const date = new Date((val - 25569) * 86400 * 1000);
            return date.getTime();
        }
        return null;
    }
    const strVal = String(val).trim();
    if (!strVal) return null;
    const dmy = strVal.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmy) {
        const d = parseInt(dmy[1], 10);
        const m = parseInt(dmy[2], 10) - 1;
        const y = parseInt(dmy[3], 10);
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return date.getTime();
    }
    const ymd = strVal.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (ymd) {
        const y = parseInt(ymd[1], 10);
        const m = parseInt(ymd[2], 10) - 1;
        const d = parseInt(ymd[3], 10);
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return date.getTime();
    }
    return null;
};

const findDateRange = (data: any[]): string | undefined => {
    if (data.length === 0) return undefined;
    const row0 = data[0];
    const keys = Object.keys(row0);
    const dateKeys = keys.filter(k => {
        const lower = k.toLowerCase();
        return lower.includes('дата') || lower.includes('date') || lower.includes('период') || lower.includes('месяц');
    });
    if (dateKeys.length === 0) return undefined;
    let minTs = Infinity;
    let maxTs = -Infinity;
    const sample = data.length > 500 ? data.slice(0, 500) : data;
    for (const row of sample) {
        for (const key of dateKeys) {
            const val = row[key];
            const ts = parseDateValue(val);
            if (ts) {
                if (ts < minTs) minTs = ts;
                if (ts > maxTs) maxTs = ts;
            }
        }
    }
    if (minTs === Infinity || maxTs === -Infinity) return undefined;
    const minDate = new Date(minTs);
    const maxDate = new Date(maxTs);
    const fmt = (d: Date) => d.toLocaleDateString('ru-RU');
    return `${fmt(minDate)} - ${fmt(maxDate)}`;
};

const detectHeaderRowIndex = (rows: any[][]): number => {
    const keywords = ['адрес', 'address', 'рм', 'rm', 'дм', 'dm', 'вес', 'weight', 'фасовка', 'packaging', 'бренд', 'brand', 'товар', 'product', 'дистрибьютор', 'distributor', 'канал', 'channel'];
    const limit = Math.min(rows.length, 20);
    let bestRowIndex = 0;
    let maxMatches = 0;
    for (let i = 0; i < limit; i++) {
        const row = rows[i].map(cell => String(cell || '').toLowerCase());
        let matches = 0;
        for (const k of keywords) {
            if (row.some(cell => cell.includes(k))) matches++;
        }
        if (matches > maxMatches) {
            maxMatches = matches;
            bestRowIndex = i;
        }
    }
    if (maxMatches >= 2) return bestRowIndex;
    return 0;
};

const convertRawDataToObjects = (rawData: any[][], predefinedHeaders?: string[]): { jsonData: any[], headers: string[] } => {
    if (!rawData || rawData.length === 0) return { jsonData: [], headers: [] };
    let headers = predefinedHeaders;
    let dataRows = rawData;
    
    if (!headers) {
        const headerRowIndex = detectHeaderRowIndex(rawData);
        headers = rawData[headerRowIndex].map(h => String(h || '').trim());
        dataRows = rawData.slice(headerRowIndex + 1);
    }

    const jsonData = dataRows.map(rowArray => {
        const obj: any = {};
        headers!.forEach((h, i) => {
            if (h) obj[h] = rowArray[i];
        });
        return obj;
    });
    return { jsonData, headers };
};

// --- LOGIC: INITIALIZE STREAM ---
function initStream({ okbData, cacheData }: { okbData: OkbDataRow[], cacheData: CoordsCache }, postMessage: PostMessageFn) {
    // Reset state
    state_aggregatedData = {};
    state_uniquePlottableClients = new Map();
    state_newAddressesToCache = {};
    state_addressesToGeocode = {};
    state_unidentifiedRows = [];
    state_headers = [];
    state_hasPotentialColumn = false;
    state_clientNameHeader = undefined;
    state_okbRegionCounts = {};
    state_okbByRegion = {};
    state_processedRowsCount = 0;
    state_dateRange = undefined;

    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Инициализация и индексация...' } });

    // Process OKB
    state_okbCoordIndex = createOkbCoordIndex(okbData);
    if (okbData) {
        okbData.forEach(row => {
            const canonicalRegion = getCanonicalRegion(row);
            if (canonicalRegion && canonicalRegion !== 'Регион не определен') {
                state_okbRegionCounts[canonicalRegion] = (state_okbRegionCounts[canonicalRegion] || 0) + 1;
                if (!state_okbByRegion[canonicalRegion]) state_okbByRegion[canonicalRegion] = [];
                state_okbByRegion[canonicalRegion].push(row);
            }
        });
    }

    // Process Cache
    state_cacheAddressMap = new Map();
    state_cacheRedirectMap = new Map();
    state_deletedAddresses = new Set();

    if (cacheData) {
        for (const rm of Object.keys(cacheData)) {
            for (const item of cacheData[rm]) {
                if (!item.address) continue;
                const normalizedTarget = normalizeAddress(item.address);
                if (item.isDeleted) {
                    state_deletedAddresses.add(normalizedTarget);
                    continue;
                }
                if (!state_cacheAddressMap.has(normalizedTarget)) {
                    state_cacheAddressMap.set(normalizedTarget, { 
                        lat: item.lat, lon: item.lon, originalAddress: item.address, isInvalid: item.isInvalid, comment: item.comment 
                    });
                }
                if (item.history) {
                    const historyEntries = String(item.history).replace(/\u00A0/g, ' ').replace(/&nbsp;/g, ' ').split(/\r?\n|\s*\|\|\s*|<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
                    for (const entry of historyEntries) {
                        const oldAddrRaw = entry.split('[')[0].trim();
                        if (!oldAddrRaw) continue;
                        const normalizedOld = normalizeAddress(oldAddrRaw);
                        if (normalizedOld && normalizedOld !== normalizedTarget) {
                            state_cacheRedirectMap.set(normalizedOld, normalizedTarget);
                        }
                    }
                }
            }
        }
    }
}

// --- LOGIC: PROCESS CHUNK ---
function processChunk(payload: { rawData: any[][], isFirstChunk: boolean, fileName?: string }, postMessage: PostMessageFn) {
    const { rawData, isFirstChunk, fileName } = payload;
    
    // 1. Convert to Objects
    let jsonData: any[] = [];
    if (isFirstChunk) {
        const result = convertRawDataToObjects(rawData);
        jsonData = result.jsonData;
        state_headers = result.headers;
        
        // Init header-based config once
        state_hasPotentialColumn = state_headers.some(h => (h || '').toLowerCase().includes('потенциал'));
        state_clientNameHeader = findClientNameHeader(state_headers);
    } else {
        // Use existing headers
        const result = convertRawDataToObjects(rawData, state_headers);
        jsonData = result.jsonData;
    }

    if (jsonData.length === 0) return;

    // 2. Date Range Detection (Best Effort - accumulate min/max)
    // For now, we just check the first chunk for efficiency, or update if not set
    if (!state_dateRange) {
        const range = findDateRange(jsonData);
        if (range) state_dateRange = range;
    }

    // 3. Process Rows
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        const rm = findManagerValue(row, ['рм', 'региональный менеджер', 'regional manager', 'kam', 'кам', 'rsm'], ['рм', 'rm', 'manager']);
        const dm = findManagerValue(row, ['дм', 'dm', 'дивизиональный', 'дивизиональный менеджер', 'district manager'], ['дм', 'dm', 'director', 'директор']);
        let finalRm = rm || dm;

        let clientAddress = findAddressInRow(row);
        const distributor = findValueInRow(row, ['дистрибьютор', 'дистрибьютер']);
        
        if ((!clientAddress || clientAddress.trim() === '') && (!distributor || distributor.trim() === '')) continue;
        
        if (!finalRm) {
            state_unidentifiedRows.push({ rm: 'РМ не указан', rowData: row, originalIndex: state_processedRowsCount + i });
            continue;
        }

        // Redirects & Deletes
        let normalizedRaw = clientAddress ? normalizeAddress(clientAddress) : '';
        if (clientAddress) {
            if (state_deletedAddresses.has(normalizedRaw)) continue;
            if (state_cacheRedirectMap.has(normalizedRaw)) {
                const newNormalizedTarget = state_cacheRedirectMap.get(normalizedRaw)!;
                const targetEntry = state_cacheAddressMap.get(newNormalizedTarget);
                if (targetEntry) {
                    clientAddress = targetEntry.originalAddress || clientAddress;
                    normalizedRaw = newNormalizedTarget;
                } else {
                    normalizedRaw = newNormalizedTarget;
                }
                if (state_deletedAddresses.has(normalizedRaw)) continue;
            }
        }

        // Region / City / Cache Logic
        const regionFromColumns = getCanonicalRegion(row);
        const parsedAddress: EnrichedParsedAddress = parseRussianAddress(clientAddress || '', distributor);
        const cacheEntry = state_cacheAddressMap.get(normalizedRaw);

        if (cacheEntry && cacheEntry.isInvalid) {
             state_unidentifiedRows.push({ rm: finalRm, rowData: row, originalIndex: state_processedRowsCount + i });
             continue;
        }

        const isCityFound = parsedAddress.city !== 'Город не определен';
        const isRegionFound = regionFromColumns !== 'Регион не определен' || (parsedAddress.region !== 'Регион не определен');
        const isCached = !!(cacheEntry && cacheEntry.lat !== undefined && cacheEntry.lon !== undefined);

        if (!isCityFound && !isRegionFound && !isCached) {
            state_unidentifiedRows.push({ rm: finalRm, rowData: row, originalIndex: state_processedRowsCount + i });
            continue;
        }

        const regionForAggregation = regionFromColumns !== 'Регион не определен' ? regionFromColumns : parsedAddress.region;
        const groupNameForAggregation = isCityFound ? parsedAddress.city : (regionForAggregation !== 'Регион не определен' ? regionForAggregation : 'Неопределенный город');
        
        const finalAddress = parsedAddress.finalAddress || clientAddress || '';
        
        const weight = parseFloat(String(findValueInRow(row, ['вес, кг', 'вес кг', 'вес', 'сумма отгрузки, руб', 'количество, кг', 'нетто']) || '0').replace(/\s/g, '').replace(',', '.'));
        
        const clientName = (state_clientNameHeader && row[state_clientNameHeader]) ? String(row[state_clientNameHeader]) : 'Без названия';
        const brand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Бренд не указан';
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';

        if (isNaN(weight)) continue;
        
        const key = `${regionForAggregation}-${brand}-${packaging}-${finalRm}`.toLowerCase();
        
        if (!state_aggregatedData[key]) {
            state_aggregatedData[key] = {
                key, clientName: `${regionForAggregation} (${brand} - ${packaging})`, brand, packaging, rm: finalRm, city: groupNameForAggregation,
                region: regionForAggregation, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Map<string, MapPoint>(),
            };
        }
        state_aggregatedData[key].fact += weight;

        if (state_hasPotentialColumn) {
            const potential = parseFloat(String(findValueInRow(row, ['потенциал', 'план']) || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) state_aggregatedData[key].potential += potential;
        }

        // Map Point Logic
        if (!state_uniquePlottableClients.has(normalizedRaw)) {
            let lat: number | undefined;
            let lon: number | undefined;
            let isCachedFlag = false;
            let comment: string | undefined; 
            
            let displayAddress = finalAddress;

            if (isCached && cacheEntry) {
                lat = cacheEntry.lat;
                lon = cacheEntry.lon;
                comment = cacheEntry.comment;
                isCachedFlag = true;
                if (cacheEntry.originalAddress) {
                    displayAddress = cacheEntry.originalAddress;
                }
            } else {
                if (!state_newAddressesToCache[finalRm]) state_newAddressesToCache[finalRm] = [];
                if (finalAddress && !state_newAddressesToCache[finalRm].some(item => item.address === finalAddress)) {
                    state_newAddressesToCache[finalRm].push({ address: finalAddress });
                }

                const okbEntry = state_okbCoordIndex.get(normalizedRaw);
                if (okbEntry) {
                    lat = okbEntry.lat;
                    lon = okbEntry.lon;
                } else if (finalAddress && !isCachedFlag) {
                    if (!state_addressesToGeocode[finalRm]) state_addressesToGeocode[finalRm] = [];
                    if (!state_addressesToGeocode[finalRm].includes(finalAddress)) {
                        state_addressesToGeocode[finalRm].push(finalAddress);
                    }
                }
            }
            
            state_uniquePlottableClients.set(normalizedRaw, {
                key: normalizedRaw,
                lat, lon, isCached: isCachedFlag,
                status: 'match',
                name: clientName,
                address: displayAddress, 
                city: groupNameForAggregation,
                region: regionForAggregation, 
                rm: finalRm, brand, packaging,
                type: findValueInRow(row, ['канал продаж', 'канал']),
                contacts: findValueInRow(row, ['контакты', 'телефон']),
                originalRow: row,
                fact: weight,
                comment: comment,
            });
        } else {
             const existing = state_uniquePlottableClients.get(normalizedRaw);
             if (existing) {
                 existing.fact = (existing.fact || 0) + weight;
             }
        }
        
        const mapPointForGroup = state_uniquePlottableClients.get(normalizedRaw);
        if (mapPointForGroup) {
            state_aggregatedData[key].clients.set(mapPointForGroup.key, mapPointForGroup);
        }
    }
    
    state_processedRowsCount += jsonData.length;
    // Release JSON data memory
    jsonData = [];
}

// --- LOGIC: FINALIZE STREAM ---
async function finalizeStream(postMessage: PostMessageFn) {
    postMessage({ type: 'progress', payload: { percentage: 90, message: 'ABC-анализ клиентов...' } });
    
    const plottableActiveClients = Array.from(state_uniquePlottableClients.values());
    
    // ABC Analysis
    const totalFact = plottableActiveClients.reduce((sum, client) => sum + (client.fact || 0), 0);
    if (totalFact > 0) {
        plottableActiveClients.sort((a, b) => (b.fact || 0) - (a.fact || 0));
        let runningTotal = 0;
        plottableActiveClients.forEach(client => {
            runningTotal += (client.fact || 0);
            const percentage = runningTotal / totalFact;
            if (percentage <= 0.80) client.abcCategory = 'A';
            else if (percentage <= 0.95) client.abcCategory = 'B';
            else client.abcCategory = 'C';
        });
    }

    postMessage({ type: 'progress', payload: { percentage: 95, message: 'Анализ пересечений с ОКБ...' } });
    
    const activeClientsByRegion = new Map<string, MapPoint[]>();
    plottableActiveClients.forEach(c => {
        if (!activeClientsByRegion.has(c.region)) activeClientsByRegion.set(c.region, []);
        activeClientsByRegion.get(c.region)!.push(c);
    });
    
    const potentialClientsCache = new Map<string, PotentialClient[]>();

    const finalData: AggregatedDataRow[] = [];
    for (const item of Object.values(state_aggregatedData)) {
        let potential = item.potential;
        if (!state_hasPotentialColumn) potential = item.fact * 1.15;
        else if (potential < item.fact) potential = item.fact;
        
        let regionPotentialClients = potentialClientsCache.get(item.region);
        if (!regionPotentialClients) {
            const activeInRegion = activeClientsByRegion.get(item.region);
            regionPotentialClients = findPotentialClients(state_okbByRegion[item.region], activeInRegion);
            potentialClientsCache.set(item.region, regionPotentialClients);
        }

        finalData.push({
            ...item, potential,
            growthPotential: Math.max(0, potential - item.fact),
            growthPercentage: potential > 0 ? (Math.max(0, potential - item.fact) / potential) * 100 : 0,
            potentialClients: regionPotentialClients,
            clients: Array.from(item.clients.values()) 
        });
    }

    // Stream Results
    postMessage({ 
        type: 'result_init', 
        payload: { 
            okbRegionCounts: state_okbRegionCounts, 
            dateRange: state_dateRange,
            totalUnidentified: state_unidentifiedRows.length
        } 
    });

    const CHUNK_SIZE = 2000;
    for (let i = 0; i < finalData.length; i += CHUNK_SIZE) {
        postMessage({
            type: 'result_chunk_aggregated',
            payload: finalData.slice(i, i + CHUNK_SIZE)
        });
    }
    for (let i = 0; i < state_unidentifiedRows.length; i += CHUNK_SIZE) {
        postMessage({
            type: 'result_chunk_unidentified',
            payload: state_unidentifiedRows.slice(i, i + CHUNK_SIZE)
        });
    }
    postMessage({ type: 'result_finished' });

    // Background Tasks
    const newAddressRMs = Object.keys(state_newAddressesToCache);
    if (newAddressRMs.length > 0) {
        postMessage({ type: 'progress', payload: { percentage: 99, message: 'Добавление новых адресов в кэш...', isBackground: true } });
        for (const rmName of newAddressRMs) {
            try {
                await fetch('/api/add-to-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rmName, rows: state_newAddressesToCache[rmName] }) });
            } catch (e) { console.error(`Failed to add to cache for ${rmName}:`, e); }
        }
    }

    const geocodeRMs = Object.keys(state_addressesToGeocode);
    if (geocodeRMs.length > 0) {
        postMessage({ type: 'progress', payload: { percentage: 99, message: 'Запуск геокодирования...', isBackground: true } });
        for (const rmName of geocodeRMs) {
            const updates: { address: string, lat: number, lon: number }[] = [];
            const addresses = state_addressesToGeocode[rmName];
            for (let i = 0; i < addresses.length; i++) {
                const address = addresses[i];
                postMessage({ type: 'progress', payload: { percentage: 99, message: `Геокодирование (${i + 1}/${addresses.length}): ${address.substring(0, 30)}...`, isBackground: true } });
                
                let coords: { lat: number, lon: number } | null = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const response = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
                        if (response.ok) {
                            coords = await response.json();
                            break;
                        }
                    } catch (e) { console.error(`Geocode attempt ${attempt} failed for ${address}:`, e); }
                    if (attempt < 3) await sleep(5000);
                }
                if (coords) updates.push({ address, ...coords });
            }

            if (updates.length > 0) {
                postMessage({ type: 'progress', payload: { percentage: 99, message: `Обновление ${updates.length} координат для ${rmName}...`, isBackground: true } });
                try {
                     await fetch('/api/update-coords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rmName, updates }) });
                } catch (e) { console.error(`Failed to update coords for ${rmName}:`, e); }
            }
        }
    }
    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Фоновые задачи завершены.', isBackground: true } });
}

// --- MAIN HANDLER ---
self.onmessage = async (e: MessageEvent<WorkerMessage | WorkerInputInit | WorkerInputChunk | WorkerInputFinalize | { file: File | null, rawSheetData?: any[][], okbData: OkbDataRow[], cacheData: CoordsCache }>) => {
    const msg = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        if ('type' in msg) {
            // New Stream API
            switch(msg.type) {
                case 'INIT_STREAM':
                    initStream(msg.payload, postMessage);
                    break;
                case 'PROCESS_CHUNK':
                    processChunk(msg.payload, postMessage);
                    break;
                case 'FINALIZE_STREAM':
                    await finalizeStream(postMessage);
                    break;
            }
        } else {
            // Legacy Handler (for file upload)
            const { file, rawSheetData, okbData, cacheData } = msg as any;
            initStream({ okbData, cacheData }, postMessage);
            
            if (rawSheetData && rawSheetData.length > 0) {
                processChunk({ rawData: rawSheetData, isFirstChunk: true }, postMessage);
                await finalizeStream(postMessage);
            } else if (file) {
                if (file.name.toLowerCase().endsWith('.csv')) {
                    const parsePromise = new Promise<{ rawData: any[][], meta: ParseMeta }>((resolve, reject) => {
                        PapaParse(file, {
                            header: false, skipEmptyLines: true,
                            complete: (results: ParseResult<any>) => resolve({ rawData: results.data, meta: results.meta }),
                            error: (error: Error) => reject(error)
                        });
                    });
                    const { rawData } = await parsePromise;
                    if (!rawData || rawData.length === 0) throw new Error("CSV файл пуст");
                    processChunk({ rawData, isFirstChunk: true, fileName: file.name }, postMessage);
                    await finalizeStream(postMessage);
                } else {
                    const data = await file.arrayBuffer();
                    const workbook = xlsx.read(data, { type: 'array', cellDates: false, cellNF: false });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const rawData: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                    processChunk({ rawData, isFirstChunk: true, fileName: file.name }, postMessage);
                    await finalizeStream(postMessage);
                }
            }
        }
    } catch (error) {
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};
