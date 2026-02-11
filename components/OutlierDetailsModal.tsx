
import React, { useMemo } from 'react';
import Modal from './Modal';
import { AggregatedDataRow } from '../types';
import { AlertIcon, FactIcon } from './icons';

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
            let statusColor = 'text-slate-400';

            if (zScore > 0) {
                // Context: High Sales Anomaly
                if (contribution > 50) {
                    diagnosis = 'Основной драйвер аномалии (Доминант)';
                    statusColor = 'text-rose-600 font-bold';
                } else if (contribution > 20) {
                    diagnosis = 'Значительный вклад в сверх-продажи';
                    statusColor = 'text-amber-600';
                } else {
                    diagnosis = 'Стандартный объем';
                }
            } else {
                // Context: Low Sales Anomaly
                if (clientFact === 0) {
                    diagnosis = 'Нулевые продажи (Критично)';
                    statusColor = 'text-red-600 font-bold';
                } else if (contribution < 5) {
                    diagnosis = 'Крайне низкая эффективность';
                    statusColor = 'text-orange-500';
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
    const colorClass = isPositive ? 'text-emerald-600' : 'text-rose-600';
    const borderClass = isPositive ? 'border-emerald-200' : 'border-rose-200';
    const bgClass = isPositive ? 'bg-emerald-50' : 'bg-rose-50';
    const iconBgClass = isPositive ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600';

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Разбор аномалии: ${row.clientName}`} 
            maxWidth="max-w-7xl"
        >
            <div className="space-y-6">
                {/* Header Summary */}
                <div className={`p-4 rounded-2xl border ${borderClass} ${bgClass} flex items-start gap-4`}>
                    <div className={`p-2 rounded-xl ${iconBgClass}`}>
                        <AlertIcon />
                    </div>
                    <div>
                        <h4 className={`text-lg font-bold ${colorClass} mb-1`}>
                            {isPositive ? 'Сверх-высокие показатели' : 'Критические отклонения'} (Z-Score: {zScore.toFixed(2)})
                        </h4>
                        <p className="text-sm text-slate-700 font-medium">{reason}</p>
                        <div className="mt-2 text-xs text-slate-500">
                            Группа отклоняется от нормы на <strong>{Math.abs(zScore).toFixed(1)}</strong> стандартных отклонений. 
                            {isPositive 
                                ? ' Рекомендуется проверить данные на дублирование или оптовые отгрузки.' 
                                : ' Рекомендуется проверить наличие товара и работу торгового представителя.'}
                        </div>
                    </div>
                </div>

                {/* Clients Breakdown */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                        <h5 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            <FactIcon small /> Вклад клиентов в аномалию
                        </h5>
                        <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg">Всего ТТ: {analyzedClients.length}</span>
                    </div>
                    
                    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0 uppercase tracking-wider font-bold">
                                <tr>
                                    <th className="px-6 py-3">Клиент</th>
                                    <th className="px-6 py-3">Адрес</th>
                                    <th className="px-6 py-3 text-right">Факт</th>
                                    <th className="px-6 py-3 text-right">Вклад</th>
                                    <th className="px-6 py-3">Диагноз системы</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {analyzedClients.map((client) => (
                                    <tr key={client.key} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 font-bold text-slate-900 max-w-[200px] truncate" title={client.name}>
                                            {client.name}
                                        </td>
                                        <td className="px-6 py-3 text-slate-500 max-w-[250px] truncate font-medium" title={client.address}>
                                            {client.address}
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono text-slate-900 font-bold">
                                            {new Intl.NumberFormat('ru-RU').format(client.fact || 0)}
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono text-slate-500">
                                            {client.contribution.toFixed(1)}%
                                        </td>
                                        <td className={`px-6 py-3 text-xs font-semibold ${client.statusColor}`}>
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
