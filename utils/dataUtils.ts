
import {
  AggregatedDataRow,
  FilterState,
  FilterOptions,
  SummaryMetrics,
  OkbDataRow,
} from '../types';
import { REGION_KEYWORD_MAP, REGION_BY_CITY_MAP, CITY_NORMALIZATION_MAP } from './addressMappings';
import { REGION_BY_CITY_WITH_INDEXES } from './regionMap';

/**
 * Applies the current filter state to the aggregated data.
 */
export const applyFilters = (data: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
  return data.filter(row => {
    const rmMatch = !filters.rm || row.rm === filters.rm;
    const brandMatch = filters.brand.length === 0 || filters.brand.includes(row.brand);
    const regionMatch = filters.region.length === 0 || filters.region.includes(row.region);
    return rmMatch && brandMatch && regionMatch;
  });
};

/**
 * Extracts all unique values for filter dropdowns from the aggregated data.
 */
export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
  const rms = new Set<string>();
  const brands = new Set<string>();
  const regions = new Set<string>();

  data.forEach(row => {
    if (row.rm) rms.add(row.rm);
    if (row.brand) brands.add(row.brand);
    if (row.region && row.region !== 'Регион не определен') regions.add(row.region);
  });

  return {
    rms: Array.from(rms).sort((a, b) => a.localeCompare(b, 'ru')),
    brands: Array.from(brands).sort((a, b) => a.localeCompare(b, 'ru')),
    regions: Array.from(regions).sort((a, b) => a.localeCompare(b, 'ru')),
  };
};

/**
 * Calculates summary metrics for a given set of data.
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics | null => {
  if (data.length === 0) {
    return null;
  }

  const metrics = data.reduce(
    (acc, row) => {
      acc.totalFact += row.fact;
      acc.totalPotential += row.potential;
      acc.totalGrowth += row.growthPotential;
      acc.totalActiveClients += row.clients?.length || 0;

      if (!acc.rmGrowth[row.rm]) {
        acc.rmGrowth[row.rm] = 0;
      }
      acc.rmGrowth[row.rm] += row.growthPotential;

      return acc;
    },
    {
      totalFact: 0,
      totalPotential: 0,
      totalGrowth: 0,
      totalActiveClients: 0,
      rmGrowth: {} as { [key: string]: number },
    }
  );

  const averageGrowthPercentage =
    metrics.totalPotential > 0 ? (metrics.totalGrowth / metrics.totalPotential) * 100 : 0;

  let topPerformingRM = { name: 'N/A', value: 0 };
  const rmKeys = Object.keys(metrics.rmGrowth);
  if (rmKeys.length > 0) {
    const topRMName = rmKeys.reduce((a, b) =>
      metrics.rmGrowth[a] > metrics.rmGrowth[b] ? a : b
    );
    topPerformingRM = { name: topRMName, value: metrics.rmGrowth[topRMName] };
  }

  return {
    totalFact: metrics.totalFact,
    totalPotential: metrics.totalPotential,
    totalGrowth: metrics.totalGrowth,
    totalClients: data.length,
    totalActiveClients: metrics.totalActiveClients,
    averageGrowthPercentage,
    topPerformingRM,
  };
};

export const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword));
        if (foundKey && row[foundKey] != null) {
            return String(row[foundKey]);
        }
    }
    return '';
};

export const findAddressInRow = (row: { [key: string]: any }): string | null => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    const prioritizedKeys = ['адрес тт limkorm', 'юридический адрес', 'адрес'];

    for (const pKey of prioritizedKeys) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }

    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    
    const fallbackKey = rowKeys.find(key => 
        (key.toLowerCase().includes('город') || key.toLowerCase().includes('регион')) && 
        !key.toLowerCase().includes('субъект')
    );
    if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);

    return null;
};

/**
 * Recovers a standardized region name from dirty strings using strict logic.
 * 
 * ALGORITHM:
 * 1. Prepare inputs: lowercase, replace ё->е.
 * 2. Strict Keyword Check (Region Column): Does the region column contain a KNOWN strong keyword (e.g. "орловская")?
 * 3. City Lookup: Clean the city (remove 'g.', 'pos.') and look it up in the database.
 * 4. Fallback Keyword Check (City Column): Does the city column contain a region keyword?
 */
