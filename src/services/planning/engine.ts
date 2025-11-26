
import { RMMetrics, PlanMetric, PlanningContext } from '../../types';
import * as Formulas from './formulas';
import * as Coefs from './coefficients';

/**
 * Движок планирования (Planning Engine).
 * Эмулирует работу макроса Excel: проходит по всем РМ, применяет формулы и коэффициенты.
 */
export class PlanningEngine {

    /**
     * Главная функция расчета плана для одного РМ.
     * Агрегирует логику листов "Розница" и "Утв. план".
     */
    public static calculateRMPlan(
        rmData: {
            totalFact: number;
            totalPotential: number; // From OKB or calculated
            matchedCount: number;
            totalRegionOkb: number;
            avgSku: number;
            avgVelocity: number;
        },
        context: PlanningContext
    ): { plan: number; growthPct: number; factors: Record<string, number> } {
        
        // 1. Расчет доли рынка (Penetration)
        let marketShare = 0;
        if (rmData.totalRegionOkb > 0) {
            marketShare = rmData.matchedCount / rmData.totalRegionOkb;
        }

        // 2. Нормализация KPI (Лист "Целевые")
        // Применяем нелинейную нормализацию к доле рынка, чтобы сгладить экстремумы
        const normalizedShare = Formulas.normalizeNonLinear(marketShare, 0.3);

        // 3. Расчет корректировки на "Низкую базу" (Extensive Growth)
        // Если доля ниже 35%, мы добавляем процент роста.
        const shareAdjustment = Formulas.calculateBaseEffect(
            normalizedShare, 
            Coefs.TARGETS.MARKET_SHARE_OPTIMAL, 
            20 // Агрессивность из Excel (коэффициент влияния)
        );

        // 4. Расчет качественных показателей (Intensive Growth)
        
        // Width Gap (Ширина ассортимента)
        const widthGap = context.globalAvgSku > 0 
            ? (context.globalAvgSku - rmData.avgSku) / context.globalAvgSku 
            : 0;
        // Cap: Min -5% (хорошо), Max +15% (плохо, надо расти)
        const widthBonus = Math.max(-5, Math.min(15, widthGap * 15));

        // Velocity Gap (Качество полки)
        const velocityGap = context.globalAvgSales > 0
            ? (context.globalAvgSales - rmData.avgVelocity) / context.globalAvgSales
            : 0;
        const velocityBonus = Math.max(-5, Math.min(15, velocityGap * 15));

        // 5. Сборка итогового процента (Формула сводного листа)
        // Base + ShareAdj + Width + Velocity
        let rawGrowthPct = context.baseRate + shareAdjustment + widthBonus + velocityBonus;

        // 6. Применение риск-факторов ("Черный день")
        const riskCoef = Coefs.RISK_FACTORS[context.riskLevel] || 1.0;
        
        // Если риск высокий, мы снижаем ожидания роста, но не режем базу.
        // В Excel это часто делается через умножение итогового плана.
        // Здесь мы скорректируем процент роста.
        let finalGrowthPct = rawGrowthPct * riskCoef;

        // Hard Limits (Sanity Check из листа "Инструкция")
        // Нельзя ставить план ниже -10% (удержание) и выше +100% (нереалистично для зрелого рынка)
        // Однако база может меняться пользователем, поэтому лимиты относительны.
        const minLimit = Math.max(0, context.baseRate - 20);
        const maxLimit = context.baseRate + 40;
        
        finalGrowthPct = Math.max(minLimit, Math.min(maxLimit, finalGrowthPct));

        // 7. Расчет абсолютного плана
        const planVolume = rmData.totalFact * (1 + finalGrowthPct / 100);

        return {
            plan: planVolume,
            growthPct: finalGrowthPct,
            factors: {
                shareAdjustment,
                widthBonus,
                velocityBonus,
                riskCoef
            }
        };
    }

    /**
     * Распределяет годовой план по кварталам.
     */
    public static getQuarterlySplit(yearlyPlan: number): Record<string, number> {
        return {
            Q1: yearlyPlan * Coefs.SEASONALITY_CURVE.Q1,
            Q2: yearlyPlan * Coefs.SEASONALITY_CURVE.Q2,
            Q3: yearlyPlan * Coefs.SEASONALITY_CURVE.Q3,
            Q4: yearlyPlan * Coefs.SEASONALITY_CURVE.Q4,
        };
    }
}
