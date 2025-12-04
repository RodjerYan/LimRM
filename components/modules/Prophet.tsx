
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Chart from 'chart.js/auto';
import { SummaryMetrics } from '../../types';
import { ProphetIcon, TrendingUpIcon, WaterfallIcon, CalculatorIcon, InfoIcon, TargetIcon } from '../icons';
import { generateSeasonalitySeries } from '../../utils/analytics';

interface ProphetProps {
    summaryMetrics: SummaryMetrics | null;
}

// Sub-component for consistent control cards
const DriverCard: React.FC<{
    title: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (val: number) => void;
    impact: number;
    formulaDescription: string;
    metricLabel: string;
    colorClass: string;
}> = ({ title, value, min, max, step, onChange, impact, formulaDescription, metricLabel, colorClass }) => (
    <div className="bg-gray-800/40 border border-gray-700 p-5 rounded-xl flex flex-col h-full relative overflow-hidden group">
        {/* Background Gradient Hint */}
        <div className={`absolute top-0 left-0 w-1 h-full ${colorClass} opacity-50`}></div>
        
        <div className="flex justify-between items-start mb-4">
            <div>
                <h4 className="font-bold text-gray-200 text-sm uppercase tracking-wide">{title}</h4>
                <p className="text-[10px] text-gray-500 mt-1">{formulaDescription}</p>
            </div>
            <div className={`text-right font-mono font-bold text-lg ${impact >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {impact > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU', { notation: "compact", maximumFractionDigits: 1 }).format(impact)}
            </div>
        </div>

        <div className="flex-grow flex flex-col justify-center">
            <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>{min}{metricLabel}</span>
                <span className="text-white font-bold">{value > 0 ? '+' : ''}{value}{metricLabel}</span>
                <span>{max}{metricLabel}</span>
            </div>
            <input 
                type="range" min={min} max={max} step={step} 
                value={value} onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
        </div>
        
        <div className="mt-4 pt-3 border-t border-gray-700/50 text-[10px] text-gray-500 flex items-center gap-1">
            <CalculatorIcon small />
            <span>Влияние рассчитывается автоматически</span>
        </div>
    </div>
);

const Prophet: React.FC<ProphetProps> = ({ summaryMetrics }) => {
    const [marketingSpend, setMarketingSpend] = useState(0); // -50% to +50%
    const [priceChange, setPriceChange] = useState(0); // -20% to +20%
    const [distributionGrowth, setDistributionGrowth] = useState(5); // 0 to 20%

    const waterfallRef = useRef<HTMLCanvasElement>(null);
    const timeSeriesRef = useRef<HTMLCanvasElement>(null);
    const waterfallInstance = useRef<Chart | null>(null);
    const timeSeriesInstance = useRef<Chart | null>(null);

    // --- ECONOMIC MODEL CONSTANTS ---
    // Elasticity: For every 1% price increase, volume drops by 1.2%
    const PRICE_ELASTICITY = -1.2; 
    // Marketing ROI: For every 10% budget increase, revenue grows by 6% (Diminishing returns simplified)
    const MARKETING_ROI = 0.6; 
    // Distribution: For every 1% coverage growth, revenue grows by 0.8% (Quality of distribution factor)
    const DISTRIBUTION_FACTOR = 0.8; 

    const baseRevenue = summaryMetrics?.totalFact || 0;

    // 1. Calculate Absolute Impacts
    const priceEffectAbs = useMemo(() => {
        // Price Effect = Volume Change + Price Change Interaction
        const volChangePct = (priceChange / 100) * PRICE_ELASTICITY;
        const newVol = baseRevenue * (1 + volChangePct);
        const newRevenue = newVol * (1 + priceChange / 100);
        return newRevenue - baseRevenue;
    }, [baseRevenue, priceChange]);

    const marketingEffectAbs = useMemo(() => {
        // Linear approximation for demo
        return baseRevenue * (marketingSpend / 100) * MARKETING_ROI;
    }, [baseRevenue, marketingSpend]);

    const distEffectAbs = useMemo(() => {
        // Linear approximation
        return baseRevenue * (distributionGrowth / 100) * DISTRIBUTION_FACTOR;
    }, [baseRevenue, distributionGrowth]);

    const scenarioResult = baseRevenue + priceEffectAbs + marketingEffectAbs + distEffectAbs;
    const absGrowth = scenarioResult - baseRevenue;
    const pctChange = baseRevenue > 0 ? (absGrowth / baseRevenue) * 100 : 0;

    // 2. Generate Time Series Data
    const historicalData = useMemo(() => generateSeasonalitySeries(baseRevenue, 0), [baseRevenue]);
    const forecastData = useMemo(() => generateSeasonalitySeries(scenarioResult, 0), [scenarioResult]);

    // --- Waterfall Chart ---
    useEffect(() => {
        if (!waterfallRef.current) return;
        const ctx = waterfallRef.current.getContext('2d');
        if (!ctx) return;

        if (waterfallInstance.current) waterfallInstance.current.destroy();

        waterfallInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['База 2025', 'Ценовой Эффект', 'Маркетинг', 'Дистрибуция', 'Прогноз 2026'],
                datasets: [{
                    label: 'Вклад в результат',
                    data: [
                        baseRevenue, 
                        priceEffectAbs, 
                        marketingEffectAbs, 
                        distEffectAbs, 
                        scenarioResult
                    ],
                    backgroundColor: (ctx) => {
                        const val = ctx.raw as number;
                        const idx = ctx.dataIndex;
                        if (idx === 0 || idx === 4) return 'rgba(99, 102, 241, 0.8)'; // Indigo for Totals
                        return val >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'; // Green/Red for deltas
                    },
                    borderWidth: 0,
                    borderRadius: 4,
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bar is better for waterfall reading
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.raw as number;
                                const sign = val > 0 ? '+' : '';
                                return `${sign}${new Intl.NumberFormat('ru-RU').format(Math.round(val))} кг`;
                            },
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                if (idx === 1) return 'Эластичность спроса (-1.2)';
                                if (idx === 2) return 'ROI Маркетинга (0.6)';
                                if (idx === 3) return 'Эффективность полки (0.8)';
                                return items[0].label;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#9ca3af', callback: (val) => new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(Number(val)) }
                    },
                    y: { 
                        grid: { display: false },
                        ticks: { color: '#e5e7eb', font: { size: 11 } }
                    }
                }
            }
        });

        return () => { if (waterfallInstance.current) waterfallInstance.current.destroy(); };
    }, [baseRevenue, priceEffectAbs, marketingEffectAbs, distEffectAbs, scenarioResult]);

    // --- Time Series Chart ---
    useEffect(() => {
        if (!timeSeriesRef.current) return;
        const ctx = timeSeriesRef.current.getContext('2d');
        if (!ctx) return;

        if (timeSeriesInstance.current) timeSeriesInstance.current.destroy();

        const labels = [
            'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек', // Year 1
            'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'  // Year 2
        ];

        const dataYear1 = [...historicalData, ...Array(12).fill(null)];
        const dataYear2 = [...Array(12).fill(null), ...forecastData];

        timeSeriesInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Факт 2025',
                        data: dataYear1,
                        borderColor: '#9ca3af',
                        backgroundColor: 'rgba(156, 163, 175, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHitRadius: 10
                    },
                    {
                        label: 'Сценарный Прогноз 2026',
                        data: dataYear2,
                        borderColor: '#818cf8',
                        backgroundColor: 'rgba(129, 140, 248, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHitRadius: 10,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#cbd5e1', usePointStyle: true } },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${new Intl.NumberFormat('ru-RU').format(Math.round(ctx.raw as number))}`
                        }
                    }
                },
                scales: {
                    y: { 
                        display: false,
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#6b7280', maxTicksLimit: 8 }
                    }
                }
            }
        });

        return () => { if (timeSeriesInstance.current) timeSeriesInstance.current.destroy(); };
    }, [historicalData, forecastData]);


    if (!summaryMetrics) {
        return <div className="text-center text-gray-500 mt-20">Для работы модуля PROPHET необходимы исторические данные. Загрузите их в ADAPTA.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">PROPHET <span className="text-gray-500 font-normal text-lg">/ Сценарное Моделирование</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Инструмент поддержки принятия решений (Decision Support System). Моделирование влияния цены, маркетинга и дистрибуции.</p>
                </div>
            </div>

            {/* 1. KPI Panel - High Level Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-900/50 border border-gray-700 p-5 rounded-2xl">
                    <div className="text-gray-400 text-xs font-bold uppercase mb-2">Базовый объем (Факт)</div>
                    <div className="text-3xl font-mono text-gray-300 font-bold">
                        {new Intl.NumberFormat('ru-RU').format(Math.round(baseRevenue))} <span className="text-sm font-sans text-gray-500">кг</span>
                    </div>
                </div>
                
                <div className="bg-gradient-to-br from-indigo-900/40 to-gray-900 border border-indigo-500/30 p-5 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><ProphetIcon /></div>
                    <div className="text-indigo-300 text-xs font-bold uppercase mb-2">Сценарный Прогноз</div>
                    <div className="text-3xl font-mono text-white font-bold">
                        {new Intl.NumberFormat('ru-RU').format(Math.round(scenarioResult))} <span className="text-sm font-sans text-indigo-400">кг</span>
                    </div>
                </div>

                <div className="bg-gray-900/50 border border-gray-700 p-5 rounded-2xl flex items-center justify-between">
                    <div>
                        <div className="text-gray-400 text-xs font-bold uppercase mb-2">Delta (Прирост)</div>
                        <div className={`text-3xl font-mono font-bold ${absGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {absGrowth > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU').format(Math.round(absGrowth))}
                        </div>
                    </div>
                    <div className={`text-xl font-bold ${pctChange >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'} px-3 py-1 rounded-lg`}>
                        {pctChange > 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* 2. Drivers Control Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DriverCard 
                    title="Ценовая Стратегия"
                    metricLabel="%"
                    min={-20} max={20} step={1}
                    value={priceChange}
                    onChange={setPriceChange}
                    impact={priceEffectAbs}
                    formulaDescription="Модель эластичности спроса (-1.2). Повышение цены снижает объем, но может растить выручку."
                    colorClass="bg-amber-500"
                />
                <DriverCard 
                    title="Маркетинговые Инвестиции"
                    metricLabel="%"
                    min={-50} max={50} step={5}
                    value={marketingSpend}
                    onChange={setMarketingSpend}
                    impact={marketingEffectAbs}
                    formulaDescription="ROI модель (0.6). Конверсия бюджета на трейд-маркетинг в дополнительный объем."
                    colorClass="bg-blue-500"
                />
                <DriverCard 
                    title="Расширение Дистрибуции"
                    metricLabel="%"
                    min={0} max={20} step={1}
                    value={distributionGrowth}
                    onChange={setDistributionGrowth}
                    impact={distEffectAbs}
                    formulaDescription="Фактор покрытия (0.8). Эффективность входа в новые торговые точки (нумерическая дистрибуция)."
                    colorClass="bg-emerald-500"
                />
            </div>

            {/* 3. Analytics Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[400px]">
                <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <WaterfallIcon small /> Структура роста (Factor Analysis)
                        </h4>
                        <div className="text-xs text-gray-500">Вклад каждого фактора в итог</div>
                    </div>
                    <div className="relative w-full flex-grow">
                        <canvas ref={waterfallRef} />
                    </div>
                </div>

                <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <TrendingUpIcon small /> Динамика продаж (Seasonality Adjusted)
                        </h4>
                        <div className="text-xs text-gray-500">Прогноз с учетом сезонных коэффициентов</div>
                    </div>
                    <div className="relative w-full flex-grow">
                        <canvas ref={timeSeriesRef} />
                    </div>
                </div>
            </div>
            
            <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
                <div className="mt-1 text-indigo-400 w-5 h-5"><InfoIcon /></div>
                <div className="text-xs text-indigo-300">
                    <strong>Методология:</strong> Модель использует линейную аппроксимацию эластичности. 
                    В реальных условиях коэффициенты (ROI, Elasticity) могут меняться нелинейно при экстремальных значениях (&gt;30% изменений). 
                    Используйте данный инструмент для стратегической оценки "Что-если" (What-If Analysis).
                </div>
            </div>
        </div>
    );
};

export default Prophet;
