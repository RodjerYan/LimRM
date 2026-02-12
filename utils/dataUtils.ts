
import {
  AggregatedDataRow,
  FilterState,
  FilterOptions,
  SummaryMetrics,
  OkbDataRow,
  MapPoint
} from '../types';
import { REGION_KEYWORD_MAP, REGION_BY_CITY_MAP } from './addressMappings';
import { REGION_BY_CITY_WITH_INDEXES } from './regionMap';

/**
 * Normalizes an RM name for consistent matching.
 */
export const normalizeRmNameForMatching = (str: string): string => {
    if (!str) return '';
    let clean = str.toLowerCase().trim();
    const surname = clean.split(/[\s.]+/)[0];
    return surname.replace(/[^a-zа-я0-9]/g, '');
};

/**
 * Applies the current filter state to the aggregated data.
 */
export const applyFilters = (data: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
  return data.filter(row => {
    const rmMatch = !filters.rm || row.rm === filters.rm;
    const brandMatch = filters.brand.length === 0 || filters.brand.includes(row.brand);
    const packagingMatch = filters.packaging.length === 0 || filters.packaging.includes(row.packaging);
    const regionMatch = filters.region.length === 0 || filters.region.includes(row.region);
    return rmMatch && brandMatch && packagingMatch && regionMatch;
  });
};

/**
 * Extracts all unique values for filter dropdowns.
 */
export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
  const rms = new Set<string>();
  const brands = new Set<string>();
  const packagings = new Set<string>();
  const regions = new Set<string>();

  data.forEach(row => {
    if (row.rm) rms.add(row.rm);
    if (row.brand) brands.add(row.brand);
    if (row.packaging) packagings.add(row.packaging);
    if (row.region && row.region !== 'Регион не определен') regions.add(row.region);
  });

  return {
    rms: Array.from(rms).sort((a, b) => a.localeCompare(b, 'ru')),
    brands: Array.from(brands).sort((a, b) => a.localeCompare(b, 'ru')),
    packagings: Array.from(packagings).sort((a, b) => a.localeCompare(b, 'ru')),
    regions: Array.from(regions).sort((a, b) => a.localeCompare(b, 'ru')),
  };
};

