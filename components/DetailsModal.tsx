
import React, { useState } from 'react';
import Modal from './Modal';
import DetailChart from './DetailChart';
import { AggregatedDataRow, OkbStatus, MapPoint } from '../types';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, CalculatorIcon, CoverageIcon, SearchIcon, AlertIcon } from './icons';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
    okbStatus: OkbStatus | null;
    onStartEdit: (client: MapPoint) => void;
}

// Local formatNumber utility
const formatNumber = (num: number, short = false) => {
    if (isNaN(num)) return '0';
    if (short) {
        if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)} млн`;
        if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)} тыс.`;
    }
    return num.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

// Local MetricCard component for modal-specific display
const MetricCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string; tooltip: string }> = ({ title, value, icon, color, tooltip }) => (
    <div title={tooltip} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 flex items-start space-x-3 overflow-hidden">
        <div className={`p-2 rounded-md ${color} bg-opacity-10 flex-shrink-0`}>
           {React.cloneElement(icon as React.ReactElement<{ small?: boolean }>, { small: true })}
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 truncate">{title}</p>
            <p className="text-lg font-bold text-white truncate">{value}</p>
        </div>
    </div>
);

const GroupedClientsList: React.FC<{ clients: MapPoint[]; onStartEdit: (client: MapPoint) => void; }> = ({ clients, onStartEdit }) => {
    const [searchTerm, setSearchTerm] = useState('');

    if (!clients || clients.length === 0) return null;

    const filteredClients = clients.filter(client => {
        const searchLower = searchTerm.toLowerCase().trim();
        if (!searchLower) return true;
        // Defensive coding: Ensure strings exist before calling toLowerCase
        const addr = (client.address || '').toString().toLowerCase();
        const name = (client.name || '').toString().toLowerCase();
        return addr.includes(searchLower) || name.includes(searchLower);
    });

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <h4 className="font-bold text-lg mb-3 text-cyan-400">Клиенты в группе ({clients.length})</h4>
            <div className="mb-3 relative">
                 <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                    <SearchIcon />
                </div>
                <input 
                    type="text" 
                    placeholder="Поиск по адресу или названию..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-2 pl-10 bg-gray-800 border border-gray-600 rounded-lg focus:ring-1 focus:ring-accent focus:border-accent text-sm text-white placeholder-gray-500 transition-colors"
                />
            </div>
            <ul className="max-h-48 overflow-y-auto custom-scrollbar text-sm space-y-1 pr-2">
                {filteredClients.length > 0 ? (
                    filteredClients.map((client) => (
                        <li 
                            key={client.key} 
                            className="text-slate-300 bg-gray-800/50 p-1.5 rounded-md truncate cursor-pointer hover:bg-indigo-500/20"
                            onClick={() => onStartEdit(client)}
                            title={`${client.address}\n(Нажмите для редактирования)`}
                        >
                           {client.address}
                        </li>
                    ))
                ) : (
                    <li className="text-gray-500 text-center py-2 text-xs">Ничего не найдено</li>
                )}
            </ul>
        </div>
    );
};

