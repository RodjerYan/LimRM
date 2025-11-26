
import React, { useState } from 'react';
import Modal from './Modal';
import DetailChart from './DetailChart';
import { AggregatedDataRow, OkbStatus, MapPoint } from '../types';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, CalculatorIcon, CoverageIcon, SearchIcon } from './icons';

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
    <div title={tooltip} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 flex items-start space-x-3">
        <div className={`p-2 rounded-md ${color} bg-opacity-10`}>
           {React.cloneElement(icon as React.ReactElement<{ small?: boolean }>, { small: true })}
        </div>
        <div>
            <p className="text-xs text-gray-400">{title}</p>
            <p className="text-lg font-bold text-white">{value}</p>
        </div>
    </div>
);

const GroupedClientsList: React.FC<{ clients: MapPoint[]; onStartEdit: (client: MapPoint) => void; }> = ({ clients, onStartEdit }) => {
    const [searchTerm, setSearchTerm] = useState('');

    if (!clients || clients.length === 0) return null;

    const filteredClients = clients.filter(client => {
        const searchLower = searchTerm.toLowerCase().trim();
        if (!searchLower) return true;
        return (
            client.address.toLowerCase().includes(searchLower) ||
            client.name.toLowerCase().includes(searchLower)
        );
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

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data, okbStatus, onStartEdit }) => {
    if (!data) return null;

    const activeClientsCount = data.clients?.length || 0;
    const avgFactPerClient = activeClientsCount > 0 ? data.fact / activeClientsCount : 0;
    const okbCoverage = (okbStatus?.rowCount && activeClientsCount > 0) ? (activeClientsCount / okbStatus.rowCount) * 100 : 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детальная информация: ${data.clientName}`} maxWidth="max-w-5xl">
            <div className="space-y-6">
                {/* Top Section: Metrics */}
                <div className="space-y-4">
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                            <h4 className="font-bold text-lg mb-3 text-indigo-400">Ключевые показатели группы</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MetricCard title="Общий Факт" value={formatNumber(data.fact, true)} icon={<FactIcon />} color="text-success" tooltip={`Текущий объем продаж по группе: ${formatNumber(data.fact, false)} кг/ед`} />
                            <MetricCard title="Общий Потенциал" value={formatNumber(data.potential, true)} icon={<PotentialIcon />} color="text-accent" tooltip={`Прогнозируемый объем рынка для группы: ${formatNumber(data.potential, false)} кг/ед`} />
                            <MetricCard title="Потенциал Роста" value={formatNumber(data.growthPotential, false)} icon={<GrowthIcon />} color="text-warning" tooltip={`Неосвоенный объем рынка для группы: ${formatNumber(data.growthPotential, false)} кг/ед`} />
                            <MetricCard title="Средний Рост" value={`${data.growthPercentage.toFixed(1)}%`} icon={<TrendingUpIcon />} color="text-yellow-400" tooltip="Средний процент неосвоенного потенциала по клиентам в группе" />
                            <MetricCard title="Активных Клиентов" value={formatNumber(activeClientsCount, false)} icon={<UsersIcon />} color="text-cyan-400" tooltip="Количество уникальных ТТ в группе" />
                            <MetricCard title="Средний Факт (Клиент)" value={formatNumber(avgFactPerClient, false)} icon={<CalculatorIcon />} color="text-indigo-400" tooltip={`Средние продажи на одну ТТ в группе: ${formatNumber(avgFactPerClient, false)} кг/ед`} />
                            <MetricCard title="Покрытие ОКБ" value={`${okbCoverage.toFixed(1)}%`} icon={<CoverageIcon />} color="text-rose-400" tooltip={`Доля активных клиентов из общей базы (${activeClientsCount} из ${okbStatus?.rowCount || 0})`} />
                            </div>
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
                    {/* Increased height for better visual impact */}
                    <div className="h-80 w-full">
                        <DetailChart fact={data.fact} potential={data.potential} />
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default DetailsModal;
