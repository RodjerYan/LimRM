
import {
  AggregatedDataRow,
  FilterState,
  FilterOptions,
  SummaryMetrics,
  OkbDataRow,
} from '../types';
import { REGION_KEYWORD_MAP, REGION_BY_CITY_MAP } from './addressMappings';
import { REGION_BY_CITY_WITH_INDEXES } from './regionMap';

/**
 * Normalizes an RM name for consistent matching.
 * Removes initials, punctuation, and case differences.
 * e.g. "Ivanov I.I." -> "ivanov"
 */
export const normalizeRmNameForMatching = (str: string): string => {
    if (!str) return '';
    let clean = str.toLowerCase().trim();
    // Split by spaces or dots to get the surname (assuming surname is first)
    const surname = clean.split(/[\s.]+/)[0];
    return surname.replace(/[^a-zа-я0-9]/g, '');
};

/**
 * Applies the current filter state to the aggregated data.
 * @param data The full array of aggregated data rows.
 * @param filters The current filter state from the UI.
 * @returns A new array containing only the rows that match the filters.
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
 * Extracts all unique values for filter dropdowns from the aggregated data.
 * @param data The full array of aggregated data rows.
 * @returns An object containing arrays of unique RMs, brands, packagings, and regions.
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
 * Calculates summary metrics for a given set of data (usually filtered data).
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics | null => {
  if (data.length === 0) {
    return null;
  }

  // Для подсчета уникальных ТТ по всей выборке
  const globalUniqueKeys = new Set<string>();
  // Для подсчета уникальных ТТ внутри каждого канала
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

  // Преобразуем Sets в количество
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


/**
 * A robust helper to find a value in a row by searching for keywords in its keys.
 */
export const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);

    // 1. Priority: Exact Match
    for (const keyword of keywords) {
        const k = keyword.toLowerCase().trim();
        const exactKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === k);
        if (exactKey && row[exactKey] != null) return String(row[exactKey]);
    }

    // 2. Priority: Word Boundary Match
    for (const keyword of keywords) {
        const k = keyword.toLowerCase().trim();
        const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^а-яёa-z0-9])${escapedK}([^а-яёa-z0-9]|$)`, 'i');
        const boundaryKey = rowKeys.find(rKey => regex.test(rKey.toLowerCase().trim()));
        if (boundaryKey && row[boundaryKey] != null) return String(row[boundaryKey]);
    }

    // 3. Fallback: Loose Partial Match
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword.toLowerCase().trim()));
        if (foundKey && row[foundKey] != null) {
            return String(row[foundKey]);
        }
    }
    
    return '';
};


/**
 * A robust helper function to find an address value within a data row.
 */
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
    
    const fallbackKey = rowKeys.find(key => 
        (key.toLowerCase().includes('город') || key.toLowerCase().includes('регион')) && 
        !key.toLowerCase().includes('субъект')
    );
    if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);

    return null;
};

// --- UNIVERSAL REGION MATCHER GENERATOR ---
const REGION_MATCHER_LIST = Object.values(REGION_KEYWORD_MAP).reduce((acc, regionName) => {
    const lowerName = regionName.toLowerCase();
    let root = lowerName
        .replace(/\bобласть\b/g, '')
        .replace(/\bкрай\b/g, '')
        .replace(/\bреспублика\b/g, '')
        .replace(/\bавтономный округ\b/g, '')
        .replace(/\bао\b/g, '')
        .replace(/\bг\.\s*/g, '') 
        .replace(/[()]/g, '')     
        .trim();
    if (root.length > 2) {
         if (!acc.some(item => item.root === root)) {
             acc.push({ root, regionName });
         }
    }
    return acc;
}, [] as { root: string, regionName: string }[]);

REGION_MATCHER_LIST.sort((a, b) => b.root.length - a.root.length);


/**
 * Recovers a standardized region name from a potentially "dirty" string.
 */
export const recoverRegion = (dirtyString: string, cityHint: string): string => {
    const lowerDirty = dirtyString 
        ? dirtyString.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() 
        : '';
    if (!lowerDirty && !cityHint) return 'Регион не определен';
    if (lowerDirty) {
        for (const [key, value] of Object.entries(REGION_KEYWORD_MAP)) {
             if (lowerDirty.includes(key)) return value;
        }
        for (const { root, regionName } of REGION_MATCHER_LIST) {
            if (lowerDirty.includes(root)) {
                return regionName;
            }
        }
    }
    let lowerCity = cityHint ? cityHint.toLowerCase().trim() : '';
    if (lowerCity) {
        lowerCity = lowerCity.replace(/^(г\.|город|пгт|пос\.|с\.|село|дер\.|д\.)\s*/, '').trim();
        lowerCity = lowerCity.replace(/ё/g, 'е');
    }
    if (lowerCity && REGION_BY_CITY_MAP[lowerCity]) {
        return REGION_BY_CITY_MAP[lowerCity];
    }
    return 'Регион не определен';
};

/**
 * Creates a comprehensive set of stopwords for address normalization.
 */
const createStopwords = (): Set<string> => {
    const genericStopwords = [
        'улица', 'ул', 'проспект', 'пр', 'пр-т', 'пр-кт', 'проезд', 'пр-д', 'переулок', 'пер', 'шоссе', 'ш', 
        'бульвар', 'б-р', 'площадь', 'пл', 'набережная', 'наб', 'тупик', 'аллея', 'линия',
        'город', 'г', 'поселок', 'пос', 'пгт', 'деревня', 'дер', 'село', 'с', 'хутор', 'х', 
        'станица', 'ст-ца', 'аул', 'рп', 'рабочий', 'поселение', 'сельское', 'городское',
        'область', 'обл', 'край', 'республика', 'респ', 'автономный', 'округ', 'ао', 'район', 'р-н', 'р', 'н',
        'кыргызстан', 'киргизия', 'кыргызская', 'казахстан', 'россия', 'рф', 'беларусь', 'белоруссия',
        'таджикистан', 'узбекистан', 'туркменистан', 'армения', 'азербайджан', 'молдова', 'грузия',
        'дом', 'корпус', 'корп', 'строение', 'стр', 'литер', 'лит',
        'квартира', 'кв', 'офис', 'оф', 'помещение', 'пом', 'комната', 'комн', 'мкр', 'микрорайон', 'автодорога'
    ];
    const regionNameParts = new Set<string>();
    const allCities = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES));
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
const ALL_CITIES = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES));

/**
 * Performs deep normalization on an address string for robust matching.
 */
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
