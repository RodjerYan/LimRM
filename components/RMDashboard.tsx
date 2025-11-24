import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import { AggregatedDataRow, MapPoint, RMMetrics, OkbDataRow } from '../types';
import { TrendingUpIcon, TargetIcon } from './icons';
import { findValueInRow } from '../utils/dataUtils';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    okbData: OkbDataRow[]; // New prop: Full OKB data for accurate market share calculation
}

// AI Analysis Icon Button
const BrainIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
    </svg>
);

const BASE_GROWTH_RATE = 13.0; // Base 13%

const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbData }) => {
    const [selectedRMForAnalysis, setSelectedRMForAnalysis] = useState<RMMetrics | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);

    const metrics = useMemo<RMMetrics[]>(() => {
        const rmMap = new Map<string, RMMetrics>();

        // 1. Calculate OKB counts per RM (Total Addressable Market)
        const okbCounts = new Map<string, number>();
        okbData.forEach(row => {
            const rm = findValueInRow(row, ['рм', 'менеджер', 'ответственный']);
            if (rm) {
                // Normalizing RM name could be added here if needed (trim, lowercase)
                okbCounts.set(rm, (okbCounts.get(rm) || 0) + 1);
            }
        });

        // 2. Aggregating Active Data (Fact)
        data.forEach(row => {
            const rm = row.rm || 'Не указан';
            if (!rmMap.has(rm)) {
                rmMap.set(rm, { 
                    rmName: rm, 
                    totalClients: 0, 
                    totalFact: 0, 
                    totalPotential: 0, // Will use OKB count for logic, but keep sum for display
                    avgFactPerClient: 0,
                    marketShare: 0,
                    countA: 0,
                    countB: 0,
                    countC: 0,
                    recommendedGrowthPct: 0,
                    nextYearPlan: 0
                });
            }

            const current = rmMap.get(rm)!;
            
            // Sum up Potential from the aggregated row (File potential)
            current.totalPotential += row.potential;

            if (row.clients && row.clients.length > 0) {
                 row.clients.forEach((client: MapPoint) => {
                    // Count UNIQUE active points. 
                    // Ideally we should dedup by key, but here we assume aggregated data logic handled grouping.
                    current.totalClients++;
                    current.totalFact += (client.fact || 0);
                    if (client.abcCategory === 'A') current.countA++;
                    else if (client.abcCategory === 'B') current.countB++;
                    else current.countC++;
                 });
            } else {
                 current.totalFact += row.fact;
            }
        });

        return Array.from(rmMap.values())
            .map(m => {
                // 3. Calculate Market Share (Coverage) based on OKB
                // Formula: Active Points (from File) / Total Points (from OKB)
                const totalOkbForRM = okbCounts.get(m.rmName) || 0;
                
                // If OKB data is missing or zero, fallback to 0 share (Blue Ocean strategy applied by default)
                // or if active clients > OKB (data mismatch), cap at 100%
                let marketShare = 0;
                if (totalOkbForRM > 0) {
                    marketShare = Math.min(1, m.totalClients / totalOkbForRM);
                } else if (okbData.length === 0) {
                    // Fallback if OKB not loaded: use File Potential if available, otherwise guess
                    marketShare = m.totalPotential > 0 ? (m.totalFact / m.totalPotential) : 0.5; 
                }

                // 4. Smart Plan Algorithm (Updated)
                // Pivot point is 40% coverage.
                // < 40% coverage: High growth potential -> Increase Plan
                // > 40% coverage: Market saturation -> Decrease Plan
                
                // Sensitivity: 
                // If Share is 10% (0.1): (0.4 - 0.1) * 20 = +6%. Result 19%.
                // If Share is 80% (0.8): (0.4 - 0.8) * 20 = -8%. Result 5%.
                const sensitivity = 20; 
                let adjustment = (0.4 - marketShare) * sensitivity;

                // Clamp limits: 
                // Minimum growth: 5% (inflation/retention)
                // Maximum growth: 25% (aggressive expansion)
                const minRate = 5;
                const maxRate = 25;
                
                let calculatedRate = BASE_GROWTH_RATE + adjustment;
                calculatedRate = Math.max(minRate, Math.min(maxRate, calculatedRate));

                const recommendedPct = Math.round(calculatedRate * 10) / 10;
                const nextYearPlan = m.totalFact * (1 + recommendedPct / 100);

                return {
                    ...m,
                    avgFactPerClient: m.totalClients > 0 ? m.totalFact / m.totalClients : 0,
                    marketShare: marketShare * 100, // Convert to percentage for display
                    recommendedGrowthPct: recommendedPct,
                    nextYearPlan: nextYearPlan
                };
            })
            .sort((a, b) => b.totalFact - a.totalFact);
    }, [data, okbData]);

    const formatNum = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

    const handleAnalyzeClick = (rm: RMMetrics) => {
        setSelectedRMForAnalysis(rm);
        setIsAnalysisModalOpen(true);
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="Дашборд эффективности РМ и Планирование 2025">
                <div className="space-y-4">
                    <div className="bg-gray-800/50 p-3 rounded-lg text-sm text-gray-400 border border-gray-700 flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                            <span>Базовое повышение: <b>{BASE_GROWTH_RATE}%</b></span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                            <span>Низкая доля рынка (Высокий план)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                            <span>Высокая доля рынка (Сниженный план)</span>
                        </div>
                        {okbData.length === 0 && (
                            <div className="ml-auto text-xs text-red-400 border border-red-500/30 px-2 py-1 rounded">
                                ⚠️ База ОКБ не загружена. Расчет приблизительный.
                            </div>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">РМ</th>
                                    <th className="px-4 py-3 text-center">Факт 2024 (кг)</th>
                                    <th className="px-4 py-3 text-center">АКБ / ОКБ (шт)</th>
                                    <th className="px-4 py-3 text-center text-indigo-300" title="Покрытие территории (АКБ / ОКБ)">Доля рынка</th>
                                    <th className="px-4 py-3 text-center border-l border-gray-700 bg-gray-800/30">Рек. План (%)</th>
                                    <th className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/30">Обоснование</th>
                                    <th className="px-4 py-3 text-center font-bold bg-gray-800/30">План 2025 (кг)</th>
                                    <th className="px-4 py-3 text-center text-amber-400" title="Клиенты категории A">A</th>
                                    <th className="px-4 py-3 text-center text-emerald-400" title="Клиенты категории B">B</th>
                                    <th className="px-4 py-3 text-center text-slate-400" title="Клиенты категории C">C</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.map((rm) => {
                                    const isHighGrowth = rm.recommendedGrowthPct > BASE_GROWTH_RATE;
                                    const isLowGrowth = rm.recommendedGrowthPct < BASE_GROWTH_RATE;
                                    const pctColor = isHighGrowth ? 'text-emerald-400' : isLowGrowth ? 'text-amber-400' : 'text-gray-300';
                                    
                                    // Find total OKB for this RM again for display
                                    let totalOkb = 0;
                                    if (okbData.length > 0) {
                                        okbData.forEach(r => {
                                            if (findValueInRow(r, ['рм', 'менеджер']) === rm.rmName) totalOkb++;
                                        });
                                    }

                                    return (
                                        <tr key={rm.rmName} className="border-b border-gray-700 hover:bg-indigo-500/10 transition-colors">
                                            <td className="px-4 py-3 font-medium text-white">{rm.rmName}</td>
                                            <td className="px-4 py-3 text-center font-bold text-gray-200">{formatNum(rm.totalFact)}</td>
                                            <td className="px-4 py-3 text-center text-gray-500">
                                                {rm.totalClients} / {totalOkb > 0 ? totalOkb : '?'}
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono text-indigo-300">
                                                {rm.marketShare.toFixed(1)}%
                                            </td>
                                            
                                            {/* Smart Planning Columns */}
                                            <td className={`px-4 py-3 text-center font-bold border-l border-gray-700 bg-gray-800/30 ${pctColor}`}>
                                                {rm.recommendedGrowthPct > 0 ? '+' : ''}{rm.recommendedGrowthPct.toFixed(1)}%
                                            </td>
                                            <td className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/30">
                                                <button 
                                                    onClick={() => handleAnalyzeClick(rm)}
                                                    className="text-xs bg-indigo-600/80 hover:bg-indigo-500 text-white py-1 px-3 rounded-md flex items-center gap-1 mx-auto transition-all shadow-md hover:shadow-indigo-500/30"
                                                    title="Получить анализ и обоснование от AI"
                                                >
                                                    <BrainIcon />
                                                    Анализ
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold text-white bg-gray-800/30">
                                                {formatNum(rm.nextYearPlan)}
                                                <div className="text-[10px] text-gray-500 font-normal">+{formatNum(rm.nextYearPlan - rm.totalFact)}</div>
                                            </td>

                                            <td className="px-4 py-3 text-center text-amber-400">{rm.countA}</td>
                                            <td className="px-4 py-3 text-center text-emerald-400">{rm.countB}</td>
                                            <td className="px-4 py-3 text-center text-slate-400">{rm.countC}</td>
                                        </tr>
                                    );
                                })}
                                {metrics.length === 0 && (
                                     <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">Нет данных для отображения</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <RMAnalysisModal 
                isOpen={isAnalysisModalOpen} 
                onClose={() => setIsAnalysisModalOpen(false)} 
                rmData={selectedRMForAnalysis}
                baseRate={BASE_GROWTH_RATE}
            />
        </>
    );
};

export default RMDashboard;