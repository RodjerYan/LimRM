
import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import ClientsListModal from './ClientsListModal';
import RegionDetailsModal from './RegionDetailsModal';
import GrowthExplanationModal from './GrowthExplanationModal';
import GamificationModal from './GamificationModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, PotentialClient } from '../types';
import { ExportIcon, ArrowLeftIcon, CalculatorIcon, ChartBarIcon, TargetIcon, InfoIcon, TrendingUpIcon } from './icons';
import { findValueInRow, findAddressInRow, normalizeRmNameForMatching, normalizeAddress } from '../utils/dataUtils';
import { getMarketData } from '../utils/marketData';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    okbRegionCounts: { [key: string]: number } | null;
    okbData: OkbDataRow[];
    mode?: 'modal' | 'page';
    metrics: SummaryMetrics | null;
    okbStatus: OkbStatus | null;
    onActiveClientsClick?: () => void;
    onEditClient?: (client: MapPoint) => void;
    dateRange?: string;
}

const fuzzyRegionMatch = (reg1: string, reg2: string): boolean => {
    const clean = (s: string) => (s || '').toLowerCase().replace(/^(г\.|г |обл\.|область|респ\.|республика|край)\s+/g, '').replace(/\s+(обл\.|область|респ\.|республика|край)$/g, '').trim();
    const c1 = clean(reg1); const c2 = clean(reg2);
    if (!c1 || !c2) return false;
    return c1.includes(c2) || c2.includes(c1);
};

const PackagingCharts: React.FC<{ fact: number; plan: number }> = ({ fact, plan }) => {
    const gap = Math.max(0, plan - fact);
    const percentage = plan > 0 ? (fact / plan) * 100 : 0;
    const barData = {
        labels: ['Факт 2025', 'План 2026'],
        datasets: [{
            data: [fact, plan],
            backgroundColor: ['rgba(16, 185, 129, 0.6)', 'rgba(99, 102, 241, 0.6)'],
            borderColor: ['#10b981', '#6366f1'],
            borderWidth: 1,
            borderRadius: 4,
        }],
    };
    return (
        <div className="grid grid-cols-2 gap-4 h-40">
            <div className="bg-black/20 p-2 rounded-xl border border-white/5"><Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { ticks: { color: '#9ca3af', font: { size: 9 } } } } }} /></div>
            <div className="bg-black/20 p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center relative">
                <Doughnut data={{ labels: ['B', 'G'], datasets: [{ data: [fact, gap], backgroundColor: ['#10b981', '#fbbf24'], borderWidth: 0 }] }} options={{ cutout: '70%', plugins: { legend: { display: false } } }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-white">{percentage.toFixed(0)}%</span>
                    <span className="text-[8px] text-gray-500 uppercase">Coverage</span>
                </div>
            </div>
        </div>
    );
};

