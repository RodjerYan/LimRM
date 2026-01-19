
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

        // 1. Aggregate Data by RM
        const rmAggregation = data.reduce((acc, item) => {
            if (!acc[item.rm]) {
                acc[item.rm] = { fact: 0, potential: 0 };
            }
            acc[item.rm].fact += item.fact;
            acc[item.rm].potential += item.potential;
            return acc;
        }, {} as { [key: string]: { fact: number, potential: number } });

        const labels = Object.keys(rmAggregation).sort((a, b) => rmAggregation[b].potential - rmAggregation[a].potential);

        // Determine Scaling Unit
        const maxVal = Math.max(...Object.values(rmAggregation).map(v => v.potential));
        let unit = '';
        let factor = 1;
        if (maxVal > 1_000_000) { unit = 'млн'; factor = 1_000_000; }
        else if (maxVal > 1_000) { unit = 'тыс.'; factor = 1_000; }

        const potentialData = labels.map(rm => rmAggregation[rm].potential / factor);
        const factData = labels.map(rm => rmAggregation[rm].fact / factor);
        const efficiencyData = labels.map(rm => {
            const p = rmAggregation[rm].potential;
            return p > 0 ? (rmAggregation[rm].fact / p) * 100 : 0;
        });

        // 2. Create Gradients
        const factGradient = ctx.createLinearGradient(0, 0, 0, 400);
        factGradient.addColorStop(0, '#10b981'); // Emerald 500
        factGradient.addColorStop(1, 'rgba(16, 185, 129, 0.2)');

        const potentialGradient = ctx.createLinearGradient(0, 0, 0, 400);
        potentialGradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)'); // Indigo 500 low alpha
        potentialGradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        chartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Потенциал',
                        data: potentialData,
                        backgroundColor: potentialGradient,
                        borderColor: 'rgba(99, 102, 241, 0.3)',
                        borderWidth: 1,
                        borderRadius: 6,
                        barPercentage: 0.7, // Wide background bar
                        categoryPercentage: 0.8,
                        grouped: false, // Allows overlay
                        order: 2, // Behind
                        yAxisID: 'y',
                        hoverBackgroundColor: 'rgba(99, 102, 241, 0.4)', // Added hover color
                        hoverBorderColor: '#6366f1',
                        hoverBorderWidth: 2
                    },
                    {
                        label: 'Факт',
                        data: factData,
                        backgroundColor: factGradient,
                        hoverBackgroundColor: '#059669',
                        borderRadius: 6,
                        barPercentage: 0.3, // Narrow foreground bar
                        grouped: false, // Allows overlay
                        order: 1, // In Front
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'Эффективность (%)',
                        data: efficiencyData,
                        borderColor: '#fbbf24', // Amber 400
                        backgroundColor: '#fbbf24',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        pointBackgroundColor: '#1f2937',
                        pointBorderColor: '#fbbf24',
                        pointBorderWidth: 2,
                        tension: 0.4,
                        yAxisID: 'y1',
                        order: 0 // Topmost
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: '#9ca3af', font: { size: 11, family: "'Geist', sans-serif" }, boxWidth: 10, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f3f4f6',
                        bodyColor: '#d1d5db',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => {
                                let val = ctx.raw as number;
                                if (ctx.dataset.type === 'line') {
                                    return `Эффективность: ${val.toFixed(1)}%`;
                                }
                                return `${ctx.dataset.label}: ${val.toFixed(1)} ${unit}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9ca3af', font: { size: 11, family: "'Geist', sans-serif" } },
                        border: { display: false }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [5, 5] } as any,
                        ticks: { color: '#64748b', font: { size: 10, family: "'Geist Mono', monospace" } },
                        border: { display: false },
                        grace: '10%' // Adds breathing room above the tallest bar
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { display: false },
                        min: 0,
                        max: 110, // Explicitly set max > 100 to prevent line from sticking to the top edge
                        ticks: { color: '#fbbf24', callback: (v) => v + '%', font: { size: 10, family: "'Geist Mono', monospace" } },
                        border: { display: false }
                    }
                }
            }
        });

    }, [data]);

    useEffect(() => {
        return () => {
            chartInstance.current?.destroy();
            chartInstance.current = null;
        }
    }, []);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 className="text-lg font-bold text-white tracking-tight">Рыночный Потенциал и Эффективность</h2>
            </div>
            <div className="relative w-full flex-grow min-h-[350px]">
                <canvas ref={chartContainer} />
            </div>
        </div>
    );
};

export default PotentialChart;