/**
 * Calculates summary metrics for a given set of data.
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics | null => {
  if (data.length === 0) return null;

  const globalUniqueKeys = new Set<string>();
  const channelUniqueKeys: Record<string, Set<string>> = {};

  const metrics = data.reduce(
    (acc, row) => {
      acc.totalFact += row.fact;
      acc.totalPotential += row.potential;
      acc.totalGrowth += row.growthPotential;
      
      if (row.clients) {
          row.clients.forEach(client => {
              globalUniqueKeys.add(client.key);
              const channel = client.type || 'Не определен';
              if (!channelUniqueKeys[channel]) channelUniqueKeys[channel] = new Set();
              channelUniqueKeys[channel].add(client.key);
          });
      }

      if (!acc.rmGrowth[row.rm]) acc.rmGrowth[row.rm] = 0;
      acc.rmGrowth[row.rm] += row.growthPotential;

      return acc;
    },
    {
      totalFact: 0,
      totalPotential: 0,
      totalGrowth: 0,
      rmGrowth: {} as { [key: string]: number },
    }
  );

  const averageGrowthPercentage = metrics.totalPotential > 0 ? (metrics.totalGrowth / metrics.totalPotential) * 100 : 0;

  let topPerformingRM = { name: 'N/A', value: 0 };
  const rmKeys = Object.keys(metrics.rmGrowth);
  if (rmKeys.length > 0) {
    const topRMName = rmKeys.reduce((a, b) => metrics.rmGrowth[a] > metrics.rmGrowth[b] ? a : b);
    topPerformingRM = { name: topRMName, value: metrics.rmGrowth[topRMName] };
  }

  const channelCounts: Record<string, number> = {};
  Object.entries(channelUniqueKeys).forEach(([ch, set]) => {
      channelCounts[ch] = set.size;
  });

  return {
    totalFact: metrics.totalFact,
    totalPotential: metrics.totalPotential,
    totalGrowth: metrics.totalGrowth,
    totalClients: data.length, 
    totalActiveClients: globalUniqueKeys.size, 
    averageGrowthPercentage,
    topPerformingRM,
    channelCounts
  };
};

export const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const k = keyword.toLowerCase().trim();
        const exactKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === k);
        if (exactKey && row[exactKey] != null) return String(row[exactKey]);
    }
    for (const keyword of keywords) {
        const k = keyword.toLowerCase().trim();
        const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^а-яёa-z0-9])${escapedK}([^а-яёa-z0-9]|$)`, 'i');
        const boundaryKey = rowKeys.find(rKey => regex.test(rKey.toLowerCase().trim()));
        if (boundaryKey && row[boundaryKey] != null) return String(row[boundaryKey]);
    }
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword.toLowerCase().trim()));
        if (foundKey && row[foundKey] != null) return String(row[foundKey]);
    }
    return '';
};

export const findAddressInRow = (row: { [key: string]: any }): string | null => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    const prioritizedKeys = ['адрес тт limkorm', 'фактический адрес', 'юридический адрес', 'адрес'];
    for (const pKey of prioritizedKeys) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }
    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    const fallbackKey = rowKeys.find(key => (key.toLowerCase().includes('город') || key.toLowerCase().includes('регион')) && !key.toLowerCase().includes('субъект'));
    if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);
    return null;
};

const REGION_MATCHER_LIST = Object.values(REGION_KEYWORD_MAP).reduce((acc, regionName) => {
    const lowerName = regionName.toLowerCase();
    let root = lowerName.replace(/\bобласть\b/g, '').replace(/\bкрай\b/g, '').replace(/\bреспублика\b/g, '').replace(/\bавтономный округ\b/g, '').replace(/\bао\b/g, '').replace(/\bг\.\s*/g, '').replace(/[()]/g, '').trim();
    if (root.length > 2) {
         if (!acc.some(item => item.root === root)) acc.push({ root, regionName });
    }
    return acc;
}, [] as { root: string, regionName: string }[]);
REGION_MATCHER_LIST.sort((a, b) => b.root.length - a.root.length);

export const recoverRegion = (dirtyString: string, cityHint: string): string => {
    const lowerDirty = dirtyString ? dirtyString.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!lowerDirty && !cityHint) return 'Регион не определен';
    if (lowerDirty) {
        for (const [key, value] of Object.entries(REGION_KEYWORD_MAP)) {
             if (lowerDirty.includes(key)) return value;
        }
        for (const { root, regionName } of REGION_MATCHER_LIST) {
            if (lowerDirty.includes(root)) return regionName;
        }
    }
    let lowerCity = cityHint ? cityHint.toLowerCase().trim() : '';
    if (lowerCity) {
        lowerCity = lowerCity.replace(/^(г\.|город|пгт|пос\.|с\.|село|дер\.|д\.)\s*/, '').trim();
        lowerCity = lowerCity.replace(/ё/g, 'е');
    }
    if (lowerCity && REGION_BY_CITY_MAP[lowerCity]) return REGION_BY_CITY_MAP[lowerCity];
    return 'Регион не определен';
};

const createStopwords = (): Set<string> => {
    const genericStopwords = ['улица', 'ул', 'проспект', 'пр', 'пр-т', 'пр-кт', 'проезд', 'пр-д', 'переулок', 'пер', 'шоссе', 'ш', 'бульвар', 'б-р', 'площадь', 'пл', 'набережная', 'наб', 'тупик', 'аллея', 'линия', 'город', 'г', 'поселок', 'пос', 'пгт', 'деревня', 'дер', 'село', 'с', 'хутор', 'х', 'станица', 'ст-ца', 'аул', 'рп', 'рабочий', 'поселение', 'сельское', 'городское', 'область', 'обл', 'край', 'республика', 'респ', 'автономный', 'округ', 'ао', 'район', 'р-н', 'р', 'н', 'кыргызстан', 'киргизия', 'кыргызская', 'казахстан', 'россия', 'рф', 'беларусь', 'белоруссия', 'таджикистан', 'узбекистан', 'туркменистан', 'армения', 'азербайджан', 'молдова', 'грузия', 'дом', 'корпус', 'корп', 'строение', 'стр', 'литер', 'лит', 'квартира', 'кв', 'офис', 'оф', 'помещение', 'пом', 'комната', 'комн', 'мкр', 'микрорайон', 'автодорога'];
    const regionNameParts = new Set<string>();
    const allCities = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES));
    for (const item of Object.entries(REGION_KEYWORD_MAP)) {
        [item[0], item[1]].forEach(text => {
            text.toLowerCase().replace(/[^а-я\s]/g, '').split(/\s+/).filter(word => word.length > 2 && !allCities.has(word)).forEach(word => regionNameParts.add(word));
        });
    }
    return new Set([...genericStopwords, ...Array.from(regionNameParts)]);
};

