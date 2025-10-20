import React, { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { AggregatedDataRow } from '../types';

interface DashboardChartsProps {
    data: AggregatedDataRow[];
}

const CHART_COLORS = [
    '#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', 
    '#a78bfa', '#f472b6', '#4ade80', '#fb923c', '#22d3ee'
];

const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-card-bg/50 p-4 rounded-lg border border-gray-800 h-80">
        <h3 className="text-lg font-bold text-white mb-3 text-center">{title}</h3>
        <div className="relative h-64">
            {children}
        </div>
    </div>
);

const BarChart: React.FC<{ data: AggregatedDataRow[] }> = ({ data }) => {
    const chartContainer = useRef<HTMLCanvasElement>(null);

    const chartData = useMemo(() => {
        const rmData = new Map<string, number>();
        data.forEach(row => {
            rmData.set(row.rm, (rmData.get(row.rm) || 0) + row.fact);
        });
        const sorted = [...rmData.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        return {
            labels: sorted.map(d => d[0]),
            datasets: [{
                label: 'Факт продаж',
                data: sorted.map(d => d[1]),
                backgroundColor: CHART_COLORS,
                borderRadius: 4,
            }]
        };
    }, [data]);

    useEffect(() => {
        if (!chartContainer.current) return;
        const chart = new Chart(chartContainer.current, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { color: '#e2e8f0' }, grid: { color: '#4a5568' } },
                    x: { ticks: { color: '#e2e8f0' }, grid: { display: false } }
                }
            }
        });
        return () => chart.destroy();
    }, [chartData]);
    
    return <canvas ref={chartContainer} />;
};

const PieChart: React.FC<{ data: AggregatedDataRow[] }> = ({ data }) => {
    const chartContainer = useRef<HTMLCanvasElement>(null);

    const chartData = useMemo(() => {
        const brandData = new Map<string, number>();
        data.forEach(row => {
            brandData.set(row.brand, (brandData.get(row.brand) || 0) + row.fact);
        });
        const sorted = [...brandData.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        return {
            labels: sorted.map(d => d[0]),
            datasets: [{
                data: sorted.map(d => d[1]),
                backgroundColor: CHART_COLORS,
                hoverOffset: 4,
            }]
        };
    }, [data]);
    
    useEffect(() => {
        if (!chartContainer.current) return;
        const chart = new Chart(chartContainer.current, {
            type: 'pie',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#e2e8f0' }
                    }
                }
            }
        });
        return () => chart.destroy();
    }, [chartData]);

    return <canvas ref={chartContainer} />;
};

const DashboardCharts: React.FC<DashboardChartsProps> = ({ data }) => {
    if (data.length === 0) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card-bg/50 p-4 rounded-lg border border-gray-800 h-80 flex items-center justify-center text-gray-500">
                    Графики появятся после загрузки данных.
                </div>
                <div className="bg-card-bg/50 p-4 rounded-lg border border-gray-800 h-80 flex items-center justify-center text-gray-500">
                    Графики появятся после загрузки данных.
                </div>
            </div>
        );
    }
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="Топ-10 РМ по объему продаж">
                <BarChart data={data} />
            </ChartCard>
            <ChartCard title="Доля брендов в продажах (Топ-10)">
                <PieChart data={data} />
            </ChartCard>
        </div>
    );
};

export default DashboardCharts;