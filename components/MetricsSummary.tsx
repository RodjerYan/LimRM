import React from 'react';
import { Metrics } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, TargetIcon } from './icons';

interface MetricsSummaryProps {
    metrics: Metrics;
    totalPotentialTTs: number;
}

const MetricItem: React.FC<{ label: string; value: string; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
    <div className="p-3 bg-gray-900/50 rounded-lg flex items-center gap-3">
        <div className={`${color} flex-shrink-0`}>
            {icon}
        </div>
        <div>
            <p className="text-xs text-gray-400">{label}</p>
            <p className={`font-bold text-lg text-slate-100`}>{value}</p>
        </div>
    </div>
);


const MetricsSummary: React.FC<MetricsSummaryProps> = ({ metrics, totalPotentialTTs }) => {
    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-3">
                 <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">3</span>
                 Сводные метрики
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MetricItem label="Общий Факт" value={formatLargeNumber(metrics.totalFact)} color="text-success" icon={<FactIcon small />} />
                <MetricItem label="Суммарный Новый План" value={formatLargeNumber(metrics.totalNewPlan)} color="text-accent" icon={<TargetIcon small />} />
                <MetricItem label="Общий Потенциал" value={formatLargeNumber(metrics.totalPotential)} color="text-info" icon={<PotentialIcon small />} />
                <MetricItem label="Потенциал Роста" value={formatLargeNumber(metrics.totalGrowthPotential)} color="text-warning" icon={<GrowthIcon small />} />
                <MetricItem label="Общая Клиентская База" value={`${totalPotentialTTs} шт.`} color="text-teal-400" icon={<UsersIcon small />} />
                <MetricItem label="Средний Рост к Факту" value={`${metrics.totalGrowthRate.toFixed(2)}%`} color="text-danger" icon={<TrendingUpIcon small />} />
            </div>
             <p className="text-xs text-gray-500 mt-4 text-center">
                Метрики рассчитаны на основе отфильтрованных данных.
            </p>
        </div>
    );
};

export default MetricsSummary;