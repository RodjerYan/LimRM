
import { AggregatedDataRow, FilterOptions, FilterState, SummaryMetrics, OkbDataRow } from '../types';
import { regionCenters } from './regionCenters';

/**
 * Normalizes a string by converting it to lower case, removing extra spaces,
 * and standardizing common company legal forms for better matching.
 * @param str The string to normalize.
 * @returns The normalized string.
 */
export const normalizeString = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/["'«»`]/g, '') // remove quotes
        .replace(/\s+/g, ' ') // collapse whitespace
        .replace(/ё/g, 'е')
        .replace(/(^|\s)(ооо|зао|пао|ип|ао)($|\s)/g, ' ') // remove legal forms
        .trim();
};


/**
 * Compares two strings using a simplified similarity metric (Jaro-Winkler-like).
 * This is a basic implementation for demonstration purposes.
 * @param s1 The first string.
 * @param s2 The second string.
 * @returns A similarity score between 0 and 1.
 */
const stringSimilarity = (s1: string, s2: string): number => {
    // Basic Jaro-Winkler logic (simplified)
    let m = 0;
    const s1_len = s1.length;
    const s2_len = s2.length;
    if (s1_len === 0 || s2_len === 0) return 0;

    const match_distance = Math.floor(Math.max(s1_len, s2_len) / 2) - 1;
    const s1_matches = new Array(s1_len).fill(false);
    const s2_matches = new Array(s2_len).fill(false);

    for (let i = 0; i < s1_len; i++) {
        const start = Math.max(0, i - match_distance);
        const end = Math.min(i + match_distance + 1, s2_len);
        for (let j = start; j < end; j++) {
            if (!s2_matches[j] && s1[i] === s2[j]) {
                s1_matches[i] = true;
                s2_matches[j] = true;
                m++;
                break;
            }
        }
    }

    if (m === 0) return 0;

    let t = 0;
    let k = 0;
    for (let i = 0; i < s1_len; i++) {
        if (s1_matches[i]) {
            while (!s2_matches[k]) k++;
            if (s1[i] !== s2[k]) t++;
            k++;
        }
    }
    t /= 2;

    const jaro = (m / s1_len + m / s2_len + (m - t) / m) / 3;
    
    // Winkler bonus
    let p = 0.1;
    let l = 0;
    const max_l = 4;
    while (l < max_l && s1[l] === s2[l]) {
        l++;
    }
    
    return jaro + l * p * (1 - jaro);
};


/**
 * Finds the best matching record from the OKB data for a given client name and city.
 * @param clientName The name of the client from the main data file.
 * @param city The city of the client.
 * @param okbData The array of OKB records with pre-normalized names.
 * @returns The best matching OKB row or null if no good match is found.
 */
export const findBestOkbMatch = (clientName: string, city: string, okbData: (OkbDataRow & { normalizedName: string })[]): OkbDataRow | null => {
    const normalizedClientName = normalizeString(clientName);
    const lowercasedCity = city.toLowerCase();
    
    let bestMatch: OkbDataRow | null = null;
    let maxScore = 0.8; // Set a threshold to avoid bad matches

    const potentialMatches = okbData.filter(okb =>
        okb['Город']?.toLowerCase() === lowercasedCity || okb['Юридический адрес']?.toLowerCase().includes(lowercasedCity)
    );

    for (const okb of potentialMatches) {
        const score = stringSimilarity(normalizedClientName, okb.normalizedName);
        if (score > maxScore) {
            maxScore = score;
            bestMatch = okb;
        }
    }
    
    return bestMatch;
};


/**
 * Extracts a standardized region name from an OKB data row using a multi-step approach.
 * @param okbRow The OKB data row.
 * @returns The determined region name or a default value.
 */
export const extractRegionFromOkb = (okbRow: OkbDataRow): string => {
    const formatRegion = (region: string) => {
        const cleaned = region.toLowerCase()
            .replace('г.', 'город')
            .replace('обл.', 'область')
            .replace('респ.', 'республика')
            .trim();
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    };

    // 1. Direct check of the 'Регион' column
    if (okbRow['Регион'] && okbRow['Регион'].trim().length > 3) {
        return formatRegion(okbRow['Регион']);
    }

    // 2. Search for a known region name within the legal address
    const address = okbRow['Юридический адрес']?.toLowerCase() || '';
    if (address) {
        const allRegions = Object.values(regionCenters);
        const sortedRegions = [...new Set(allRegions)].sort((a, b) => b.length - a.length);
        
        for (const region of sortedRegions) {
            if (address.includes(region)) {
                return formatRegion(region);
            }
            const regionAdjective = region.split(' ')[0];
            if (regionAdjective.length > 4 && address.includes(regionAdjective)) {
                 return formatRegion(region);
            }
        }
    }
    
    // 3. Fallback to using the 'Город' column and the region center map
    const city = okbRow['Город']?.toLowerCase();
    if (city && regionCenters[city]) {
        return formatRegion(regionCenters[city]);
    }

    return 'Регион не определен';
};


/**
 * Filters the main dataset based on the current filter state.
 * @param allData The complete array of aggregated data.
 * @param filters The current filter settings.
 * @returns A new array containing only the rows that match the filters.
 */
export const applyFilters = (allData: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
    return allData.filter(row => {
        const rmMatch = filters.rm ? row.rm === filters.rm : true;
        const brandMatch = filters.brand.length > 0 ? filters.brand.includes(row.brand) : true;
        const regionMatch = filters.region.length > 0 ? filters.region.includes(row.region) : true;
        return rmMatch && brandMatch && regionMatch;
    });
};

/**
 * Extracts unique values for all filterable columns from the dataset.
 * @param data The array of aggregated data.
 * @returns An object containing arrays of unique RMs, brands, and regions.
 */
export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
    const rms = new Set<string>();
    const brands = new Set<string>();
    const regions = new Set<string>();

    data.forEach(row => {
        rms.add(row.rm);
        brands.add(row.brand);
        regions.add(row.region);
    });

    return {
        rms: Array.from(rms).sort(),
        brands: Array.from(brands).sort(),
        regions: Array.from(regions).sort(),
    };
};

/**
 * Calculates summary metrics for a given dataset.
 * @param data The array of (usually filtered) aggregated data.
 * @returns An object with calculated summary metrics.
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics => {
    const totalFact = data.reduce((sum, row) => sum + row.fact, 0);
    const totalPotential = data.reduce((sum, row) => sum + row.potential, 0);
    const totalGrowth = data.reduce((sum, row) => sum + row.growthPotential, 0);

    const totalClients = data.length; // Now represents number of groups
    const totalActiveClients = data.reduce((sum, row) => sum + (row.clients?.length || 1), 0);
    
    const averageGrowthPercentage = totalPotential > 0 ? (totalGrowth / totalPotential) * 100 : 0;
    
    const rmGrowth: { [key: string]: number } = {};
    data.forEach(row => {
        if (!rmGrowth[row.rm]) {
            rmGrowth[row.rm] = 0;
        }
        rmGrowth[row.rm] += row.growthPotential;
    });

    const topPerformingRM = Object.entries(rmGrowth).reduce(
        (top, [name, value]) => (value > top.value ? { name, value } : top),
        { name: 'N/A', value: -1 }
    );

    return {
        totalFact,
        totalPotential,
        totalGrowth,
        totalClients,
        totalActiveClients,
        averageGrowthPercentage,
        topPerformingRM,
    };
};
