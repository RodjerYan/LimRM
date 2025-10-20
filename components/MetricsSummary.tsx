import React from 'react';
import { Metrics } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, TargetIcon } from './icons';

interface MetricsSummaryProps {
    metrics: Metrics;
    totalPotentialTTs: number;
    totalActiveTTs: number;
}

const MetricItem: React.FC<{ label: string; value: string; color: string; icon: React.ReactNode; tooltip: string; }> = ({ label, value, color, icon, tooltip }) => (
    <div className="p-3 bg-gray-900/50 rounded-lg flex items-center gap-3" title={tooltip}>
        <div className={`${color} flex-shrink-0`}>
            {icon}
        </div>
        <div>
            <p className="text-xs text-gray-400">{label}</p>
            <p className={`font-bold text-lg text-slate-100`}>{value}</p>
        </div>
    </div>
);


const MetricsSummary: React.FC<MetricsSummaryProps> = ({ metrics, totalPotentialTTs, totalActiveTTs }) => {
    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-3">
                 Сводные метрики
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MetricItem 
                    label="Общий Факт" 
                    value={formatLargeNumber(metrics.totalFact)} 
                    color="text-success" 
                    icon={<FactIcon small />} 
                    tooltip="Сумма фактических продаж по всем отфильтрованным позициям за отчетный период."
                />
                <MetricItem 
                    label="Суммарный Новый План" 
                    value={formatLargeNumber(metrics.totalNewPlan)} 
                    color="text-accent" 
                    icon={<TargetIcon small />}
                    tooltip="Общий рекомендуемый план продаж, рассчитанный динамически на основе факта, потенциала рынка и баланса брендов."
                />
                <MetricItem 
                    label="Потенциал Роста" 
                    value={formatLargeNumber(metrics.totalGrowthPotential)} 
                    color="text-warning" 
                    icon={<GrowthIcon small />} 
                    tooltip="Разница между 'Суммарным Новым Планом' и 'Общим Фактом'. Показывает абсолютный объем роста, заложенный в план."
                />
                 <MetricItem 
                    label="Средний Рост к Факту" 
                    value={`${metrics.totalGrowthRate.toFixed(2)}%`} 
                    color="text-danger" 
                    icon={<TrendingUpIcon small />} 
                    tooltip="Средневзвешенный процент роста 'Нового Плана' по отношению к 'Факту' для отфильтрованных данных."
                />
                 <MetricItem 
                    label="Активная Клин. База (АКБ)" 
                    value={`${totalActiveTTs} шт.`} 
                    color="text-cyan-400" 
                    icon={<FactIcon small />} 
                    tooltip="Количество уникальных действующих клиентов (адресов) в рамках текущей фильтрации."
                />
                <MetricItem 
                    label="Общая Клин. База (ОКБ)" 
                    value={`${totalPotentialTTs} шт.`} 
                    color="text-teal-400" 
                    icon={<UsersIcon small />} 
                    tooltip="Общее количество потенциальных торговых точек (зоомагазины, ветклиники) в выбранных регионах, найденное по открытым данным."
                />
                 <MetricItem 
                    label="Общий Потенциал (Прогноз)" 
                    value={formatLargeNumber(metrics.totalPotential)} 
                    color="text-info" 
                    icon={<PotentialIcon small />}
                    tooltip="Первичная оценка ёмкости рынка, используемая для построения графика. Более точный расчет представлен в 'Новом Плане'."
                />
            </div>
             <p className="text-xs text-gray-500 mt-4 text-center">
                Метрики рассчитаны на основе отфильтрованных данных.
            </p>
        </div>
    );
};

export default MetricsSummary;