const STOPWORDS = createStopwords();
const ALL_CITIES = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES));

export function normalizeAddress(address: string | null | undefined, options: { simplify?: boolean } = {}): string {
    if (!address) return "";
    let cleaned = address.toLowerCase().replace(/ё/g, 'е');
    cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+[а-я]?)/g, '$1к$2').replace(/\b(корпус|корп|к)\.?\s*([а-я])\b/g, 'к$2').replace(/\b(строение|стр)\.?\s*([а-я])\b/g, 'с$2').replace(/\b(литер|лит)\.?\s*([а-я])\b/g, 'л$2').replace(/\b(корпус|корп|к)\.?\s*(\d+[а-я]?\b)/g, 'к$2').replace(/\b(строение|стр)\.?\s*(\d+[а-я]?\b)/g, 'с$2').replace(/\b(литер|лит)\.?\s*(\d+[а-я]?\b)/g, 'л$2').replace(/\b(д|дом)\.?\s*(\d+[а-я]?\b)/g, '$2').replace(/\b(\d+)\s+([а-я])\b/g, '$1$2');
    cleaned = cleaned.replace(/\b\d{5,6}\b/g, ''); 
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' '); 
    let parts = cleaned.split(/\s+/).filter(part => part && !STOPWORDS.has(part));
    if (options.simplify) {
        parts = parts.filter(part => {
            if (/^\d+.*$/.test(part) || /^[ксл]\d/.test(part) || /^[ксл][а-я]$/.test(part)) return true;
            if (ALL_CITIES.has(part)) return true;
            if (part.endsWith('ский') || part.endsWith('ской') || part.endsWith('цкий') || part.endsWith('ецкий')) return false;
            return true;
        });
    }
    parts.sort((a, b) => a.localeCompare(b, 'ru'));
    return parts.join(' ').trim();
}

/**
 * Standardizes a string to YYYY-MM-DD format if possible.
 * Robustly handles YYYY-MM-DD, DD.MM.YYYY, YYYY.MM.DD and ISO strings.
 */
export const toDayKey = (raw?: string | null | number): string | null => {
  if (!raw) return null;
  const s = String(raw).trim();

  // 1. Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // 2. YYYY.MM.DD or YYYY/MM/DD (common in data exports)
  let match = s.match(/^(\d{4})[\.\-/](\d{1,2})[\.\-/](\d{1,2})/);
  if (match) {
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  // 3. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (Russian/EU format)
  match = s.match(/^(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})/);
  if (match) {
      return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }

  // 4. ISO Date String (starts with YYYY-MM-DD)
  if (s.length >= 10 && s[4] === '-' && s[7] === '-') {
       return s.substring(0, 10);
  }

  // 5. Date Object attempt (last resort, for full text dates)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
  }

  return null;
};

// --- NORMALIZATION UTILS (Single Source of Truth) ---

export const sumMonthlyInRange = (mf: Record<string, number> | undefined, startYM: string | null, endYM: string | null, strictUnknown = true): number => {
    if (!mf) return 0;
    let sum = 0;
    for (const [k, v] of Object.entries(mf)) {
        if (k === 'unknown') {
            if (strictUnknown) continue;
            sum += Number(v) || 0;
            continue;
        }
        if (startYM && k < startYM) continue;
        if (endYM && k > endYM) continue;
        sum += Number(v) || 0;
    }
    return sum;
};

