import { AggregatedDataRow, FilterOptions, FilterState, SummaryMetrics, OkbDataRow } from '../types';
import { REGION_BY_CITY_MAP, standardizeRegion } from './addressMappings';

/**
 * Normalizes an address string for search and comparison purposes.
 * It converts to lower case, removes punctuation and common address parts,
 * and then tokenizes and sorts the words to make it order-independent.
 * @param str The string to normalize.
 * @returns The normalized, order-independent string.
 */
export const normalizeAddressForSearch = (str: string | undefined | null): string => {
    if (!str) return '';
    const cleaned = str
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/["'«»`.,;:[\]()]/g, ' ')
        .replace(/(^|\s)(ооо|зао|пао|ип|ао)($|\s)/g, ' ')
        .replace(/\b(обл|обл\.|область|р-н|р-н\.|район|респ|респ\.|республика|г|г\.|город|ул|ул\.|улица|д|д\.|дом|к|к\.|корп|корп\.|корпус|кв|кв\.|квартира|стр|стр\.|строение|пом|пом\.|помещение)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Tokenize, sort, and join for order-independent matching
    return cleaned.split(' ').filter(Boolean).sort().join(' ');
};


// For compatibility with older parts of the codebase if needed.
export const normalizeString = normalizeAddressForSearch;

/**
 * Calculates the Levenshtein distance between two strings.
 * This is a measure of the difference between two sequences.
 * @param a The first string.
 * @param b The second string.
 * @returns The Levenshtein distance (number of edits).
 */
export const levenshteinDistance = (a: string, b: string): number => {
    const an = a ? a.length : 0;
    const bn = b ? b.length : 0;
    if (an === 0) return bn;
    if (bn === 0) return an;
    const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
    for (let j = 1; j <= an; j++) matrix[0][j] = j;

    for (let i = 1; i <= bn; i++) {
        for (let j = 1; j <= an; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return matrix[bn][an];
};

/**
 * Finds the best matching record from a list of OKB entries based on name similarity.
 * @param clientName - The name of the client to match from the sales data.
 * @param okbCandidates - An array of potential matches from the OKB data (e.g., from the same region).
 * @returns The best matching OKB row or undefined if no match exceeds the similarity threshold.
 */
export const findBestFuzzyMatchByName = (clientName: string, okbCandidates: OkbDataRow[]): OkbDataRow | undefined => {
    if (!clientName || okbCandidates.length === 0) {
        return undefined;
    }

    const normalizedClientName = normalizeString(clientName);
    let bestMatch: OkbDataRow | undefined = undefined;
    let minDistance = Infinity;
    // Set a dynamic threshold: the name must be at least 70% similar.
    const threshold = Math.floor(normalizedClientName.length * 0.3); 

    for (const okb of okbCandidates) {
        const okbName = okb['Наименование'];
        if (okbName) {
            const normalizedOkbName = normalizeString(okbName);
            const distance = levenshteinDistance(normalizedClientName, normalizedOkbName);
            
            if (distance < minDistance && distance <= threshold) {
                minDistance = distance;
                bestMatch = okb;
            }
        }
    }
    
    return bestMatch;
};


/**
 * Extracts a standardized region name from an OKB data row using a priority system.
 */
export const extractRegionFromOkb = (okbRow: OkbDataRow): string => {
    // Priority 1: Use the 'Регион' column if it's valid
    if (okbRow['Регион']) {
        const standardized = standardizeRegion(okbRow['Регион']);
        if (standardized !== 'Регион не определен') {
            return standardized;
        }
    }
    
    // Priority 2: Infer region from 'Город' column if 'Регион' failed or was absent
    const city = okbRow['Город']?.toLowerCase();
    if (city && REGION_BY_CITY_MAP[city]) {
        return REGION_BY_CITY_MAP[city]; // This already returns a standardized name
    }

    return 'Регион не определен';
};


/**
 * Filters the main dataset based on the current filter state.
 */
export const applyFilters = (allData: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
    return allData.filter(row => {
        const rmMatch = filters.rm ? row.rm === filters.rm : true;
        const brandMatch = filters.brand.length > 0 ? filters.brand.includes(row.brand) : true;
        // FIX: Filter by region instead of city
        const regionMatch = filters.region.length > 0 ? filters.region.includes(row.region) : true;
        return rmMatch && brandMatch && regionMatch;
    });
};

/**
 * Extracts unique values for all filterable columns from the dataset.
 */
export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
    const rms = new Set<string>();
    const brands = new Set<string>();
    const regions = new Set<string>(); // FIX: Extract regions instead of cities

    data.forEach(row => {
        rms.add(row.rm);
        brands.add(row.brand);
        regions.add(row.region);
    });

    return {
        rms: Array.from(rms).sort(),
        brands: Array.from(brands).sort(),
        regions: Array.from(regions).sort(), // FIX: Return sorted regions
    };
};

/**
 * Calculates summary metrics for a given dataset.
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics => {
    const totalFact = data.reduce((sum, row) => sum + row.fact, 0);
    const totalPotential = data.reduce((sum, row) => sum + row.potential, 0);
    const totalGrowth = data.reduce((sum, row) => sum + row.growthPotential, 0);

    const totalClients = data.length;
    const totalActiveClients = data.reduce((sum, row) => sum + (row.clients?.length || 1), 0);
    
    const averageGrowthPercentage = totalPotential > 0 ? (totalGrowth / totalPotential) * 100 : 0;
    
    const rmGrowth: { [key: string]: number } = {};
    data.forEach(row => {
        if (!rmGrowth[row.rm]) rmGrowth[row.rm] = 0;
        rmGrowth[row.rm] += row.growthPotential;
    });

    const topPerformingRM = Object.entries(rmGrowth).reduce(
        (top, [name, value]) => (value > top.value ? { name, value } : top),
        { name: 'N/A', value: -1 }
    );

    return {
        totalFact, totalPotential, totalGrowth, totalClients, totalActiveClients,
        averageGrowthPercentage, topPerformingRM,
    };
};