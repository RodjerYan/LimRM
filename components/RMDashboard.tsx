import React, { useMemo } from 'react';
import Modal from './Modal';
import { MapPoint, OkbStatus } from '../types';
import { UsersIcon, CalculatorIcon, CoverageIcon } from './icons';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    activeClients: MapPoint[];
    okbStatus: OkbStatus | null;
}

interface RMMetrics {
    rmName: string;
    clientCount: number;
    totalFact: number;
    avgCheck: number;
    aClients: number;
    bClients: number;
    cClients: number;
}

const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, activeClients, okbStatus }) => {

    const rmMetrics = useMemo(() => {
        const map = new Map<string, RMMetrics>();

        activeClients.forEach(client => {
            const rm = client.rm || 'Неизвестный РМ';
            if (!map.has(rm)) {
                map.set(rm, { rmName: rm, clientCount: 0, totalFact: 0, avgCheck: 0, aClients: 0, bClients: 0, cClients: 0 });
            }
            const metrics = map.get(rm)!;
            metrics.clientCount++;
            metrics.totalFact += (client.fact || 0);
            if (client.abcCategory === 'A') metrics.aClients++;
            else if (client.abcCategory === 'B') metrics.bClients++;
            else metrics.cClients++;
        });

        // Calculate averages and convert to array
        return Array.from(map.values()).map(m => ({
            ...m,
            avgCheck: m.clientCount > 0 ? m.totalFact / m.clientCount : 0
        })).sort((a, b) => b.totalFact - a.totalFact); // Sort by total volume descending

    }, [activeClients]);

    const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Рейтинг Эффективности Региональных Менеджеров">
             <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex items-center space-x-3">
                        <div className="p-2 bg-cyan-500/20 rounded-lg text-cyan-400"><UsersIcon /></div>
                        <div>
                            <p className="text-xs text-gray-400">Всего Активных ТТ</p>
                            <p className="text-lg font-bold text-white">{activeClients.length}</p>
                        </div>
                    </div>
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex items-center space-x-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><CalculatorIcon /></div>
                         <div>
                            <p className="text-xs text-gray-400">Общий объем (Факт)</p>
                            <p className="text-lg font-bold text-white">{formatNumber(activeClients.reduce((sum, c) => sum + (c.fact || 0), 0))} кг</p>
                        </div>
                    </div>
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex items-center space-x-3">
                        <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400"><CoverageIcon /></div>
                         <div>
                            <p className="text-xs text-gray-400">Покрытие ОКБ</p>
                            <p className="text-lg font-bold text-white">
                                {okbStatus?.rowCount ? ((activeClients.length / okbStatus.rowCount) * 100).toFixed(1) : 0}%
                            </p>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="px-4 py-3">РМ</th>
                                <th className="px-4 py-3 text-center">ТТ</th>
                                <th className="px-4 py-3 text-right">Объем (кг)</th>
                                <th className="px-4 py-3 text-right">Ср. чек (кг)</th>
                                <th className="px-4 py-3 text-center" title="Категория A (Топ 80% объёма)">Кат. A</th>
                                <th className="px-4 py-3 text-center">Кат. B</th>
                                <th className="px-4 py-3 text-center">Кат. C</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rmMetrics.map((row) => (
                                <tr key={row.rmName} className="border-b border-gray-700 hover:bg-indigo-500/10">
                                    <td className="px-4 py-3 font-medium text-white">{row.rmName}</td>
                                    <td className="px-4 py-3 text-center">{row.clientCount}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-success">{formatNumber(row.totalFact)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-indigo-300">{formatNumber(row.avgCheck)}</td>
                                    <td className="px-4 py-3 text-center font-bold text-yellow-500">{row.aClients}</td>
                                    <td className="px-4 py-3 text-center text-green-400">{row.bClients}</td>
                                    <td className="px-4 py-3 text-center text-gray-500">{row.cClients}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
};

export default RMDashboard;