export const recoverRegion = (dirtyRegionString: string, cityHint: string): string => {
    const normalize = (str: string) => str ? str.toLowerCase().replace(/ё/g, 'е').trim() : '';
    
    const normRegionCol = normalize(dirtyRegionString);
    const normCityCol = normalize(cityHint);

    if (!normRegionCol && !normCityCol) return 'Регион не определен';

    // 1. PRIORITY: Check Region Column for Strong Keywords
    // REGION_KEYWORD_MAP now only contains unambiguous roots (e.g. "орловская", "орел")
    if (normRegionCol) {
        for (const [key, val] of Object.entries(REGION_KEYWORD_MAP)) {
             if (normRegionCol.includes(key)) return val;
        }
    }

    // 2. Check City Column against City DB (REGION_BY_CITY_MAP)
    // We perform a safe local cleanup of prefixes just for the lookup, 
    // WITHOUT modifying the CITY_NORMALIZATION_MAP globally.
    if (normCityCol) {
        // Apply global normalization first (fix typos like 'г.орел' -> 'орел')
        let cleanCity = normCityCol;
        for (const [bad, good] of Object.entries(CITY_NORMALIZATION_MAP)) {
             if (cleanCity.includes(bad)) {
                 cleanCity = cleanCity.replace(bad, good);
             }
        }
        
        // Strip standard prefixes safely to find the core city name
        // This handles "г. Орел" -> "орел", "пгт Сахарный" -> "сахарный"
        const strippedCity = cleanCity.replace(/^(город|поселок|село|деревня|станица|хутор|пгт|рп|г|п|с|д|ст|х)(\.|\s)+/i, '').trim();
        
        // Lookup stripped version (e.g. "орел")
        if (REGION_BY_CITY_MAP[strippedCity]) return REGION_BY_CITY_MAP[strippedCity];
        // Lookup raw version (e.g. "сахарный", if prefix wasn't matched or if it's just the name)
        if (REGION_BY_CITY_MAP[cleanCity]) return REGION_BY_CITY_MAP[cleanCity];
    }

    // 3. Fallback: Check City Column for Region Keywords
    // (Case: Region column empty, City column says "Орловская обл, г. Орел")
    if (normCityCol) {
        for (const [key, val] of Object.entries(REGION_KEYWORD_MAP)) {
             if (normCityCol.includes(key)) return val;
        }
    }

    return 'Регион не определен';
};

// --- ADDRESS NORMALIZATION UTILS ---

const createStopwords = (): Set<string> => {
    const genericStopwords = [
        'улица', 'ул', 'проспект', 'пр', 'пр-т', 'пр-кт', 'проезд', 'пр-д', 'переулок', 'пер', 'шоссе', 'ш', 
        'бульвар', 'б-р', 'площадь', 'пл', 'набережная', 'наб', 'тупик', 'аллея', 'линия',
        'город', 'г', 'поселок', 'пос', 'пгт', 'деревня', 'дер', 'село', 'с', 'хутор', 'х', 
        'станица', 'ст-ца', 'аул', 'рп', 'рабочий', 'поселение', 'сельское', 'городское',
        'область', 'обл', 'край', 'республика', 'респ', 'автономный', 'округ', 'ао', 'район', 'р-н', 'р', 'н',
        'кыргызстан', 'киргизия', 'кыргызская', 'казахстан', 'россия', 'рф', 'беларусь', 'белоруссия',
        'таджикистан', 'узбекистан', 'туркменистан', 'армения', 'азербайджан', 'молдова', 'грузия',
        'квартира', 'кв', 'офис', 'оф', 'помещение', 'пом', 'комната', 'комн', 'мкр', 'микрорайон', 'автодорога'
    ];

    const regionNameParts = new Set<string>();
    const allCities = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES).map(c => c.toLowerCase()));

    for (const item of Object.entries(REGION_KEYWORD_MAP)) {
        [item[0], item[1]].forEach(text => {
            text.toLowerCase()
                .replace(/[^а-я\s]/g, '') 
                .split(/\s+/)
                .filter(word => word.length > 2 && !allCities.has(word)) 
                .forEach(word => regionNameParts.add(word));
        });
    }

    return new Set([...genericStopwords, ...Array.from(regionNameParts)]);
};

const STOPWORDS = createStopwords();
const ALL_CITIES = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES).map(c => c.toLowerCase()));

export function normalizeAddress(address: string | null | undefined, options: { simplify?: boolean } = {}): string {
    if (!address) return "";

    let cleaned = address.toLowerCase().replace(/ё/g, 'е');
    
    cleaned = cleaned
        .replace(/(\d+)\s*\/\s*(\d+[а-я]?)/g, '$1к$2')
        .replace(/\b(корпус|корп|к)\.?\s*([а-я])\b/g, 'к$2')
        .replace(/\b(строение|стр)\.?\s*([а-я])\b/g, 'с$2')
        .replace(/\b(литер|лит)\.?\s*([а-я])\b/g, 'л$2')
        .replace(/\b(корпус|корп|к)\.?\s*(\d+[а-я]?\b)/g, 'к$2')
        .replace(/\b(строение|стр)\.?\s*(\d+[а-я]?\b)/g, 'с$2')
        .replace(/\b(литер|лит)\.?\s*(\d+[а-я]?\b)/g, 'л$2')
        .replace(/\b(д|дом)\.?\s*(\d+[а-я]?\b)/g, '$2')
        .replace(/\b(\d+)\s+([а-я])\b/g, '$1$2');

    cleaned = cleaned.replace(/\b\d{5,6}\b/g, '');
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' '); 

    let parts = cleaned.split(/\s+/)
        .filter(part => part && !STOPWORDS.has(part));
    
    if (options.simplify) {
        parts = parts.filter(part => {
            if (/^\d+.*$/.test(part) || /^[ксл]\d/.test(part) || /^[ксл][а-я]$/.test(part)) return true;
            if (ALL_CITIES.has(part)) return true;
            if (part.endsWith('ский') || part.endsWith('ской') || part.endsWith('цкий') || part.endsWith('ецкий')) {
                return false;
            }
            return true;
        });
    }
    
    parts.sort((a, b) => a.localeCompare(b, 'ru'));
    
    return parts.join(' ').trim();
}
