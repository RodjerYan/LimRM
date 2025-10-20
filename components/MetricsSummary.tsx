import React from 'react';
import { formatLargeNumber } from '../utils/dataUtils';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon } from './icons';

interface MetricsSummaryProps {
    totalFact: number;
    totalPotential: number;
    filteredCount: number;
    totalCount: number;
}

const MetricCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-card-bg/50 p-4 rounded-lg flex items-center gap-4 border border-gray-800">
        <div className={`p-3 rounded-full ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

const MetricsSummary: React.FC<MetricsSummaryProps> = ({ totalFact, totalPotential, filteredCount, totalCount }) => {
    const growthPotential = totalPotential - totalFact;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard 
                title="Общий Факт (кг/ед)"
                value={formatLargeNumber(totalFact)}
                icon={<FactIcon />}
                color="bg-green-500/20 text-success"
            />
            <MetricCard 
                title="Общий Потенциал (кг/ед)"
                value={formatLargeNumber(totalPotential)}
                icon={<PotentialIcon />}
                color="bg-indigo-500/20 text-accent"
            />
            <MetricCard 
                title="Потенциал Роста (кг/ед)"
                value={`${formatLargeNumber(growthPotential)}`}
                icon={<GrowthIcon />}
                color="bg-amber-500/20 text-warning"
            />
            <MetricCard 
                title="Отобрано записей"
                value={`${filteredCount} / ${totalCount}`}
                icon={<UsersIcon />}
                color="bg-sky-500/20 text-sky-400"
            />
        </div>
    );
};

export default MetricsSummary;
