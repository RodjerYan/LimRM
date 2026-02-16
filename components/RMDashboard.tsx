import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { AggregatedDataRow, SummaryMetrics, OkbStatus, OkbDataRow, MapPoint, PotentialClient, RMMetrics } from '../types';
import { CalendarIcon, ExportIcon, TargetIcon, UsersIcon, FactIcon, WarningIcon, SearchIcon, TrendingUpIcon, ArrowLeftIcon } from './icons';
import MetricsSummary from './MetricsSummary';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import RegionDetailsModal from './RegionDetailsModal';
import { normalizeAddress } from '../utils/dataUtils';
import { enrichDataWithSmartPlan } from '../services/planning/integration';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    metrics: SummaryMetrics | null;
    okbRegionCounts: { [key: string]: number };
    mode: 'modal' | 'page';
    okbData: OkbDataRow[];
    okbStatus: OkbStatus | null;
    onEditClient: (client: MapPoint) => void;
    startDate: string;
    endDate: string;
}

interface PlanConfig {
    isActive: boolean;
    baseRate: number;
}

export const RMDashboard: React.FC<RMDashboardProps> = ({
    isOpen, onClose, data, metrics, okbRegionCounts, mode, okbData, okbStatus, onEditClient, startDate, endDate
}) => {
    const [isPlanSettingsOpen, setIsPlanSettingsOpen] = useState(false);
    const [planConfig, setPlanConfig] = useState<PlanConfig>({ isActive: false, baseRate: 15 });
    const [selectedRM, setSelectedRM] = useState<RMMetrics | null>(null);
    const [selectedRegionDetails, setSelectedRegionDetails] = useState<{ rm: string, region: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // --- Smart Plan Calculation ---
    const plannedData = useMemo(() => {
        if (!planConfig.isActive) return data;
        // Use a coordinate set for matching if okbData is available (optional but better)
        const coordSet = new Set<string>();
        okbData.forEach(r => {
            if (r.lat && r.lon) coordSet.add(`${r.lat.toFixed(4)},${r.lon.toFixed(4)}`);
        });
        
        return enrichDataWithSmartPlan(data, okbRegionCounts, planConfig.baseRate, coordSet);
    }, [data, planConfig, okbRegionCounts, okbData]);

    // --- Aggregation by RM ---
    const rmAggregates = useMemo(() => {
        const map = new Map<string, RMMetrics>();

        plannedData.forEach(row => {
            const rm = row.rm || 'Не указан';
            if (!map.has(rm)) {
                map.set(rm, {
                    rmName: rm,
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
            const stat = map.get(rm)!;
            
            // Add row metrics
            stat.totalFact += row.fact;
            stat.totalPotential += row.potential;
            stat.nextYearPlan += (row.potential || 0); // Using potential as plan if calculated
            
            row.clients.forEach(c => {
                stat.totalClients++;
                if (c.abcCategory === 'A') { stat.countA++; stat.factA += (c.fact || 0); }
                else if (c.abcCategory === 'B') { stat.countB++; stat.factB += (c.fact || 0); }
                else { stat.countC++; stat.factC += (c.fact || 0); }
            });

            // Rough region counting logic
            // In a real app we'd aggregate regions properly here
            const regionOkb = okbRegionCounts[row.region] || 0;
            // Only add if not already counted? Simplified: assume region rows are unique per RM-Region combo
            // Actually AggregatedDataRow is unique by Group (Region-RM-Brand-Pack).
            // So we might sum up the same region capacity multiple times if we aren't careful.
            // Let's rely on unique region names for OKB sum.
        });

        // Post-process for OKB and Share
        const result = Array.from(map.values()).map(stat => {
            // Recalculate OKB specific to this RM's regions
            const uniqueRegions = new Set(plannedData.filter(d => d.rm === stat.rmName).map(d => d.region));
            let totalOkb = 0;
            uniqueRegions.forEach(reg => {
                totalOkb += (okbRegionCounts[reg] || 0);
            });
            stat.totalOkbCount = totalOkb;
            
            stat.marketShare = totalOkb > 0 ? (stat.totalClients / totalOkb) * 100 : 0;
            stat.avgFactPerClient = stat.totalClients > 0 ? stat.totalFact / stat.totalClients : 0;
            
            // Calculate recommended growth (simple weighted avg of rows or just global formula)
            // Using logic from planning engine result if available
            if (planConfig.isActive && stat.totalFact > 0) {
                stat.recommendedGrowthPct = ((stat.nextYearPlan - stat.totalFact) / stat.totalFact) * 100;
            } else {
                stat.recommendedGrowthPct = planConfig.baseRate;
            }

            return stat;
        });

        return result.sort((a, b) => b.totalFact - a.totalFact);
    }, [plannedData, okbRegionCounts, planConfig]);

    const filteredRMs = useMemo(() => {
        if (!searchTerm) return rmAggregates;
        const lower = searchTerm.toLowerCase();
        return rmAggregates.filter(rm => rm.rmName.toLowerCase().includes(lower));
    }, [rmAggregates, searchTerm]);

    const handleGlobalExportUncovered = () => {
        if (!okbData.length) {
            alert('База ОКБ не загружена.');
            return;
        }

        // Identify Active Addresses
        const activeAddresses = new Set<string>();
        data.forEach(row => {
            row.clients.forEach(c => {
                if (c.address) activeAddresses.add(normalizeAddress(c.address));
            });
        });

        // Filter OKB
        const uncovered = okbData.filter(row => {
            // Assuming row has 'address' or 'юридический адрес'
            const addr = row['Адрес'] || row['Юридический адрес'] || row.address;
            if (!addr) return false;
            return !activeAddresses.has(normalizeAddress(addr));
        });

        if (uncovered.length === 0) {
            alert('Нет непокрытых точек (100% покрытие).');
            return;
        }

        // Export
        const exportData = uncovered.map(u => ({
            'Регион': u.region || u['Регион'] || '',
            'Город': u.city || u['Город'] || '',
            'Наименование': u.name || u['Наименование'] || '',
            'Адрес': u.address || u['Юридический адрес'] || '',
            'Тип': u.type || u['Вид деятельности'] || ''
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Uncovered_Global");
        XLSX.writeFile(wb, `Uncovered_Potential_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Helper to get drilldown data
    const getDrilldownData = () => {
        if (!selectedRegionDetails) return { active: [], potential: [] };
        
        const { rm, region } = selectedRegionDetails;
        
        // Active Clients for this RM & Region
        const active: MapPoint[] = [];
        data.filter(r => r.rm === rm && r.region === region).forEach(r => active.push(...r.clients));
        
        // Potential Clients for this Region (OKB) - excluding active
        const activeAddrSet = new Set(active.map(c => normalizeAddress(c.address)));
        
        const potential: PotentialClient[] = okbData
            .filter(r => {
                // Check region match (fuzzy or exact)
                const rReg = r.region || r['Регион'];
                return rReg && rReg.includes(region);
            })
            .filter(r => {
                const addr = r.address || r['Юридический адрес'];
                return addr && !activeAddrSet.has(normalizeAddress(addr));
            })
            .map(r => ({
                name: r.name || r['Наименование'] || 'Unknown',
                address: r.address || r['Юридический адрес'] || '',
                type: r.type || r['Вид деятельности'] || '',
                lat: r.lat,
                lon: r.lon
            }));

        return { active, potential };
    };

    const drilldownData = getDrilldownData();

    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 z-50 flex flex-col bg-slate-50 overflow-hidden ${mode === 'modal' ? 'p-4 md:p-8' : ''}`}>
            {mode === 'modal' && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-md" onClick={onClose} />
            )}
            
            <div className={`relative flex flex-col w-full h-full bg-slate-100/50 ${mode === 'modal' ? 'rounded-3xl shadow-2xl border border-slate-200 overflow-hidden' : ''}`}>
                
                {/* Header */}
                <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {mode === 'page' && (
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <ArrowLeftIcon />
                            </button>
                        )}
                        <div>
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">Панель Управления (План/Факт)</h1>
                            <p className="text-xs text-slate-500 font-medium">Стратегический обзор эффективности регионов</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsPlanSettingsOpen(true)}
                            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold rounded-xl border transition-colors shadow-sm h-full ${planConfig.isActive ? 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-500' : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500'}`}
                            title="Настроить период и рассчитать план"
                        >
                            <CalendarIcon small /> 
                            {planConfig.isActive ? 'План рассчитан (Настроить)' : 'Рассчитать план'}
                        </button>

                        <button 
                            onClick={handleGlobalExportUncovered}
                            className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors shadow-sm"
                            title="Скачать всю базу непокрытых точек (Excel)"
                        >
                            <ExportIcon small />
                            <span>Выгрузить "Белые пятна"</span>
                        </button>
                    </div>
                </div>

                {/* Dashboard Content */}
                <div className="flex-grow overflow-y-auto custom-scrollbar p-6">
                    {/* Top Metrics */}
                    <div className="mb-8">
                        <MetricsSummary metrics={metrics} okbStatus={okbStatus} disabled={false} />
                    </div>

                    {/* RM Grid */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <UsersIcon /> Эффективность по Менеджерам
                            </h2>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    placeholder="Поиск РМ..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <div className="absolute left-3 top-2.5 text-slate-400"><SearchIcon small /></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {filteredRMs.map(rm => (
                                <div key={rm.rmName} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-all group">
                                    <div className="flex flex-col md:flex-row justify-between gap-6">
                                        
                                        {/* RM Info */}
                                        <div className="w-full md:w-1/4">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold border border-indigo-100">
                                                    {rm.rmName.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 text-base">{rm.rmName}</h3>
                                                    <div className="text-xs text-slate-500">{rm.totalClients} активных ТТ</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-3">
                                                <button 
                                                    onClick={() => setSelectedRM(rm)}
                                                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                                                >
                                                    AI Анализ
                                                </button>
                                                {/* Could add Region breakdown toggle here */}
                                            </div>
                                        </div>

                                        {/* Stats Grid */}
                                        <div className="flex-grow grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Факт Продаж</div>
                                                <div className="text-lg font-mono font-black text-slate-900">
                                                    {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(rm.totalFact)}
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Потенциал (ОКБ)</div>
                                                <div className="text-lg font-mono font-bold text-indigo-600">
                                                    {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(rm.totalOkbCount * 100)} <span className="text-xs text-slate-400 font-normal">ед (est)</span>
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Доля Рынка</div>
                                                <div className={`text-lg font-bold ${rm.marketShare > 30 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    {rm.marketShare.toFixed(1)}%
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">План {new Date().getFullYear() + 1}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg font-mono font-bold text-slate-900">
                                                        {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(rm.nextYearPlan)}
                                                    </span>
                                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${rm.recommendedGrowthPct > 15 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                                        +{rm.recommendedGrowthPct.toFixed(0)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                    
                                    {/* Region Tags (Clickable) */}
                                    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                                        {Array.from(new Set(plannedData.filter(d => d.rm === rm.rmName).map(d => d.region))).map(reg => (
                                            <button 
                                                key={reg}
                                                onClick={() => setSelectedRegionDetails({ rm: rm.rmName, region: reg })}
                                                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 font-medium hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center gap-1"
                                            >
                                                {reg}
                                                <span className="text-[9px] text-slate-300">↗</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Config Modal */}
            <Modal isOpen={isPlanSettingsOpen} onClose={() => setIsPlanSettingsOpen(false)} title="Настройки Планирования" maxWidth="max-w-lg">
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Базовая ставка роста (%)</label>
                        <input 
                            type="number" 
                            value={planConfig.baseRate} 
                            onChange={(e) => setPlanConfig({ ...planConfig, baseRate: Number(e.target.value) })}
                            className="w-full border border-slate-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold text-lg"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            Этот процент будет применен как минимальный целевой рост для всех клиентов, 
                            с последующей корректировкой на основе доли рынка (ROI Genome).
                        </p>
                    </div>
                    
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex gap-3">
                        <div className="text-indigo-500"><TargetIcon /></div>
                        <div className="text-xs text-indigo-800 leading-relaxed">
                            <strong>Smart Planning Engine:</strong> 
                            Система автоматически рассчитает индивидуальные планы для каждого РМ на основе:
                            <ul className="list-disc list-inside mt-1 ml-1 space-y-0.5">
                                <li>Текущей доли рынка (Penetration)</li>
                                <li>Потенциала "белых пятен" (Uncovered OKB)</li>
                                <li>Эффективности ассортимента (Velocity)</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={() => setIsPlanSettingsOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition">Отмена</button>
                        <button 
                            onClick={() => { setPlanConfig({ ...planConfig, isActive: true }); setIsPlanSettingsOpen(false); }}
                            className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-200 transition"
                        >
                            Рассчитать
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Details Modals */}
            {selectedRM && (
                <RMAnalysisModal 
                    isOpen={!!selectedRM} 
                    onClose={() => setSelectedRM(null)} 
                    rmData={selectedRM} 
                    baseRate={planConfig.baseRate} 
                    dateRange={`${startDate} - ${endDate}`}
                />
            )}

            {selectedRegionDetails && (
                <RegionDetailsModal 
                    isOpen={!!selectedRegionDetails}
                    onClose={() => setSelectedRegionDetails(null)}
                    rmName={selectedRegionDetails.rm}
                    regionName={selectedRegionDetails.region}
                    activeClients={drilldownData.active}
                    potentialClients={drilldownData.potential}
                    onEditClient={onEditClient}
                />
            )}
        </div>
    );
};
