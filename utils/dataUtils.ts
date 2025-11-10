// utils/dataUtils.ts

// FIX: This file's placeholder content was causing multiple build errors. This new implementation provides the necessary data utility functions required by other components, such as App.tsx and the processing worker. It includes functions for filtering data, extracting filter options, calculating summary metrics, and normalizing addresses for consistent matching.
import {
  AggregatedDataRow,
  FilterState,
  FilterOptions,
  SummaryMetrics,
  OkbDataRow,
} from '../types';

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
 * A robust helper to find an address value within an OKB data row.
 * It searches for keys in a prioritized order.
 * @param row The OKB data row object.
 * @returns The found address string or an empty string.
 */
export const getOkbAddress = (row: OkbDataRow | null | undefined): string => {
  if (!row) return '';
  const rowKeys = Object.keys(row);
  const prioritizedKeys = ['юридический адрес', 'адрес'];

  for (const pKey of prioritizedKeys) {
    const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === pKey);
    if (foundKey && row[foundKey]) return String(row[foundKey]);
  }

  const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
  if (addressKey && row[addressKey]) return String(row[addressKey]);

  const fallbackKey = rowKeys.find(
    key => key.toLowerCase().includes('город') || key.toLowerCase().includes('регион')
  );
  if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);

  return '';
};

/**
 * "Intelligently" normalizes an address string for robust, high-speed matching.
 * This is the core fix for matching addresses between the sales file and the OKB, ensuring green dots appear.
 * @param address The raw address string.
 * @returns A normalized string, sorted by words, suitable for high-match-rate lookups.
 */
export const normalizeAddressForSearch = (address: string | null | undefined): string => {
  if (!address) return '';

  const cleanedAddress = address
    .toLowerCase()
    .replace(/ё/g, 'е')
    // STEP 1: Aggressively remove everything that is not a Cyrillic letter or a space.
    // This removes numbers, punctuation, building letters (if they are Latin), hyphens, etc.
    .replace(/[^а-я\s]/g, '')
    // STEP 2: Now that we have only words, remove common address "stop words".
    // This includes single-letter words which are likely building/corpus identifiers.
    .replace(/\b(г|ул|улица|пр|проспект|д|дом|корп|корпус|обл|область|респ|республика|край|р-н|район|пос|поселок|село|деревня|станица|ст-ца|мкр|микрорайон|кв|квартира|а|б|в|к)\b/g, '')
    // STEP 3: Collapse multiple spaces into one.
    .replace(/\s+/g, ' ')
    .trim();

  // STEP 4: Sort the remaining significant words to handle different ordering.
  return cleanedAddress.split(' ').filter(Boolean).sort().join(' ');
};