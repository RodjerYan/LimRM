
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
            // Используем новую нормализацию (с сортировкой слов) для надежного матчинга
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

function initStream({ okbData, cacheData, totalRowsProcessed, restoredData, restoredUnidentified }: { 
    okbData: OkbDataRow[], 
    cacheData: CoordsCache, 
    totalRowsProcessed?: number,
    restoredData?: AggregatedDataRow[],
    restoredUnidentified?: UnidentifiedRow[]
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
        // Загружаем кэш (Вашу таблицу).
        // Ключом делаем нормализованный адрес, чтобы сопоставлять его с файлом.
        Object.values(cacheData).flat().forEach(item => {
            if (item.address && !item.isDeleted) {
                // ВАЖНО: Используем ту же нормализацию, что и для строк файла
                state_cacheAddressMap.set(normalizeAddress(item.address), { 
                    lat: item.lat, 
                    lon: item.lon, 
                    originalAddress: item.address, 
                    isInvalid: item.isInvalid, 
                    comment: item.comment 
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
    
    const statusMsg = totalRowsProcessed 
        ? `Восстановление сессии (Локальная база): ${totalRowsProcessed} строк...` 
        : 'Связь установлена. Начало индексации...';
        
    postMessage({ type: 'progress', payload: { percentage: 5, message: statusMsg, totalProcessed: state_processedRowsCount } });
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
        
        let rm = findManagerValue(row, ['рм', 'региональный менеджер'], []);
        if (!rm) rm = 'Unknown_RM';

        const rawAddr = findAddressInRow(row);
        if (!rawAddr) continue;

        let channel = findValueInRow(row, ['канал продаж', 'тип тт', 'сегмент']);
        if (!channel || channel.length < 2) channel = 'Не определен';

        const brand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Без бренда';
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';

        // --- ЛОГИКА ПОИСКА КООРДИНАТ ---
        
        // 1. Поиск в КЭШЕ (Ваша таблица) - ПРИОРИТЕТ №1
        // Ищем по "сырому" адресу (нормализованному, но без умного парсинга города).
        // Это восстанавливает поведение для старых записей, которые есть в таблице "как есть".
        const rawNormAddr = normalizeAddress(rawAddr);
        let cacheEntry = state_cacheAddressMap.get(rawNormAddr);

        // 2. Умный парсинг (определение города/региона)
        const distributor = findValueInRow(row, ['дистрибьютор', 'партнер']);
        const parsed = parseRussianAddress(rawAddr, distributor);
        
        // 3. Повторный поиск в КЭШЕ по обогащенному адресу
        // Если "сырой" адрес не найден (например, в файле "Ленина 1", а в кэше "Москва, Ленина 1"),
        // пробуем найти по полному адресу.
        const enrichedNormAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        
        if (!cacheEntry && rawNormAddr !== enrichedNormAddr) {
            cacheEntry = state_cacheAddressMap.get(enrichedNormAddr);
        }

        const isCityFound = parsed.city !== 'Город не определен';
        const reg = getCanonicalRegion(row) || parsed.region;
        const isRegionFound = reg !== 'Регион не определен';

        // Если не нашли в кэше и не смогли определить регион -> в "Неопознанные"
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
                monthlyFact: {},
                potential: 0, 
                growthPotential: 0, 
                growthPercentage: 0, 
                clients: new Map(),
            };
        }

        const weightRaw = findValueInRow(row, ['вес', 'количество', 'факт', 'объем', 'продажи', 'отгрузки', 'кг', 'тонн']);
        const weight = parseCleanFloat(weightRaw);
        
        const dateRaw = findValueInRow(row, ['дата', 'период', 'месяц', 'date', 'period', 'day']);
        const dateKey = parseDateKey(dateRaw) || 'unknown';

        state_aggregatedData[groupKey].fact += weight;
        
        if (!state_aggregatedData[groupKey].monthlyFact) state_aggregatedData[groupKey].monthlyFact = {};
        state_aggregatedData[groupKey].monthlyFact[dateKey] = (state_aggregatedData[groupKey].monthlyFact[dateKey] || 0) + weight;

        // Ключ клиента для карты - используем обогащенный адрес для группировки дублей
        const clientKey = enrichedNormAddr;

        if (!state_uniquePlottableClients.has(clientKey)) {
            // Если в кэше нет, ищем в ОКБ (вторичный источник)
            const okb = state_okbCoordIndex.get(clientKey);
            
            state_uniquePlottableClients.set(clientKey, {
                key: clientKey,
                lat: cacheEntry?.lat || okb?.lat, // Сначала берем из таблицы (cache), если нет - из ОКБ
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
                monthlyFact: {},
                abcCategory: 'C'
            });
        }
        
        const pt = state_uniquePlottableClients.get(clientKey);
        if (pt) {
            pt.fact = (pt.fact || 0) + weight;
            if (!pt.monthlyFact) pt.monthlyFact = {};
            pt.monthlyFact[dateKey] = (pt.monthlyFact[dateKey] || 0) + weight;
            
            state_aggregatedData[groupKey].clients.set(clientKey, pt);
        }
    }
    
    if (state_processedRowsCount - state_lastCheckpointCount >= CHECKPOINT_THRESHOLD) {
        state_lastCheckpointCount = state_processedRowsCount;
        
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
    postMessage({ type: 'progress', payload: { percentage: currentProgress, message: `Потоковая передача: ${state_processedRowsCount.toLocaleString()} строк...`, totalProcessed: state_processedRowsCount } });
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
    else if (msg.type === 'PROCESS_FILE') {
        const { fileBuffer, fileName } = msg.payload;
        try {
            const workbook = xlsx.read(fileBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
            
            const CHUNK_SIZE = 5000;
            const total = rows.length;
            
            for (let i = 0; i < total; i += CHUNK_SIZE) {
                const chunk = rows.slice(i, i + CHUNK_SIZE);
                processChunk({ rawData: chunk, isFirstChunk: i === 0, fileName }, self.postMessage);
                await new Promise(r => setTimeout(r, 0));
            }
            await finalizeStream(self.postMessage);
        } catch (e) {
            self.postMessage({ type: 'error', payload: `File parse error: ${(e as Error).message}` });
        }
    }
    else if (msg.type === 'FINALIZE_STREAM') await finalizeStream(self.postMessage);
};
