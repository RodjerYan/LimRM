
import { 
    AggregatedDataRow, 
    OkbDataRow, 
    MapPoint, 
    UnidentifiedRow 
} from '../../types';
import { parseRussianAddress } from '../../services/addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../../utils/dataUtils';

// Helper for Unique IDs
const generateRowId = () => `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Map<string, MapPoint> } };

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

// Safe float parsing (handles commas, spaces)
const parseCleanFloat = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const strVal = String(val);
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

// --- CORE PROCESS FUNCTION ---
// Processes a batch of raw rows and returns partial aggregation
export function processBatch(
    rawData: any[][], 
    headers: string[] | null, 
    okbCoordIndex: Map<string, { lat: number; lon: number }>,
    cacheAddressMap: Map<string, { lat?: number; lon?: number; originalAddress?: string; isInvalid?: boolean; comment?: string }>
): {
    aggregatedData: AggregationMap,
    unidentifiedRows: UnidentifiedRow[],
    okbRegionCounts: { [key: string]: number },
    nextHeaders: string[]
} {
    const aggregatedData: AggregationMap = {};
    const unidentifiedRows: UnidentifiedRow[] = [];
    const okbRegionCounts: { [key: string]: number } = {};
    const uniquePlottableClients = new Map<string, MapPoint>();

    let currentHeaders = headers;
    let jsonData: any[] = [];

    // Header Detection (if first batch)
    if (!currentHeaders || currentHeaders.length === 0) {
        const hRow = rawData.findIndex(row => row.some(cell => String(cell || '').toLowerCase().includes('адрес')));
        const actualHRow = hRow === -1 ? 0 : hRow;
        currentHeaders = rawData[actualHRow].map(h => String(h || '').trim());
        jsonData = rawData.slice(actualHRow + 1).map(row => {
            const obj: any = {};
            currentHeaders!.forEach((h, i) => { if (h) obj[h] = row[i]; });
            return obj;
        });
    } else {
        jsonData = rawData.map(row => {
            const obj: any = {};
            currentHeaders!.forEach((h, i) => { if (h) obj[h] = row[i]; });
            return obj;
        });
    }

    const clientNameHeader = currentHeaders.find(h => normalizeHeaderKey(h).includes('наименование'));

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        let rm = findManagerValue(row, ['рм', 'региональный менеджер'], []);
        if (!rm) rm = 'Unknown_RM';

        const rawAddr = findAddressInRow(row);
        if (!rawAddr) continue;

        let channel = findValueInRow(row, ['канал продаж', 'тип тт', 'сегмент']);
        if (!channel || channel.length < 2) channel = 'Не определен';

        // 1. Get raw brand value
        const rawBrand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Без бренда';
        // 2. Split by comma or semicolon
        const brands = rawBrand.split(/[,;]/).map(b => b.trim()).filter(b => b.length > 0);

        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';

        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        const cacheEntry = cacheAddressMap.get(normAddr);
        
        const isCityFound = parsed.city !== 'Город не определен';
        const reg = getCanonicalRegion(row) || parsed.region;
        const isRegionFound = reg !== 'Регион не определен';

        if (!isCityFound && !isRegionFound && !cacheEntry) {
            unidentifiedRows.push({ rm, rowData: row, originalIndex: i }); // Note: Index is relative to batch here
            continue;
        }

        const weightRaw = findValueInRow(row, ['вес', 'количество', 'факт', 'объем', 'продажи', 'отгрузки', 'кг', 'тонн']);
        const totalWeight = parseCleanFloat(weightRaw);
        // 3. Divide weight
        const weightPerBrand = brands.length > 0 ? totalWeight / brands.length : 0;

        for (const brand of brands) {
            const groupKey = `${reg}-${rm}-${brand}-${packaging}`.toLowerCase();
            if (!aggregatedData[groupKey]) {
                aggregatedData[groupKey] = {
                    __rowId: generateRowId(),
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

            aggregatedData[groupKey].fact += weightPerBrand;

            if (!uniquePlottableClients.has(normAddr)) {
                const okb = okbCoordIndex.get(normAddr);
                uniquePlottableClients.set(normAddr, {
                    key: normAddr,
                    lat: cacheEntry?.lat || okb?.lat,
                    lon: cacheEntry?.lon || okb?.lon,
                    status: 'match',
                    name: String(row[clientNameHeader || ''] || 'ТТ'),
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
            
            const pt = uniquePlottableClients.get(normAddr);
            if (pt) {
                pt.fact = (pt.fact || 0) + weightPerBrand;
                aggregatedData[groupKey].clients.set(normAddr, pt);
            }
        }
    }

    return {
        aggregatedData,
        unidentifiedRows,
        okbRegionCounts,
        nextHeaders: currentHeaders
    };
}
