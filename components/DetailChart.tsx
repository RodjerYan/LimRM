import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

interface DetailChartProps {
    fact: number;
    potential: number;
}

const DetailChart: React.FC<DetailChartProps> = ({ fact, potential }) => {
    const chartContainer = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartContainer.current) return;

        const ctx = chartContainer.current.getContext('2d');
        if (!ctx) return;

        const labels = ['Текущий Факт', 'Прогнозный Потенциал'];

        const maxValue = Math.max(fact, potential);
        const unit = maxValue > 1_000_000 ? 'млн' : maxValue > 1_000 ? 'тыс.' : '';
        const factor = unit === 'млн' ? 1_000_000 : unit === 'тыс.' ? 1_000 : 1;
        const yAxisLabel = `Объем (кг/ед, ${unit})`;
        
        const chartData = {
            labels,
            datasets: [{
                label: 'Объем продаж',
                data: [fact / factor, potential / factor],
                backgroundColor: ['#34d399', '#818cf8'],
                borderColor: ['#10b981', '#6366f1'],
                borderWidth: 1,
                borderRadius: 4,
            }],
        };

        if (chartInstance.current) {
            chartInstance.current.data = chartData;
            const yScale: any = chartInstance.current.options.scales?.y;
            if (yScale?.title) {
                yScale.title.text = yAxisLabel;
            }
            chartInstance.current.update();
        } else {
            chartInstance.current = new Chart(ctx, {
                type: 'bar',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        const originalValue = context.raw as number * factor;
                                        label += new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(originalValue) + ' кг/ед';
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { 
                            grid: { display: false }, 
                            ticks: { color: '#e2e8f0', font: { size: 14 } } 
                        },
                        y: { 
                            beginAtZero: true, 
                            title: { display: true, text: yAxisLabel, color: '#e2e8f0' },
                            grid: { color: '#4a5568' }, 
                            ticks: { color: '#e2e8f0' } 
                        },
                    },
                },
            });
        }
    }, [fact, potential]);

    useEffect(() => {
        return () => {
            chartInstance.current?.destroy();
            chartInstance.current = null;
        }
    }, []);

    return <canvas ref={chartContainer} />;
};

export default DetailChart;