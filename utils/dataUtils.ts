import { AggregatedDataRow, OkbDataRow, FilterOptions, FilterState, SummaryMetrics } from '../types';
import { regionCenters } from './regionCenters';

/**
 * Normalizes a string for comparison by converting to lowercase and removing special characters.
 * @param str The input string.
 * @returns The normalized string.
 */
export const normalizeString = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/["'«»().,]/g, '') // Remove common punctuation
        .replace(/\s+/g, ' ') // Collapse whitespace
        .trim();
};

/**
 * Calculates a simple similarity score between two strings based on common words.
 * @param str1 First string.
 * @param str2 Second string.
 * @returns A number representing the similarity score.
 */
const getSimpleSimilarity = (str1: string, str2: string): number => {
    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    return intersection.size / Math.max(words1.size, words2.size);
};


/**
 * Finds the best matching OKB record for a given client name and city.
 * It prioritizes city matches and then uses string similarity for the name.
 * @param clientName The name of the client to match.
 * @param city The city of the client.
 * @param okbDataWithNormalizedNames An array of OKB data, with a pre-computed 'normalizedName' field.
 * @returns The best matching OkbDataRow or null if no suitable match is found.
 */
export const findBestOkbMatch = (clientName: string, city: string, okbDataWithNormalizedNames: (OkbDataRow & { normalizedName: string })[]): OkbDataRow | null => {
    const normalizedClient = normalizeString(clientName);
    const normalizedCity = normalizeString(city);

    const cityMatches = okbDataWithNormalizedNames.filter(
        okb => normalizeString(okb['Город']) === normalizedCity
    );

    const candidates = cityMatches.length > 0 ? cityMatches : okbDataWithNormalizedNames;

    if (candidates.length === 0) return null;

    let bestMatch: OkbDataRow | null = null;
    let bestScore = 0.5; // Set a threshold to avoid poor matches

    for (const okb of candidates) {
        const score = getSimpleSimilarity(normalizedClient, okb.normalizedName);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = okb;
        }
    }

    return bestMatch;
};


/**
 * Extracts a standardized region name from an OKB data row.
 * It checks the 'Регион' field first, then tries to derive it from the 'Город' field using a lookup table.
 * @param okbMatch The OKB data row.
 * @returns The determined region name or 'Регион не определен'.
 */
export const extractRegionFromOkb = (okbMatch: OkbDataRow): string => {
    const region = okbMatch['Регион'];
    if (region && region.trim().length > 5) {
        // Simple title case formatting
        return region.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    }

    const city = okbMatch['Город']?.toLowerCase().trim();
    if (city && regionCenters[city]) {
        const foundRegion = regionCenters[city];
        return foundRegion.charAt(0).toUpperCase() + foundRegion.slice(1);
    }

    return 'Регион не определен';
};


/**
 * Extracts unique, sorted options for filters from the aggregated data.
 * @param data An array of all aggregated data rows.
 * @returns An object containing arrays of unique RMs, brands, and cities.
 */
export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
    const rms = new Set<string>();
    const brands = new Set<string>();
    const cities = new Set<string>();

    data.forEach(row => {
        rms.add(row.rm);
        brands.add(row.brand);
        cities.add(row.city);
    });

    return {
        rms: Array.from(rms).sort((a, b) => a.localeCompare(b, 'ru')),
        brands: Array.from(brands).sort((a, b) => a.localeCompare(b, 'ru')),
        cities: Array.from(cities).sort((a, b) => a.localeCompare(b, 'ru')),
    };
};

/**
 * Applies the current set of filters to the data.
 * @param data The full dataset.
 * @param filters The current filter state.
 * @returns The filtered array of data rows.
 */
export const applyFilters = (data: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
    return data.filter(row => {
        const rmMatch = !filters.rm || row.rm === filters.rm;
        const brandMatch = filters.brand.length === 0 || filters.brand.includes(row.brand);
        const cityMatch = filters.city.length === 0 || filters.city.includes(row.city);
        return rmMatch && brandMatch && cityMatch;
    });
};


/**
 * Calculates summary metrics from a given set of data rows.
 * @param data The data (usually pre-filtered) to summarize.
 * @returns A SummaryMetrics object or null if data is empty.
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics | null => {
    if (data.length === 0) {
        return null;
    }

    const totals = data.reduce(
        (acc, row) => {
            acc.totalFact += row.fact;
            acc.totalPotential += row.potential;
            acc.totalGrowth += row.growthPotential;
            return acc;
        },
        { totalFact: 0, totalPotential: 0, totalGrowth: 0 }
    );

    const rmGrowth: { [key: string]: number } = data.reduce((acc, row) => {
        if (!acc[row.rm]) {
            acc[row.rm] = 0;
        }
        acc[row.rm] += row.growthPotential;
        return acc;
    }, {} as { [key: string]: number });

    const topPerformingRM = Object.entries(rmGrowth).reduce(
        (top, [name, value]) => {
            return value > top.value ? { name, value } : top;
        },
        { name: 'N/A', value: -1 }
    );
    
    const totalPotentialSum = totals.totalPotential > 0 ? totals.totalPotential : 1;
    const averageGrowthPercentage = (totals.totalGrowth / totalPotentialSum) * 100;

    return {
        ...totals,
        totalClients: data.length,
        averageGrowthPercentage: isNaN(averageGrowthPercentage) ? 0 : averageGrowthPercentage,
        topPerformingRM: topPerformingRM.name === 'N/A' ? { name: 'Нет данных', value: 0 } : topPerformingRM,
    };
};
