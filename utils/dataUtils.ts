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
    
    // "Новый План" является ключевой метрикой. Если он не рассчитан, используем факт.
    const totalNewPlan = data.reduce((sum, item) => sum + (item.newPlan || item.fact), 0);
    
    // "Потенциал Роста" теперь строго основан на разнице между новым планом и фактом.
    const totalGrowthPotential = totalNewPlan - totalFact;
    
    // "Средний Рост" также рассчитывается на основе этой разницы, что обеспечивает консистентность.
    const totalGrowthRate = totalFact > 0 ? (totalGrowthPotential / totalFact) * 100 : 0;

    // "Общий Потенциал" - это предварительная оценка из worker'а, используемая в основном для графика.
    // Оставляем его для совместимости с графиком, но ключевыми метриками являются totalNewPlan и totalGrowthPotential.
    const workerCalculatedTotalPotential = data.reduce((sum, item) => sum + item.potential, 0);

    // Эта метрика теперь дублирует totalGrowthRate и является более точной.
    const avgPlanIncrease = totalGrowthRate;

    return { 
        totalFact, 
        totalPotential: workerCalculatedTotalPotential,
        totalGrowthPotential, // Исправлено
        totalGrowthRate,      // Исправлено
        avgPlanIncrease,      // Исправлено
        totalNewPlan 
    };
}


export function formatLargeNumber(num: number): string {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(2) + ' млн';
    if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(2) + ' тыс.';
    return num.toFixed(2);
}