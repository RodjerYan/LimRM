import React, { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';

interface DetailChartProps {
    fact: number;
    potential: number;
}

const DetailChart: React.FC<DetailChartProps> = ({ fact, potential }) => {
    const chartContainer = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    // Calculate percentage for the overlay widget
    const percentage = useMemo(() => {
        if (potential <= 0) return fact > 0 ? 100 : 0;
        return Math.min(100, Math.max(0, (fact / potential) * 100));
    }, [fact, potential]);

    const gap = Math.max(0, potential - fact);

    useEffect(() => {
        if (!chartContainer.current) return;

        const ctx = chartContainer.current.getContext('2d');
        if (!ctx) return;

        // Create Modern Gradients
        const gradientFact = ctx.createLinearGradient(0, 0, 0, 400);
        gradientFact.addColorStop(0, 'rgba(52, 211, 153, 1)'); // Emerald 400
        gradientFact.addColorStop(1, 'rgba(52, 211, 153, 0.2)');

        const gradientPotential = ctx.createLinearGradient(0, 0, 0, 400);
        gradientPotential.addColorStop(0, 'rgba(129, 140, 248, 1)'); // Indigo 400
        gradientPotential.addColorStop(1, 'rgba(129, 140, 248, 0.2)');

        const maxValue = Math.max(fact, potential) * 1.1; // Add 10% headroom
        
        // Determine Unit
        let unit = '';
        let factor = 1;
        if (maxValue > 1_000_000) {
            unit = 'млн';
            factor = 1_000_000;
        } else if (maxValue > 1_000) {
            unit = 'тыс.';
            factor = 1_000;
        }

        const labels = ['Текущий Факт', 'Общий Потенциал'];
        
        const chartConfig = {
            type: 'bar' as const,
            data: {
                labels,
                datasets: [{
                    label: 'Объем',
                    data: [fact, potential],
                    backgroundColor: [gradientFact, gradientPotential],
                    borderColor: ['#34d399', '#818cf8'],
                    borderWidth: 0,
                    borderRadius: { topLeft: 12, topRight: 12, bottomLeft: 4, bottomRight: 4 },
                    borderSkipped: false,
                    barPercentage: 0.5,
                    categoryPercentage: 0.8,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1500,
                    easing: 'easeOutQuart' as const,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context: any) {
                                const val = context.raw as number;
                                const formattedVal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(val);
                                
                                let label = `Объем: ${formattedVal}`;
                                
                                // Add context to the tooltip
                                if (context.dataIndex === 0) { // Fact
                                    const pot = context.chart.data.datasets[0].data[1] as number;
                                    const pct = pot > 0 ? ((val / pot) * 100).toFixed(1) : 0;
                                    label += ` (${pct}% от плана)`;
                                } else if (context.dataIndex === 1) { // Potential
                                    const f = context.chart.data.datasets[0].data[0] as number;
                                    const gap = val - f;
                                    if (gap > 0) {
                                        const gapStr = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(gap);
                                        return [`Цель: ${formattedVal}`, `Потенциал роста: +${gapStr}`];
                                    }
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { display: false }, 
                        ticks: { 
                            color: '#94a3b8', 
                            font: { size: 13, family: "'Geist', sans-serif", weight: 'bold' as const } 
                        },
                        border: { display: false }
                    },
                    y: { 
                        beginAtZero: true, 
                        max: maxValue,
                        grid: { 
                            color: 'rgba(75, 85, 99, 0.2)',
                            tickLength: 0,
                            borderDash: [4, 4]
                        }, 
                        ticks: { 
                            color: '#64748b',
                            font: { size: 11, family: "'Geist Mono', monospace" },
                            callback: function(value: any) {
                                return (value / factor).toFixed(1) + (unit ? ` ${unit}` : '');
                            }
                        },
                        border: { display: false }
                    },
                },
            },
        };

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }
        
        chartInstance.current = new Chart(ctx, chartConfig);

    }, [fact, potential]);

    useEffect(() => {
        return () => {
            chartInstance.current?.destroy();
            chartInstance.current = null;
        }
    }, []);

    return (
        <div className="relative w-full h-full flex items-end">
            {/* LEFT WIDGET: COMPLETION (Fact) */}
            <div className="absolute top-0 left-4 flex flex-col items-start z-10 pointer-events-none">
                <div className="text-left mb-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Выполнение</span>
                </div>
                <div className="flex items-center gap-3 bg-gray-800/80 backdrop-blur-md border border-white/10 rounded-2xl p-3 shadow-xl">
                    <div className="relative w-12 h-12">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-700" />
                            <circle 
                                cx="24" cy="24" r="20" 
                                stroke="currentColor" strokeWidth="4" fill="transparent" 
                                strokeDasharray={125.6} 
                                strokeDashoffset={125.6 - (125.6 * percentage) / 100} 
                                className={`${percentage >= 80 ? 'text-emerald-400' : percentage >= 50 ? 'text-yellow-400' : 'text-indigo-400'} transition-all duration-1000 ease-out`}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white">{percentage.toFixed(0)}%</span>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className={`text-2xl font-bold ${percentage >= 80 ? 'text-emerald-400' : 'text-white'}`}>
                            {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(fact)}
                        </span>
                        <span className="text-[10px] text-gray-400">Текущий Факт</span>
                    </div>
                </div>
            </div>

            {/* RIGHT WIDGET: POTENTIAL (Gap) */}
            <div className="absolute top-0 right-4 flex flex-col items-end z-10 pointer-events-none">
                <div className="text-right mb-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Потенциал</span>
                </div>
                <div className="flex items-center gap-3 bg-gray-800/80 backdrop-blur-md border border-white/10 rounded-2xl p-3 shadow-xl">
                     <div className="flex flex-col items-end">
                        <span className="text-2xl font-bold text-indigo-400">
                            {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(potential)}
                        </span>
                        <span className="text-[10px] text-yellow-400">
                            Рост: +{new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(gap)}
                        </span>
                    </div>
                    <div className="relative w-12 h-12 flex items-center justify-center bg-indigo-500/10 rounded-full border border-indigo-500/20">
                         <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                        </svg>
                    </div>
                </div>
            </div>

            <canvas ref={chartContainer} />
        </div>
    );
};

export default DetailChart;