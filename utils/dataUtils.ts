import { AggregatedDataRow, FilterOptions, Metrics } from "../types";


export function getUniqueFilterOptions(data: AggregatedDataRow[]): FilterOptions {
    const rms = [...new Set(data.map(item => item.rm))].sort();
    const brands = [...new Set(data.map(item => item.brand))].sort();
    const cities = [...new Set(data.map(item => item.city))].sort();
    return { rms, brands, cities };
}

// --- Metrics Calculation ---

export function calculateMetrics(data: AggregatedDataRow[]): Metrics {
    const totalFact = data.reduce((sum, item) => sum + item.fact, 0);
    const totalPotential = data.reduce((sum, item) => sum + item.potential, 0);
    const totalGrowthPotential = totalPotential - totalFact;
    const totalGrowthRate = totalFact > 0 ? (totalGrowthPotential / totalFact) * 100 : 0;
    const avgPlanIncrease = data.length > 0
        ? data.reduce((sum, item) => sum + item.growthRate, 0) / data.length
        : 0;

    return { totalFact, totalPotential, totalGrowthPotential, totalGrowthRate, avgPlanIncrease };
}

export function formatLargeNumber(num: number): string {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(2) + ' млн';
    if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(2) + ' тыс.';
    return num.toFixed(2);
}