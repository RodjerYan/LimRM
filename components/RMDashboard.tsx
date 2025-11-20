import React, { useMemo } from 'react';
import Modal from './Modal';
import { AggregatedDataRow, MapPoint } from '../types';
import { UsersIcon, TrendingUpIcon, CalculatorIcon } from './icons';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
}

interface RMMetrics {
    rmName: string;
    totalClients: number; // Count of active individual clients
    totalFact: number;
    avgFactPerClient: number;
    countA: number;
    countB: number;
    countC: number;
}

const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data }) => {
    
    const metrics = useMemo(() => {
        const rmMap = new Map<string, RMMetrics>();

        data.forEach(row => {
            const rm = row.rm || 'Не указан';
            if (!rmMap.has(rm)) {
                rmMap.set(rm, { 
                    rmName: rm, 
                    totalClients: 0, 
                    totalFact: 0, 
                    avgFactPerClient: 0,
                    countA: 0,
                    countB: 0,
                    countC: 0
                });
            }

            const current = rmMap.get(rm)!;
            
            // Use the detailed clients array if available for accuracy, otherwise fallback to row count (less accurate)
            if (row.clients && row.clients.length > 0) {
                 row.clients.forEach((client: MapPoint) => {
                    current.totalClients++;
                    current.totalFact += (client.fact || 0);
                    if (client.abcCategory === 'A') current.countA++;
                    else if (client.abcCategory === 'B') current.countB++;
                    else current.countC++;
                 });
            } else {
                // Fallback if clients array is missing (shouldn't happen in this app flow)
                 current.totalFact += row.fact;
            }
        });

        return Array.from(rmMap.values())
            .map(m => ({
                ...m,
                avgFactPerClient: m.totalClients > 0 ? m.totalFact / m.totalClients : 0
            }))
            .sort((a, b) => b.totalFact - a.totalFact); // Sort by total volume descending
    }, [data]);

    const formatNum = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Дашборд эффективности РМ">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0">
                        <tr>
                            <th className="px-4 py-3">Региональный Менеджер</th>
                            <th className="px-4 py-3 text-center">Объем продаж (кг)</th>
                            <th className="px-4 py-3 text-center">Активных ТТ</th>
                            <th className="px-4 py-3 text-center">Средний чек (кг/ТТ)</th>
                            <th className="px-4 py-3 text-center text-amber-400">Категория A</th>
                            <th className="px-4 py-3 text-center text-emerald-400">Категория B</th>
                            <th className="px-4 py-3 text-center text-slate-400">Категория C</th>
                        </tr>
                    </thead>
                    <tbody>
                        {metrics.map((rm) => (
                            <tr key={rm.rmName} className="border-b border-gray-700 hover:bg-indigo-500/10">
                                <td className="px-4 py-3 font-medium text-white">{rm.rmName}</td>
                                <td className="px-4 py-3 text-center font-bold text-success">{formatNum(rm.totalFact)}</td>
                                <td className="px-4 py-3 text-center">{rm.totalClients}</td>
                                <td className="px-4 py-3 text-center">{formatNum(rm.avgFactPerClient)}</td>
                                <td className="px-4 py-3 text-center font-bold text-amber-400">{rm.countA}</td>
                                <td className="px-4 py-3 text-center font-bold text-emerald-400">{rm.countB}</td>
                                <td className="px-4 py-3 text-center font-bold text-slate-400">{rm.countC}</td>
                            </tr>
                        ))}
                        {metrics.length === 0 && (
                             <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Нет данных для отображения</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
};

export default RMDashboard;