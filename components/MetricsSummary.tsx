
import React, { useState } from 'react';
import { OkbStatus, SummaryMetrics } from '../types';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, TargetIcon, CalculatorIcon, CoverageIcon, InfoIcon } from './icons';
import Modal from './Modal';

interface MetricCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    tooltip: string;
    onClick?: () => void;
    isClickable?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, color, tooltip, onClick, isClickable }) => (
    <div 
        title={tooltip} 
        onClick={onClick}
        className={`bg-card-bg/50 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-indigo-500/10 flex items-start space-x-4 transition-transform hover:scale-105 hover:shadow-indigo-500/20 ${isClickable ? 'cursor-pointer' : ''}`}
    >
        <div className={`p-3 rounded-lg ${color} bg-opacity-20`}>
           {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400 flex items-center gap-1">
                {title}
                {isClickable && <span className="w-4 h-4 opacity-50"><InfoIcon /></span>}
            </p>
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
    onActiveClientsClick?: () => void;
}

type MetricType = 'totalFact' | 'totalPotential' | 'totalGrowth' | 'avgGrowth' | 'avgFact' | 'coverage' | 'topRM';

const METRIC_EXPLANATIONS: Record<MetricType, { title: string; description: React.ReactNode }> = {
    totalFact: {
        title: 'Общий Факт',
        description: (
            <div className="space-y-3 text-gray-300">
                <p>Суммарный объем продаж по всем загруженным строкам из файла.</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                    <li><strong>Источник:</strong> Колонка "Вес" (или аналогичная) в загруженном файле.</li>
                    <li><strong>Логика:</strong> Прямая сумма значений факта по всем активным клиентам.</li>
                </ul>
            </div>
        )
    },
    totalPotential: {
        title: 'Общий Потенциал',
        description: (
            <div className="space-y-3 text-gray-300">
                <p>Прогнозируемый объем рынка для всех текущих клиентов и групп.</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                    <li><strong>Источник:</strong> Колонка "Потенциал" в файле.</li>
                    <li><strong>Если колонки нет:</strong> Рассчитывается автоматически как <em>Факт × 1.15</em> (15% прироста).</li>
                    <li><strong>Корректировка:</strong> Если указанный потенциал меньше факта, система автоматически принимает Потенциал = Факт (рынок полностью освоен).</li>
                </ul>
            </div>
        )
    },
    totalGrowth: {
        title: 'Потенциал Роста',
        description: (
            <div className="space-y-3 text-gray-300">
                <p>Абсолютный объем продаж, который можно дополнительно получить с текущей клиентской базы.</p>
                <div className="bg-gray-800 p-2 rounded border border-gray-700 font-mono text-xs">
                    Формула: Общий Потенциал - Общий Факт
                </div>
                <p className="text-sm">Это "деньги на столе" — объем, который клиенты покупают у конкурентов или недобирают.</p>
            </div>
        )
    },
    avgGrowth: {
        title: 'Средний Рост',
        description: (
            <div className="space-y-3 text-gray-300">
                <p>Средневзвешенный процент неосвоенного потенциала по всей компании.</p>
                <div className="bg-gray-800 p-2 rounded border border-gray-700 font-mono text-xs">
                    Формула: (Потенциал Роста / Общий Потенциал) × 100%
                </div>
                <p className="text-sm">Показывает, насколько в среднем мы можем вырасти, если реализуем весь потенциал текущих клиентов.</p>
            </div>
        )
    },
    avgFact: {
        title: 'Средний Факт (на Клиента)',
        description: (
            <div className="space-y-3 text-gray-300">
                <p>Средний объем продаж на одну активную торговую точку (ТТ).</p>
                <div className="bg-gray-800 p-2 rounded border border-gray-700 font-mono text-xs">
                    Формула: Общий Факт / Количество Активных Клиентов
                </div>
                <p className="text-sm">Используется для оценки эффективности работы с единичной точкой (Удельный вес ТТ).</p>
            </div>
        )
    },
    coverage: {
        title: 'Покрытие ОКБ',
        description: (
            <div className="space-y-3 text-gray-300">
                <p>Доля рынка, выраженная в количественном охвате торговых точек из Общей Клиентской Базы (ОКБ).</p>
                <div className="bg-gray-800 p-2 rounded border border-gray-700 font-mono text-xs">
                    Формула: (Кол-во Активных Клиентов / Общее кол-во строк в ОКБ) × 100%
                </div>
                <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    <li><strong>Низкое покрытие:</strong> Означает наличие большого числа "холодных" клиентов в базе, с которыми еще не ведется работа (Blue Ocean).</li>
                    <li><strong>Высокое покрытие:</strong> Означает высокую насыщенность, рост возможен только за счет увеличения среднего чека (качественная дистрибуция).</li>
                </ul>
            </div>
        )
    },
    topRM: {
        title: 'Топ РМ (по росту)',
        description: (
            <div className="space-y-3 text-gray-300">
                <p>Региональный менеджер с самым высоким абсолютным показателем <strong>Потенциала Роста</strong>.</p>
                <p className="text-sm">Это не обязательно РМ с самыми большими продажами, а тот, у кого на территории (среди текущих клиентов) скрыто больше всего возможностей для увеличения объема.</p>
                <p className="text-sm italic text-gray-400">Именно сюда стоит направить маркетинговые усилия в первую очередь.</p>
            </div>
        )
    }
};

const MetricsSummary: React.FC<MetricsSummaryProps> = ({ metrics, okbStatus, disabled, onActiveClientsClick }) => {
    const [selectedExplanation, setSelectedExplanation] = useState<MetricType | null>(null);

    if (disabled || !metrics) {
        // Render placeholders
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
    
    const avgFactPerClient = metrics.totalClients > 0 ? metrics.totalFact / metrics.totalClients : 0;
    const okbCoverage = (okbStatus?.rowCount && metrics.totalActiveClients > 0) 
        ? (metrics.totalActiveClients / okbStatus.rowCount) * 100 
        : 0;

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard 
                    title="Общий Факт" 
                    value={formatNumber(metrics.totalFact)} 
                    icon={<FactIcon />} 
                    color="text-success"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('totalFact')}
                />
                <MetricCard 
                    title="Общий Потенциал" 
                    value={formatNumber(metrics.totalPotential)} 
                    icon={<PotentialIcon />} 
                    color="text-accent"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('totalPotential')}
                />
                <MetricCard 
                    title="Потенциал Роста" 
                    value={formatNumber(metrics.totalGrowth)} 
                    icon={<GrowthIcon />} 
                    color="text-warning"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('totalGrowth')}
                />
                <MetricCard 
                    title="Средний Рост" 
                    value={`${metrics.averageGrowthPercentage.toFixed(1)}%`}
                    icon={<TrendingUpIcon />} 
                    color="text-yellow-400"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('avgGrowth')}
                />
                <MetricCard 
                    title="Активных Клиентов" 
                    value={formatNumber(metrics.totalActiveClients, false)}
                    icon={<UsersIcon />} 
                    color="text-cyan-400"
                    tooltip="Нажмите для просмотра списка клиентов"
                    onClick={onActiveClientsClick}
                    isClickable={!!onActiveClientsClick}
                />
                <MetricCard 
                    title="Средний Факт (Клиент)"
                    value={formatNumber(avgFactPerClient)}
                    icon={<CalculatorIcon />}
                    color="text-indigo-400"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('avgFact')}
                />
                 <MetricCard 
                    title="Покрытие ОКБ"
                    value={`${okbCoverage.toFixed(1)}%`}
                    icon={<CoverageIcon />}
                    color="text-rose-400"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('coverage')}
                />
                <MetricCard 
                    title="Топ РМ (по росту)" 
                    value={metrics.topPerformingRM.name}
                    icon={<TargetIcon />} 
                    color="text-red-400"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('topRM')}
                />
            </div>

            {/* Explanation Modal */}
            <Modal
                isOpen={!!selectedExplanation}
                onClose={() => setSelectedExplanation(null)}
                title={selectedExplanation ? METRIC_EXPLANATIONS[selectedExplanation].title : ''}
            >
                <div className="p-2">
                    {selectedExplanation && METRIC_EXPLANATIONS[selectedExplanation].description}
                </div>
            </Modal>
        </>
    );
};

export default MetricsSummary;
