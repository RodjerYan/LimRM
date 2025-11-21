
import {
  AggregatedDataRow,
  FilterState,
  FilterOptions,
  SummaryMetrics,
} from '../types';
import { REGION_KEYWORD_MAP } from './addressMappings';
import { REGION_BY_CITY_WITH_INDEXES } from './regionMap';

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
    const regionMatch = filters.region.length === 0 || filters.region.includes(row.region);
    return rmMatch && brandMatch && regionMatch;
  });
};

/**
 * Extracts all unique values for filter dropdowns from the aggregated data.
 * @param data The full array of aggregated data rows.
 * @returns An object containing arrays of unique RMs, brands, and regions.
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
 * Calculates summary metrics for a given set of data (usually filtered data).
 * NOTE: The `totalActiveClients` count here is based on deduplicated client names within groups.
 * The final count displayed to the user should come from the length of the full `plottableActiveClients` array for accuracy.
 * @param data The array of data rows to calculate metrics for.
 * @returns A SummaryMetrics object, or null if the input data is empty.
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
      // This counts unique clients *within the aggregated groups*, which can differ from total file rows.
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
    totalClients: data.length, // Total number of groups
    totalActiveClients: metrics.totalActiveClients, // This count is based on unique addresses per group.
    averageGrowthPercentage,
    topPerformingRM,
  };
};


/**
 * A robust helper to find a value in a row by searching for keywords in its keys.
 * @param row The data row object.
 * @param keywords An array of lowercase keywords to search for.
 * @returns The found string value or an empty string.
 */
export const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword));
        if (foundKey && row[foundKey] != null) { // Check for null and undefined
            return String(row[foundKey]);
        }
    }
    return '';
};


/**
 * A robust helper function to find an address value within a data row.
 * It searches for keys in a prioritized order, using both exact and partial matches.
 * This is the centralized, single source of truth for finding an address.
 * @param row The data row object.
 * @returns The found address string or null.
 */
export const findAddressInRow = (row: { [key: string]: any }): string | null => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    // Prioritized, exact matches first for reliability
    const prioritizedKeys = ['адрес тт limkorm', 'юридический адрес', 'адрес'];

    for (const pKey of prioritizedKeys) {
        // Find a key that matches exactly when lowercased and trimmed
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }

    // Fallback to partial match if no exact match is found
    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    
    // Last resort fallback
    const fallbackKey = rowKeys.find(key => key.toLowerCase().includes('город') || key.toLowerCase().includes('регион'));
    if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);

    return null;
};

// --- START OF NEW, ROBUST ADDRESS NORMALIZATION LOGIC ---

/**
 * Creates a comprehensive set of stopwords for address normalization.
 * This function now intelligently filters out known city names to prevent them from
 * being incorrectly removed from addresses, which was a critical bug.
 * @returns A Set of lowercase stopword strings.
 */
const createStopwords = (): Set<string> => {
    const genericStopwords = [
        // Типы улиц
        'улица', 'ул', 'проспект', 'пр', 'пр-т', 'пр-кт', 'проезд', 'пр-д', 'переулок', 'пер', 'шоссе', 'ш', 
        'бульвар', 'б-р', 'площадь', 'пл', 'набережная', 'наб', 'тупик', 'аллея', 'линия',
        // Типы населенных пунктов
        'город', 'г', 'поселок', 'пос', 'пгт', 'деревня', 'дер', 'село', 'с', 'хутор', 'х', 
        'станица', 'ст-ца', 'аул', 'рп', 'рабочий', 'поселение', 'сельское', 'городское',
        // Типы административных делений
        'область', 'обл', 'край', 'республика', 'респ', 'автономный', 'округ', 'ао', 'район', 'р-н', 'р', 'н',
        // Страны (Explicitly added to ensure cross-matching between cache and file versions)
        'кыргызстан', 'киргизия', 'кыргызская', 'казахстан', 'россия', 'рф', 'беларусь', 'белоруссия',
        'таджикистан', 'узбекистан', 'туркменистан', 'армения', 'азербайджан', 'молдова', 'грузия',
        // Обозначения зданий - Handled by regex, removing from generic stopwords to avoid side-effects
        'дом', 'корпус', 'корп', 'строение', 'стр', 'литер', 'лит',
        // Прочее
        'квартира', 'кв', 'офис', 'оф', 'помещение', 'пом', 'комната', 'комн', 'мкр', 'микрорайон', 'автодорога'
    ];

    const regionNameParts = new Set<string>();
    // Create a Set of all known city names for fast lookups.
    const allCities = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES));

    // Process keywords used for region identification.
    for (const item of Object.entries(REGION_KEYWORD_MAP)) {
        // Analyze both the keyword (e.g., 'брянская обл') and its value (e.g., 'Брянская область')
        [item[0], item[1]].forEach(text => {
            text.toLowerCase()
                .replace(/[^а-я\s]/g, '') // Keep only Cyrillic letters and spaces
                .split(/\s+/)
                // CRITICAL FIX: Add a word to stopwords ONLY if it's not a known city name.
                // This prevents "брянск" from being removed from addresses.
                .filter(word => word.length > 2 && !allCities.has(word)) 
                .forEach(word => regionNameParts.add(word));
        });
    }

    return new Set([...genericStopwords, ...Array.from(regionNameParts)]);
};

