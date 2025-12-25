
import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import ClientsListModal from './ClientsListModal';
import RegionDetailsModal from './RegionDetailsModal';
import GamificationModal from './GamificationModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, PotentialClient } from '../types';
import { ExportIcon, ArrowLeftIcon, CalculatorIcon, ChartBarIcon, TargetIcon, CheckIcon, LoaderIcon } from './icons';
import { findValueInRow, findAddressInRow, normalizeRmNameForMatching, normalizeAddress } from '../utils/dataUtils';
import { PlanningEngine } from '../services/planning/engine';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

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
    const clean = (s: string) => (s || '').toLowerCase()
        .replace(/^(г\.|г |обл\.|область|респ\.|республика|край)\s+/g, '')
        .replace(/\s+(обл\.|область|респ\.|республика|край)$/g, '')
        .trim();
    const c1 = clean(reg1);
    const c2 = clean(reg2);
    if (!c1 || !c2) return false;
    return c1.includes(c2) || c2.includes(c1);
};

const PackagingCharts: React.FC<{ fact: number; plan: number }> = ({ fact, plan }) => {
    const gap = Math.max(0, plan - fact);
    const percentage = plan > 0 ? (fact / plan) * 100 : 0;
    
    const barData = {
        labels: ['Факт 2025', 'План 2026'],
        datasets: [{
            label: 'Объем (кг)',
            data: [fact, plan],
            backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(99, 102, 241, 0.7)'],
            borderColor: ['#10b981', '#6366f1'],
            borderWidth: 1,
            borderRadius: 6,
        }],
    };

    const doughnutData = {
        labels: ['База (Факт)', 'Цель (Gap)'],
        datasets: [{
            data: [fact, gap],
            backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(251, 191, 36, 0.8)'],
            borderWidth: 0,
        }],
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[220px]">
            <div className="bg-gray-900/40 p-3 rounded-xl border border-gray-800"><Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
            <div className="bg-gray-900/40 p-3 rounded-xl border border-gray-800 relative">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-white">{percentage.toFixed(0)}%</div>
                        <div className="text-[10px] text-gray-500 uppercase">Покрытие</div>
                    </div>
                </div>
                <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }} />
            </div>
        </div>
    );
};