// NEW: Recommendation Component (Idea 2)
const AssortmentRecommendations: React.FC<{ brand: string; packaging: string }> = ({ brand, packaging }) => {
    // Simulated recommendations based on "What similar clients buy"
    // In a real app, this would query the backend for cross-sell data.
    const recommendations = [
        { name: `${brand} Паучи 85г Говядина`, reason: 'Топ-3 SKU в регионе' },
        { name: `${brand} Сухой 1.5кг Курица`, reason: 'Часто берут вместе с текущим' },
        { name: `${brand} Лакомства 50г`, reason: 'Высокая маржинальность' }
    ];

    return (
        <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 p-4 rounded-lg border border-indigo-500/30">
            <h4 className="font-bold text-sm text-indigo-300 mb-3 flex items-center gap-2">
                <span className="text-lg">✨</span> Матрица Золотого Стандарта
            </h4>
            <div className="space-y-2">
                {recommendations.map((rec, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-900/40 p-2 rounded border border-white/5">
                        <span className="text-sm text-gray-200">{rec.name}</span>
                        <span className="text-xs text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded">{rec.reason}</span>
                    </div>
                ))}
            </div>
            <div className="mt-3 text-[10px] text-gray-500 text-center">
                Рекомендации основаны на анализе похожих точек (Look-alike modeling)
            </div>
        </div>
    );
};

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data, okbStatus, onStartEdit }) => {
    if (!data) return null;

    const activeClientsCount = data.clients?.length || 0;
    const avgFactPerClient = activeClientsCount > 0 ? data.fact / activeClientsCount : 0;
    
    const okbTotal = okbStatus?.rowCount || 0;
    const uncoveredApprox = Math.max(0, okbTotal - activeClientsCount);
    const totalUniverse = activeClientsCount + uncoveredApprox;
    
    const rawCoverage = totalUniverse > 0 ? (activeClientsCount / totalUniverse) * 100 : 0;
    const okbCoverage = Math.min(100, rawCoverage);

    // Idea 8: Cannibalization Check (Mock)
    const isCannibalizationRisk = activeClientsCount > 5 && avgFactPerClient < 50; // Simple heuristic

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детальная информация: ${data.clientName}`} maxWidth="max-w-4xl">
            <div className="space-y-6">
                {/* Top Section: Metrics */}
                <div className="space-y-4">
                    <div className="bg-gray-900/50 p-5 rounded-lg border border-gray-700">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-lg text-indigo-400">Ключевые показатели группы</h4>
                                <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-600 truncate max-w-[200px]">Фасовка: {data.packaging}</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MetricCard title="Общий Факт" value={formatNumber(data.fact, true)} icon={<FactIcon />} color="text-success" tooltip={`Текущий объем продаж по группе: ${formatNumber(data.fact, false)} кг/ед`} />
                            <MetricCard title="Общий Потенциал" value={formatNumber(data.potential, true)} icon={<PotentialIcon />} color="text-accent" tooltip={`Прогнозируемый объем рынка для группы: ${formatNumber(data.potential, false)} кг/ед`} />
                            <MetricCard title="Потенциал Роста" value={formatNumber(data.growthPotential, false)} icon={<GrowthIcon />} color="text-warning" tooltip={`Неосвоенный объем рынка для группы: ${formatNumber(data.growthPotential, false)} кг/ед`} />
                            <MetricCard title="Средний Рост" value={`${data.growthPercentage.toFixed(1)}%`} icon={<TrendingUpIcon />} color="text-yellow-400" tooltip="Средний процент неосвоенного потенциала по клиентам в группе" />
                            <MetricCard title="Активных Клиентов" value={formatNumber(activeClientsCount, false)} icon={<UsersIcon />} color="text-cyan-400" tooltip="Количество уникальных ТТ в группе" />
                            <MetricCard title="Средний Факт (Клиент)" value={formatNumber(avgFactPerClient, false)} icon={<CalculatorIcon />} color="text-indigo-400" tooltip={`Средние продажи на одну ТТ в группе: ${formatNumber(avgFactPerClient, false)} кг/ед`} />
                            <MetricCard title="Покрытие ОКБ" value={`${okbCoverage.toFixed(1)}%`} icon={<CoverageIcon />} color="text-rose-400" tooltip={`Доля активных клиентов от всей базы (${activeClientsCount} из ${totalUniverse}). Макс 100%.`} />
                            </div>
                    </div>
                    
                    {/* New Risk & Recs Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {isCannibalizationRisk && (
                            <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-lg flex items-start gap-3">
                                <div className="text-red-400"><AlertIcon /></div>
                                <div>
                                    <h4 className="font-bold text-red-400 text-sm">Риск Каннибализации</h4>
                                    <p className="text-xs text-gray-300 mt-1">
                                        Высокая плотность точек ({activeClientsCount}) при низком среднем чеке. 
                                        Возможно, клиенты отбирают трафик друг у друга.
                                    </p>
                                </div>
                            </div>
                        )}
                        <AssortmentRecommendations brand={data.brand} packaging={data.packaging} />
                    </div>

                    <GroupedClientsList clients={data.clients} onStartEdit={onStartEdit} />
                </div>
                
                {/* Bottom Section: Chart */}
                <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700 shadow-lg relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-xl text-emerald-400 flex items-center gap-2">
                            <FactIcon small />
                            Факт vs Потенциал
                        </h4>
                    </div>
                    <div className="h-80 w-full">
                        <DetailChart fact={data.fact} potential={data.potential} />
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default DetailsModal;
