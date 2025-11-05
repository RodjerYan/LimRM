import { AggregatedDataRow, FilterState, FilterOptions, SummaryMetrics } from '../types';

export const applyFilters = (data: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
    return data.filter(row => {
        const rmMatch = !filters.rm || row.rm === filters.rm;
        
        const brandMatch = filters.brand.length === 0 || 
            (row.brand && filters.brand.some(b => row.brand.toLowerCase().includes(b.toLowerCase())));

        const cityMatch = filters.city.length === 0 || 
            (row.city && filters.city.some(c => row.city.toLowerCase().includes(c.toLowerCase())));

        return rmMatch && brandMatch && cityMatch;
    });
};

export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
    const rms = new Set<string>();
    const brands = new Set<string>();
    const cities = new Set<string>();

    data.forEach(row => {
        if (row.rm) rms.add(row.rm);
        if (row.brand) {
            row.brand.split(',').forEach(b => {
                const trimmed = b.trim();
                if(trimmed) brands.add(trimmed);
            });
        }
        if (row.city) {
            row.city.split(',').forEach(c => {
                const trimmed = c.trim();
                if(trimmed) cities.add(trimmed);
            });
        }
    });

    return {
        rms: Array.from(rms).sort(),
        brands: Array.from(brands).sort(),
        cities: Array.from(cities).sort(),
    };
};

export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics | null => {
    if (data.length === 0) {
        return null;
    }

    const metrics = data.reduce((acc, row) => {
        acc.totalFact += row.fact;
        acc.totalPotential += row.potential;
        acc.totalGrowth += row.growthPotential;
        acc.totalClients += row.potentialClients.length;
        acc.totalActiveClients += row.currentClients.length;
        return acc;
    }, { totalFact: 0, totalPotential: 0, totalGrowth: 0, totalClients: 0, totalActiveClients: 0 });

    const totalGrowthPercentage = data.reduce((sum, row) => sum + row.growthPercentage, 0);
    const averageGrowthPercentage = data.length > 0 ? totalGrowthPercentage / data.length : 0;

    const topPerformingRM = data.reduce((top, row) => {
        if (row.growthPotential > top.value) {
            return { name: row.rm, value: row.growthPotential };
        }
        return top;
    }, { name: 'N/A', value: -Infinity });

    return { 
        ...metrics, 
        averageGrowthPercentage, 
        topPerformingRM: topPerformingRM.value === -Infinity ? { name: 'N/A', value: 0 } : topPerformingRM 
    };
};
