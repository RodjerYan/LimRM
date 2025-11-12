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

// Memoized function to create a comprehensive set of "noise" words from the app's own knowledge base.
const getComprehensiveStopwords = (() => {
    let comprehensiveSet: Set<string> | null = null;
    
    const baseStopwords = [
        'улица', 'ул', 'проспект', 'пр', 'пр-т', 'проезд', 'переулок', 'пер', 'шоссе', 'ш',
        'бульвар', 'б-р', 'площадь', 'пл', 'набережная', 'наб', 'тупик', 'аллея',
        'дом', 'д', 'корпус', 'корп', 'к', 'строение', 'стр',
        'литер', 'лит', 'владение', 'вл', 'квартира', 'кв', 'офис', 'оф',
        'г', 'область', 'обл', 'край', 'республика', 'респ', 'автономный', 'ао',
        'округ', 'район', 'р-н', 'поселок', 'пос', 'пгт', 'деревня', 'дер',
        'станица', 'ст-ца', 'хутор', 'х'
    ];

    return () => {
        if (comprehensiveSet) {
            return comprehensiveSet;
        }

        const newSet = new Set(baseStopwords);

        // Add all keywords from the region map to the stopwords.
        // This is crucial for removing "брянская", "жуковский", etc., from the fingerprint.
        Object.keys(REGION_KEYWORD_MAP).forEach(key => {
            key.split(/\s+/).forEach(word => {
                if (word.length > 2) newSet.add(word); // Avoid adding short, ambiguous words like 'р'
            });
        });
        
        // Add parts of the standardized region names as well
        Object.values(REGION_KEYWORD_MAP).forEach(value => {
            value.toLowerCase().replace(/—/g, ' ').replace(/[()]/g, '').split(/\s+/).forEach(word => {
                 if (word.length > 3) newSet.add(word);
            });
        });
        
        comprehensiveSet = newSet;
        return comprehensiveSet;
    };
})();


/**
 * Creates a "digital fingerprint" of a Russian address for robust, order-independent matching.
 * This function is the definitive solution to the address matching problem.
 * @param address The raw address string.
 * @returns A normalized, sorted, space-separated string representing the address fingerprint.
 */
export function normalizeAddress(address: string | null | undefined): string {
    if (!address) return "";

    const stopwords = getComprehensiveStopwords();

    // Step 1: Basic cleaning and unifying building numbers/letters.
    let cleaned = address.toLowerCase().replace(/ё/g, 'е');
    // "д 17 а", "дом 17а" -> "д17а". Also handles cases like "д.17/2".
    cleaned = cleaned.replace(/\s*(дом|д|корпус|корп|к|строение|стр|литер|лит)[\s.]*([\w\d/]+)/g, ' д$2');

    // Step 2: Remove postal codes and all punctuation.
    cleaned = cleaned.replace(/\b\d{5,6}\b/g, ' ').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"]/g, ' ');

    // Step 3: Tokenize and filter out all stopwords.
    const significantParts = cleaned.split(/\s+/)
        .map(part => part.trim())
        .filter(part => {
            return part && !stopwords.has(part);
        });

    // Step 4: Sort the remaining significant parts alphabetically.
    significantParts.sort((a, b) => a.localeCompare(b, 'ru'));

    // Step 5: Join to create the final, unique fingerprint.
    return significantParts.join(' ').trim();
}
// --- END OF NEW, ROBUST ADDRESS NORMALIZATION LOGIC ---
