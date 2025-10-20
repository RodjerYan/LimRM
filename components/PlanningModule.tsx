import React, { useMemo } from 'react';
import { AggregatedDataRow, RMPerformanceAnalysis } from '../types';
import { formatLargeNumber, formatPercentage } from '../utils/dataUtils';
import DetailChart from './DetailChart';
import { StarIcon, BriefcaseIcon, RocketIcon } from './icons';

interface PlanningModuleProps {
    data: AggregatedDataRow[];
}

const BASE_PLAN_INCREASE = 15; // Базовый % повышения плана

const analyzeRMPerformance = (data: AggregatedDataRow[]): RMPerformanceAnalysis[] => {
    const rmData = new Map<string, { fact: number, potential: number, growth: number }>();

    data.forEach(row => {
        const current = rmData.get(row.rm) || { fact: 0, potential: 0, growth: 0 };
        current.fact += row.fact;
        current.potential += row.potential;
        current.growth += row.growthPotential;
        rmData.set(row.rm, current);
    });

    const analysisResults: RMPerformanceAnalysis[] = [];
    
    rmData.forEach((metrics, rmName) => {
        const realizationRate = metrics.potential > 0 ? (metrics.fact / metrics.potential) * 100 : 100;

        let category: RMPerformanceAnalysis['category'];
        let recommendedIncrease: number;
        let justification: string;

        if (realizationRate > 70) {
            category = 'Звезда';
            recommendedIncrease = BASE_PLAN_INCREASE + 2.5; // Небольшой бонус за удержание
            justification = `Высокая эффективность на освоенном рынке (${realizationRate.toFixed(0)}%). Основная задача — удержание лидерских позиций и точечный рост.`;
        } else if (realizationRate > 30) {
            category = 'Рабочая лошадка';
            recommendedIncrease = BASE_PLAN_INCREASE + 5.0; // Максимальный бонус за потенциал
            justification = `Стабильный результат (${realizationRate.toFixed(0)}%) и высокий потенциал для роста. Рекомендуется агрессивная экспансия на неохваченных территориях.`;
        } else {
            category = 'Зона Роста';
            recommendedIncrease = BASE_PLAN_INCREASE + 3.5; // Амбициозный, но достижимый рост
            justification = `Огромный неиспользованный потенциал рынка (${(100 - realizationRate).toFixed(0)}% свободно). Фокус на агрессивном наборе клиентской базы.`;
        }
        
        analysisResults.push({
            rmName,
            ...metrics,
            realizationRate,
            category,
            recommendedIncrease,
            justification
        });
    });
    
    return analysisResults.sort((a, b) => b.potential - a.potential);
};


const RMAnalysisCard: React.FC<{ analysis: RMPerformanceAnalysis }> = ({ analysis }) => {
    const categoryStyles = {
        'Звезда': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', icon: <StarIcon /> },
        'Рабочая лошадка': { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', icon: <BriefcaseIcon /> },
        'Зона Роста': { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', icon: <RocketIcon /> }
    };

    const styles = categoryStyles[analysis.category];

    return (
        <div className={`p-4 rounded-lg border ${styles.border} ${styles.bg} flex flex-col md:flex-row gap-4`}>
            {/* Left Side: Info & Justification */}
            <div className="flex-1">
                <div className="flex items-center gap-3">
                    <span className={`p-2 rounded-full ${styles.bg}`}>
                        <div className={`w-6 h-6 ${styles.text}`}>{styles.icon}</div>
                    </span>
                    <div>
                        <h3 className="text-lg font-bold text-white">{analysis.rmName}</h3>
                        <p className={`text-sm font-semibold ${styles.text}`}>{analysis.category}</p>
                    </div>
                </div>
                
                <div className="my-4">
                    <p className="text-gray-400 text-sm">Рекомендуемый рост плана:</p>
                    <p className="text-4xl font-bold text-white my-1">{formatPercentage(analysis.recommendedIncrease)}</p>
                    <p className="text-xs text-gray-500">Базовый план {BASE_PLAN_INCREASE}% + персональная надбавка</p>
                </div>

                <div className="bg-gray-900/40 p-3 rounded-md">
                     <p className="text-sm text-gray-300 font-semibold mb-1">Обоснование:</p>
                     <p className="text-xs text-gray-400">{analysis.justification}</p>
                </div>
            </div>

            {/* Right Side: Chart & Metrics */}
            <div className="md:w-1/2 lg:w-2/5">
                 <div className="h-40 mb-3">
                    <DetailChart fact={analysis.fact} potential={analysis.potential} />
                </div>
                <div className="text-xs space-y-1 text-gray-400 text-center">
                    <p>Факт: <span className="font-mono text-white">{formatLargeNumber(analysis.fact)}</span> / Потенциал: <span className="font-mono text-white">{formatLargeNumber(analysis.potential)}</span></p>
                    <p>Освоение рынка: <span className={`font-mono font-bold ${styles.text}`}>{formatPercentage(analysis.realizationRate)}</span></p>
                </div>
            </div>
        </div>
    );
};

const PlanningModule: React.FC<PlanningModuleProps> = ({ data }) => {
    
    const performanceData = useMemo(() => analyzeRMPerformance(data), [data]);

    if (data.length === 0) {
        return (
             <div className="h-full flex items-center justify-center">
                <p className="text-gray-500 italic text-center px-6">Данные для планирования появятся после загрузки файла. <br/> Если данные загружены, сбросьте фильтры для полного анализа.</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar pr-2">
            <div className="space-y-4">
                {performanceData.map(analysis => (
                    <RMAnalysisCard key={analysis.rmName} analysis={analysis} />
                ))}
            </div>
             <div className="text-xs text-gray-600 pt-4 border-t border-gray-700 mt-6">
                <p><strong>Как это работает:</strong> Система анализирует освоение рынка (Факт/Потенциал) для каждого РМ и предлагает индивидуальную цель роста, добавляя бонус к базовому плану ({BASE_PLAN_INCREASE}%) в зависимости от потенциала и текущей эффективности.</p>
            </div>
        </div>
    );
};

export default PlanningModule;