import React, { useState, useMemo, useRef, useEffect } from 'react';
import Chart from 'chart.js/auto';
import { SummaryMetrics } from '../../types';
import { ProphetIcon, TrendingUpIcon } from '../icons';

interface ProphetProps {
    summaryMetrics: SummaryMetrics | null;
}

const Prophet: React.FC<ProphetProps> = ({ summaryMetrics }) => {
    const [marketingSpend, setMarketingSpend] = useState(0); // -50% to +50%
    const [priceChange, setPriceChange] = useState(0); // -20% to +20%
    const [distributionGrowth, setDistributionGrowth] = useState(5); // 0 to 20%

    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    // Elasticity Models (Heuristics for Demo)
    const PRICE_ELASTICITY = -1.2; // 10% price hike = 12% volume drop
    const MARKETING_ROI = 0.6; // 10% spend increase = 6% revenue increase (diminishing returns simulated simply)
    const DISTRIBUTION_FACTOR = 0.8; // 10% distribution growth = 8% sales growth

    const baseRevenue = summaryMetrics?.totalFact || 0;

    const scenarioResult = useMemo(() => {
        if (baseRevenue === 0) return 0;

        const marketingEffect = 1 + (marketingSpend / 100) * MARKETING_ROI;
        
        // Price effect is tricky: Revenue = Volume * Price.
        // Volume change = Price Change * Elasticity.
        // New Revenue = (Vol * (1 + VolChange)) * (Price * (1 + PriceChange))
        const volChange = (priceChange / 100) * PRICE_ELASTICITY;
        const priceEffectMultiplier = (1 + volChange) * (1 + priceChange / 100);

        const distEffect = 1 + (distributionGrowth / 100) * DISTRIBUTION_FACTOR;

        return baseRevenue * marketingEffect * priceEffectMultiplier * distEffect;
    }, [baseRevenue, marketingSpend, priceChange, distributionGrowth]);

    const difference = scenarioResult - baseRevenue;
    const pctChange = baseRevenue > 0 ? (difference / baseRevenue) * 100 : 0;

    // Update Chart
    useEffect(() => {
        if (!chartRef.current) return;
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        if (chartInstance.current) chartInstance.current.destroy();

        chartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Baseline 2026', 'Scenario 2026'],
                datasets: [{
                    label: 'Projected Revenue',
                    data: [baseRevenue, scenarioResult],
                    backgroundColor: [
                        'rgba(75, 85, 99, 0.5)', // Gray for baseline
                        pctChange >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)' // Green/Red for scenario
                    ],
                    borderColor: [
                        'rgba(75, 85, 99, 1)',
                        pctChange >= 0 ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)'
                    ],
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => new Intl.NumberFormat('ru-RU').format(ctx.raw as number) + ' kg/units'
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });

        return () => {
            if (chartInstance.current) chartInstance.current.destroy();
        };
    }, [baseRevenue, scenarioResult]);

    if (!summaryMetrics) {
        return <div className="text-center text-gray-500 mt-20">Please load data in ADAPTA module first.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">PROPHET <span className="text-gray-500 font-normal text-lg">/ Decisioning</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Forecasting, Scenario Planning ("What-if"), and Optimization.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Controls */}
                <div className="bg-gray-900/50 backdrop-blur-xl border border-indigo-500/20 rounded-2xl p-6 space-y-8">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <ProphetIcon small /> Scenario Builder
                    </h3>

                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-300">Marketing Budget</span>
                            <span className="text-indigo-400 font-mono">{marketingSpend > 0 ? '+' : ''}{marketingSpend}%</span>
                        </div>
                        <input 
                            type="range" min="-50" max="50" step="5" 
                            value={marketingSpend} onChange={(e) => setMarketingSpend(Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Impacts brand awareness. ROI Factor: 0.6</p>
                    </div>

                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-300">Price Strategy</span>
                            <span className="text-amber-400 font-mono">{priceChange > 0 ? '+' : ''}{priceChange}%</span>
                        </div>
                        <input 
                            type="range" min="-20" max="20" step="1" 
                            value={priceChange} onChange={(e) => setPriceChange(Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Price Elasticity assumed at -1.2</p>
                    </div>

                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-300">Distribution Growth</span>
                            <span className="text-emerald-400 font-mono">+{distributionGrowth}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="20" step="1" 
                            value={distributionGrowth} onChange={(e) => setDistributionGrowth(Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Physical availability expansion.</p>
                    </div>
                </div>

                {/* Visualization */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                            <p className="text-gray-400 text-xs uppercase">Baseline 2026</p>
                            <p className="text-2xl font-bold text-white font-mono mt-1">
                                {new Intl.NumberFormat('ru-RU').format(Math.round(baseRevenue))}
                            </p>
                        </div>
                        <div className={`bg-gray-800/50 p-4 rounded-xl border ${pctChange >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                            <p className="text-gray-400 text-xs uppercase">Scenario Projection</p>
                            <div className="flex items-end gap-3 mt-1">
                                <p className="text-2xl font-bold text-white font-mono">
                                    {new Intl.NumberFormat('ru-RU').format(Math.round(scenarioResult))}
                                </p>
                                <span className={`text-sm font-bold ${pctChange >= 0 ? 'text-emerald-400' : 'text-red-400'} mb-1`}>
                                    {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 h-[350px]">
                        <canvas ref={chartRef} />
                    </div>

                    <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-xl flex gap-3">
                        <div className="text-indigo-400 mt-1"><TrendingUpIcon small /></div>
                        <div className="text-sm text-indigo-200">
                            <strong>PROPHET Insight:</strong> Based on standard elasticity curves, increasing price by {priceChange}% while boosting marketing by {marketingSpend}% results in a net {pctChange > 0 ? 'positive' : 'negative'} outcome. 
                            {pctChange > 5 && " This looks like a viable growth strategy."}
                            {pctChange < 0 && " Careful: Volume loss from price hike outweighs revenue gains."}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Prophet;