export const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbRegionCounts, okbData, mode = 'modal', metrics, okbStatus, onEditClient }) => {
    const [baseRate] = useState(15);
    const [selectedRMName, setSelectedRMName] = useState<string | null>(null);
    const [isAbcModalOpen, setIsAbcModalOpen] = useState(false);
    const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
    const [selectedRegionDetails, setSelectedRegionDetails] = useState<{ rmName: string; regionName: string; activeClients: MapPoint[]; potentialClients: PotentialClient[]; } | null>(null);
    const [explainingPlan, setExplainingPlan] = useState<PlanMetric | null>(null);
    const [isLeagueModalOpen, setIsLeagueModalOpen] = useState(false);

    const metricsData = useMemo<RMMetrics[]>(() => {
        const globalOkb = okbRegionCounts || {};
        const rmBuckets = new Map<string, any>();
        data.forEach(row => {
            const rm = row.rm || 'N/A'; const norm = normalizeRmNameForMatching(rm);
            if (!rmBuckets.has(norm)) rmBuckets.set(norm, { originalName: rm, regions: new Map(), totalFact: 0, countA: 0, countB: 0, countC: 0, uniqueKeys: new Set() });
            const bucket = rmBuckets.get(norm)!;
            bucket.totalFact += row.fact;
            row.clients.forEach(c => {
                bucket.uniqueKeys.add(c.key);
                if (c.abcCategory === 'A') bucket.countA++; else if (c.abcCategory === 'B') bucket.countB++; else bucket.countC++;
            });
            const regKey = row.region || 'Unknown';
            if (!bucket.regions.has(regKey)) bucket.regions.set(regKey, { fact: 0, clients: new Set(), brands: new Map(), eCom: getMarketData(regKey).eComPenetration });
            const rb = bucket.regions.get(regKey)!;
            rb.fact += row.fact; row.clients.forEach((c: any) => rb.clients.add(c.key));
            const brand = row.brand || 'No Brand';
            if (!rb.brands.has(brand)) rb.brands.set(brand, { fact: 0, row });
            rb.brands.get(brand).fact += row.fact;
        });

        const result: RMMetrics[] = [];
        rmBuckets.forEach(rmData => {
            const regionMetrics: PlanMetric[] = []; let totalCalculated = 0;
            rmData.regions.forEach((regBucket: any, name: string) => {
                const totalOkbCount = globalOkb[name] || 0;
                let regPlan = 0; const brandMetrics: PlanMetric[] = [];
                regBucket.brands.forEach((bObj: any, brandName: string) => {
                    const row = bObj.row as AggregatedDataRow;
                    const pm = row.planMetric!;
                    regPlan += pm.plan;
                    brandMetrics.push({ ...pm, name: brandName });
                });
                totalCalculated += regPlan;
                regionMetrics.push({ name, fact: regBucket.fact, plan: regPlan, growthPct: regBucket.fact > 0 ? ((regPlan - regBucket.fact) / regBucket.fact) * 100 : 15, marketShare: Math.min(100, (regBucket.clients.size / Math.max(1, totalOkbCount)) * 100), eCom: regBucket.eCom, brands: brandMetrics.sort((a,b) => b.fact - a.fact), factors: brandMetrics[0]?.factors, details: brandMetrics[0]?.details });
            });
            result.push({ 
                rmName: rmData.originalName, totalClients: rmData.uniqueKeys.size, 
                totalOkbCount: Array.from(rmData.regions.keys() as IterableIterator<string>).reduce((s: number, k: string) => s + (globalOkb[k] || 0), 0), 
                totalFact: rmData.totalFact, recommendedGrowthPct: rmData.totalFact > 0 ? ((totalCalculated - rmData.totalFact) / rmData.totalFact) * 100 : 15, 
                nextYearPlan: totalCalculated, countA: rmData.countA, countB: rmData.countB, countC: rmData.countC, 
                regions: regionMetrics.sort((a,b) => b.fact - a.fact), marketShare: 0, factA: 0, factB: 0, factC: 0, brands: [], totalPotential: 0, avgFactPerClient: 0 
            });
        });
        return result.sort((a,b) => b.totalFact - a.totalFact);
    }, [data, okbRegionCounts]);

    const activeRM = useMemo(() => {
        if (!selectedRMName) return metricsData[0] || null;
        return metricsData.find(m => m.rmName === selectedRMName) || metricsData[0] || null;
    }, [selectedRMName, metricsData]);

    const handleRegionClick = (rmName: string, regionName: string) => {
        const active: MapPoint[] = []; const target = normalizeRmNameForMatching(rmName);
        data.forEach(g => { if (normalizeRmNameForMatching(g.rm) === target && fuzzyRegionMatch(g.region, regionName)) active.push(...g.clients); });
        const activeAddrs = new Set(active.map(a => normalizeAddress(a.address)));
        const potential: PotentialClient[] = okbData.filter(row => {
            const rReg = findValueInRow(row, ['субъект', 'регион']) || '';
            if (!fuzzyRegionMatch(rReg, regionName)) return false;
            return !activeAddrs.has(normalizeAddress(findAddressInRow(row)));
        }).map(r => ({ name: String(r['Наименование']), address: findAddressInRow(r) || '', type: findValueInRow(r, ['тип']) || 'Розница' }));
        setSelectedRegionDetails({ rmName, regionName, activeClients: active, potentialClients: potential });
        setIsRegionModalOpen(true);
    };

    const mainContent = (
        <div className="space-y-6 animate-fade-in">
            {/* RM Selector Bar */}
            <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700 flex items-center gap-4 overflow-x-auto custom-scrollbar">
                <div className="flex-shrink-0 text-xs font-bold text-gray-500 uppercase tracking-widest mr-2">Менеджер:</div>
                {metricsData.map(rm => (
                    <button 
                        key={rm.rmName}
                        onClick={() => setSelectedRMName(rm.rmName)}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            activeRM?.rmName === rm.rmName 
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                                : 'bg-gray-900 text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        {rm.rmName}
                    </button>
                ))}
            </div>

            {/* Split Panel Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* LEFT PANEL: Regions */}
                <div className="bg-gray-900/60 p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col h-[70vh]">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                                <ChartBarIcon small />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white uppercase tracking-tight">Детализация по регионам</h3>
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-0.5">Клик по строке для списка ТТ</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Всего регионов</span>
                            <div className="text-xl font-mono font-bold text-white">{activeRM?.regions.length || 0}</div>
                        </div>
                    </div>

                    <div className="flex-grow overflow-y-auto custom-scrollbar pr-1">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] text-gray-500 uppercase bg-gray-900/80 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">Регион</th>
                                    <th className="px-4 py-3 text-center">Покрытие / E-com</th>
                                    <th className="px-4 py-3 text-center">Рост %</th>
                                    <th className="px-4 py-3 text-right">План 2026</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {activeRM?.regions.map(reg => (
                                    <tr 
                                        key={reg.name} 
                                        className="hover:bg-white/5 cursor-pointer group transition-colors"
                                        onClick={() => handleRegionClick(activeRM.rmName, reg.name)}
                                    >
                                        <td className="px-4 py-4">
                                            <div className="font-bold text-white group-hover:text-indigo-300 transition-colors">{reg.name}</div>
                                            <div className="text-[10px] text-gray-500 font-mono">Факт: {reg.fact.toLocaleString('ru-RU')} кг</div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-bold ${reg.marketShare! > 40 ? 'text-emerald-400' : 'text-amber-400'}`}>{reg.marketShare?.toFixed(0)}%</span>
                                                    <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
                                                        <div className={`h-full ${reg.marketShare! > 40 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${reg.marketShare}%` }}></div>
                                                    </div>
                                                </div>
                                                <span className="text-[8px] text-indigo-400 uppercase font-bold tracking-tighter">e-com: {reg.eCom}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setExplainingPlan(reg); }}
                                                className={`px-2 py-1 rounded border font-bold text-xs transition-all ${reg.growthPct > baseRate ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}
                                            >
                                                +{reg.growthPct.toFixed(1)}%
                                            </button>
                                        </td>
                                        <td className="px-4 py-4 text-right font-mono font-bold text-gray-200">
                                            {reg.plan.toLocaleString('ru-RU')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* RIGHT PANEL: Brands & Charts */}
                <div className="flex flex-col gap-6 h-[70vh]">
                    <div className="bg-gray-900/60 p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col flex-grow">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                                    <TargetIcon small />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white uppercase tracking-tight">Регионы и Бренды</h3>
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-0.5">Вклад торговых марок</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto custom-scrollbar pr-1">
                            <div className="space-y-6">
                                {activeRM?.regions.map(reg => (
                                    <div key={reg.name} className="border-l-2 border-indigo-500/30 pl-4 py-1">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">{reg.name}</div>
                                        <div className="space-y-2">
                                            {reg.brands?.map(brand => (
                                                <div key={brand.name} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                                                    <span className="text-xs font-bold text-gray-300">{brand.name}</span>
                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right">
                                                            <div className="text-[10px] text-gray-500 font-mono">Факт: {brand.fact.toLocaleString('ru-RU')}</div>
                                                            <div className="text-[10px] text-emerald-400 font-bold">Рост: +{brand.growthPct.toFixed(1)}%</div>
                                                        </div>
                                                        <div className="w-20 text-right font-mono font-bold text-white text-sm">
                                                            {brand.plan.toLocaleString('ru-RU')}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Charts Widget */}
                    <div className="bg-gray-900/60 p-6 rounded-2xl border border-gray-700 shadow-xl h-60 shrink-0">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <TrendingUpIcon small /> Визуализация охвата (Trend Line)
                            </h4>
                        </div>
                        <PackagingCharts fact={activeRM?.totalFact || 0} plan={activeRM?.nextYearPlan || 0} />
                    </div>
                </div>
            </div>
            
            {/* Summary Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Суммарный Факт</div>
                    <div className="text-xl font-mono font-bold text-white">{activeRM?.totalFact.toLocaleString('ru-RU')} <span className="text-xs text-gray-500">кг</span></div>
                </div>
                <div className="bg-indigo-900/20 p-4 rounded-xl border border-indigo-500/20">
                    <div className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider mb-1">Целевой План 2026</div>
                    <div className="text-xl font-mono font-bold text-white">{Math.round(activeRM?.nextYearPlan || 0).toLocaleString('ru-RU')} <span className="text-xs text-gray-500">кг</span></div>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Средний рост %</div>
                    <div className="text-xl font-mono font-bold text-emerald-400">+{activeRM?.recommendedGrowthPct.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Клиентов / ОКБ</div>
                    <div className="text-xl font-mono font-bold text-indigo-300">{activeRM?.totalClients} / {activeRM?.totalOkbCount}</div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {mode === 'page' ? (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                        <div className="flex items-center gap-4">
                            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 transition-colors">
                                <ArrowLeftIcon />
                            </button>
                            <div>
                                <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Коммерческий Дашборд 2026</h2>
                                <p className="text-xs text-gray-500 font-bold tracking-widest">SMART PLANNING ENGINE V3.1 / {activeRM?.rmName}</p>
                            </div>
                        </div>
                        <button onClick={() => setIsLeagueModalOpen(true)} className="text-xs font-bold text-yellow-400 bg-yellow-600/10 px-4 py-2 rounded-xl border border-yellow-500/30 hover:bg-yellow-600/20 transition-all flex items-center gap-2">
                            <span>🏆</span> ЛИГА ЧЕМПИОНОВ
                        </button>
                    </div>
                    {mainContent}
                </div>
            ) : (
                <Modal isOpen={isOpen} onClose={onClose} title="Управление планами" maxWidth="max-w-[98vw]">{mainContent}</Modal>
            )}
            {isRegionModalOpen && selectedRegionDetails && <RegionDetailsModal isOpen={true} onClose={() => setIsRegionModalOpen(false)} {...selectedRegionDetails} onEditClient={onEditClient} />}
            {isLeagueModalOpen && <GamificationModal isOpen={true} onClose={() => setIsLeagueModalOpen(false)} data={metricsData} />}
            {explainingPlan && <GrowthExplanationModal isOpen={!!explainingPlan} onClose={() => setExplainingPlan(null)} data={explainingPlan} baseRate={baseRate} />}
        </>
    );
};

export default RMDashboard;
