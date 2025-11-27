
import React, { useMemo } from 'react';
import Modal from './Modal';
import { AggregatedDataRow } from '../types';
import { AlertIcon, CheckIcon, FactIcon } from './icons';

interface OutlierItem {
    row: AggregatedDataRow;
    zScore: number;
    reason: string;
}

interface OutlierDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: OutlierItem;
}

const OutlierDetailsModal: React.FC<OutlierDetailsModalProps> = ({ isOpen, onClose, item }) => {
    const { row, zScore, reason } = item;

    // Analyze clients within the group to find specific drivers
    const analyzedClients = useMemo(() => {
        const totalFact = row.fact;
        const clients = [...row.clients];
        
        // Sort by contribution (absolute volume)
        clients.sort((a, b) => (b.fact || 0) - (a.fact || 0));

        return clients.map(client => {
            const clientFact = client.fact || 0;
            const contribution = totalFact > 0 ? (clientFact / totalFact) * 100 : 0;
            
            let diagnosis = '';
            let statusColor = 'text-gray-400';

            if (zScore > 0) {
                // Context: High Sales Anomaly
                if (contribution > 50) {
                    diagnosis = 'Основной драйвер аномалии (Доминант)';
                    statusColor = 'text-red-400 font-bold';
                } else if (contribution > 20) {
                    diagnosis = 'Значительный вклад в сверх-продажи';
                    statusColor = 'text-amber-400';
                } else {
                    diagnosis = 'Стандартный объем';
                }
            } else {
                // Context: Low Sales Anomaly
                if (clientFact === 0) {
                    diagnosis = 'Нулевые продажи (Критично)';
                    statusColor = 'text-red-500 font-bold';
                } else if (contribution < 5) {
                    diagnosis = 'Крайне низкая эффективность';
                    statusColor = 'text-orange-400';
                } else {
                    diagnosis = 'Низкий объем';
                }
            }

            return {
                ...client,
                contribution,
                diagnosis,
                statusColor
            };
        });
    }, [row, zScore]);

    const isPositive = zScore > 0;
    const colorClass = isPositive ? 'text-emerald-400' : 'text-red-400';
    const borderClass = isPositive ? 'border-emerald-500/30' : 'border-red-500/30';
    const bgClass = isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10';

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Разбор аномалии: ${row.clientName}`} 
            maxWidth="max-w-7xl"
        >
            <div className="space-y-6">
                {/* Header Summary */}
                <div className={`p-4 rounded-xl border ${borderClass} ${bgClass} flex items-start gap-4`}>
                    <div className={`p-2 rounded-lg bg-gray-900/50 ${colorClass}`}>
                        <AlertIcon />
                    </div>
                    <div>
                        <h4 className={`text-lg font-bold ${colorClass} mb-1`}>
                            {isPositive ? 'Сверх-высокие показатели' : 'Критические отклонения'} (Z-Score: {zScore.toFixed(2)})
                        </h4>
                        <p className="text-sm text-gray-300">{reason}</p>
                        <div className="mt-2 text-xs text-gray-400">
                            Группа отклоняется от нормы на <strong>{Math.abs(zScore).toFixed(1)}</strong> стандартных отклонений. 
                            {isPositive 
                                ? ' Рекомендуется проверить данные на дублирование или оптовые отгрузки.' 
                                : ' Рекомендуется проверить наличие товара и работу торгового представителя.'}
                        </div>
                    </div>
                </div>

                {/* Clients Breakdown */}
                <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="p-3 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center">
                        <h5 className="font-bold text-gray-200 flex items-center gap-2">
                            <FactIcon small /> Вклад клиентов в аномалию
                        </h5>
                        <span className="text-xs text-gray-500">Всего ТТ: {analyzedClients.length}</span>
                    </div>
                    
                    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 bg-gray-800/80 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2">Клиент</th>
                                    <th className="px-4 py-2">Адрес</th>
                                    <th className="px-4 py-2 text-right">Факт</th>
                                    <th className="px-4 py-2 text-right">Вклад</th>
                                    <th className="px-4 py-2">Диагноз системы</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {analyzedClients.map((client) => (
                                    <tr key={client.key} className="hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate" title={client.name}>
                                            {client.name}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 max-w-[250px] truncate" title={client.address}>
                                            {client.address}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-white">
                                            {new Intl.NumberFormat('ru-RU').format(client.fact || 0)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-gray-400">
                                            {client.contribution.toFixed(1)}%
                                        </td>
                                        <td className={`px-4 py-3 text-xs ${client.statusColor}`}>
                                            {client.diagnosis}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default OutlierDetailsModal;
