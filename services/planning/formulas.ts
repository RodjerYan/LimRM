
/**
 * Модуль математических формул, перенесенных из Excel.
 * Реализует специфическую логику нормализации и расчета отклонений.
 */

/**
 * Нелинейная нормализация KPI.
 * Формула из Excel: 0,5 + (A2 - 0,5) * (1 - k * (A2 - 0,5)^2)
 * Используется для сглаживания метрик (например, доли рынка), чтобы избежать экстремальных планов.
 * 
 * @param value Исходное значение (нормализованное 0..1, например, доля рынка / 100)
 * @param k Коэффициент сглаживания (обычно 0.1 - 0.5)
 */
export const normalizeNonLinear = (value: number, k: number = 0.2): number => {
    // Clamp value between 0 and 1 to prevent formula explosion
    const clamped = Math.max(0, Math.min(1, value));
    const centered = clamped - 0.5;
    const result = 0.5 + centered * (1 - k * Math.pow(centered, 2));
    return Math.max(0, Math.min(1, result));
};

/**
 * Безопасный расчет процента выполнения.
 * Excel: =IF(Plan=0, 0, Fact/Plan)
 */
export const calculateExecutionPercent = (fact: number, plan: number): number => {
    if (plan === 0) return 0;
    return (fact / plan) * 100;
};

/**
 * Расчет месячного плана на основе годового с учетом сезонности.
 * Excel: =План_Год * Коэф_Месяца
 */
export const distributeYearToMonth = (yearlyPlan: number, seasonCoef: number): number => {
    return yearlyPlan * seasonCoef;
};

/**
 * Z-Score нормализация для сравнения метрик РМ.
 * Позволяет понять, насколько РМ лучше/хуже среднего.
 */
export const calculateZScore = (value: number, mean: number, stdDev: number): number => {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
};

/**
 * Расчет корректировки на "эффект базы".
 * Если база низкая -> рост должен быть выше.
 * Если база высокая -> рост консервативнее.
 * 
 * @param marketShare Доля рынка (0..1)
 * @param baseTarget Базовая цель (например, 0.35 или 35%)
 * @param aggressionFactor Множитель агрессии (сила влияния)
 */
export const calculateBaseEffect = (marketShare: number, baseTarget: number = 0.35, aggressionFactor: number = 20): number => {
    // (Цель - Факт) * Агрессия
    return (baseTarget - marketShare) * aggressionFactor;
};
