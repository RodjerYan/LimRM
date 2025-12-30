
import { OkbDataRow, AggregatedDataRow, MapPoint, UnidentifiedRow } from '../../types.js';
import { parseRussianAddress } from '../../services/addressParser.js';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../../utils/addressMappings.js';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../../utils/dataUtils.js';

// Helper: Normalize keys for lookups
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

// --- CORE SERVER PROCESSING LOGIC ---
export function processBatchOnServer(
    rawData: any[][], 
    startRowIndex: number,
    okbCoordIndex: Map<string, { lat: number; lon: number }>,
    cacheAddressMap: Map<string, { lat?: number; lon?: number; isInvalid?: boolean }>
) {
    let headers: string[] = [];
    let jsonData: any[] = [];
    
    // Attempt to find headers if this is the start, or assume first row provided is data if we are deep in file
    // For simplicity in this sharded architecture, we assume rawData[0] is headers if startRowIndex == 0
    // BUT, the caller usually passes a chunk. 
    // To make this robust, the caller should pass "headers" explicitly or we detect them.
    // Here we assume rawData passed includes the header row ONLY if it's the very first batch, 
    // otherwise we need headers passed in. 
    // **Design Decision:** The caller (cron-sync) will handle header extraction and pass objects, not arrays.
    
    // Wait, let's make this function accept Objects directly to skip header parsing issues here.
    return processObjectsOnServer(rawData as any[], startRowIndex, okbCoordIndex, cacheAddressMap);
}

export function processObjectsOnServer(
    rows: any[], 
    globalRowOffset: number,
    okbCoordIndex: Map<string, { lat: number; lon: number }>,
    cacheAddressMap: Map<string, { lat?: number; lon?: number; isInvalid?: boolean }>
) {
    const aggregatedData: Record<string, AggregatedDataRow> = {};
    const unidentifiedRows: UnidentifiedRow[] = [];
    const regionCounts: Record<string, number> = {};
    
    // Helper to get client name key
    const sampleRow = rows[0] || {};
    const clientNameKey = Object.keys(sampleRow).find(k => k.toLowerCase().includes('наименование')) || 'Наименование';

    rows.forEach((row, idx) => {
        const originalIndex = globalRowOffset + idx + 1;
        
        // 1. RM Extraction
        let rm = findManagerValue(row, ['рм', 'региональный менеджер'], []);
        if (!rm) rm = 'Unknown_RM';

        // 2. Address & Channel
        const rawAddr = findAddressInRow(row);
        if (!rawAddr) return; // Skip empty lines

        let channel = findValueInRow(row, ['канал продаж', 'тип тт', 'сегмент']);
        if (!channel || channel.length < 2) channel = 'Не определен';

        const brand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Без бренда';
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';

        // 3. Parsing & Normalization
        const parsed = parseRussianAddress(rawAddr);
        const normAddr = normalizeAddress(parsed.finalAddress || rawAddr);
        const cacheEntry = cacheAddressMap.get(normAddr);
        
        const isCityFound = parsed.city !== 'Город не определен';
        const reg = getCanonicalRegion(row) || parsed.region;
        const isRegionFound = reg !== 'Регион не определен';

        // 4. Region Stats
        if (isRegionFound) {
            regionCounts[reg] = (regionCounts[reg] || 0) + 1;
        }

        // 5. Unidentified Logic
        if (!isCityFound && !isRegionFound && !cacheEntry) {
            unidentifiedRows.push({ rm, rowData: row, originalIndex });
            // We still try to aggregate it under "Unknown"
        }

        // 6. Aggregation
        const groupKey = `${reg}-${rm}-${brand}-${packaging}`.toLowerCase();
        
        if (!aggregatedData[groupKey]) {
            aggregatedData[groupKey] = {
                key: groupKey,
                clientName: `${reg}: ${brand}`,
                brand,
                packaging,
                rm,
                city: parsed.city,
                region: reg,
                fact: 0,
                potential: 0,
                growthPotential: 0,
                growthPercentage: 0,
                clients: [], // Will populate
                potentialClients: []
            };
        }

        const weightRaw = findValueInRow(row, ['вес', 'количество', 'факт', 'объем', 'продажи', 'отгрузки', 'кг', 'тонн']);
        const weight = parseCleanFloat(weightRaw);
        
        aggregatedData[groupKey].fact += weight;

        // 7. Client Mapping
        const okb = okbCoordIndex.get(normAddr);
        const lat = cacheEntry?.lat || okb?.lat;
        const lon = cacheEntry?.lon || okb?.lon;

        const clientPoint: MapPoint = {
            key: normAddr,
            lat,
            lon,
            status: 'match',
            name: String(row[clientNameKey] || 'ТТ'),
            address: rawAddr,
            city: parsed.city,
            region: reg,
            rm,
            brand,
            packaging,
            type: channel,
            originalRow: row,
            fact: weight,
            abcCategory: 'C' // Calc later
        };

        // Check duplicates within this chunk
        const existingClientIndex = aggregatedData[groupKey].clients.findIndex(c => c.key === normAddr);
        if (existingClientIndex !== -1) {
            aggregatedData[groupKey].clients[existingClientIndex].fact = (aggregatedData[groupKey].clients[existingClientIndex].fact || 0) + weight;
        } else {
            aggregatedData[groupKey].clients.push(clientPoint);
        }
    });

    // 8. Post-process ABC (Locally for this chunk)
    // Note: True ABC requires global data, but we do estimation here
    Object.values(aggregatedData).forEach(group => {
        group.clients.sort((a, b) => (b.fact || 0) - (a.fact || 0));
        const total = group.fact;
        let run = 0;
        group.clients.forEach(c => {
            run += (c.fact || 0);
            const p = total > 0 ? run / total : 1;
            c.abcCategory = p <= 0.8 ? 'A' : (p <= 0.95 ? 'B' : 'C');
        });
        
        // Add potential metrics
        group.potential = group.fact * 1.15;
        group.growthPotential = group.potential - group.fact;
        group.growthPercentage = 15;
    });

    return {
        aggregatedData: Object.values(aggregatedData),
        unidentifiedRows,
        regionCounts
    };
}
