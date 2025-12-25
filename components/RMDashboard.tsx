
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
    const [expandedRM, setExpandedRM] = useState<string | null>(null);
    const [isAbcModalOpen, setIsAbcModalOpen] = useState(false);
    const [abcClients, setAbcClients] = useState<MapPoint[]>([]);
    const [abcModalTitle, setAbcModalTitle] = useState<React.ReactNode>('');
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
        <div className="space-y-4 animate-fade-in">
            <div className="bg-gray-800/50 p-3 rounded-lg flex items-center gap-4 border border-gray-700">
                <div className="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-lg border border-indigo-500/30">
                    <span className="text-xs font-bold text-gray-500 uppercase">База роста:</span>
                    <span className="text-indigo-400 font-bold">{baseRate}%</span>
                </div>
                <button onClick={() => setIsLeagueModalOpen(true)} className="ml-auto text-xs font-bold text-yellow-400 bg-yellow-600/10 px-4 py-2 rounded-xl border border-yellow-500/30 hover:bg-yellow-600/20 transition-all">🏆 ЛИГА ЧЕМПИОНОВ</button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-[10px] text-gray-500 uppercase bg-gray-900/80 sticky top-0">
                        <tr><th className="px-4 py-3">Региональный Менеджер</th><th className="px-4 py-3 text-center">Факт 2025</th><th className="px-4 py-3 text-center">АКБ/ОКБ</th><th className="px-4 py-3 text-center">Покрытие / E-com</th><th className="px-4 py-3 text-center">Рост %</th><th className="px-4 py-3 text-center">План 2026</th><th className="px-4 py-3 text-center text-amber-400">A</th><th className="px-4 py-3 text-center text-emerald-400">B</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {metricsData.map(rm => {
                            const isExp = expandedRM === rm.rmName;
                            const avgShare = rm.regions.reduce((s,r) => s+(r.marketShare||0),0)/rm.regions.length;
                            const avgEcom = rm.regions.reduce((s,r) => s+(r.eCom||0),0)/rm.regions.length;
                            return (
                                <React.Fragment key={rm.rmName}>
                                    <tr className={`hover:bg-gray-800/40 cursor-pointer transition-colors ${isExp ? 'bg-gray-800/60' : ''}`} onClick={() => setExpandedRM(isExp ? null : rm.rmName)}>
                                        <td className="px-4 py-4 font-bold text-white flex items-center gap-2">{isExp ? '▲' : '▼'} {rm.rmName}</td>
                                        <td className="px-4 py-4 text-center font-mono text-gray-100">{rm.totalFact.toLocaleString('ru-RU')}</td>
                                        <td className="px-4 py-4 text-center text-gray-400">{rm.totalClients} / {rm.totalOkbCount}</td>
                                        <td className="px-4 py-4 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-emerald-400">{avgShare.toFixed(0)}%</span><div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${avgShare}%` }}></div></div></div>
                                                <span className="text-[8px] text-indigo-400 uppercase font-bold tracking-tighter">e-com pot: {avgEcom}%</span>
                                            </div>
                                        </td>
                                        <td className={`px-4 py-4 text-center font-bold ${rm.recommendedGrowthPct > baseRate ? 'text-emerald-400' : 'text-amber-400'}`}>+{rm.recommendedGrowthPct.toFixed(1)}%</td>
                                        <td className="px-4 py-4 text-center font-bold text-white bg-white/5">{rm.nextYearPlan.toLocaleString('ru-RU')}</td>
                                        <td className="px-4 py-4 text-center font-bold text-amber-500/80">{rm.countA}</td>
                                        <td className="px-4 py-4 text-center font-bold text-emerald-500/80">{rm.countB}</td>
                                    </tr>
                                    {isExp && (
                                        <tr>
                                            <td colSpan={8} className="p-4 bg-black/40 border-b border-indigo-500/20">
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    <div className="space-y-4">
                                                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><ChartBarIcon small/> ДЕТАЛИЗАЦИЯ ПО РЕГИОНАМ</h4>
                                                        <div className="max-h-60 overflow-y-auto custom-scrollbar border border-gray-800 rounded-xl overflow-hidden bg-gray-900/50">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-gray-800 text-gray-500"><tr><th className="p-3">Регион</th><th className="p-3 text-center">Покрытие</th><th className="p-3 text-center">Рост %</th><th className="p-3 text-right">План 2026</th></tr></thead>
                                                                <tbody className="divide-y divide-gray-800">
                                                                    {rm.regions.map(reg => (
                                                                        <tr key={reg.name} className="hover:bg-white/5 cursor-pointer group" onClick={() => handleRegionClick(rm.rmName, reg.name)}>
                                                                            <td className="p-3 text-gray-300 font-medium group-hover:text-white transition-colors">{reg.name}</td>
                                                                            <td className="p-3 text-center text-emerald-400 font-bold">{reg.marketShare?.toFixed(0)}%</td>
                                                                            <td className="p-3 text-center">
                                                                                <button onClick={(e) => { e.stopPropagation(); setExplainingPlan(reg); }} className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded border border-indigo-500/20 font-bold transition-all">+{reg.growthPct.toFixed(1)}%</button>
                                                                            </td>
                                                                            <td className="p-3 text-right text-white font-mono">{reg.plan.toLocaleString('ru-RU')}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-4">
                                                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><TargetIcon small/> ДЕТАЛИЗАЦИЯ: РЕГИОНЫ И БРЕНДЫ</h4>
                                                        <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-800 flex flex-col gap-4">
                                                            <div className="space-y-2">
                                                                {rm.regions[0]?.brands?.slice(0, 3).map(b => (
                                                                    <div key={b.name} className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                                                                        <span className="text-gray-300 font-bold">{b.name}</span>
                                                                        <div className="flex gap-4">
                                                                            <span className="text-gray-500 font-mono">{b.fact.toLocaleString('ru-RU')} кг</span>
                                                                            <span className="text-emerald-400 font-bold">+{b.growthPct.toFixed(1)}%</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <PackagingCharts fact={rm.totalFact} plan={rm.nextYearPlan} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <>
            {mode === 'page' ? (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center gap-4 border-b border-gray-800 pb-4">
                        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><ArrowLeftIcon/></button>
                        <div><h2 className="text-2xl font-bold text-white uppercase">Дашборд Коммерческого Директора</h2><p className="text-xs text-gray-500 font-bold tracking-widest">SMART PLANNING ENGINE V3.0</p></div>
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
