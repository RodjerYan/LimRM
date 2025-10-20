import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { AggregatedDataRow } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';

interface DashboardChartsProps {
    data: AggregatedDataRow[];
}

const DashboardCharts: React.FC<DashboardChartsProps> = ({ data }) => {
    const pieChartContainer = useRef<HTMLCanvasElement>(null);
    const pieChartInstance = useRef<Chart | null>(null);

    const pieChartData = React.useMemo(() => {
        const rmData = new Map<string, number>();
        data.forEach(row => {
            const current = rmData.get(row.rm) || 0;
            rmData.set(row.rm, current + row.potential);
        });

        const sortedRMs = Array.from(rmData.entries()).sort((a, b) => b[1] - a[1]).slice(0, 7);
        const labels = sortedRMs.map(item => item[0]);
        const values = sortedRMs.map(item => item[1]);

        return {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#e879f9'],
                hoverOffset: 4
            }]
        };
    }, [data]);

    useEffect(() => {
        if (!pieChartContainer.current) return;
        const ctx = pieChartContainer.current.getContext('2d');
        if (!ctx) return;

        if (pieChartInstance.current) {
            pieChartInstance.current.data = pieChartData;
            pieChartInstance.current.update();
        } else {
            pieChartInstance.current = new Chart(ctx, {
                type: 'pie',
                data: pieChartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: '#e2e8f0' } },
                        title: {
                            display: true,
                            text: 'Распределение Потенциала по РМ (Топ-7)',
                            color: '#e2e8f0',
                            font: { size: 16 }
                        },
                        tooltip: {
                             callbacks: {
                                label: (context) => {
                                    const label = context.label || '';
                                    const value = context.raw as number;
                                    return `${label}: ${formatLargeNumber(value)} кг/ед`;
                                },
                            },
                        }
                    }
                }
            });
        }
    }, [pieChartData]);
    
     useEffect(() => {
        return () => {
            pieChartInstance.current?.destroy();
            pieChartInstance.current = null;
        };
    }, []);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-card-bg/70 p-6 rounded-2xl h-96">
                <canvas ref={pieChartContainer} />
            </div>
             <div className="bg-card-bg/70 p-6 rounded-2xl h-96 flex items-center justify-center">
                <p className="text-gray-500">Другой график здесь...</p>
            </div>
        </div>
    );
};

export default DashboardCharts;
