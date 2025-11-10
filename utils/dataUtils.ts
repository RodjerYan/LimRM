import {
  AggregatedDataRow,
  FilterState,
  FilterOptions,
  SummaryMetrics,
  OkbDataRow,
} from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
// FIX: Import the city normalization map to unify address processing logic.
import { CITY_NORMALIZATION_MAP } from './addressMappings';

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
    totalActiveClients: metrics.totalActiveClients, // Total number of individual clients
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


// --- Super-aggressive address normalization ---

// Create these lists once outside the function for performance.
const regionNameWords = russiaRegionsGeoJSON.features.flatMap(f => 
    (f.properties?.name || '').toLowerCase().split(/[\s-]+/)
);
const uniqueRegionWords = [...new Set(regionNameWords)];

const baseStopWords = [
    'г', 'ул', 'улица', 'пр', 'проспект', 'д', 'дом', 'корп', 'корпус', 'обл', 'область', 'респ', 'республика', 'край', 
    'р-н', 'район', 'пос', 'поселок', 'село', 'деревня', 'станица', 'ст-ца', 'мкр', 'микрорайон', 'кв', 'квартира', 
    'а', 'б', 'в', 'к', 'стр', 'строение', 'лит', 'литера', 'пер', 'переулок', 'ш', 'шоссе', 'пл', 'площадь', 'наб', 
    'набережная', 'бульвар', 'б-р', 'проезд', 'пр-д', 'ао', 'автономный', 'округ', 'федерации', 'народная'
];

const allStopWords = [...new Set([...baseStopWords, ...uniqueRegionWords])];
const stopWordsRegex = new RegExp(`\\b(${allStopWords.join('|')})\\b`, 'g');


/**
 * The unified, "master" function for normalizing addresses for robust matching.
 * This is the centralized, single source of truth for creating a matchable address key.
 * It follows a multi-step process to handle real-world data inconsistencies.
 * @param address The raw address string.
 * @returns A normalized string, suitable for high-match-rate lookups.
 */
export const normalizeAddressForSearch = (address: string | null | undefined): string => {
  if (!address) return '';

  let normalized = address.toLowerCase().replace(/ё/g, 'е');

  // STEP 1: Apply alias normalization FIRST to correct common typos and abbreviations.
  // This uses the same logic that was previously isolated elsewhere, unifying the approach.
  for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
      // Use a regex to replace whole words/phrases to avoid partial replacements.
      const regex = new RegExp(`\\b${alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g');
      normalized = normalized.replace(regex, canonical);
  }

  const cleanedAddress = normalized
    // STEP 2: Replace common punctuation with spaces to handle cases like "31/1" or "юго-западная".
    .replace(/[,.;:()/"'-]/g, ' ')
    // STEP 3: Specifically find and remove 5 or 6-digit numbers (postal codes) to prevent mismatches.
    .replace(/\b\d{5,6}\b/g, '')
    // STEP 4: Intelligently add spaces between numbers and letters to normalize building/corpus numbers.
    // E.g., "дом25к2" -> "дом 25 к 2", "25к2" -> "25 к 2".
    .replace(/(\d)([а-яa-z])/g, '$1 $2')
    .replace(/([а-яa-z])(\d)/g, '$1 $2')
    // STEP 5: Remove the massively expanded list of stop words, including all region name components.
    .replace(stopWordsRegex, '')
    // STEP 6: Remove any remaining non-alphanumeric characters.
    .replace(/[^а-яa-z0-9\s]/g, '')
    // STEP 7: Collapse multiple spaces that may have formed during replacements into one.
    .replace(/\s+/g, ' ')
    .trim();

  // STEP 8: Sort the remaining significant words and numbers to handle different ordering.
  // This makes "Ленина 10" and "10 Ленина" identical.
  return cleanedAddress.split(' ').filter(Boolean).sort().join(' ');
};