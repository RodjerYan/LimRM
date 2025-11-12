import {
  AggregatedDataRow,
  FilterState,
  FilterOptions,
  SummaryMetrics,
  OkbDataRow,
} from '../types';
import { REGION_KEYWORD_MAP } from './addressMappings';

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
 * Creates a comprehensive set of stopwords ONCE from static lists and dynamic app data.
 * This is a critical optimization, ensuring the "heavy lifting" is done only one time.
 * @returns A Set containing all words to be ignored during address normalization.
 */
const generateStopwords = (): Set<string> => {
    const staticStopwords = [
        'улица', 'ул', 'проспект', 'пр', 'пр-т', 'проезд', 'пр-д', 'переулок', 'пер', 'шоссе', 'ш',
        'бульвар', 'б-р', 'площадь', 'пл', 'набережная', 'наб', 'тупик', 'аллея', 'линия',
        'тракт', 'мкр', 'микрорайон', 'квартал', 'кв-л', 'территория', 'тер', 'городок',
        'дом', 'д', 'корпус', 'корп', 'к', 'строение', 'стр', 'литер', 'лит', 'вл', 'владение',
        'город', 'г', 'поселок', 'пос', 'пгт', 'деревня', 'дер', 'село', 'с', 'хутор', 'х',
        'станица', 'ст-ца', 'ст', 'аул', 'рп', 'рабочий', 'снт', 'с/п', 'го',
        'область', 'обл', 'край', 'республика', 'респ', 'автономный', 'округ', 'ао', 'автономная',
        'район', 'р-н', 'муниципальный',
        'квартира', 'кв', 'офис', 'оф', 'помещение', 'пом', 'комната', 'комн',
        'российская', 'федерация', 'россия', 'рф',
        'народная', 'еврейская'
    ];

    const stopwords = new Set(staticStopwords);

    // Dynamically add all keywords used for region mapping to the stopwords.
    // This makes the algorithm "smarter" by using the app's own knowledge base.
    // It will add words like "брянская", "смоленская", "жуковский", etc.
    Object.keys(REGION_KEYWORD_MAP).forEach(key => {
        key.split(/\s+/).forEach(word => stopwords.add(word.replace(/[-.]/g, '')));
    });

    return stopwords;
};

// Memoize the generated stopwords so the function is only executed once per app lifecycle.
const ALL_STOPWORDS = generateStopwords();


/**
 * Performs deep normalization on an address string for robust, order-independent matching.
 * This "hybrid" algorithm uses targeted regex replacements before tokenization to handle
 * complex cases like district names, ensuring a highly reliable "digital fingerprint" for each address.
 * @param address The raw address string.
 * @returns A normalized, order-independent string for high-match-rate lookups.
 */
export function normalizeAddress(address: string | null | undefined): string {
    if (!address) return "";

    let cleaned = address.toLowerCase().replace(/ё/g, 'е');

    // Step 1: Targeted Phrase Removal - Remove administrative units like "Жуковский р-н" before tokenizing.
    // This prevents parts of district names from being confused with city names.
    cleaned = cleaned.replace(/[\w-]+\s+(р-н|район|сельское поселение|с\/п|городской округ|го)\b/g, ' ');
    
    // Step 2: Unify building/structure numbers to a consistent format AND remove their prefixes.
    cleaned = cleaned
        .replace(/\b(дом|д|корпус|корп|к|строение|стр|литер|лит)\.?\s*([\d]+[а-я]?\b)/g, ' $2 ')
        .replace(/\b(\d+)\s+([а-я])\b/g, '$1$2'); // "17 а" -> "17а"

    // Step 3: Remove postal codes and all punctuation.
    cleaned = cleaned.replace(/\b\d{5,6}\b/g, ' ');
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"]/g, ' ');

    // Step 4: Tokenize and remove all stopwords from the comprehensive, dynamically-generated list.
    const parts = cleaned.split(/\s+/)
        .filter(part => {
             // Keep the part if it's not empty and not in our massive stopword list.
             return part && !ALL_STOPWORDS.has(part);
        });
    
    // Step 5: Sort the remaining significant parts to make the fingerprint order-independent.
    parts.sort((a, b) => a.localeCompare(b, 'ru'));
    
    return parts.join(' ').trim();
}
// --- END OF NEW, ROBUST ADDRESS NORMALIZATION LOGIC ---