export const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbRegionCounts, okbData, mode = 'modal', metrics, okbStatus, onEditClient }) => {
    const [baseRate, setBaseRate] = useState(15);
    const [expandedRM, setExpandedRM] = useState<string | null>(null);
    const [isAbcModalOpen, setIsAbcModalOpen] = useState(false);
    const [abcClients, setAbcClients] = useState<MapPoint[]>([]);
    const [abcModalTitle, setAbcModalTitle] = useState<React.ReactNode>('');
    const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
    const [selectedRegionDetails, setSelectedRegionDetails] = useState<{ rmName: string; regionName: string; activeClients: MapPoint[]; potentialClients: PotentialClient[]; } | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [uncoveredRowsCache, setUncoveredRowsCache] = useState<OkbDataRow[]>([]);
    const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
    const [isLeagueModalOpen, setIsLeagueModalOpen] = useState(false);

    const currentYear = 2025;
    const nextYear = 2026;

    const metricsData = useMemo<RMMetrics[]>(() => {
        const globalOkbCounts = okbRegionCounts || {};
        let globalListings = 0; let globalVolume = 0; const uniqueKeys = new Set<string>();
        data.forEach(row => { globalVolume += row.fact; globalListings += row.clients.length; row.clients.forEach(c => uniqueKeys.add(c.key)); });
        const avgSku = uniqueKeys.size > 0 ? globalListings / uniqueKeys.size : 0;
        const avgSales = globalListings > 0 ? globalVolume / globalListings : 0;

        const rmMap = new Map<string, any>();
        data.forEach(row => {
            const rm = row.rm || 'Unknown'; const norm = normalizeRmNameForMatching(rm);
            if (!rmMap.has(norm)) rmMap.set(norm, { original: rm, regions: new Map(), totalFact: 0, countA: 0, countB: 0, countC: 0, listings: 0, uniqueKeys: new Set() });
            const bucket = rmMap.get(norm)!; bucket.totalFact += row.fact; bucket.listings += row.clients.length;
            row.clients.forEach(c => { bucket.uniqueKeys.add(c.key); if (c.abcCategory === 'A') bucket.countA++; else if (c.abcCategory === 'B') bucket.countB++; else bucket.countC++; });
            
            const regKey = row.region || 'N/A';
            if (!bucket.regions.has(regKey)) bucket.regions.set(regKey, { fact: 0, clients: new Set(), brandRows: new Map() });
            const rb = bucket.regions.get(regKey)!; rb.fact += row.fact; row.clients.forEach((c: any) => rb.clients.add(c.key));
            
            const brand = row.brand || 'No Brand';
            if (!rb.brandRows.has(brand)) rb.brandRows.set(brand, []);
            rb.brandRows.get(brand).push(row);
        });

        const result: RMMetrics[] = [];
        rmMap.forEach(rmData => {
            const regionMetrics: PlanMetric[] = []; let totalCalculated = 0;
            rmData.regions.forEach((regBucket: any, name: string) => {
                const totalOkb = globalOkbCounts[name] || 0;
                let regPlan = 0; const brandMetrics: PlanMetric[] = [];
                regBucket.brandRows.forEach((rows: AggregatedDataRow[], brand: string) => {
                    const fact = rows.reduce((s, r) => s + r.fact, 0);
                    const calc = PlanningEngine.calculateRMPlan({ totalFact: fact, totalPotential: totalOkb, matchedCount: regBucket.clients.size, activeCount: regBucket.clients.size, totalRegionOkb: totalOkb, avgSku: 1, avgVelocity: fact / Math.max(1, regBucket.clients.size), rmGlobalVelocity: rmData.totalFact / Math.max(1, rmData.listings) }, { baseRate, globalAvgSku: avgSku, globalAvgSales: avgSales, riskLevel: 'low' });
                    regPlan += fact * (1 + calc.growthPct / 100);
                    brandMetrics.push({ name: brand, fact, plan: fact * (1 + calc.growthPct / 100), growthPct: calc.growthPct });
                });
                totalCalculated += regPlan;
                regionMetrics.push({ name, fact: regBucket.fact, plan: regPlan, growthPct: regBucket.fact > 0 ? ((regPlan - regBucket.fact) / regBucket.fact) * 100 : 0, marketShare: Math.min(100, (regBucket.clients.size / Math.max(1, totalOkb)) * 100), brands: brandMetrics.sort((a,b) => b.fact - a.fact) });
            });
            // Fix: Added type annotations to the reduce callback to resolve 'unknown' type errors and ensure type safety when indexing globalOkbCounts.
            result.push({ 
                rmName: rmData.original, 
                totalClients: rmData.uniqueKeys.size, 
                totalOkbCount: Array.from(rmData.regions.keys() as IterableIterator<string>).reduce((s: number, k: string) => s + (globalOkbCounts[k] || 0), 0), 
                totalFact: rmData.totalFact, 
                marketShare: 0, 
                countA: rmData.countA, 
                countB: rmData.countB, 
                countC: rmData.countC, 
                recommendedGrowthPct: rmData.totalFact > 0 ? ((totalCalculated - rmData.totalFact) / rmData.totalFact) * 100 : baseRate, 
                nextYearPlan: totalCalculated, 
                regions: regionMetrics.sort((a,b) => b.fact - a.fact), 
                brands: [], 
                totalPotential: 0, 
                avgFactPerClient: 0, 
                factA: 0, 
                factB: 0, 
                factC: 0 
            });
        });
        return result.sort((a,b) => b.totalFact - a.totalFact);
    }, [data, okbRegionCounts, baseRate]);

    const handleRegionClick = (rmName: string, regionName: string) => {
        const active: MapPoint[] = []; const target = normalizeRmNameForMatching(rmName);
        data.forEach(g => { if (normalizeRmNameForMatching(g.rm) === target && fuzzyRegionMatch(g.region, regionName)) active.push(...g.clients); });
        const activeAddrs = new Set(active.map(a => normalizeAddress(a.address)));
        const activeCoords = new Set(active.map(a => (a.lat && a.lon) ? `${a.lat.toFixed(4)},${a.lon.toFixed(4)}` : ''));
        const potential: PotentialClient[] = okbData.filter(row => {
            const rReg = findValueInRow(row, ['субъект', 'регион']) || '';
            if (!fuzzyRegionMatch(rReg, regionName)) return false;
            const rAddr = normalizeAddress(findAddressInRow(row));
            const rCoord = (row.lat && row.lon) ? `${row.lat.toFixed(4)},${row.lon.toFixed(4)}` : '';
            return !activeAddrs.has(rAddr) && (!rCoord || !activeCoords.has(rCoord));
        }).map(r => ({ name: String(r['Наименование'] || 'ТТ'), address: findAddressInRow(r) || 'н/д', type: findValueInRow(r, ['тип', 'вид']) || 'Розница', lat: r.lat, lon: r.lon }));
        setSelectedRegionDetails({ rmName, regionName, activeClients: active, potentialClients: potential });
        setIsRegionModalOpen(true);
    };

    const performExport = () => {
        const rows = uncoveredRowsCache.filter(r => selectedCountries.has(findValueInRow(r, ['страна']) || 'Россия'));
        const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ 'Наименование': r['Наименование'], 'Адрес': findAddressInRow(r), 'Регион': findValueInRow(r, ['регион']), 'ИНН': r['ИНН'] })));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Potential');
        XLSX.writeFile(wb, `Uncovered_${new Date().toISOString().split('T')[0]}.xlsx`);
        setIsExportModalOpen(false);
    };

    const tableContent = (
        <div className="space-y-4">
            <div className="bg-gray-800/50 p-3 rounded-lg flex items-center gap-4">
                <div className="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-lg border border-indigo-500/30">
                    <label className="text-xs font-bold text-gray-400">ПОВЫШЕНИЕ:</label>
                    <input type="number" value={baseRate} onChange={e => setBaseRate(Number(e.target.value))} className="w-12 bg-transparent border-none text-indigo-400 font-bold focus:ring-0 p-0" />
                    <span className="text-indigo-400 font-bold">%</span>
                </div>
                <button onClick={() => setIsLeagueModalOpen(true)} className="ml-auto text-xs font-bold text-yellow-400 bg-yellow-600/10 px-3 py-1.5 rounded-lg border border-yellow-500/30">🏆 ЛИГА ЧЕМПИОНОВ</button>
                <button onClick={() => {
                    const activeCoords = new Set(data.flatMap(g => g.clients).map(c => (c.lat && c.lon) ? `${c.lat.toFixed(4)},${c.lon.toFixed(4)}` : ''));
                    const unc = okbData.filter(r => !r.lat || !activeCoords.has(`${(r.lat ?? 0).toFixed(4)},${(r.lon ?? 0).toFixed(4)}`));
                    setUncoveredRowsCache(unc); setSelectedCountries(new Set(['Россия'])); setIsExportModalOpen(true);
                }} className="text-xs font-bold text-white bg-emerald-600 px-3 py-1.5 rounded-lg flex items-center gap-2"><ExportIcon /> ЭКСПОРТ ОКБ</button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/20">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-[10px] text-gray-500 uppercase bg-gray-900/60 sticky top-0">
                        <tr><th className="px-4 py-3">РМ Менеджер</th><th className="px-4 py-3 text-center">Факт {currentYear}</th><th className="px-4 py-3 text-center">АКБ/ОКБ</th><th className="px-4 py-3 text-center">План %</th><th className="px-4 py-3 text-center">План {nextYear}</th><th className="px-4 py-3 text-center text-amber-400">A</th><th className="px-4 py-3 text-center text-emerald-400">B</th><th className="px-4 py-3 text-center text-slate-400">C</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {metricsData.map(rm => {
                            const isExp = expandedRM === rm.rmName;
                            return (
                                <React.Fragment key={rm.rmName}>
                                    <tr className={`hover:bg-gray-800/40 cursor-pointer transition-colors ${isExp ? 'bg-gray-800/60' : ''}`} onClick={() => setExpandedRM(isExp ? null : rm.rmName)}>
                                        <td className="px-4 py-4 font-bold text-white flex items-center gap-2">{isExp ? '▲' : '▼'} {rm.rmName}</td>
                                        <td className="px-4 py-4 text-center font-mono">{rm.totalFact.toLocaleString('ru-RU')}</td>
                                        <td className="px-4 py-4 text-center text-gray-500">{rm.totalClients} / {rm.totalOkbCount}</td>
                                        <td className={`px-4 py-4 text-center font-bold ${rm.recommendedGrowthPct > baseRate ? 'text-emerald-400' : 'text-amber-400'}`}>+{rm.recommendedGrowthPct.toFixed(1)}%</td>
                                        <td className="px-4 py-4 text-center font-bold text-white bg-white/5">{rm.nextYearPlan.toLocaleString('ru-RU')}</td>
                                        <td className="px-4 py-4 text-center font-bold text-amber-400">{rm.countA}</td>
                                        <td className="px-4 py-4 text-center font-bold text-emerald-400">{rm.countB}</td>
                                        <td className="px-4 py-4 text-center font-bold text-slate-500">{rm.countC}</td>
                                    </tr>
                                    {isExp && (
                                        <tr>
                                            <td colSpan={8} className="p-4 bg-black/40 border-b border-indigo-500/20">
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    <div className="space-y-3">
                                                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><ChartBarIcon small/> Детализация регионов</h4>
                                                        <div className="max-h-60 overflow-y-auto custom-scrollbar border border-gray-800 rounded-lg">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-gray-800 text-gray-400"><tr><th className="p-2">Регион</th><th className="p-2 text-right">Покрытие</th><th className="p-2 text-right">План 2026</th></tr></thead>
                                                                <tbody className="divide-y divide-gray-800">
                                                                    {rm.regions.map(reg => (
                                                                        <tr key={reg.name} className="hover:bg-white/5 cursor-pointer" onClick={() => handleRegionClick(rm.rmName, reg.name)}>
                                                                            <td className="p-2 text-gray-300">{reg.name}</td>
                                                                            <td className="p-2 text-right text-indigo-400 font-bold">{reg.marketShare?.toFixed(0)}%</td>
                                                                            <td className="p-2 text-right text-white">{reg.plan.toLocaleString('ru-RU')}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><TargetIcon small/> Распределение Брендов</h4>
                                                        <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800">
                                                            {rm.regions[0]?.brands?.map(b => (
                                                                <div key={b.name} className="flex justify-between items-center mb-2 border-b border-gray-800 pb-1 last:border-0">
                                                                    <span className="text-gray-300 text-xs font-bold">{b.name}</span>
                                                                    <div className="flex items-center gap-4">
                                                                        <span className="text-[10px] text-gray-500">{b.fact.toLocaleString('ru-RU')} кг</span>
                                                                        <span className="text-emerald-400 font-bold text-xs">+{b.growthPct.toFixed(1)}%</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            <div className="mt-4"><PackagingCharts fact={rm.totalFact} plan={rm.nextYearPlan} /></div>
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
                        <div><h2 className="text-2xl font-bold text-white uppercase tracking-tight">Дашборд Коммерческого Директора 2026</h2><p className="text-xs text-gray-500">Система автоматического планирования на базе ИИ и справочников ОКБ.</p></div>
                    </div>
                    {tableContent}
                </div>
            ) : (
                <Modal isOpen={isOpen} onClose={onClose} title="Управление планами" maxWidth="max-w-[98vw]">{tableContent}</Modal>
            )}
            {isRegionModalOpen && selectedRegionDetails && <RegionDetailsModal isOpen={true} onClose={() => setIsRegionModalOpen(false)} {...selectedRegionDetails} onEditClient={onEditClient} />}
            {isLeagueModalOpen && <GamificationModal isOpen={true} onClose={() => setIsLeagueModalOpen(false)} data={metricsData} />}
            <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Экспорт непокрытого потенциала" footer={<div className="flex justify-end p-4 bg-gray-900 border-t border-gray-800"><button onClick={performExport} className="bg-emerald-600 px-6 py-2 rounded-lg text-white font-bold">Скачать ({uncoveredRowsCache.length})</button></div>}>
                <div className="grid grid-cols-2 gap-2">
                    {Array.from(new Set(uncoveredRowsCache.map(r => findValueInRow(r, ['страна']) || 'Россия'))).map(c => (
                        <label key={c} className="flex items-center gap-2 p-2 bg-gray-800 rounded border border-gray-700 cursor-pointer">
                            <input type="checkbox" checked={selectedCountries.has(c)} onChange={() => { const n = new Set(selectedCountries); if (n.has(c)) n.delete(c); else n.add(c); setSelectedCountries(n); }} />
                            <span className="text-sm text-gray-300">{c}</span>
                        </label>
                    ))}
                </div>
            </Modal>
        </>
    );
};

export default RMDashboard;
