import React, { useMemo, useState, useEffect } from 'react';
import { AggregatedDataRow, RMPerformanceAnalysis } from '../types';
import { formatLargeNumber, formatPercentage } from '../utils/dataUtils';
import DetailChart from './DetailChart';
import AIInsights from './AIInsights';
import { StarIcon, BriefcaseIcon, RocketIcon } from './icons';

interface PlanningModuleProps {
    data: AggregatedDataRow[];
}

const BASE_PLAN_INCREASE = 15; // Базовый годовой ориентир по росту

interface AiAnalysisResult {
    summary: string;
    insights: string[];
    forecasts: string[];
}

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
        if (metrics.potential <= 0) return; 

        const realizationRate = (metrics.fact / metrics.potential) * 100;

        let category: RMPerformanceAnalysis['category'];
        let recommendedIncrease: number;
        let justification: string;

        if (realizationRate > 75) {
            category = 'Лидер рынка';
            recommendedIncrease = Math.max(5, BASE_PLAN_INCREASE - (realizationRate - 75) / 4); 
            justification = `Высочайшая эффективность на зрелом рынке (${realizationRate.toFixed(0)}%). Цель скорректирована для удержания доли и органического роста.`;
        } else if (realizationRate > 35) {
            category = 'Стабильный рост';
            recommendedIncrease = BASE_PLAN_INCREASE;
            justification = `Хороший баланс между освоенной долей (${realizationRate.toFixed(0)}%) и потенциалом. Стандартная цель в ${BASE_PLAN_INCREASE}% достижима.`;
        } else {
            category = 'Высокий потенциал';
            recommendedIncrease = BASE_PLAN_INCREASE + (100 - realizationRate) / 10;
            justification = `Огромный неосвоенный потенциал (${(100 - realizationRate).toFixed(0)}% свободно). Повышенная цель отражает возможность взрывного роста.`;
        }
        
        analysisResults.push({
            rmName,
            ...metrics,
            realizationRate,
            category,
            recommendedIncrease: parseFloat(recommendedIncrease.toFixed(1)),
            justification
        });
    });
    
    return analysisResults.sort((a, b) => b.potential - a.potential);
};


const RMAnalysisCard: React.FC<{ analysis: RMPerformanceAnalysis }> = ({ analysis }) => {
    const categoryStyles = {
        'Лидер рынка': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', icon: <StarIcon /> },
        'Стабильный рост': { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', icon: <BriefcaseIcon /> },
        'Высокий потенциал': { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', icon: <RocketIcon /> }
    };

    const styles = categoryStyles[analysis.category];
    const isPlanIncreased = analysis.recommendedIncrease > BASE_PLAN_INCREASE;
    const isPlanDecreased = analysis.recommendedIncrease < BASE_PLAN_INCREASE;

    return (
        <div className={`p-4 rounded-lg border ${styles.border} ${styles.bg} flex flex-col md:flex-row gap-4`}>
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
                    <p className="text-4xl font-bold text-white my-1 flex items-center gap-2">
                        {formatPercentage(analysis.recommendedIncrease)}
                        {isPlanIncreased && <span className="text-xs font-semibold bg-green-500/20 text-success px-2 py-1 rounded-full">ПОВЫШЕН</span>}
                        {isPlanDecreased && <span className="text-xs font-semibold bg-amber-500/20 text-warning px-2 py-1 rounded-full">СКОРРЕКТИРОВАН</span>}
                    </p>
                    <p className="text-xs text-gray-500">Ориентир компании: {BASE_PLAN_INCREASE}%</p>
                </div>
                <div className="bg-gray-900/40 p-3 rounded-md">
                     <p className="text-sm text-gray-300 font-semibold mb-1">Обоснование:</p>
                     <p className="text-xs text-gray-400">{analysis.justification}</p>
                </div>
            </div>
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
    
    const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisResult | null>(null);
    const [isLoadingAi, setIsLoadingAi] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const performanceData = useMemo(() => analyzeRMPerformance(data), [data]);

    useEffect(() => {
        if (data.length > 0) {
            const fetchAiAnalysis = async () => {
                setIsLoadingAi(true);
                setAiError(null);
                setAiAnalysis(null);
                try {
                    const response = await fetch('/api/gemini-analytics', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tableData: data }),
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Ошибка при получении AI-анализа');
                    }
                    const result: AiAnalysisResult = await response.json();
                    setAiAnalysis(result);
                } catch (error: any) {
                    setAiError(error.message);
                } finally {
                    setIsLoadingAi(false);
                }
            };

            const timerId = setTimeout(fetchAiAnalysis, 500);
            return () => clearTimeout(timerId);
        }
    }, [data]);


    if (data.length === 0) {
        return (
             <div className="h-full flex items-center justify-center">
                <p className="text-gray-500 italic text-center px-6">Данные для планирования появятся после загрузки файла. <br/> Если данные загружены, сбросьте фильтры для полного анализа.</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar pr-2">
            <div className="space-y-6">
                 <AIInsights analysis={aiAnalysis} isLoading={isLoadingAi} error={aiError} />

                {performanceData.map(analysis => (
                    <RMAnalysisCard key={analysis.rmName} analysis={analysis} />
                ))}
            </div>
             <div className="text-xs text-gray-600 pt-4 border-t border-gray-700 mt-6">
                <p><strong>Как это работает:</strong> Система анализирует освоение рынка (Факт/Потенциал) для каждого РМ и предлагает индивидуальную цель роста, адаптируя базовый ориентир ({BASE_PLAN_INCREASE}%) в зависимости от потенциала и текущей эффективности.</p>
            </div>
        </div>
    );
};

export default PlanningModule;