
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Chart from 'chart.js/auto';
import { SummaryMetrics } from '../../types';
import { ProphetIcon, TrendingUpIcon, WaterfallIcon } from '../icons';
import { generateSeasonalitySeries } from '../../utils/analytics';

interface ProphetProps {
    summaryMetrics: SummaryMetrics | null;
}

const Prophet: React.FC<ProphetProps> = ({ summaryMetrics }) => {
    const [marketingSpend, setMarketingSpend] = useState(0); // -50% to +50%
    const [priceChange, setPriceChange] = useState(0); // -20% to +20%
    const [distributionGrowth, setDistributionGrowth] = useState(5); // 0 to 20%

    const waterfallRef = useRef<HTMLCanvasElement>(null);
    const timeSeriesRef = useRef<HTMLCanvasElement>(null);
    const waterfallInstance = useRef<Chart | null>(null);
    const timeSeriesInstance = useRef<Chart | null>(null);

    // Elasticity Models (Heuristics for Demo)
    const PRICE_ELASTICITY = -1.2; 
    const MARKETING_ROI = 0.6; 
    const DISTRIBUTION_FACTOR = 0.8; 

    const baseRevenue = summaryMetrics?.totalFact || 0;

    // 1. Calculate Effects for Waterfall
    const priceEffectAbs = useMemo(() => {
        const volChange = (priceChange / 100) * PRICE_ELASTICITY;
        // Revenue impact purely from price change on volume
        return baseRevenue * ((1 + volChange) * (1 + priceChange / 100) - 1);
    }, [baseRevenue, priceChange]);

    const marketingEffectAbs = useMemo(() => {
        return baseRevenue * (marketingSpend / 100) * MARKETING_ROI;
    }, [baseRevenue, marketingSpend]);

    const distEffectAbs = useMemo(() => {
        return baseRevenue * (distributionGrowth / 100) * DISTRIBUTION_FACTOR;
    }, [baseRevenue, distributionGrowth]);

    const scenarioResult = baseRevenue + priceEffectAbs + marketingEffectAbs + distEffectAbs;
    const pctChange = baseRevenue > 0 ? ((scenarioResult - baseRevenue) / baseRevenue) * 100 : 0;

    // 2. Generate Time Series Data
    const historicalData = useMemo(() => generateSeasonalitySeries(baseRevenue, 0), [baseRevenue]);
    const forecastData = useMemo(() => generateSeasonalitySeries(scenarioResult, 0), [scenarioResult]);

    // --- Waterfall Chart Effect ---
    useEffect(() => {
        if (!waterfallRef.current) return;
        const ctx = waterfallRef.current.getContext('2d');
        if (!ctx) return;

        if (waterfallInstance.current) waterfallInstance.current.destroy();

        // Waterfall logic: using stacked bars with a transparent bottom segment
        // Base -> +Price -> +Marketing -> +Dist -> Final
        
        // For simplicity in Chart.js without plugins, we visualize as a horizontal breakdown
        // Bar 1: Baseline
        // Bar 2: Price Effect
        // Bar 3: Marketing Effect
        // Bar 4: Distribution Effect
        // Bar 5: Final Result

        waterfallInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['База 2025', 'Эффект Цены', 'Эффект Маркетинга', 'Эффект Дистрибуции', 'Прогноз 2026'],
                datasets: [{
                    label: 'Объем (кг)',
                    data: [
                        baseRevenue, 
                        priceEffectAbs, 
                        marketingEffectAbs, 
                        distEffectAbs, 
                        scenarioResult
                    ],
                    backgroundColor: [
                        'rgba(75, 85, 99, 0.7)', // Gray
                        priceEffectAbs >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)', // Green/Red
                        marketingEffectAbs >= 0 ? 'rgba(59, 130, 246, 0.7)' : 'rgba(239, 68, 68, 0.7)', // Blue/Red
                        distEffectAbs >= 0 ? 'rgba(245, 158, 11, 0.7)' : 'rgba(239, 68, 68, 0.7)', // Amber/Red
                        'rgba(139, 92, 246, 0.8)' // Purple
                    ],
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
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
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#9ca3af' }
                    },
                    y: { 
                        grid: { display: false },
                        ticks: { color: '#e5e7eb', font: { weight: 'bold' } }
                    }
                }
            }
        });

        return () => { if (waterfallInstance.current) waterfallInstance.current.destroy(); };
    }, [baseRevenue, priceEffectAbs, marketingEffectAbs, distEffectAbs, scenarioResult]);

    // --- Time Series Chart Effect ---
    useEffect(() => {
        if (!timeSeriesRef.current) return;
        const ctx = timeSeriesRef.current.getContext('2d');
        if (!ctx) return;

        if (timeSeriesInstance.current) timeSeriesInstance.current.destroy();

        const labels = [
            'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек', // Year 1
            'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'  // Year 2 (Forecast)
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
                        borderColor: 'rgba(75, 85, 99, 0.8)',
                        backgroundColor: 'rgba(75, 85, 99, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 2
                    },
                    {
                        label: 'Прогноз 2026',
                        data: dataYear2,
                        borderColor: '#818cf8',
                        backgroundColor: 'rgba(129, 140, 248, 0.2)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#cbd5e1' } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${new Intl.NumberFormat('ru-RU').format(Math.round(ctx.raw as number))}`
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#9ca3af' }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#9ca3af' }
                    }
                }
            }
        });

        return () => { if (timeSeriesInstance.current) timeSeriesInstance.current.destroy(); };
    }, [historicalData, forecastData]);


    if (!summaryMetrics) {
        return <div className="text-center text-gray-500 mt-20">Пожалуйста, сначала загрузите данные в модуле ADAPTA.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">PROPHET <span className="text-gray-500 font-normal text-lg">/ Прогнозирование</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Сценарное планирование ("What-if") и моделирование драйверов роста (Waterfall).</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Controls */}
                <div className="bg-gray-900/50 backdrop-blur-xl border border-indigo-500/20 rounded-2xl p-6 space-y-8 h-fit">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <ProphetIcon small /> Драйверы Роста
                    </h3>

                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-300">Маркетинговый бюджет</span>
                            <span className="text-indigo-400 font-mono">{marketingSpend > 0 ? '+' : ''}{marketingSpend}%</span>
                        </div>
                        <input 
                            type="range" min="-50" max="50" step="5" 
                            value={marketingSpend} onChange={(e) => setMarketingSpend(Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">ROI модели: 0.6 (на каждые 10% бюджета 6% роста)</p>
                    </div>

                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-300">Ценовая стратегия</span>
                            <span className="text-amber-400 font-mono">{priceChange > 0 ? '+' : ''}{priceChange}%</span>
                        </div>
                        <input 
                            type="range" min="-20" max="20" step="1" 
                            value={priceChange} onChange={(e) => setPriceChange(Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Ценовая эластичность: -1.2</p>
                    </div>

                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-300">Рост дистрибуции</span>
                            <span className="text-emerald-400 font-mono">+{distributionGrowth}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="20" step="1" 
                            value={distributionGrowth} onChange={(e) => setDistributionGrowth(Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Физическая доступность (Numeric Distribution)</p>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-700">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Итоговый прогноз:</span>
                            <span className={`text-xl font-bold font-mono ${pctChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Visualizations */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Waterfall Chart */}
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 h-[320px]">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                <WaterfallIcon small /> Факторный анализ (Waterfall)
                            </h4>
                        </div>
                        <div className="relative h-[250px] w-full">
                            <canvas ref={waterfallRef} />
                        </div>
                    </div>

                    {/* Time Series Chart */}
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 h-[320px]">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                <TrendingUpIcon small /> Сезонность и Тренд (24 мес)
                            </h4>
                        </div>
                        <div className="relative h-[250px] w-full">
                            <canvas ref={timeSeriesRef} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Prophet;