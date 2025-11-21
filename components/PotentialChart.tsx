import React, { useEffect, useRef } from 'react';
import { AggregatedDataRow } from '../types';
import Chart from 'chart.js/auto';

interface PotentialChartProps {
    data: AggregatedDataRow[];
}

const PotentialChart: React.FC<PotentialChartProps> = ({ data }) => {
    const chartContainer = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartContainer.current) return;
        const ctx = chartContainer.current.getContext('2d');
        if (!ctx) return;

        const rmAggregation = data.reduce((acc, item) => {
            if (!acc[item.rm]) {
                acc[item.rm] = { fact: 0, potential: 0, growth: 0 };
            }
            acc[item.rm].fact += item.fact;
            acc[item.rm].potential += item.potential;
            acc[item.rm].growth += item.growthPotential;
            return acc;
        }, {} as { [key: string]: { fact: number, potential: number, growth: number } });

        const labels = Object.keys(rmAggregation).sort((a, b) => rmAggregation[b].potential - rmAggregation[a].potential);

        const maxValue = Math.max(...labels.map(rm => rmAggregation[rm].potential));
        const unit = maxValue > 1_000_000 ? 'млн' : maxValue > 1_000 ? 'тыс.' : '';
        const factor = unit === 'млн' ? 1_000_000 : unit === 'тыс.' ? 1_000 : 1;
        const yAxisLabel = unit ? `Сумма (${unit})` : 'Сумма';
        
        const factData = labels.map(rm => rmAggregation[rm].fact / factor);
        const potentialData = labels.map(rm => rmAggregation[rm].potential / factor);
        const growthData = labels.map(rm => rmAggregation[rm].growth / factor);

        // --- Professional Visuals ---
        
        // Gradients
        const factGradient = ctx.createLinearGradient(0, 0, 0, 400);
        factGradient.addColorStop(0, 'rgba(52, 211, 153, 0.9)');   // Emerald 400
        factGradient.addColorStop(1, 'rgba(52, 211, 153, 0.4)');

        const potentialGradient = ctx.createLinearGradient(0, 0, 0, 400);
        potentialGradient.addColorStop(0, 'rgba(129, 140, 248, 0.9)'); // Indigo 400
        potentialGradient.addColorStop(1, 'rgba(129, 140, 248, 0.4)');

        const chartData = {
            labels,
            datasets: [
                { 
                    type: 'bar' as const, 
                    label: `Факт`, 
                    data: factData, 
                    backgroundColor: '#34d399', // Flat color for legend, gradient for bars via scriptable if needed but passing gradient obj works
                    hoverBackgroundColor: '#10b981',
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8,
                    order: 2
                },
                { 
                    type: 'bar' as const, 
                    label: `Потенциал`, 
                    data: potentialData, 
                    backgroundColor: '#818cf8',
                    hoverBackgroundColor: '#6366f1',
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8,
                    order: 3
                },
                { 
                    type: 'line' as const, 
                    label: `Потенциал Роста`, 
                    data: growthData, 
                    borderColor: '#fbbf24', // Amber 400
                    backgroundColor: '#fbbf24',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#fbbf24',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 1
                },
            ],
        };

        // Apply gradients directly to dataset objects
        chartData.datasets[0].backgroundColor = factGradient as any;
        chartData.datasets[1].backgroundColor = potentialGradient as any;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        chartInstance.current = new Chart(chartContainer.current, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: { 
                    legend: { 
                        labels: { 
                            color: '#cbd5e1', 
                            font: { family: "'Geist', sans-serif", size: 12 },
                            usePointStyle: true,
                            padding: 20
                        },
                        position: 'top',
                        align: 'end'
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#f8fafc',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(148, 163, 184, 0.2)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: (context) => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(context.parsed.y);
                                    if (unit) label += ` ${unit}`;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: '#94a3b8', font: { family: "'Geist', sans-serif" } },
                        border: { display: false }
                    },
                    y: { 
                        beginAtZero: true, 
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: false },
                        grid: { color: 'rgba(71, 85, 105, 0.3)', borderDash: [4, 4] } as any, 
                        ticks: { color: '#64748b', font: { family: "'Geist Mono', monospace" } },
                        border: { display: false }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: `Потенциал Роста`, color: '#fbbf24', font: { size: 10 } },
                        grid: { display: false },
                        ticks: { color: '#fbbf24', font: { family: "'Geist Mono', monospace" } },
                        border: { display: false }
                    }
                },
            },
        });

    }, [data]);
    
    useEffect(() => {
        return () => {
            chartInstance.current?.destroy();
            chartInstance.current = null;
        }
    }, []);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white tracking-tight">Визуализация рыночного потенциала</h2>
            </div>
            <div className="relative h-[45vh] w-full">
                <canvas ref={chartContainer} />
            </div>
        </div>
    );
};

export default PotentialChart;