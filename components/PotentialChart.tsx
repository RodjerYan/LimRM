import React, { useEffect, useRef } from 'react';
import { AggregatedDataRow } from '../types';
import Chart from 'chart.js/auto';
import { formatLargeNumber } from '../utils/dataUtils';

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
        const yAxisLabel = `Сумма (${unit})`;
        
        const factData = labels.map(rm => rmAggregation[rm].fact / factor);
        const potentialData = labels.map(rm => rmAggregation[rm].potential / factor);
        const growthData = labels.map(rm => rmAggregation[rm].growth / factor);

        // Gradient fills
        const successGradient = ctx.createLinearGradient(0, 0, 0, 400);
        successGradient.addColorStop(0, 'rgba(52, 211, 153, 0.7)');
        successGradient.addColorStop(1, 'rgba(52, 211, 153, 0.1)');
        
        const accentGradient = ctx.createLinearGradient(0, 0, 0, 400);
        accentGradient.addColorStop(0, 'rgba(96, 165, 250, 0.7)');
        accentGradient.addColorStop(1, 'rgba(96, 165, 250, 0.1)');

        const chartData = {
            labels,
            datasets: [
                { type: 'bar' as const, label: `Факт`, data: factData, backgroundColor: successGradient, borderColor: '#34d399', borderWidth: 1, borderRadius: 4 },
                { type: 'bar' as const, label: `Потенциал`, data: potentialData, backgroundColor: accentGradient, borderColor: '#60a5fa', borderWidth: 1, borderRadius: 4 },
                { 
                    label: `Потенциал Роста`, data: growthData, type: 'line' as const, 
                    borderColor: '#fbbf24', tension: 0.4, yAxisID: 'y1', pointBackgroundColor: '#fbbf24', pointRadius: 4, pointHoverRadius: 6
                },
            ],
        };

        if (chartInstance.current) {
            chartInstance.current.data = chartData;
            const yScale: any = chartInstance.current.options.scales?.y;
            if (yScale?.title) {
                yScale.title.text = yAxisLabel;
            }
            const y1Scale: any = chartInstance.current.options.scales?.y1;
            if (y1Scale?.title) {
                y1Scale.title.text = `Потенциал Роста (${unit})`;
            }
            chartInstance.current.update();
        } else {
            chartInstance.current = new Chart(chartContainer.current, {
                type: 'bar',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { labels: { color: '#e2e8f0', usePointStyle: true, boxWidth: 8 } },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: '#161b22',
                            titleFont: { weight: 'bold' },
                            bodySpacing: 4,
                            padding: 10,
                            callbacks: {
                                label: function(context) {
                                    const rawValue = (context.raw as number) * factor;
                                    return `${context.dataset.label}: ${formatLargeNumber(rawValue)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { color: 'rgba(139, 148, 158, 0.2)' }, ticks: { color: '#e2e8f0' } },
                        y: { 
                            beginAtZero: true, 
                            title: { display: true, text: yAxisLabel, color: '#e2e8f0' },
                            grid: { color: 'rgba(139, 148, 158, 0.2)' }, ticks: { color: '#e2e8f0' } 
                        },
                        y1: {
                            type: 'linear', display: true, position: 'right',
                            title: { display: true, text: `Потенциал Роста (${unit})`, color: '#fbbf24' },
                            grid: { drawOnChartArea: false }, ticks: { color: '#fbbf24' }
                        }
                    },
                },
            });
        }
    }, [data]);
    
    // Cleanup chart instance on component unmount
    useEffect(() => {
        return () => {
            chartInstance.current?.destroy();
            chartInstance.current = null;
        }
    }, []);

    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white">Визуализация рыночного потенциала</h2>
            <div className="relative h-[45vh] w-full">
                <canvas ref={chartContainer} />
            </div>
        </div>
    );
};

export default PotentialChart;