export const filterMonthlyMap = (mf: Record<string, number> | undefined, startYM: string | null, endYM: string | null): Record<string, number> => {
    if (!mf) return {};
    const res: Record<string, number> = {};
    for (const [k, v] of Object.entries(mf)) {
        if (k === 'unknown') continue;
        if (startYM && k < startYM) continue;
        if (endYM && k > endYM) continue;
        res[k] = Number(v) || 0;
    }
    return res;
};

/**
 * Normalizes aggregated data to a specific date range.
 * Safely handles missing monthlyFact for legacy or manual data by preserving total Fact if in doubt.
 */
export const normalizeAggregatedToPeriod = (data: AggregatedDataRow[], startYM: string | null, endYM: string | null): AggregatedDataRow[] => {
    // If no filter, return data as is
    if (!startYM && !endYM) return data;

    const out: AggregatedDataRow[] = [];

    for (const group of data) {
        const clientsFiltered = (group.clients || []).map((c) => {
            let fact = 0;
            const hasMonthly = c.monthlyFact && Object.keys(c.monthlyFact).length > 0;
            const hasDaily = c.dailyFact && Object.keys(c.dailyFact).length > 0;
            
            // Prefer Daily for precision
            if (hasDaily) {
                let dailySum = 0;
                for (const [day, val] of Object.entries(c.dailyFact!)) {
                    const dk = toDayKey(day);
                    if (!dk) continue; 
                    
                    // Note: startYM/endYM passed here are likely YYYY-MM prefixes if called from useDataSync logic
                    // We need full comparison if possible, but typically this function uses Month keys.
                    // For robustness, let's assume if it's Daily, we should filter by Month prefix if inputs are Months.
                    
                    // If inputs are full YYYY-MM-DD:
                    if (startYM && startYM.length === 10 && dk < startYM) continue;
                    if (endYM && endYM.length === 10 && dk > endYM) continue;
                    
                    // If inputs are YYYY-MM:
                    if (startYM && startYM.length === 7 && dk.slice(0, 7) < startYM) continue;
                    if (endYM && endYM.length === 7 && dk.slice(0, 7) > endYM) continue;

                    dailySum += val;
                }
                fact = dailySum;
            } 
            // Fallback to Monthly
            else if (hasMonthly) {
                // If filtering by specific DAYS, monthly might be inaccurate but it's the best we have
                const startMonth = startYM ? startYM.slice(0, 7) : null;
                const endMonth = endYM ? endYM.slice(0, 7) : null;
                fact = sumMonthlyInRange(c.monthlyFact, startMonth, endMonth, true);
            } else {
                // STRICT MODE: If a date range is set, we CANNOT assume c.fact belongs to this period.
                // If we don't know the date, we must treat it as 0 in this filtered view.
                fact = 0; 
            }
            
            if (fact <= 0.001) return null;

            return {
                ...c,
                fact,
                // Preserve detailed facts for drill-down even if subset is shown
                monthlyFact: c.monthlyFact,
                dailyFact: c.dailyFact
            };
        }).filter(Boolean) as MapPoint[];

        if (clientsFiltered.length === 0) continue;

        const groupFact = clientsFiltered.reduce((s, c) => s + (c.fact || 0), 0);
        
        // Re-aggregate monthly for group consistency (optional but good for charts)
        const groupMonthly: Record<string, number> = {};
        clientsFiltered.forEach(c => {
            if (c.monthlyFact) {
                Object.entries(c.monthlyFact).forEach(([k, v]) => {
                    groupMonthly[k] = (groupMonthly[k] || 0) + v;
                });
            }
        });

        out.push({
            ...group,
            clients: clientsFiltered,
            fact: groupFact,
            monthlyFact: groupMonthly,
            potential: groupFact * 1.15,
            growthPotential: (groupFact * 1.15) - groupFact,
            growthPercentage: 15,
        });
    }

    return out;
};
