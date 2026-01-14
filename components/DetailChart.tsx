import React, { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { FactIcon, PotentialIcon } from './icons';

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

        // Enhanced Gradients
        const gradientFact = ctx.createLinearGradient(0, 0, 0, 400);
        gradientFact.addColorStop(0, 'rgba(16, 185, 129, 0.9)'); // Emerald 500
        gradientFact.addColorStop(1, 'rgba(16, 185, 129, 0.2)');

        const gradientPotential = ctx.createLinearGradient(0, 0, 0, 400);
        gradientPotential.addColorStop(0, 'rgba(99, 102, 241, 0.9)'); // Indigo 500
        gradientPotential.addColorStop(1, 'rgba(99, 102, 241, 0.2)');

        const maxValue = Math.max(fact, potential) * 1.15; 
        
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

        const chartConfig = {
            type: 'bar' as const,
            data: {
                labels: ['Текущий Факт', 'Общий Потенциал'],
                datasets: [{
                    label: 'Объем',
                    data: [fact, potential],
                    backgroundColor: [gradientFact, gradientPotential],
                    borderColor: ['transparent', 'transparent'],
                    borderWidth: 0,
                    borderRadius: 8,
                    barThickness: 'flex' as const,
                    maxBarThickness: 120,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1200,
                    easing: 'easeOutQuart' as const,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(148, 163, 184, 0.2)',
                        borderWidth: 1,
                        padding: 14,
                        cornerRadius: 10,
                        displayColors: false,
                        callbacks: {
                            title: () => '', // No title
                            label: function(context: any) {
                                const val = context.raw as number;
                                const formattedVal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(val);
                                
                                if (context.dataIndex === 0) { // Fact
                                    const pot = context.chart.data.datasets[0].data[1] as number;
                                    const pct = pot > 0 ? ((val / pot) * 100).toFixed(1) : 0;
                                    return [`Факт: ${formattedVal}`, `Выполнение: ${pct}%`];
                                } else { // Potential
                                    const f = context.chart.data.datasets[0].data[0] as number;
                                    const g = val - f;
                                    return [`Потенциал: ${formattedVal}`, g > 0 ? `Рост: +${new Intl.NumberFormat('ru-RU').format(g)}` : ''];
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { display: false }, 
                        ticks: { 
                            color: '#cbd5e1', 
                            font: { size: 14, family: "'Geist', sans-serif", weight: 600 },
                            padding: 10
                        },
                        border: { display: false }
                    },
                    y: { 
                        beginAtZero: true, 
                        max: maxValue,
                        grid: { 
                            color: 'rgba(255, 255, 255, 0.05)',
                            tickLength: 0,
                        }, 
                        ticks: { 
                            color: '#64748b',
                            font: { size: 11, family: "'Geist Mono', monospace" },
                            callback: function(value: any) {
                                return (value / factor).toFixed(0) + (unit ? ` ${unit}` : '');
                            },
                            padding: 10
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
        <div className="relative w-full h-full">
            <canvas ref={chartContainer} />
            
            {/* Floating Metric Badge */}
            <div className="absolute top-4 right-4 bg-gray-800/90 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-lg flex items-center gap-4">
                <div className="flex flex-col items-end">
                    <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Потенциал Роста</span>
                    <span className="text-lg font-bold text-amber-400 font-mono">
                        +{new Intl.NumberFormat('ru-RU', { notation: "compact", maximumFractionDigits: 1 }).format(gap)}
                    </span>
                </div>
                <div className="h-8 w-px bg-gray-700"></div>
                <div className="flex flex-col items-end">
                    <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Выполнение</span>
                    <span className={`text-lg font-bold font-mono ${percentage >= 80 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                        {percentage.toFixed(0)}%
                    </span>
                </div>
            </div>
        </div>
    );
};

export default DetailChart;