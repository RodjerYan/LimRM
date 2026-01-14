
import { PlanningContext, GrowthFactors, GrowthDetails } from '../../types';
import * as Formulas from './formulas';
import * as Coefs from './coefficients';

/**
 * Движок планирования (Planning Engine).
 * Эмулирует сложную логику Excel и добавляет "Умное планирование" на основе бенчмарков.
 */
export class PlanningEngine {

    /**
     * Главная функция расчета плана для конкретного Региона (или Бренда в регионе).
     */
    public static calculateRMPlan(
        rmData: {
            totalFact: number;
            totalPotential: number; // Емкость из файла или суррогат
            matchedCount: number;   // АКБ (совпадения с ОКБ)
            activeCount?: number;   // NEW: Общее кол-во активных клиентов (включая тех, что не совпали)
            totalRegionOkb: number; // ОКБ (емкость базы)
            
            // Локальные метрики региона
            avgSku: number;      
            avgVelocity: number;
            
            // Глобальные метрики РМ (для случаев, когда в регионе 0 продаж)
            rmGlobalVelocity: number; 
        },
        context: PlanningContext
    ): { plan: number; growthPct: number; factors: GrowthFactors; details: GrowthDetails } {
        
        // --- 1. Расчет Доли Рынка (Penetration) ---
        let marketShare = 0;
        
        const activeCount = rmData.activeCount && rmData.activeCount > 0 ? rmData.activeCount : rmData.matchedCount;
        
        // STRICT COVERAGE CALCULATION: Active / (Active + Uncovered)
        // 100% достижимо ТОЛЬКО если MatchedCount == TotalRegionOkb (то есть мы закрыли все точки из базы).
        // Если MatchedCount < TotalRegionOkb, значит есть "Uncovered" (потенциал), который увеличивает знаменатель.
        
        // Uncovered = Сколько точек из ОКБ мы еще НЕ обслуживаем.
        const uncoveredCount = Math.max(0, rmData.totalRegionOkb - rmData.matchedCount);
        
        // TotalUniverse = Наш текущий мир (Active) + То, что мы еще не захватили (Uncovered).
        const totalUniverse = activeCount + uncoveredCount;
        
        if (totalUniverse > 0) {
            marketShare = activeCount / totalUniverse;
        }

        // --- 2. Базовая ставка ---
        let growthComponents: GrowthFactors = {
            base: context.baseRate,
            share: 0,
            width: 0,
            velocity: 0,
            acquisition: 0
        };

        // Context snapshot for explanation
        const details: GrowthDetails = {
            mySku: rmData.avgSku,
            globalSku: context.globalAvgSku,
            myVelocity: rmData.avgVelocity,
            globalVelocity: context.globalAvgSales,
            marketShare: marketShare,
            rmEfficiencyRatio: context.globalAvgSales > 0 ? rmData.rmGlobalVelocity / context.globalAvgSales : 1.0
        };

        // --- 3. Логика для регионов с присутствием (Есть продажи) ---
        if (rmData.totalFact > 0) {
            
            // А. Поправка на Долю Рынка (Extensive)
            // Если доля мала (< 20%), растем быстрее. Если велика (> 40%), растем медленнее.
            if (marketShare > 0 && marketShare < 0.9) {
                const normalizedShare = Formulas.normalizeNonLinear(marketShare, 0.3);
                growthComponents.share = Formulas.calculateBaseEffect(
                    normalizedShare, 
                    Coefs.TARGETS.MARKET_SHARE_OPTIMAL, 
                    15 // Сила влияния доли рынка
                );
            }

            // Б. Качественная дистрибуция (Intensive - Width)
            // Если SKU меньше, чем в среднем по компании -> потенциал роста через расширение матрицы.
            if (context.globalAvgSku > 0) {
                const widthGap = (context.globalAvgSku - rmData.avgSku) / context.globalAvgSku;
                // Если gap положительный (у нас меньше SKU), добавляем к плану.
                // Максимум +10% за ширину.
                growthComponents.width = Math.max(-5, Math.min(10, widthGap * 15)); 
            }

            // В. Качество продаж (Intensive - Velocity)
            // Если продаем меньше кг на SKU, чем в среднем -> потенциал роста через ротацию/акции.
            if (context.globalAvgSales > 0) {
                const velocityGap = (context.globalAvgSales - rmData.avgVelocity) / context.globalAvgSales;
                growthComponents.velocity = Math.max(-5, Math.min(10, velocityGap * 10));
            }

        } 
        // --- 4. Логика "Захвата" (Нулевое или мизерное покрытие) ---
        else {
            // Если продаж нет, или их ничтожно мало, стандартные метрики SKU/Velocity не работают или равны 0.
            // Мы должны начислить план на "Вход в регион" (Acquisition).
            
            // Логика: "Накидываем N% точек из ОКБ".
            // Как определить N? Смотрим на эффективность РМ в ДРУГИХ регионах (rmGlobalVelocity).
            
            let acquisitionBonus = 0;
            
            // Сравниваем РМ со средним по больнице.
            // Если РМ крутой (торгует мощно), ставим амбициозную задачу на захват.
            if (details.rmEfficiencyRatio > 1.1) {
                // Сильный менеджер: Ожидаем захват +10-15% к базе
                acquisitionBonus = 12; 
            } else if (details.rmEfficiencyRatio < 0.8) {
                // Слабый менеджер: Консервативный вход +2-5%
                acquisitionBonus = 3;
            } else {
                // Средний: +7%
                acquisitionBonus = 7;
            }

            growthComponents.acquisition = acquisitionBonus;
        }

        // 5. Суммируем и применяем лимиты
        let rawGrowthPct = 
            growthComponents.base + 
            growthComponents.share + 
            growthComponents.width + 
            growthComponents.velocity + 
            growthComponents.acquisition;

        // Корректировка на риск
        const riskCoef = Coefs.RISK_FACTORS[context.riskLevel] || 1.0;
        let finalGrowthPct = rawGrowthPct * riskCoef;

        // Жесткие границы (Safety limits)
        // Мин: 5% (чтобы не было стагнации), Макс: 100% (чтобы не было космоса)
        // Исключение: если база < 5%, может быть минус.
        const minLimit = context.baseRate > 5 ? 5 : 0;
        finalGrowthPct = Math.max(minLimit, Math.min(150, finalGrowthPct));

        // 6. Расчет Абсолютного Плана
        let planVolume = 0;
        
        if (rmData.totalFact > 0) {
            // Стандартный рост от достигнутого
            planVolume = rmData.totalFact * (1 + finalGrowthPct / 100);
        } else {
            // Расчет "с нуля" на основе ОКБ (Логика "Накинуть точек")
            // Эвристика: 
            // Цель = (Емкость ОКБ * TargetShare * AvgSalesPerClient)
            
            // TargetShare зависит от эффективности РМ (acquisitionBonus)
            // Если бонус высокий (12%), цель 5% рынка. Если низкий (3%), цель 1% рынка.
            const acquisitionTargetShare = (growthComponents.acquisition / 100) * 0.5; // ~1-6%
            
            if (rmData.totalRegionOkb > 0 && context.globalAvgSales > 0) {
                 // Средние продажи на точку ~ GlobalAvgSales * GlobalAvgSku
                 const avgClientVolume = context.globalAvgSales * context.globalAvgSku;
                 const targetClients = Math.ceil(rmData.totalRegionOkb * acquisitionTargetShare);
                 planVolume = Math.max(1, targetClients * avgClientVolume);
            }
        }

        return {
            plan: planVolume,
            growthPct: finalGrowthPct,
            factors: growthComponents,
            details: details
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
