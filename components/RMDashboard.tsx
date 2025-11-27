
import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import { AggregatedDataRow, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, RMMetrics } from '../types';
import { TargetIcon } from './icons';
import MetricsSummary from './MetricsSummary';
import RMAnalysisModal from './RMAnalysisModal';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    okbRegionCounts: { [key: string]: number } | null;
    okbData: OkbDataRow[];
    mode?: 'modal' | 'page';
    metrics?: SummaryMetrics | null;
    okbStatus?: OkbStatus | null;
    onActiveClientsClick?: () => void;
    onEditClient?: (client: MapPoint) => void;
}

const RMDashboard: React.FC<RMDashboardProps> = ({ 
    isOpen, onClose, data, okbRegionCounts, okbData, mode = 'modal', 
    metrics, okbStatus, onActiveClientsClick 
}) => {
    const [selectedRM, setSelectedRM] = useState<RMMetrics | null>(null);
    const [baseRate, setBaseRate] = useState(15);

    const nextYear = new Date().getFullYear() + 1;

    const rmAggregatedData = useMemo(() => {
        const rmMap = new Map<string, RMMetrics>();

        data.forEach(row => {
            if (!rmMap.has(row.rm)) {
                rmMap.set(row.rm, {
                    rmName: row.rm,
                    totalClients: 0,
                    totalOkbCount: 0,
                    totalFact: 0,
                    totalPotential: 0,
                    avgFactPerClient: 0,
                    marketShare: 0,
                    countA: 0, countB: 0, countC: 0,
                    factA: 0, factB: 0, factC: 0,
                    recommendedGrowthPct: 0,
                    nextYearPlan: 0,
                    regions: [],
                    brands: []
                });
            }
            const stats = rmMap.get(row.rm)!;
            
            stats.totalFact += row.fact;
            stats.totalPotential += row.potential;
            stats.nextYearPlan += row.potential; // In enriched data, potential is often the plan
            
            row.clients.forEach(c => {
                stats.totalClients++;
                if (c.abcCategory === 'A') { stats.countA++; stats.factA += (c.fact || 0); }
                else if (c.abcCategory === 'B') { stats.countB++; stats.factB += (c.fact || 0); }
                else { stats.countC++; stats.factC += (c.fact || 0); }
            });
        });

        const result = Array.from(rmMap.values()).map(stats => {
            stats.avgFactPerClient = stats.totalClients > 0 ? stats.totalFact / stats.totalClients : 0;
            stats.recommendedGrowthPct = stats.totalFact > 0 
                ? ((stats.nextYearPlan - stats.totalFact) / stats.totalFact) * 100 
                : (stats.nextYearPlan > 0 ? 100 : 0);
            return stats;
        });

        return result.sort((a, b) => b.totalFact - a.totalFact);
    }, [data]);

    const content = (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-lg text-white"><TargetIcon /></div>
                    <div>
                        <h3 className="font-bold text-white text-lg">Панель управления продажами</h3>
                        <p className="text-sm text-gray-400">Планирование на {nextYear} год</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <label className="text-xs text-gray-400 block mb-1">Базовая ставка роста</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                value={baseRate} 
                                onChange={(e) => setBaseRate(Number(e.target.value))}
                                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white w-16 text-center"
                            />
                            <span className="text-white font-bold">%</span>
                        </div>
                    </div>
                </div>
            </div>

            {mode === 'page' && metrics && (
                <MetricsSummary 
                    metrics={metrics} 
                    okbStatus={okbStatus || null} 
                    disabled={false} 
                    onActiveClientsClick={onActiveClientsClick}
                />
            )}

            <div className="overflow-x-auto rounded-xl border border-gray-700">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-800/80 sticky top-0 backdrop-blur-sm">
                        <tr>
                            <th className="px-4 py-3">Региональный Менеджер</th>
                            <th className="px-4 py-3 text-right">Факт (кг)</th>
                            <th className="px-4 py-3 text-center text-cyan-300" title="Средний объем продаж на одну позицию">Ср. Продажи/ТТ</th>
                            <th className="px-4 py-3 text-center border-l border-gray-700 bg-gray-800/30">Рек. План (%)</th>
                            <th className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/30">Обоснование</th>
                            <th className="px-4 py-3 text-center font-bold bg-gray-800/30">План {nextYear} (кг)</th>
                            <th className="px-4 py-3 text-center text-amber-400" title="Категория A: Лидеры (80% оборота)">A</th>
                            <th className="px-4 py-3 text-center text-emerald-400" title="Категория B: Середняки (15% оборота)">B</th>
                            <th className="px-4 py-3 text-center text-slate-400" title="Категория C: Хвост (5% оборота)">C</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 bg-gray-900/40">
                        {rmAggregatedData.map(rm => (
                            <tr key={rm.rmName} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 font-medium text-white">{rm.rmName}</td>
                                <td className="px-4 py-3 text-right font-mono">{new Intl.NumberFormat('ru-RU').format(Math.round(rm.totalFact))}</td>
                                <td className="px-4 py-3 text-center font-mono text-cyan-200">{new Intl.NumberFormat('ru-RU').format(Math.round(rm.avgFactPerClient))}</td>
                                <td className="px-4 py-3 text-center font-bold border-l border-gray-700 bg-gray-800/20">
                                    <span className={rm.recommendedGrowthPct > baseRate ? 'text-emerald-400' : 'text-indigo-400'}>
                                        +{rm.recommendedGrowthPct.toFixed(1)}%
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/20">
                                    <button 
                                        onClick={() => setSelectedRM(rm)}
                                        className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded transition-colors"
                                    >
                                        Анализ AI
                                    </button>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-white bg-gray-800/20 font-mono">
                                    {new Intl.NumberFormat('ru-RU').format(Math.round(rm.nextYearPlan))}
                                </td>
                                <td className="px-4 py-3 text-center font-mono text-amber-400">{rm.countA}</td>
                                <td className="px-4 py-3 text-center font-mono text-emerald-400">{rm.countB}</td>
                                <td className="px-4 py-3 text-center font-mono text-slate-400">{rm.countC}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedRM && (
                <RMAnalysisModal 
                    isOpen={!!selectedRM} 
                    onClose={() => setSelectedRM(null)} 
                    rmData={selectedRM} 
                    baseRate={baseRate}
                />
            )}
        </div>
    );

    if (mode === 'page') {
        return content;
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Дашборд РМ" maxWidth="max-w-[90vw]">
            {content}
        </Modal>
    );
};

export default RMDashboard;
