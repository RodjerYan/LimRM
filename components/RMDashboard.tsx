
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import ClientsListModal from './ClientsListModal';
import RegionDetailsModal from './RegionDetailsModal';
import GrowthExplanationModal from './GrowthExplanationModal';
import GamificationModal from './GamificationModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, PotentialClient } from '../types';
import { ExportIcon, SearchIcon, ArrowLeftIcon, CalculatorIcon, BrainIcon, LoaderIcon, ChartBarIcon, TargetIcon, CheckIcon } from './icons';
import { findValueInRow, findAddressInRow, normalizeRmNameForMatching, normalizeAddress } from '../utils/dataUtils';
import { PlanningEngine } from '../services/planning/engine';
import { streamPackagingInsights } from '../services/aiService';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
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
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

// Register ChartJS components
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

// Вспомогательная функция для нечеткого сравнения регионов
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

export const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbRegionCounts, okbData, mode = 'modal', metrics, okbStatus, onEditClient, dateRange }) => {
    const [baseRate, setBaseRate] = useState(15);
    const [expandedRM, setExpandedRM] = useState<string | null>(null);
    const [isAbcModalOpen, setIsAbcModalOpen] = useState(false);
    const [abcClients, setAbcClients] = useState<MapPoint[]>([]);
    const [abcModalTitle, setAbcModalTitle] = useState<React.ReactNode>('');
    const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
    const [selectedRegionDetails, setSelectedRegionDetails] = useState<{ rmName: string; regionName: string; activeClients: MapPoint[]; potentialClients: PotentialClient[]; } | null>(null);
    
    // --- Export State ---
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [uncoveredRowsCache, setUncoveredRowsCache] = useState<OkbDataRow[]>([]);
    const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
    const [isLeagueModalOpen, setIsLeagueModalOpen] = useState(false);

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const metricsData = useMemo<RMMetrics[]>(() => {
        const globalOkbRegionCounts = okbRegionCounts || {};
        let globalTotalListings = 0; let globalTotalVolume = 0; const allUniqueClientKeys = new Set<string>();
        data.forEach(row => { globalTotalVolume += row.fact; globalTotalListings += row.clients.length; row.clients.forEach(c => allUniqueClientKeys.add(c.key)); });
        const globalTotalUniqueClients = allUniqueClientKeys.size;
        const globalAvgSkuPerClient = globalTotalUniqueClients > 0 ? globalTotalListings / globalTotalUniqueClients : 0;
        const globalAvgSalesPerSku = globalTotalListings > 0 ? globalTotalVolume / globalTotalListings : 0;
        
        const rmBuckets = new Map<string, any>();
        data.forEach(row => {
            const rmName = row.rm || 'Не указан'; const normRm = normalizeRmNameForMatching(rmName); const regionKey = row.region || 'Регион не определен';
            if (!rmBuckets.has(normRm)) rmBuckets.set(normRm, { originalName: rmName, regions: new Map(), totalFact: 0, countA: 0, countB: 0, countC: 0, factA: 0, factB: 0, factC: 0, uniqueClientKeys: new Set(), totalListings: 0 });
            const rmBucket = rmBuckets.get(normRm)!; rmBucket.totalFact += row.fact; rmBucket.totalListings += row.clients.length;
            if (row.clients) row.clients.forEach(c => { rmBucket.uniqueClientKeys.add(c.key); const f = c.fact || 0; if (c.abcCategory === 'A') { rmBucket.countA++; rmBucket.factA += f; } else if (c.abcCategory === 'B') { rmBucket.countB++; rmBucket.factB += f; } else { rmBucket.countC++; rmBucket.factC += f; } });
            if (!rmBucket.regions.has(regionKey)) rmBucket.regions.set(regionKey, { fact: 0, potential: 0, activeClients: new Set(), matchedOkbCoords: new Set(), brandFacts: new Map(), brandClientCounts: new Map(), brandRows: new Map(), originalRegionName: row.region, regionListings: 0 });
            const regBucket = rmBucket.regions.get(regionKey)!; regBucket.fact += row.fact; regBucket.potential += row.potential || 0; regBucket.regionListings += row.clients.length;
            if (row.clients) row.clients.forEach(c => { regBucket.activeClients.add(c.key); });
            const brandName = row.brand || 'No Brand'; regBucket.brandFacts.set(brandName, (regBucket.brandFacts.get(brandName) || 0) + row.fact); regBucket.brandClientCounts.set(brandName, (regBucket.brandClientCounts.get(brandName) || 0) + row.clients.length);
            if (!regBucket.brandRows.has(brandName)) regBucket.brandRows.set(brandName, []); regBucket.brandRows.get(brandName)!.push(row);
        });

        const resultMetrics: RMMetrics[] = [];
        rmBuckets.forEach((rmData) => {
            const regionMetrics: PlanMetric[] = []; let rmTotalOkbRaw = 0; let rmTotalCalculatedPlan = 0;
            rmData.regions.forEach((regData: any, regionKey: string) => {
                const activeCount = regData.activeClients.size;
                let totalRegionOkb = globalOkbRegionCounts[regionKey] || 0; rmTotalOkbRaw += totalRegionOkb;
                let regionCalculatedPlan = 0; const regionBrands: PlanMetric[] = [];
                regData.brandFacts.forEach((bFact: number, bName: string) => {
                    const bClientCount = regData.brandClientCounts.get(bName) || 0;
                    const calc = PlanningEngine.calculateRMPlan({ totalFact: bFact, totalPotential: totalRegionOkb, matchedCount: activeCount, activeCount, totalRegionOkb, avgSku: 1, avgVelocity: bFact / Math.max(1, bClientCount), rmGlobalVelocity: rmData.totalFact / Math.max(1, rmData.totalListings) }, { baseRate, globalAvgSku: globalAvgSkuPerClient, globalAvgSales: globalAvgSalesPerSku, riskLevel: 'low' });
                    regionCalculatedPlan += bFact * (1 + calc.growthPct / 100);
                    regionBrands.push({ name: bName, fact: bFact, plan: bFact * (1 + calc.growthPct / 100), growthPct: calc.growthPct, packagingDetails: regData.brandRows.get(bName) || [] });
                });
                rmTotalCalculatedPlan += regionCalculatedPlan;
                const regionGrowthPct = regData.fact > 0 ? ((regionCalculatedPlan - regData.fact) / regData.fact) * 100 : (regionCalculatedPlan > 0 ? 100 : 0);
                regionMetrics.push({ name: regionKey, fact: regData.fact, plan: regionCalculatedPlan, growthPct: regionGrowthPct, marketShare: Math.min(100, (activeCount / Math.max(1, totalRegionOkb)) * 100), activeCount, totalCount: totalRegionOkb, brands: regionBrands.sort((a, b) => b.fact - a.fact) });
            });
            const effectiveGrowthPct = rmData.totalFact > 0 ? ((rmTotalCalculatedPlan - rmData.totalFact) / rmData.totalFact) * 100 : baseRate;
            resultMetrics.push({ rmName: rmData.originalName, totalClients: rmData.uniqueClientKeys.size, totalOkbCount: rmTotalOkbRaw, totalFact: rmData.totalFact, totalPotential: rmData.totalFact * 1.15, avgFactPerClient: rmData.totalFact / Math.max(1, rmData.uniqueClientKeys.size), marketShare: Math.min(100, (rmData.uniqueClientKeys.size / Math.max(1, rmTotalOkbRaw)) * 100), countA: rmData.countA, countB: rmData.countB, countC: rmData.countC, factA: rmData.factA, factB: rmData.factB, factC: rmData.factC, recommendedGrowthPct: effectiveGrowthPct, nextYearPlan: rmTotalCalculatedPlan, regions: regionMetrics.sort((a, b) => b.fact - a.fact), brands: [], avgSkuPerClient: rmData.totalListings / Math.max(1, rmData.uniqueClientKeys.size), avgSalesPerSku: rmData.totalFact / Math.max(1, rmData.totalListings), globalAvgSku: globalAvgSkuPerClient, globalAvgSalesSku: globalAvgSalesPerSku } as unknown as RMMetrics);
        });
        return resultMetrics.sort((a, b) => b.totalFact - a.totalFact);
    }, [data, okbRegionCounts, okbData, baseRate]);

    const handleRegionClick = (rmName: string, regionName: string) => {
        const active: MapPoint[] = [];
        const normTargetRm = normalizeRmNameForMatching(rmName);
        data.forEach(group => {
            if (normalizeRmNameForMatching(group.rm) === normTargetRm && fuzzyRegionMatch(group.region, regionName)) {
                active.push(...group.clients);
            }
        });

        const activeAddrs = new Set(active.map(a => normalizeAddress(a.address)));
        const activeCoords = new Set(active.map(a => (a.lat && a.lon) ? `${a.lat.toFixed(4)},${a.lon.toFixed(4)}` : ''));

        const potential: PotentialClient[] = okbData.filter(row => {
            const rowReg = findValueInRow(row, ['субъект', 'регион', 'область']) || '';
            if (!fuzzyRegionMatch(rowReg, regionName)) return false;

            const rowAddr = findAddressInRow(row);
            const normRowAddr = rowAddr ? normalizeAddress(rowAddr) : '';
            const rowCoordHash = (row.lat && row.lon) ? `${row.lat.toFixed(4)},${row.lon.toFixed(4)}` : '';

            return !activeAddrs.has(normRowAddr) && (!rowCoordHash || !activeCoords.has(rowCoordHash));
        }).map(row => ({
            name: String(row['Наименование'] || 'ТТ из ОКБ'),
            address: findAddressInRow(row) || 'Адрес не указан',
            type: findValueInRow(row, ['вид деятельности', 'тип', 'категория']) || 'Розница',
            lat: row.lat, lon: row.lon
        }));

        setSelectedRegionDetails({ rmName, regionName, activeClients: active, potentialClients: potential });
        setIsRegionModalOpen(true);
    };

    const handleAbcClick = (rmName: string, cat: 'A' | 'B' | 'C') => {
        const clients: MapPoint[] = []; const target = normalizeRmNameForMatching(rmName);
        data.forEach(g => { if (normalizeRmNameForMatching(g.rm) === target) g.clients.forEach(c => { if (c.abcCategory === cat) clients.push(c); }); });
        setAbcClients(clients.sort((a, b) => (b.fact || 0) - (a.fact || 0)));
        const d = { 'A': 'Лидеры (80% продаж)', 'B': 'Середняки (15% продаж)', 'C': 'Малообъемные (5% продаж)' };
        setAbcModalTitle(<div className="flex flex-col"><span className="text-xl font-bold text-white">{rmName}: {cat} ({clients.length})</span><span className="text-sm text-indigo-400 mt-1 uppercase">{d[cat]}</span></div>);
        setIsAbcModalOpen(true);
    };

    const prepareExportData = () => {
        const activeCoords = new Set<string>();
        data.forEach(g => g.clients.forEach(c => { if (c.lat && c.lon) activeCoords.add(`${c.lat.toFixed(4)},${c.lon.toFixed(4)}`); }));
        const uncovered = okbData.filter(row => {
            if (!row.lat || !row.lon) return true;
            return !activeCoords.has(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`);
        });
        
        setUncoveredRowsCache(uncovered);
        const countries = new Set<string>();
        uncovered.forEach(row => {
            const c = findValueInRow(row, ['страна', 'country']) || 'Россия';
            countries.add(c);
        });
        setSelectedCountries(countries);
        setIsExportModalOpen(true);
    };

    const performExport = () => {
        const rows = uncoveredRowsCache.filter(row => {
            const c = findValueInRow(row, ['страна', 'country']) || 'Россия';
            return selectedCountries.has(c);
        });
        const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ 'Наименование': r['Наименование'], 'Адрес': findAddressInRow(r), 'Регион': findValueInRow(r, ['регион', 'субъект']), 'ИНН': r['ИНН'] })));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Potential');
        XLSX.writeFile(wb, `Uncovered_${new Date().toISOString().split('T')[0]}.xlsx`);
        setIsExportModalOpen(false);
    };

    const formatNum = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

    const mainContent = (
        <div className="space-y-4 animate-fade-in">
            <div className="bg-gray-800/50 p-3 rounded-lg text-sm text-gray-400 border border-gray-700 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2 bg-gray-900/50 p-1 pr-3 rounded-lg border border-indigo-500/30">
                    <span className="w-3 h-3 rounded-full bg-indigo-500 ml-2"></span>
                    <label className="font-medium text-gray-300">Повышение:</label>
                    <input type="number" value={baseRate} onChange={(e) => setBaseRate(Number(e.target.value))} className="w-14 bg-transparent border-none text-center font-bold text-indigo-400 focus:ring-0" />
                    <span className="font-bold text-indigo-400">%</span>
                </div>
                <button onClick={() => setIsLeagueModalOpen(true)} className="ml-auto flex items-center gap-2 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 px-3 py-1.5 rounded-lg border border-yellow-500/50 shadow-lg text-xs font-bold">🏆 Лига Чемпионов</button>
                {okbData.length > 0 && (
                    <button onClick={prepareExportData} className="flex items-center gap-2 bg-emerald-600/80 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg"><ExportIcon /> Скачать непокрытый потенциал</button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0 z-10">
                        <tr><th className="px-4 py-3 w-8"></th><th className="px-4 py-3">РМ</th><th className="px-4 py-3 text-center">Факт {currentYear}</th><th className="px-4 py-3 text-center">АКБ/ОКБ</th><th className="px-4 py-3 text-center text-indigo-300">Покрытие</th><th className="px-4 py-3 text-center border-l border-gray-700 bg-gray-800/30">План (%)</th><th className="px-4 py-3 text-center font-bold bg-gray-800/30">План {nextYear}</th><th className="px-4 py-3 text-center text-amber-400">A</th><th className="px-4 py-3 text-center text-emerald-400">B</th><th className="px-4 py-3 text-center text-slate-400">C</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {metricsData.map(rm => {
                            const isExp = expandedRM === rm.rmName;
                            const share = rm.marketShare;
                            return (
                                <React.Fragment key={rm.rmName}>
                                    <tr className={`hover:bg-gray-800/50 cursor-pointer transition-all ${isExp ? 'bg-gray-800/90' : ''}`} onClick={() => setExpandedRM(isExp ? null : rm.rmName)}>
                                        <td className="px-4 py-3 text-gray-500">{isExp ? '▲' : '▼'}</td>
                                        <td className="px-4 py-3 font-medium text-white truncate max-w-[200px]">{rm.rmName}</td>
                                        <td className="px-4 py-3 text-center font-mono text-white">{formatNum(rm.totalFact)}</td>
                                        <td className="px-4 py-3 text-center font-mono text-gray-400">{rm.totalClients}/{rm.totalOkbCount || '?'}</td>
                                        <td className="px-4 py-3 text-center"><div className="flex flex-col items-center"><span className="text-xs font-bold text-indigo-300 mb-1">{share.toFixed(0)}%</span><div className="w-20 h-1 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${share}%` }}></div></div></div></td>
                                        <td className={`px-4 py-3 text-center font-bold font-mono border-l border-gray-700 ${rm.recommendedGrowthPct > baseRate ? 'text-emerald-400' : 'text-amber-400'}`}>+{rm.recommendedGrowthPct.toFixed(1)}%</td>
                                        <td className="px-4 py-3 text-center font-bold font-mono text-white bg-gray-800/20">{formatNum(rm.nextYearPlan)}</td>
                                        <td className="px-4 py-3 text-center cursor-pointer hover:bg-amber-500/10" onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'A'); }}><div className="font-bold text-amber-400">{rm.countA}</div></td>
                                        <td className="px-4 py-3 text-center cursor-pointer hover:bg-emerald-500/10" onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'B'); }}><div className="font-bold text-emerald-400">{rm.countB}</div></td>
                                        <td className="px-4 py-3 text-center cursor-pointer hover:bg-slate-500/10" onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'C'); }}><div className="font-bold text-slate-400">{rm.countC}</div></td>
                                    </tr>
                                    {isExp && (
                                        <tr>
                                            <td colSpan={10} className="p-0 bg-gray-900/95 border-b border-indigo-500/20">
                                                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/40">
                                                        <div className="bg-gray-800/50 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-700">Детализация по Регионам</div>
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-gray-800 text-gray-500"><tr><th className="px-3 py-2">Регион</th><th className="px-3 py-2 text-right">Покрытие</th><th className="px-3 py-2 text-right">План {nextYear}</th></tr></thead>
                                                            <tbody className="divide-y divide-gray-700/50">
                                                                {rm.regions.map(reg => (
                                                                    <tr key={reg.name} className="hover:bg-indigo-500/20 cursor-pointer" onClick={() => handleRegionClick(rm.rmName, reg.name)}>
                                                                        <td className="px-3 py-2 font-medium">{reg.name}</td>
                                                                        <td className="px-3 py-2 text-right text-indigo-300 font-bold">{(reg.marketShare || 0).toFixed(0)}%</td>
                                                                        <td className="px-3 py-2 text-right text-white font-medium">{formatNum(reg.plan)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/40">
                                                        <div className="bg-gray-800/50 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-700">Бренды</div>
                                                        <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                                            {rm.regions[0]?.brands?.map(b => (
                                                                <div key={b.name} className="flex justify-between p-2 border-b border-gray-700/30">
                                                                    <span className="text-gray-200">{b.name}</span>
                                                                    <span className="text-emerald-400 font-bold">+{b.growthPct.toFixed(1)}%</span>
                                                                </div>
                                                            ))}
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
                    <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                        <div className="flex items-center gap-4">
                            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"><ArrowLeftIcon /></button>
                            <div><h2 className="text-2xl font-bold text-white">Дашборд / План-Факт</h2><p className="text-gray-400 text-sm">Умное планирование и работа с ОКБ.</p></div>
                        </div>
                    </div>
                    {mainContent}
                </div>
            ) : (
                <Modal isOpen={isOpen} onClose={onClose} title="Панель управления: План/Факт">{mainContent}</Modal>
            )}

            {isRegionModalOpen && selectedRegionDetails && (
                <RegionDetailsModal 
                    isOpen={isRegionModalOpen} 
                    onClose={() => setIsRegionModalOpen(false)} 
                    rmName={selectedRegionDetails.rmName} 
                    regionName={selectedRegionDetails.regionName} 
                    activeClients={selectedRegionDetails.activeClients} 
                    potentialClients={selectedRegionDetails.potentialClients} 
                    onEditClient={onEditClient} 
                />
            )}
            {isAbcModalOpen && (
                <ClientsListModal 
                    isOpen={isAbcModalOpen} 
                    onClose={() => setIsAbcModalOpen(false)} 
                    title={abcModalTitle} 
                    clients={abcClients} 
                    onClientSelect={() => {}} 
                    onStartEdit={(c) => { onEditClient?.(c); setIsAbcModalOpen(false); }} 
                    showAbcLegend={true} 
                />
            )}
            {isLeagueModalOpen && <GamificationModal isOpen={isLeagueModalOpen} onClose={() => setIsLeagueModalOpen(false)} data={metricsData} />}
            
            <Modal 
                isOpen={isExportModalOpen} 
                onClose={() => setIsExportModalOpen(false)} 
                title="Экспорт непокрытого потенциала"
                footer={<div className="flex justify-end p-4 gap-2 bg-gray-900/50 border-t border-gray-700"><button onClick={() => setIsExportModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">Отмена</button><button onClick={performExport} className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 transition-all shadow-lg">Скачать Excel ({uncoveredRowsCache.length})</button></div>}
            >
                <div className="space-y-4">
                    <p className="text-gray-300 text-sm">Выберите страны для выгрузки. Найдено {uncoveredRowsCache.length} строк.</p>
                    <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto p-2 bg-black/20 rounded-xl">
                        {Array.from(new Set(uncoveredRowsCache.map(r => findValueInRow(r, ['страна', 'country']) || 'Россия'))).map(c => (
                            <label key={c} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer">
                                <input type="checkbox" checked={selectedCountries.has(c)} onChange={() => {
                                    const next = new Set(selectedCountries);
                                    if (next.has(c)) next.delete(c); else next.add(c);
                                    setSelectedCountries(next);
                                }} className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-emerald-500" />
                                <span className="text-sm text-gray-300">{c}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default RMDashboard;
