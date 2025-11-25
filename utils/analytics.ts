
import { AggregatedDataRow } from '../types';

/**
 * Calculates the mean (average) of an array of numbers.
 */
export const calculateMean = (numbers: number[]): number => {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, val) => sum + val, 0) / numbers.length;
};

/**
 * Calculates the Standard Deviation (sigma) of an array.
 */
export const calculateStdDev = (numbers: number[]): number => {
    if (numbers.length < 2) return 0;
    const mean = calculateMean(numbers);
    const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numbers.length;
    return Math.sqrt(variance);
};

/**
 * Outlier Detection using Z-Score.
 * Identifies items that are more than `threshold` standard deviations away from the mean.
 */
export const detectOutliers = (
    data: AggregatedDataRow[], 
    threshold: number = 2.5
): { row: AggregatedDataRow; zScore: number; reason: string }[] => {
    const facts = data.map(d => d.fact).filter(f => f > 0);
    if (facts.length < 5) return [];

    const mean = calculateMean(facts);
    const stdDev = calculateStdDev(facts);

    if (stdDev === 0) return [];

    const outliers: { row: AggregatedDataRow; zScore: number; reason: string }[] = [];

    data.forEach(row => {
        if (row.fact <= 0) return;
        const zScore = (row.fact - mean) / stdDev;
        if (Math.abs(zScore) > threshold) {
            outliers.push({
                row,
                zScore,
                reason: zScore > 0 
                    ? `Сверх-высокие продажи (Z=${zScore.toFixed(1)}). Проверьте на опт/дубль.` 
                    : `Аномально низкие продажи (Z=${zScore.toFixed(1)}).`
            });
        }
    });

    return outliers.sort((a, b) => b.zScore - a.zScore);
};

/**
 * Simulates monthly seasonality for FMCG context.
 * Generates 12 points based on a yearly total, adding a sine wave + random noise.
 */
export const generateSeasonalitySeries = (yearlyTotal: number, startMonth: number = 0): number[] => {
    const baseMonthly = yearlyTotal / 12;
    const series: number[] = [];
    
    // Seasonality curve: Peak in Summer (months 5-7) and Dec (11), Low in Jan/Feb
    const seasonalityFactors = [0.8, 0.85, 0.95, 1.0, 1.1, 1.2, 1.2, 1.1, 1.0, 0.95, 0.9, 1.15];

    for (let i = 0; i < 12; i++) {
        const monthIndex = (startMonth + i) % 12;
        const factor = seasonalityFactors[monthIndex];
        // Add +/- 5% random noise
        const noise = 0.95 + Math.random() * 0.1; 
        series.push(baseMonthly * factor * noise);
    }
    return series;
};

/**
 * Calculates Euclidean similarity between two regions based on normalized vectors.
 * Returns a score from 0 to 100.
 */
export const calculateSimilarity = (
    target: { volume: number; growth: number; potential: number },
    candidate: { volume: number; growth: number; potential: number },
    maxVolume: number
): number => {
    // Normalize inputs to 0-1 scale to give them equal weight
    // Use maxVolume for volume normalization to handle scale differences
    
    const v1 = target.volume / maxVolume;
    const v2 = candidate.volume / maxVolume;
    
    // Growth is percentage (0-100), normalize to 0-1
    const g1 = target.growth / 100;
    const g2 = candidate.growth / 100;

    const p1 = target.potential / maxVolume;
    const p2 = candidate.potential / maxVolume;

    const distance = Math.sqrt(
        Math.pow(v1 - v2, 2) + 
        Math.pow(g1 - g2, 2) + 
        Math.pow(p1 - p2, 2)
    );

    // Convert distance to similarity score. Max possible distance is roughly sqrt(3) ~ 1.73
    const maxDistance = 1.73;
    const similarity = Math.max(0, 1 - (distance / maxDistance)) * 100;
    
    return similarity;
};

/**
 * Pareto Analysis (ABC Analysis).
 * Identifies the top items contributing to 80% of the total value.
 */
export const performParetoAnalysis = (
    items: { name: string; value: number; meta?: any }[]
): { top20: typeof items; bottom80: typeof items; cutoffValue: number } => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const totalValue = sorted.reduce((sum, item) => sum + item.value, 0);
    const threshold = totalValue * 0.8;

    let runningTotal = 0;
    let splitIndex = 0;

    for (let i = 0; i < sorted.length; i++) {
        runningTotal += sorted[i].value;
        if (runningTotal >= threshold) {
            splitIndex = i;
            break;
        }
    }

    return {
        top20: sorted.slice(0, splitIndex + 1),
        bottom80: sorted.slice(splitIndex + 1),
        cutoffValue: threshold
    };
};
