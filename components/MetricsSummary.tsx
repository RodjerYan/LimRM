
import React, { useState } from 'react';
import { OkbStatus, SummaryMetrics } from '../types';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, TargetIcon, CalculatorIcon, CoverageIcon, InfoIcon, ChannelIcon } from './icons';
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
        className={`bg-white p-5 rounded-3xl border border-slate-200 shadow-[0_18px_50px_rgba(15,23,42,0.06)] flex items-start space-x-4 transition-all hover:scale-[1.02] hover:shadow-[0_22px_70px_rgba(15,23,42,0.12)] hover:border-indigo-200 cursor-default ${isClickable ? 'cursor-pointer active:scale-[0.98]' : ''}`}
    >
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 flex-shrink-0`}>
           {icon}
        </div>
        <div className="min-w-0 overflow-hidden">
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1 truncate mb-1">
                {title}
                {isClickable && <span className="w-3.5 h-3.5 opacity-40 hover:opacity-100 transition-opacity text-slate-400"><InfoIcon /></span>}
            </p>
            <p className="text-2xl font-black text-slate-900 truncate tracking-tight tabular-nums" title={value}>{value}</p>
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

type MetricType = 'totalFact' | 'totalPotential' | 'totalGrowth' | 'avgGrowth' | 'avgFact' | 'coverage' | 'topRM' | 'channels';

const METRIC_EXPLANATIONS: Record<Exclude<MetricType, 'channels'>, { title: string; description: React.ReactNode }> = {
    totalFact: {
        title: 'Общий Факт',
        description: (
            <div className="space-y-3 text-slate-600">
                <p>Суммарный объем продаж по всем загруженным строкам из файла.</p>
                <ul className="list-disc list-inside space-y-1 text-sm font-medium">
                    <li><strong>Источник:</strong> Колонка "Вес" (или аналогичная) в загруженном файле.</li>
                    <li><strong>Логика:</strong> Прямая сумма значений факта по всем активным клиентам.</li>
                </ul>
            </div>
        )
    },
    totalPotential: {
        title: 'Общий Потенциал',
        description: (
            <div className="space-y-3 text-slate-600">
                <p>Прогнозируемый объем рынка для всех текущих клиентов и групп.</p>
                <ul className="list-disc list-inside space-y-1 text-sm font-medium">
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
            <div className="space-y-3 text-slate-600">
                <p>Абсолютный объем продаж, который можно дополнительно получить с текущей клиентской базы.</p>
                <div className="bg-slate-100 p-2 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 font-bold">
                    Формула: Общий Потенциал - Общий Факт
                </div>
                <p className="text-sm font-medium">Это "деньги на столе" — объем, который клиенты покупают у конкурентов или недобирают.</p>
            </div>
        )
    },
    avgGrowth: {
        title: 'Средний Рост',
        description: (
            <div className="space-y-3 text-slate-600">
                <p>Средневзвешенный процент неосвоенного потенциала по всей компании.</p>
                <div className="bg-slate-100 p-2 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 font-bold">
                    Формула: (Потенциал Роста / Общий Потенциал) × 100%
                </div>
                <p className="text-sm font-medium">Показывает, насколько в среднем мы можем вырасти, если реализуем весь потенциал текущих клиентов.</p>
            </div>
        )
    },
    avgFact: {
        title: 'Средний Факт (на Клиента)',
        description: (
            <div className="space-y-3 text-slate-600">
                <p>Средний объем продаж на одну активную торговую точку (ТТ).</p>
                <div className="bg-slate-100 p-2 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 font-bold">
                    Формула: Общий Факт / Количество Активных Клиентов
                </div>
                <p className="text-sm font-medium">Используется для оценки эффективности работы с единичной точкой (Удельный вес ТТ).</p>
            </div>
        )
    },
    coverage: {
        title: 'Покрытие ОКБ',
        description: (
            <div className="space-y-3 text-slate-600">
                <p>Доля активных клиентов от Общей базы (Активные + Непокрытый Потенциал).</p>
                <div className="bg-slate-100 p-2 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 font-bold">
                    Формула: ActiveCount / (ActiveCount + (TotalOKB - Matched))
                </div>
                <p className="text-sm mt-2 font-bold text-emerald-600">Важно: Максимальное значение — 100%.</p>
                <ul className="list-disc list-inside space-y-1 text-sm mt-1 font-medium">
                    <li><strong>100%</strong> означает, что все точки из базы ОКБ найдены в активных (нет непокрытых).</li>
                    <li><strong>Uncovered Potential:</strong> Разница между 100% и текущим покрытием.</li>
                </ul>
            </div>
        )
    },
    topRM: {
        title: 'Топ РМ (по росту)',
        description: (
            <div className="space-y-3 text-slate-600">
                <p>Региональный менеджер с самым высоким абсолютным показателем <strong>Потенциала Роста</strong>.</p>
                <p className="text-sm font-medium">Это не обязательно РМ с самыми большими продажами, а тот, у кого на территории (среди текущих клиентов) скрыто больше всего возможностей для увеличения объема.</p>
                <p className="text-sm italic text-slate-400">Именно сюда стоит направить маркетинговые усилия в первую очередь.</p>
            </div>
        )
    }
};

const MetricsSummary: React.FC<MetricsSummaryProps> = ({ metrics, okbStatus, disabled, onActiveClientsClick }) => {
    const [selectedExplanation, setSelectedExplanation] = useState<MetricType | null>(null);

    if (disabled || !metrics) {
        return (
            <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${disabled ? 'opacity-50' : ''}`}>
                {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="bg-white/50 p-6 rounded-3xl border border-slate-200 animate-pulse shadow-sm">
                        <div className="h-3 bg-slate-200 rounded w-1/2 mb-3"></div>
                        <div className="h-7 bg-slate-200/80 rounded w-3/4"></div>
                    </div>
                ))}
            </div>
        );
    }
    
    const avgFactPerClient = metrics.totalActiveClients > 0 ? metrics.totalFact / metrics.totalActiveClients : 0;
    
    const active = metrics.totalActiveClients;
    const okbTotal = okbStatus?.rowCount || 0;
    
    const uncoveredEstimate = Math.max(0, okbTotal - active);
    const totalUniverseEstimate = active + uncoveredEstimate;
    const rawCoverage = totalUniverseEstimate > 0 ? (active / totalUniverseEstimate) * 100 : 0;
    const okbCoverage = Math.min(100, rawCoverage);

    const channelSorted = Object.entries(metrics.channelCounts).sort((a, b) => b[1] - a[1]);

    return (
        <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                    title="Общий Факт" 
                    value={formatNumber(metrics.totalFact)} 
                    icon={<FactIcon />} 
                    color="text-emerald-600"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('totalFact')}
                />
                <MetricCard 
                    title="Общий Потенциал" 
                    value={formatNumber(metrics.totalPotential)} 
                    icon={<PotentialIcon />} 
                    color="text-indigo-600"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('totalPotential')}
                />
                <MetricCard 
                    title="Потенциал Роста" 
                    value={formatNumber(metrics.totalGrowth)} 
                    icon={<GrowthIcon />} 
                    color="text-amber-500"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('totalGrowth')}
                />
                <MetricCard 
                    title="Средний Рост" 
                    value={`${metrics.averageGrowthPercentage.toFixed(1)}%`}
                    icon={<TrendingUpIcon />} 
                    color="text-yellow-500"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('avgGrowth')}
                />
                <MetricCard 
                    title="Активных Клиентов" 
                    value={formatNumber(metrics.totalActiveClients, false)}
                    icon={<UsersIcon />} 
                    color="text-cyan-500"
                    tooltip="Нажмите для просмотра списка клиентов"
                    onClick={onActiveClientsClick}
                    isClickable={!!onActiveClientsClick}
                />
                <MetricCard 
                    title="Каналы продаж"
                    value={`${Object.keys(metrics.channelCounts).length}`}
                    icon={<ChannelIcon />}
                    color="text-purple-500"
                    tooltip="Разбивка по каналам сбыта (Зоо розница, Опт, Бридер и др.)"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('channels')}
                />
                 <MetricCard 
                    title="Покрытие ОКБ"
                    value={`${okbCoverage.toFixed(1)}%`}
                    icon={<CoverageIcon />}
                    color="text-rose-500"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('coverage')}
                />
                <MetricCard 
                    title="Топ РМ (по росту)" 
                    value={metrics.topPerformingRM.name}
                    icon={<TargetIcon />} 
                    color="text-red-500"
                    tooltip="Нажмите для пояснения расчета"
                    isClickable={true}
                    onClick={() => setSelectedExplanation('topRM')}
                />
            </div>

            {/* Explanation Modal */}
            <Modal
                isOpen={!!selectedExplanation}
                onClose={() => setSelectedExplanation(null)}
                title={selectedExplanation === 'channels' ? 'Разбивка по каналам продаж' : (selectedExplanation ? METRIC_EXPLANATIONS[selectedExplanation as keyof typeof METRIC_EXPLANATIONS].title : '')}
            >
                <div className="p-2">
                    {selectedExplanation === 'channels' ? (
                        <div className="space-y-4">
                            <p className="text-slate-500 text-sm mb-4 font-medium">Всего адресов: <strong className="text-slate-900">{metrics.totalActiveClients.toLocaleString('ru-RU')}</strong></p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {channelSorted.map(([channel, count]) => {
                                    const pct = (count / metrics.totalActiveClients) * 100;
                                    return (
                                        <div key={channel} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center group hover:bg-white hover:shadow-md transition-all">
                                            <div className="flex flex-col">
                                                <span className="text-indigo-700 font-bold text-sm uppercase tracking-wider">{channel}</span>
                                                <span className="text-xs text-slate-500 mt-1 font-medium">{pct.toFixed(1)}% от общего числа</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-mono font-bold text-slate-900">{count.toLocaleString('ru-RU')}</div>
                                                <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Адресов</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        selectedExplanation && METRIC_EXPLANATIONS[selectedExplanation as keyof typeof METRIC_EXPLANATIONS].description
                    )}
                </div>
            </Modal>
        </>
    );
};

export default MetricsSummary;
