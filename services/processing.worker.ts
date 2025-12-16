
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
} from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../utils/dataUtils';
import { getDistanceKm } from '../utils/analytics';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Map<string, MapPoint> } };

type OkbCoordIndex = Map<string, { lat: number; lon: number }>;
type CommonProcessArgs = {
    okbData: OkbDataRow[];
    cacheData: CoordsCache;
    postMessage: PostMessageFn;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determines the Canonical Region Name for a given data row (Sales or OKB).
 */
const getCanonicalRegion = (row: any): string => {
    // 1. Search for relevant columns. Priority: Subject > Region > Oblast
    const subjectValue = findValueInRow(row, ['субъект', 'subject', 'регион', 'region', 'область']);

    if (subjectValue && subjectValue.trim()) {
        const cleanVal = subjectValue.trim();
        
        // Initial cleaning: lower case, normalize e, replace punctuation with space
        let lowerVal = cleanVal.toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[.,]/g, ' ')
            .replace(/\s+/g, ' ');

        // Strict Normalization: Remove 'г', 'г.', 'гор', 'гор.', 'город' prefixes and suffixes
        const normalized = lowerVal
            .replace(/^(г|гор|город)[.\s]+/g, '') 
            .replace(/\s+(г|гор|город)$/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Explicit check for Orel/Orel variations to ensure mapping to Orlovskaya Oblast
        if (["орел", "орёл", "orel"].includes(normalized)) {
            return "Орловская область";
        }

        // Direct mapping check against known variations.
        if (REGION_KEYWORD_MAP[normalized]) {
            return REGION_KEYWORD_MAP[normalized];
        }

        // Priority 2: Keyword search
        for (const [key, standardName] of Object.entries(REGION_KEYWORD_MAP)) {
            if (normalized.startsWith(key)) {
                return standardName;
            }
            if (lowerVal.includes(key)) {
                return standardName;
            }
        }
        
        return standardizeRegion(cleanVal);
    }

    // 2. Fallback: Parse the address string ONLY if region column is missing.
    const address = findAddressInRow(row);
    const distributor = findValueInRow(row, ['дистрибьютор']);
    
    if (address || distributor) {
        try {
            const parsed = parseRussianAddress(address || '', distributor);
            if (parsed.region && parsed.region !== 'Регион не определен') {
                return standardizeRegion(parsed.region);
            }
        } catch (e) { /* ignore */ }
    }

    // 3. Final Fallback: Check keywords in address directly if parsing failed
    if (address) {
        const lowerAddr = address.toLowerCase();
        for (const [key, standardName] of Object.entries(REGION_KEYWORD_MAP)) {
            if (lowerAddr.includes(key)) {
                return standardName;
            }
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
            if (normalized && !coordIndex.has(normalized)) {
                coordIndex.set(normalized, { lat, lon });
            }
        }
    }
    return coordIndex;
};

/**
 * Optimized: Finds potential clients from a pre-filtered list of OKB rows for a specific region.
 * Uses Geo-Radius matching (150m) and robust string normalization to exclude existing clients.
 */
function findPotentialClients(
    regionOkbRows: OkbDataRow[] | undefined, 
    activeClientsInRegion: MapPoint[] | undefined
): PotentialClient[] {
    if (!regionOkbRows || regionOkbRows.length === 0) return [];

    const potential: PotentialClient[] = [];
    
    // Prepare lookups for Active Clients in this region
    const activeAddressSet = new Set<string>();
    const activeCoords: { lat: number, lon: number }[] = [];

    if (activeClientsInRegion) {
        activeClientsInRegion.forEach(c => {
            activeAddressSet.add(normalizeAddress(c.address));
            if (c.lat && c.lon) {
                activeCoords.push({ lat: c.lat, lon: c.lon });
            }
        });
    }

    // Iterate OKB rows
    for (const okbRow of regionOkbRows) {
        const okbAddress = findAddressInRow(okbRow) || '';
        if (!okbAddress) continue;

        let isMatch = false;

        // 1. Geo-Radius Match (if OKB has coords): Check if within 150m (0.15km) of any active client
        if (okbRow.lat && okbRow.lon && !isNaN(okbRow.lat) && !isNaN(okbRow.lon)) {
            for (const activeCoord of activeCoords) {
                const dist = getDistanceKm(okbRow.lat, okbRow.lon, activeCoord.lat, activeCoord.lon);
                if (dist < 0.15) { 
                    isMatch = true;
                    break;
                }
            }
        }

        // 2. String Match (if no geo match found or possible): Check normalized string
        if (!isMatch) {
            const normalizedOkb = normalizeAddress(okbAddress);
            if (activeAddressSet.has(normalizedOkb)) {
                isMatch = true;
            }
        }

        // If no match found in Active Clients, this is a Potential Client
        if (!isMatch) {
            const client: PotentialClient = {
                name: findValueInRow(okbRow, ['наименование', 'клиент']) || 'Без названия',
                address: okbAddress,
                type: findValueInRow(okbRow, ['вид деятельности', 'тип']) || 'н/д',
            };
            if(okbRow.lat && okbRow.lon) {
                client.lat = okbRow.lat;
                client.lon = okbRow.lon;
            }
            potential.push(client);
        }
        
        if (potential.length >= 200) break; // Limit potential list per region for performance
    }
    return potential;
}


const findClientNameHeader = (headers: string[]): string | undefined => {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    const priorityTerms = [
        'название магазина limkorm', 
        'название клиента', 
        'наименование клиента', 
        'контрагент', 
        'клиент', 
        'уникальное наименование товара'
    ];
    
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

// --- DATE RANGE DETECTION LOGIC ---
const parseDateValue = (val: any): number | null => {
    if (!val) return null;
    
    // 1. Excel Serial Date (numbers > 20000, usually around 45000 for current years)
    if (typeof val === 'number') {
        if (val > 30000 && val < 60000) {
            // Excel epoch is 1899-12-30
            const date = new Date((val - 25569) * 86400 * 1000);
            return date.getTime();
        }
        return null;
    }

    const strVal = String(val).trim();
    if (!strVal) return null;

    // 2. String Format DD.MM.YYYY or YYYY-MM-DD
    // Regex for DD.MM.YYYY
    const dmy = strVal.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmy) {
        const d = parseInt(dmy[1], 10);
        const m = parseInt(dmy[2], 10) - 1;
        const y = parseInt(dmy[3], 10);
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return date.getTime();
    }

    // Regex for YYYY-MM-DD
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
    
    // 1. Find columns that look like "Date"
    const row0 = data[0];
    const keys = Object.keys(row0);
    const dateKeys = keys.filter(k => {
        const lower = k.toLowerCase();
        return lower.includes('дата') || lower.includes('date') || lower.includes('период') || lower.includes('месяц');
    });

    if (dateKeys.length === 0) return undefined;

    // 2. Scan rows for min/max values
    let minTs = Infinity;
    let maxTs = -Infinity;
    
    // Scan a sample of rows to performance
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

/**
 * Intelligent Header Detection
 * Scans the first N rows to find the row that most likely contains the column headers.
 * IMPROVED: Instead of picking the *first* row with >=2 matches, picking the row with the *MAX* matches.
 * Matches against known critical columns like 'address', 'rm', 'weight'.
 */
const detectHeaderRowIndex = (rows: any[][]): number => {
    const keywords = [
        'адрес', 'address', 
        'рм', 'rm', 'pm',
        'дм', 'dm',
        'вес', 'weight', 
        'фасовка', 'packaging', 
        'бренд', 'brand', 
        'товар', 'product', 
        'дистрибьютор', 'distributor', 
        'канал', 'channel'
    ];
    
    // Scan up to the first 20 rows
    const limit = Math.min(rows.length, 20);
    let bestRowIndex = 0;
    let maxMatches = 0;
    
    for (let i = 0; i < limit; i++) {
        const row = rows[i].map(cell => String(cell || '').toLowerCase());
        let matches = 0;
        
        // Count how many keywords are present in this row
        for (const k of keywords) {
            // Check if any cell contains the keyword
            if (row.some(cell => cell.includes(k))) {
                matches++;
            }
        }
        
        // Use the row with the MOST header matches
        if (matches > maxMatches) {
            maxMatches = matches;
            bestRowIndex = i;
        }
    }
    
    // Ensure we found at least a minimal number of matches to consider it a valid header row.
    // If not, fall back to row 0.
    if (maxMatches >= 2) {
        return bestRowIndex;
    }
    
    return 0; // Default to first row if no good candidate found
};

/**
 * Helper to converting a raw 2D array (from XLSX/CSV) into an Array of Objects using a specific header row.
 */
const convertRawDataToObjects = (rawData: any[][]): { jsonData: any[], headers: string[] } => {
    if (!rawData || rawData.length === 0) return { jsonData: [], headers: [] };

    // 1. Detect Header Row
    const headerRowIndex = detectHeaderRowIndex(rawData);
    
    // 2. Extract Headers
    const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
    
    // 3. Slice data rows (everything after header)
    const dataRows = rawData.slice(headerRowIndex + 1);
    
    // 4. Map to objects
    const jsonData = dataRows.map(rowArray => {
        const obj: any = {};
        headers.forEach((h, i) => {
            // Skip empty headers
            if (h) {
                obj[h] = rowArray[i];
            }
        });
        return obj;
    });

    return { jsonData, headers };
};


self.onmessage = async (e: MessageEvent<{ file: File | null, rawSheetData?: any[][], okbData: OkbDataRow[], cacheData: CoordsCache }>) => {
    const { file, rawSheetData, okbData, cacheData } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        const commonArgs = { okbData, cacheData, postMessage };
        
        // Mode 1: Processing raw data from Google Sheet
        if (rawSheetData && rawSheetData.length > 0) {
            postMessage({ type: 'progress', payload: { percentage: 5, message: 'Обработка данных из облака...' } });
            
            // Use common conversion logic with header detection
            const { jsonData, headers } = convertRawDataToObjects(rawSheetData);
            
            await processFile(jsonData, headers, commonArgs);
        } 
        // Mode 2: Processing uploaded file
        else if (file) {
            if (file.name.toLowerCase().endsWith('.csv')) {
                await processCsv(file, commonArgs);
            } else {
                await processXlsx(file, commonArgs);
            }
        } else {
            throw new Error('No data provided for processing.');
        }
    } catch (error) {
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};

async function processFile(jsonData: any[], headers: string[], { okbData, cacheData, postMessage }: CommonProcessArgs) {
    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');

    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase().includes('потенциал'));
    const clientNameHeader = findClientNameHeader(headers);
    
    // NEW: Detect Date Range
    const dateRange = findDateRange(jsonData);
    if (dateRange) {
        console.log(`Detected Date Range: ${dateRange}`);
    }

    // DEBUG: Log Headers to help diagnosis
    console.log('[HEADERS]', headers);

    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Индексация данных...' } });
    const okbCoordIndex = createOkbCoordIndex(okbData);
    
    // --- PRE-GROUP OKB BY REGION ---
    const okbRegionCounts: { [key: string]: number } = {};
    const okbByRegion: Record<string, OkbDataRow[]> = {};

    if (okbData) {
        okbData.forEach(row => {
            const canonicalRegion = getCanonicalRegion(row);
            if (canonicalRegion && canonicalRegion !== 'Регион не определен') {
                okbRegionCounts[canonicalRegion] = (okbRegionCounts[canonicalRegion] || 0) + 1;
                
                if (!okbByRegion[canonicalRegion]) {
                    okbByRegion[canonicalRegion] = [];
                }
                okbByRegion[canonicalRegion].push(row);
            }
        });
    }

    // --- CACHE INITIALIZATION with Redirects & Comments ---
    const cacheAddressMap = new Map<string, { lat?: number; lon?: number; originalAddress?: string; isInvalid?: boolean; comment?: string }>();
    const cacheRedirectMap = new Map<string, string>(); // normalizedOld -> normalizedTarget
    const deletedAddresses = new Set<string>();

    if (cacheData) {
        for (const rm of Object.keys(cacheData)) {
            for (const item of cacheData[rm]) {
                if (!item.address) continue;

                const normalizedTarget = normalizeAddress(item.address);

                if (item.isDeleted) {
                    deletedAddresses.add(normalizedTarget);
                    continue;
                }

                // Store canonical entry
                if (!cacheAddressMap.has(normalizedTarget)) {
                    cacheAddressMap.set(normalizedTarget, { 
                        lat: item.lat, 
                        lon: item.lon, 
                        originalAddress: item.address,
                        isInvalid: item.isInvalid,
                        comment: item.comment // Store comment
                    });
                }

                // Parse history for redirects
                if (item.history) {
                    const historyEntries = String(item.history)
                        .replace(/\u00A0/g, ' ')
                        .replace(/&nbsp;/g, ' ')
                        .split(/\r?\n|\s*\|\|\s*|<br\s*\/?>/i)
                        .map(s => s.trim())
                        .filter(Boolean);

                    for (const entry of historyEntries) {
                        const oldAddrRaw = entry.split('[')[0].trim();
                        if (!oldAddrRaw) continue;
                        
                        const normalizedOld = normalizeAddress(oldAddrRaw);
                        // If the old address matches the current canonical one, it's not a redirect, just a variant/duplicate
                        if (normalizedOld && normalizedOld !== normalizedTarget) {
                            cacheRedirectMap.set(normalizedOld, normalizedTarget);
                        }
                    }
                }
            }
        }
    }
    console.log('[CACHE LOAD] addresses=', cacheAddressMap.size, 'redirects=', cacheRedirectMap.size, 'deleted=', deletedAddresses.size);
    postMessage({ type: 'progress', payload: { percentage: 10, message: `Кэш обработан: ${cacheAddressMap.size} записей.` } });

    const aggregatedData: AggregationMap = {};
    const uniquePlottableClients = new Map<string, MapPoint>();
    const newAddressesToCache: { [rmName: string]: { address: string }[] } = {};
    const addressesToGeocode: { [rmName: string]: string[] } = {};
    const unidentifiedRows: UnidentifiedRow[] = [];

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Strict keyword matching for RM to avoid picking up "Специализация корма"
        // Updated list to include Latin/Cyrillic variants and full names
        let rm = findValueInRow(row, ['рм', 'pm', 'региональный менеджер', 'regional manager', 'kam', 'кам', 'rsm']);
        
        // IMPROVED: Fallback to DM if RM is not found.
        // Often 'DM' or 'Director' columns contain the necessary grouping key if 'RM' is empty.
        const dm = findValueInRow(row, ['дм', 'dm', 'дивизиональный', 'директор', 'director']);
        if (!rm && dm) {
             rm = dm;
        }

        if (i > 0 && i % 5000 === 0) {
            const percentage = 10 + Math.round((i / jsonData.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработка: ${i.toLocaleString('ru-RU')}...` } });
        }
        
        let clientAddress = findAddressInRow(row);
        const distributor = findValueInRow(row, ['дистрибьютор', 'дистрибьютер']);
        if ((!clientAddress || clientAddress.trim() === '') && (!distributor || distributor.trim() === '')) continue;
        
        if (!rm) {
            // Debug log for the first few errors to help identify file structure issues
            if (unidentifiedRows.length < 5) {
                console.warn('[RM NOT FOUND]', row);
            }
            unidentifiedRows.push({ rm: 'РМ не указан', rowData: row, originalIndex: i });
            continue;
        }

        // --- REDIRECT & DELETE LOGIC ---
        let normalizedRaw = clientAddress ? normalizeAddress(clientAddress) : '';
        if (clientAddress) {
            // 1. Check if explicitly deleted
            if (deletedAddresses.has(normalizedRaw)) continue;

            // 2. Check for Redirect (History)
            if (cacheRedirectMap.has(normalizedRaw)) {
                const newNormalizedTarget = cacheRedirectMap.get(normalizedRaw)!;
                const targetEntry = cacheAddressMap.get(newNormalizedTarget);
                
                if (targetEntry) {
                    clientAddress = targetEntry.originalAddress || clientAddress;
                    normalizedRaw = newNormalizedTarget;
                } else {
                    normalizedRaw = newNormalizedTarget;
                }

                if (deletedAddresses.has(normalizedRaw)) continue;
            }
        }

        // 1. Determine Canonical Region from columns FIRST
        const regionFromColumns = getCanonicalRegion(row);
        
        // 2. Parse Address
        const parsedAddress: EnrichedParsedAddress = parseRussianAddress(clientAddress || '', distributor);
        
        // 3. Check Cache availability
        const cacheEntry = cacheAddressMap.get(normalizedRaw);
        
        // Check if the cached entry is explicitly invalid (e.g. "Не найдено" in sheet)
        if (cacheEntry && cacheEntry.isInvalid) {
             unidentifiedRows.push({ rm, rowData: row, originalIndex: i });
             continue;
        }

        // Validation Logic: Accept row if we have City OR Region OR Cache
        const isCityFound = parsedAddress.city !== 'Город не определен';
        const isRegionFound = regionFromColumns !== 'Регион не определен' || (parsedAddress.region !== 'Регион не определен');
        const isCached = !!(cacheEntry && cacheEntry.lat !== undefined && cacheEntry.lon !== undefined);

        if (!isCityFound && !isRegionFound && !isCached) {
            unidentifiedRows.push({ rm, rowData: row, originalIndex: i });
            continue;
        }

        const regionForAggregation = regionFromColumns !== 'Регион не определен' ? regionFromColumns : parsedAddress.region;
        const groupNameForAggregation = isCityFound ? parsedAddress.city : (regionForAggregation !== 'Регион не определен' ? regionForAggregation : 'Неопределенный город');
        
        const finalAddress = parsedAddress.finalAddress || clientAddress || '';
        
        const weight = parseFloat(String(findValueInRow(row, ['вес, кг', 'вес кг', 'вес', 'сумма отгрузки, руб', 'количество, кг', 'нетто']) || '0').replace(/\s/g, '').replace(',', '.'));
        
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
        const brand = findValueInRow(row, ['торговая марка', 'бренд']) || 'Бренд не указан';
        const packaging = findValueInRow(row, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана';

        if (isNaN(weight)) continue;
        
        const key = `${regionForAggregation}-${brand}-${packaging}-${rm}`.toLowerCase();
        
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${regionForAggregation} (${brand} - ${packaging})`, brand, packaging, rm, city: groupNameForAggregation,
                region: regionForAggregation, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Map<string, MapPoint>(),
            };
        }
        aggregatedData[key].fact += weight;

        if (hasPotentialColumn) {
            const potential = parseFloat(String(findValueInRow(row, ['потенциал', 'план']) || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }

        // --- Map Point Logic ---
        if (!uniquePlottableClients.has(normalizedRaw)) {
            let lat: number | undefined;
            let lon: number | undefined;
            let isCachedFlag = false;
            let comment: string | undefined; // For comment
            
            let displayAddress = finalAddress;

            if (isCached && cacheEntry) {
                lat = cacheEntry.lat;
                lon = cacheEntry.lon;
                comment = cacheEntry.comment; // Get comment from cache
                isCachedFlag = true;
                if (cacheEntry.originalAddress) {
                    displayAddress = cacheEntry.originalAddress;
                }
            } else {
                if (!newAddressesToCache[rm]) newAddressesToCache[rm] = [];
                // Cache the display address for future consistency
                if (finalAddress && !newAddressesToCache[rm].some(item => item.address === finalAddress)) {
                    newAddressesToCache[rm].push({ address: finalAddress });
                }

                const okbEntry = okbCoordIndex.get(normalizedRaw);
                if (okbEntry) {
                    lat = okbEntry.lat;
                    lon = okbEntry.lon;
                } else if (finalAddress && !isCachedFlag) {
                    if (!addressesToGeocode[rm]) addressesToGeocode[rm] = [];
                    if (!addressesToGeocode[rm].includes(finalAddress)) {
                        addressesToGeocode[rm].push(finalAddress);
                    }
                }
            }
            
            uniquePlottableClients.set(normalizedRaw, {
                key: normalizedRaw,
                lat, lon, isCached: isCachedFlag,
                status: 'match',
                name: clientName,
                address: displayAddress, 
                city: groupNameForAggregation,
                region: regionForAggregation, 
                rm, brand, packaging,
                type: findValueInRow(row, ['канал продаж', 'канал']),
                contacts: findValueInRow(row, ['контакты', 'телефон']),
                originalRow: row,
                fact: weight,
                comment: comment, // Set comment
            });
        } else {
             const existing = uniquePlottableClients.get(normalizedRaw);
             if (existing) {
                 existing.fact = (existing.fact || 0) + weight;
             }
        }
        
        const mapPointForGroup = uniquePlottableClients.get(normalizedRaw);
        if (mapPointForGroup) {
            aggregatedData[key].clients.set(mapPointForGroup.key, mapPointForGroup);
        }
    }

    postMessage({ type: 'progress', payload: { percentage: 90, message: 'ABC-анализ клиентов...' } });
    
    const plottableActiveClients = Array.from(uniquePlottableClients.values());
    
    // Calculate ABC categories
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
    for (const item of Object.values(aggregatedData)) {
        let potential = item.potential;
        if (!hasPotentialColumn) potential = item.fact * 1.15;
        else if (potential < item.fact) potential = item.fact;
        
        let regionPotentialClients = potentialClientsCache.get(item.region);
        if (!regionPotentialClients) {
            const activeInRegion = activeClientsByRegion.get(item.region);
            regionPotentialClients = findPotentialClients(okbByRegion[item.region], activeInRegion);
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

    // --- STREAMING OUTPUT IMPLEMENTATION ---
    // Instead of sending one massive payload, we send chunks.
    
    postMessage({ 
        type: 'result_init', 
        payload: { 
            okbRegionCounts, 
            dateRange,
            totalUnidentified: unidentifiedRows.length
        } 
    });

    const CHUNK_SIZE = 2000;

    // 1. Stream Aggregated Data (contains Client objects)
    for (let i = 0; i < finalData.length; i += CHUNK_SIZE) {
        postMessage({
            type: 'result_chunk_aggregated',
            payload: finalData.slice(i, i + CHUNK_SIZE)
        });
    }

    // 2. Stream Unidentified Rows (if any)
    for (let i = 0; i < unidentifiedRows.length; i += CHUNK_SIZE) {
        postMessage({
            type: 'result_chunk_unidentified',
            payload: unidentifiedRows.slice(i, i + CHUNK_SIZE)
        });
    }

    // 3. Signal Finish
    postMessage({ type: 'result_finished' });


    // --- BACKGROUND TASKS ---
    const newAddressRMs = Object.keys(newAddressesToCache);
    if (newAddressRMs.length > 0) {
        postMessage({ type: 'progress', payload: { percentage: 99, message: 'Добавление новых адресов в кэш...', isBackground: true } });
        for (const rmName of newAddressRMs) {
            try {
                await fetch('/api/add-to-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rmName, rows: newAddressesToCache[rmName] }) });
            } catch (e) { console.error(`Failed to add to cache for ${rmName}:`, e); }
        }
    }

    const geocodeRMs = Object.keys(addressesToGeocode);
    if (geocodeRMs.length > 0) {
        postMessage({ type: 'progress', payload: { percentage: 99, message: 'Запуск геокодирования...', isBackground: true } });
        for (const rmName of geocodeRMs) {
            const updates: { address: string, lat: number, lon: number }[] = [];
            const addresses = addressesToGeocode[rmName];
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


async function processXlsx(file: File, args: CommonProcessArgs) {
    args.postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла XLSX...' } });
    const data = await file.arrayBuffer();
    const workbook = xlsx.read(data, { type: 'array', cellDates: false, cellNF: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // READ AS ARRAY OF ARRAYS to enable header detection
    const rawData: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    // Process with intelligent header detection
    const { jsonData, headers } = convertRawDataToObjects(rawData);
    
    await processFile(jsonData, headers, args);
}


async function processCsv(file: File, args: CommonProcessArgs) {
    args.postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла CSV...' } });
    
    const parsePromise = new Promise<{ rawData: any[][], meta: ParseMeta }>((resolve, reject) => {
        PapaParse(file, {
            header: false, // READ AS ARRAY OF ARRAYS
            skipEmptyLines: true,
            complete: (results: ParseResult<any>) => {
                if (results.errors.length > 0) console.warn('CSV parsing errors:', results.errors);
                resolve({ rawData: results.data, meta: results.meta });
            },
            error: (error: Error) => reject(error)
        });
    });

    try {
        const { rawData } = await parsePromise;
        if (!rawData || rawData.length === 0) throw new Error("CSV файл пуст или не удалось его прочитать.");
        
        // Process with intelligent header detection
        const { jsonData, headers } = convertRawDataToObjects(rawData);
        
        await processFile(jsonData, headers, args);
    } catch (error) {
        throw new Error(`Failed to parse CSV file: ${(error as Error).message}`);
    }
}
