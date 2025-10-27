
import React from 'react';
import { SummaryMetrics } from '../types';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, TargetIcon } from './icons';

interface MetricCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    tooltip: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, color, tooltip }) => (
    <div title={tooltip} className="bg-card-bg/50 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-indigo-500/10 flex items-start space-x-4 transition-transform hover:scale-105 hover:shadow-indigo-500/20">
        <div className={`p-3 rounded-lg ${color} bg-opacity-20`}>
           {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

const formatNumber = (num: number) => {
    if (Math.abs(num) >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(2)} млн`;
    }
    if (Math.abs(num) >= 1_000) {
        return `${(num / 1_000).toFixed(1)} тыс.`;
    }
    return num.toFixed(0);
};

interface MetricsSummaryProps {
    metrics: SummaryMetrics | null;
    disabled: boolean;
}

const MetricsSummary: React.FC<MetricsSummaryProps> = ({ metrics, disabled }) => {
    if (disabled || !metrics) {
        // Render placeholders
        return (
            <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 ${disabled ? 'opacity-50' : ''}`}>
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="bg-card-bg/50 p-5 rounded-xl animate-pulse">
                        <div className="h-6 bg-gray-700 rounded w-3/4 mb-2"></div>
                        <div className="h-8 bg-gray-600 rounded w-1/2"></div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard 
                title="Общий Факт" 
                value={formatNumber(metrics.totalFact)} 
                icon={<FactIcon />} 
                color="text-success"
                tooltip={`Текущий объем продаж: ${metrics.totalFact.toLocaleString('ru-RU')} кг/ед`}
            />
            <MetricCard 
                title="Общий Потенциал" 
                value={formatNumber(metrics.totalPotential)} 
                icon={<PotentialIcon />} 
                color="text-accent"
                tooltip={`Прогнозируемый объем рынка: ${metrics.totalPotential.toLocaleString('ru-RU')} кг/ед`}
            />
            <MetricCard 
                title="Потенциал Роста" 
                value={formatNumber(metrics.totalGrowth)} 
                icon={<GrowthIcon />} 
                color="text-warning"
                tooltip={`Неосвоенный объем рынка: ${metrics.totalGrowth.toLocaleString('ru-RU')} кг/ед`}
            />
            <MetricCard 
                title="Средний Рост" 
                value={`${metrics.averageGrowthPercentage.toFixed(1)}%`}
                icon={<TrendingUpIcon />} 
                color="text-yellow-400"
                tooltip="Средний процент неосвоенного потенциала по всем клиентам"
            />
            <MetricCard 
                title="Активных Клиентов" 
                value={metrics.totalClients.toLocaleString('ru-RU')}
                icon={<UsersIcon />} 
                color="text-cyan-400"
                tooltip="Количество уникальных клиентов в выборке"
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
