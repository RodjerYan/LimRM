import React from 'react';
import { OkbStatus, SummaryMetrics } from '../types';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, TargetIcon, CalculatorIcon, CoverageIcon } from './icons';

interface MetricCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    tooltip: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, color, tooltip }) => (
    <div 
        title={tooltip} 
        className={`bg-card-bg/50 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-indigo-500/10 flex items-start space-x-4 transition-transform hover:scale-105 hover:shadow-indigo-500/20`}
    >
        <div className={`p-3 rounded-lg ${color} bg-opacity-20`}>
           {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

const formatNumber = (num: number, short = true) => {
    if (short) {
        if (Math.abs(num) >= 1_000_000) {
            return `${(num / 1_000_000).toFixed(2)} млн`;
        }
        if (Math.abs(num) >= 1_000) {
            return `${(num / 1_000).toFixed(1)} тыс.`;
        }
    }
    return num.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

interface MetricsSummaryProps {
    metrics: SummaryMetrics | null;
    okbStatus: OkbStatus | null;
    disabled: boolean;
}

const MetricsSummary: React.FC<MetricsSummaryProps> = ({ metrics, okbStatus, disabled }) => {
    if (disabled || !metrics) {
        return (
            <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${disabled ? 'opacity-50' : ''}`}>
                {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="bg-card-bg/50 p-5 rounded-xl animate-pulse">
                        <div className="h-6 bg-gray-700 rounded w-3/4 mb-2"></div>
                        <div className="h-8 bg-gray-600 rounded w-1/2"></div>
                    </div>
                ))}
            </div>
        );
    }
    
    const avgFactPerClient = metrics.totalActiveClients > 0 ? metrics.totalFact / metrics.totalActiveClients : 0;
    const okbCoverage = (okbStatus?.rowCount && metrics.totalActiveClients > 0) 
        ? (metrics.totalActiveClients / okbStatus.rowCount) * 100 
        : 0;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard 
                title="Общий Факт" 
                value={formatNumber(metrics.totalFact)} 
                icon={<FactIcon />} 
                color="text-success"
                tooltip={`Текущий объем продаж: ${formatNumber(metrics.totalFact, false)} кг/ед`}
            />
            <MetricCard 
                title="Общий Потенциал" 
                value={formatNumber(metrics.totalPotential)} 
                icon={<PotentialIcon />} 
                color="text-accent"
                tooltip={`Прогнозируемый объем рынка: ${formatNumber(metrics.totalPotential, false)} кг/ед`}
            />
            <MetricCard 
                title="Потенциал Роста" 
                value={formatNumber(metrics.totalGrowth)} 
                icon={<GrowthIcon />} 
                color="text-warning"
                tooltip={`Неосвоенный объем рынка: ${formatNumber(metrics.totalGrowth, false)} кг/ед`}
            />
            <MetricCard 
                title="Средний Рост" 
                value={`${metrics.averageGrowthPercentage.toFixed(1)}%`}
                icon={<TrendingUpIcon />} 
                color="text-yellow-400"
                tooltip="Средний процент неосвоенного потенциала по всем группам"
            />
            <MetricCard 
                title="Активных Клиентов" 
                value={formatNumber(metrics.totalActiveClients, false)}
                icon={<UsersIcon />} 
                color="text-cyan-400"
                tooltip="Общее количество уникальных ТТ в загруженном файле."
            />
            <MetricCard 
                title="Средний Факт (Клиент)"
                value={formatNumber(avgFactPerClient)}
                icon={<CalculatorIcon />}
                color="text-indigo-400"
                tooltip={`Средние продажи на одну активную ТТ: ${formatNumber(avgFactPerClient, false)} кг/ед`}
            />
             <MetricCard 
                title="Покрытие ОКБ"
                value={`${okbCoverage.toFixed(1)}%`}
                icon={<CoverageIcon />}
                color="text-rose-400"
                tooltip={`Доля активных клиентов из общей базы (${metrics.totalActiveClients} из ${okbStatus?.rowCount || 0})`}
            />
            <MetricCard 
                title="Топ РМ (по росту)" 
                value={metrics.topPerformingRM.name}
                icon={<TargetIcon />} 
                color="text-red-400"
                tooltip={`РМ с наибольшим потенциалом роста: ${formatNumber(metrics.topPerformingRM.value)} кг/ед`}
            />
        </div>
    );
};

export default MetricsSummary;