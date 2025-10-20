import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { AggregatedDataRow } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';

interface PotentialChartProps {
    data: AggregatedDataRow[];
}

const PotentialChart: React.FC<PotentialChartProps> = ({ data }) => {
    const chartContainer = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    // Aggregate data by brand for the chart
    const chartData = React.useMemo(() => {
        const brandData = new Map<string, { fact: number, potential: number }>();
        data.forEach(row => {
            const current = brandData.get(row.brand) || { fact: 0, potential: 0 };
            current.fact += row.fact;
            current.potential += row.potential;
            brandData.set(row.brand, current);
        });

        const sortedBrands = Array.from(brandData.entries()).sort((a, b) => b[1].potential - a[1].potential).slice(0, 10);

        return {
            labels: sortedBrands.map(item => item[0]),
            datasets: [
                {
                    label: 'Факт',
                    data: sortedBrands.map(item => item[1].fact),
                    backgroundColor: 'rgba(52, 211, 153, 0.7)',
                    borderColor: '#34d399',
                    borderWidth: 1,
                },
                {
                    label: 'Потенциал',
                    data: sortedBrands.map(item => item[1].potential),
                    backgroundColor: 'rgba(129, 140, 248, 0.7)',
                    borderColor: '#818cf8',
                    borderWidth: 1,
                },
            ],
        };
    }, [data]);

    useEffect(() => {
        if (!chartContainer.current) return;
        const ctx = chartContainer.current.getContext('2d');
        if (!ctx) return;

        if (chartInstance.current) {
            chartInstance.current.data = chartData;
            chartInstance.current.update();
        } else {
            chartInstance.current = new Chart(ctx, {
                type: 'bar',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { color: '#e2e8f0' }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => `${context.dataset.label}: ${formatLargeNumber(context.raw as number)} кг/ед`,
                            },
                        },
                        title: {
                            display: true,
                            text: 'Топ-10 Брендов по Потенциалу',
                            color: '#e2e8f0',
                            font: { size: 16 }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            grid: { color: '#4a5568' },
                            ticks: { color: '#e2e8f0' },
                            title: { display: true, text: 'Объем (кг/ед)', color: '#e2e8f0' }
                        },
                        y: {
                            stacked: true,
                            grid: { display: false },
                            ticks: { color: '#e2e8f0' }
                        },
                    },
                },
            });
        }
    }, [chartData]);

    useEffect(() => {
        return () => {
            chartInstance.current?.destroy();
            chartInstance.current = null;
        };
    }, []);

    return <canvas ref={chartContainer} />;
};

export default PotentialChart;
