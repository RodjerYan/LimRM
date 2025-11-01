import { AggregatedDataRow, FilterOptions, FilterState, SummaryMetrics } from '../types';

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