const STOPWORDS = createStopwords();
const ALL_CITIES = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES));

/**
 * Performs deep normalization on an address string for robust, order-independent matching.
 * This multi-stage "digital fingerprint" algorithm creates a consistent key for an address,
 * regardless of major variations in its original formatting.
 * @param address The raw address string.
 * @param options An object with options, e.g., { simplify: true } to remove district names.
 * @returns A normalized, order-independent string for high-match-rate lookups.
 */
export function normalizeAddress(address: string | null | undefined, options: { simplify?: boolean } = {}): string {
    if (!address) return "";

    let cleaned = address.toLowerCase().replace(/ё/g, 'е');
    
    // Step 1: Specific pattern replacements for building/structure identifiers. This is CRITICAL.
    // This runs before general punctuation removal to preserve structure.
    cleaned = cleaned
        // "10/2", "10 / 2а" -> "10к2", "10к2а"
        .replace(/(\d+)\s*\/\s*(\d+[а-я]?)/g, '$1к$2')
        // "корпус А", "корп. а" -> "ка"
        .replace(/\b(корпус|корп|к)\.?\s*([а-я])\b/g, 'к$2')
        // "строение Б", "стр-е б" -> "сб"
        .replace(/\b(строение|стр)\.?\s*([а-я])\b/g, 'с$2')
         // "литер В" -> "лв"
        .replace(/\b(литер|лит)\.?\s*([а-я])\b/g, 'л$2')
        // "корпус 1", "к.1" -> "к1"
        .replace(/\b(корпус|корп|к)\.?\s*(\d+[а-я]?\b)/g, 'к$2')
        // "строение 2", "стр2" -> "с2"
        .replace(/\b(строение|стр)\.?\s*(\d+[а-я]?\b)/g, 'с$2')
        // "литер 3" -> "л3"
        .replace(/\b(литер|лит)\.?\s*(\d+[а-я]?\b)/g, 'л$2')
        // "дом 5", "д.5" -> "5". Also handles "д 5а" -> "5а".
        .replace(/\b(д|дом)\.?\s*(\d+[а-я]?\b)/g, '$2')
        // "17 а" -> "17а" (unifies house number with its letter)
        .replace(/\b(\d+)\s+([а-я])\b/g, '$1$2');


    // Step 2: Replace all remaining punctuation and hyphens with spaces. This helps with tokenization.
    cleaned = cleaned.replace(/\b\d{5,6}\b/g, ''); // Remove postal codes
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' '); 

    // Step 3: Tokenize and remove all stopwords.
    let parts = cleaned.split(/\s+/)
        .filter(part => part && !STOPWORDS.has(part));
    
    // Step 4 (Optional): Simplify by removing district-like adjectives.
    if (options.simplify) {
        parts = parts.filter(part => {
            // Keep if it's a number/structure identifier.
            if (/^\d+.*$/.test(part) || /^[ксл]\d/.test(part) || /^[ксл][а-я]$/.test(part)) return true;
            // Keep if it's a known city
            if (ALL_CITIES.has(part)) return true;
            // Discard if it looks like a district/region adjective and is NOT a city
            if (part.endsWith('ский') || part.endsWith('ской') || part.endsWith('цкий') || part.endsWith('ецкий')) {
                return false;
            }
            return true;
        });
    }
    
    // Step 5: Sort the remaining significant parts to make it order-independent.
    parts.sort((a, b) => a.localeCompare(b, 'ru'));
    
    return parts.join(' ').trim();
}
