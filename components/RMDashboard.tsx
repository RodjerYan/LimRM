
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

const PackagingCharts: React.FC<{ fact: number; plan: number; growthPct: number }> = ({ fact, plan, growthPct }) => {
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
            barPercentage: 0.6,
        }],
    };
    const barOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: 'Динамика Роста', color: '#9ca3af', font: { size: 14 } } },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', callback: (v: any) => new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(v) } },
            x: { grid: { display: false }, ticks: { color: '#e5e7eb' } }
        }
    };
    const doughnutData = {
        labels: ['Текущая База (Факт)', 'Цель Роста (Gap)'],
        datasets: [{ data: [fact, gap], backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(251, 191, 36, 0.8)'], borderWidth: 0, hoverOffset: 4 }],
    };
    const doughnutOptions = {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { display: true, position: 'bottom' as const, labels: { color: '#d1d5db', font: { size: 11 }, usePointStyle: true } } },
    };
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-800/40 p-5 rounded-2xl border border-gray-700 h-[300px] flex flex-col justify-center shadow-inner"><Bar data={barData} options={barOptions} /></div>
            <div className="bg-gray-800/40 p-5 rounded-2xl border border-gray-700 h-[300px] flex flex-col items-center justify-center relative shadow-inner">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8"><div className="text-center"><div className="text-4xl font-bold text-white">{percentage.toFixed(0)}%</div><div className="text-xs text-gray-400 uppercase tracking-wider mt-1">база</div></div></div>
                <div className="w-full h-full flex items-center justify-center"><Doughnut data={doughnutData} options={doughnutOptions} /></div>
            </div>
        </div>
    );
};

export const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbRegionCounts, okbData, mode = 'modal', metrics, okbStatus, onEditClient, dateRange }) => {
    const [baseRate, setBaseRate] = useState(15);
    const [expandedRM, setExpandedRM] = useState<string | null>(null);
    const [isAbcModalOpen, setIsAbcModalOpen] = useState(false);
    const [abcClients, setAbcClients] = useState<MapPoint[]>([]);
    const [abcModalTitle, setAbcModalTitle] = useState<React.ReactNode>('');
    const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
    const [selectedRegionDetails, setSelectedRegionDetails] = useState<{ rmName: string; regionName: string; activeClients: MapPoint[]; potentialClients: PotentialClient[]; } | null>(null);
    const [explanationData, setExplanationData] = useState<PlanMetric | null>(null);
    const [selectedBrandForDetails, setSelectedBrandForDetails] = useState<PlanMetric | null>(null);
    const [selectedBrandRegion, setSelectedBrandRegion] = useState<string>('');
    const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [uncoveredRowsCache, setUncoveredRowsCache] = useState<OkbDataRow[]>([]);
    const [exportHierarchy, setExportHierarchy] = useState<Record<string, Set<string>>>({});
    const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [regionSearch, setRegionSearch] = useState('');
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
        const globalOkbCoordSet = new Set<string>(); const globalOkbAddressSet = new Set<string>();
        if (okbData && okbData.length > 0) {
            okbData.forEach(row => {
                if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) globalOkbCoordSet.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`);
                const addr = findAddressInRow(row);
                if (addr) globalOkbAddressSet.add(normalizeAddress(addr));
            });
        }
        const rmBuckets = new Map<string, any>();
        data.forEach(row => {
            const rmName = row.rm || 'Не указан'; const normRm = normalizeRmNameForMatching(rmName); const regionKey = row.region || 'Регион не определен';
            if (!rmBuckets.has(normRm)) rmBuckets.set(normRm, { originalName: rmName, regions: new Map(), totalFact: 0, countA: 0, countB: 0, countC: 0, factA: 0, factB: 0, factC: 0, uniqueClientKeys: new Set(), totalListings: 0 });
            const rmBucket = rmBuckets.get(normRm)!; rmBucket.totalFact += row.fact; rmBucket.totalListings += row.clients.length;
            if (row.clients) row.clients.forEach(c => { rmBucket.uniqueClientKeys.add(c.key); const f = c.fact || 0; if (c.abcCategory === 'A') { rmBucket.countA++; rmBucket.factA += f; } else if (c.abcCategory === 'B') { rmBucket.countB++; rmBucket.factB += f; } else { rmBucket.countC++; rmBucket.factC += f; } });
            if (!rmBucket.regions.has(regionKey)) rmBucket.regions.set(regionKey, { fact: 0, potential: 0, activeClients: new Set(), matchedOkbCoords: new Set(), brandFacts: new Map(), brandClientCounts: new Map(), brandRows: new Map(), originalRegionName: row.region, regionListings: 0 });
            const regBucket = rmBucket.regions.get(regionKey)!; regBucket.fact += row.fact; regBucket.potential += row.potential || 0; regBucket.regionListings += row.clients.length;
            if (row.clients) row.clients.forEach(c => { regBucket.activeClients.add(c.key); let isMatch = false; if (c.lat && c.lon) { if (globalOkbCoordSet.has(`${c.lat.toFixed(4)},${c.lon.toFixed(4)}`)) isMatch = true; } if (!isMatch && globalOkbAddressSet.has(normalizeAddress(c.address))) isMatch = true; if (isMatch) regBucket.matchedOkbCoords.add(c.key); });
            const brandName = row.brand || 'No Brand'; regBucket.brandFacts.set(brandName, (regBucket.brandFacts.get(brandName) || 0) + row.fact); regBucket.brandClientCounts.set(brandName, (regBucket.brandClientCounts.get(brandName) || 0) + row.clients.length);
            if (!regBucket.brandRows.has(brandName)) regBucket.brandRows.set(brandName, []); regBucket.brandRows.get(brandName)!.push(row);
        });
        const resultMetrics: RMMetrics[] = [];
        rmBuckets.forEach((rmData) => {
            const regionMetrics: PlanMetric[] = []; let rmTotalOkbRaw = 0; let rmTotalMatched = 0; let rmTotalActive = 0; let rmTotalCalculatedPlan = 0;
            const rmUniqueClientsCount = rmData.uniqueClientKeys.size;
            const rmGlobalAvgVelocity = rmData.totalListings > 0 ? rmData.totalFact / rmData.totalListings : 0;
            rmData.regions.forEach((regData, regionKey) => {
                const activeCount = regData.activeClients.size; const matchedCount = regData.matchedOkbCoords.size;
                rmTotalMatched += matchedCount; rmTotalActive += activeCount;
                let totalRegionOkb = globalOkbRegionCounts[regionKey] || 0; rmTotalOkbRaw += totalRegionOkb;
                let regionCalculatedPlan = 0; const regionBrands: PlanMetric[] = [];
                regData.brandFacts.forEach((bFact: number, bName: string) => {
                    const bClientCount = regData.brandClientCounts.get(bName) || 0; const bVelocity = bClientCount > 0 ? bFact / bClientCount : 0;
                    const calc = PlanningEngine.calculateRMPlan({ totalFact: bFact, totalPotential: totalRegionOkb, matchedCount, activeCount, totalRegionOkb, avgSku: 1, avgVelocity: bVelocity, rmGlobalVelocity: rmGlobalAvgVelocity }, { baseRate, globalAvgSku: globalAvgSkuPerClient, globalAvgSales: globalAvgSalesPerSku, riskLevel: 'low' });
                    const bPlan = bFact * (1 + calc.growthPct / 100); regionCalculatedPlan += bPlan;
                    regionBrands.push({ name: bName, fact: bFact, plan: bPlan, growthPct: calc.growthPct, factors: calc.factors, details: calc.details, packagingDetails: regData.brandRows.get(bName) || [] });
                });
                rmTotalCalculatedPlan += regionCalculatedPlan;
                const regionGrowthPct = regData.fact > 0 ? ((regionCalculatedPlan - regData.fact) / regData.fact) * 100 : (regionCalculatedPlan > 0 ? 100 : 0);
                const marketShare = (activeCount + Math.max(0, totalRegionOkb - matchedCount)) > 0 ? (activeCount / (activeCount + Math.max(0, totalRegionOkb - matchedCount))) : 0;
                regionMetrics.push({ name: regionKey, fact: regData.fact, plan: regionCalculatedPlan, growthPct: regionGrowthPct, marketShare: marketShare * 100, activeCount, totalCount: totalRegionOkb, brands: regionBrands.sort((a, b) => b.fact - a.fact) });
            });
            const effectiveGrowthPct = rmData.totalFact > 0 ? ((rmTotalCalculatedPlan - rmData.totalFact) / rmData.totalFact) * 100 : baseRate;
            const weightedShare = (rmTotalActive + Math.max(0, rmTotalOkbRaw - rmTotalMatched)) > 0 ? (rmTotalActive / (rmTotalActive + Math.max(0, rmTotalOkbRaw - rmTotalMatched))) * 100 : 0;
            resultMetrics.push({ rmName: rmData.originalName, totalClients: rmUniqueClientsCount, totalOkbCount: rmTotalOkbRaw, totalFact: rmData.totalFact, totalPotential: rmData.totalFact * 1.15, avgFactPerClient: rmUniqueClientsCount > 0 ? rmData.totalFact / rmUniqueClientsCount : 0, marketShare: weightedShare, countA: rmData.countA, countB: rmData.countB, countC: rmData.countC, factA: rmData.factA, factB: rmData.factB, factC: rmData.factC, recommendedGrowthPct: effectiveGrowthPct, nextYearPlan: rmTotalCalculatedPlan, regions: regionMetrics.sort((a, b) => b.fact - a.fact), brands: [], avgSkuPerClient: rmData.totalListings / rmUniqueClientsCount, avgSalesPerSku: rmGlobalAvgVelocity, globalAvgSku: globalAvgSkuPerClient, globalAvgSalesSku: globalAvgSalesPerSku } as unknown as RMMetrics);
        });
        return resultMetrics.sort((a, b) => b.totalFact - a.totalFact);
    }, [data, okbRegionCounts, okbData, baseRate]);

    // ИСПРАВЛЕННЫЙ МЕТОД: Динамический расчет потенциала для региона
    const handleRegionClick = (rmName: string, regionName: string) => {
        const active: MapPoint[] = [];
        const normalizedTargetRm = normalizeRmNameForMatching(rmName);
        data.forEach(group => {
            if (normalizeRmNameForMatching(group.rm) === normalizedTargetRm && group.region === regionName) {
                active.push(...group.clients);
            }
        });

        // Расчет потенциальных клиентов из общей базы ОКБ
        const activeAddrs = new Set(active.map(a => normalizeAddress(a.address)));
        const activeCoords = new Set(active.map(a => a.lat && a.lon ? `${a.lat.toFixed(4)},${a.lon.toFixed(4)}` : ''));

        const potential: PotentialClient[] = okbData.filter(row => {
            const rowReg = findValueInRow(row, ['субъект', 'регион', 'область']) || '';
            const isSameRegion = rowReg.toLowerCase().includes(regionName.toLowerCase()) || regionName.toLowerCase().includes(rowReg.toLowerCase());
            if (!isSameRegion) return false;

            const rowAddr = findAddressInRow(row);
            const normRowAddr = rowAddr ? normalizeAddress(rowAddr) : '';
            const rowCoordHash = row.lat && row.lon ? `${row.lat.toFixed(4)},${row.lon.toFixed(4)}` : '';

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

    const handleAbcClick = (rmName: string, category: 'A' | 'B' | 'C') => {
        const clients: MapPoint[] = []; const target = normalizeRmNameForMatching(rmName);
        data.forEach(g => { if (normalizeRmNameForMatching(g.rm) === target) { g.clients.forEach(c => { if (c.abcCategory === category) clients.push(c); }); } });
        setAbcClients(clients.sort((a, b) => (b.fact || 0) - (a.fact || 0)));
        const desc = { 'A': 'Лидеры (80% продаж)', 'B': 'Середняки (15% продаж)', 'C': 'Малообъемные (5% продаж)' };
        setAbcModalTitle(<div className="flex flex-col"><span className="text-xl font-bold text-white">{rmName}: Категория {category} ({clients.length})</span><span className="text-sm text-indigo-400 mt-1 uppercase">{desc[category]}</span></div>);
        setIsAbcModalOpen(true);
    };

    const prepareExportData = () => {
        const activeCoordSet = new Set<string>();
        data.forEach(g => g.clients.forEach(c => { if (c.lat && c.lon) activeCoordSet.add(`${c.lat.toFixed(4)},${c.lon.toFixed(4)}`); }));
        const uncovered = okbData.filter(row => {
            if (!row.lat || !row.lon) return true;
            return !activeCoordSet.has(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`);
        });
        setUncoveredRowsCache(uncovered);
        const hierarchy: Record<string, Set<string>> = {}; const countries = new Set<string>(); const regions = new Set<string>();
        uncovered.forEach(row => {
            const country = findValueInRow(row, ['страна', 'country']) || 'Россия';
            const region = findValueInRow(row, ['субъект', 'регион', 'область']) || 'Не указан';
            if (!hierarchy[country]) hierarchy[country] = new Set();
            hierarchy[country].add(region); countries.add(country); regions.add(region);
        });
        setExportHierarchy(hierarchy); setSelectedCountries(countries); setSelectedRegions(regions);
        setIsExportModalOpen(true);
    };

    const performExport = () => {
        const rows = uncoveredRowsCache.filter(row => {
            const country = findValueInRow(row, ['страна', 'country']) || 'Россия';
            const region = findValueInRow(row, ['субъект', 'регион', 'область']) || 'Не указан';
            return selectedCountries.has(country) && selectedRegions.has(region);
        });
        const worksheet = XLSX.utils.json_to_sheet(rows.map(r => ({ 'Наименование': r['Наименование'], 'Адрес': findAddressInRow(r), 'Регион': findValueInRow(r, ['регион', 'субъект']), 'ИНН': r['ИНН'] })));
        const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Potential');
        XLSX.writeFile(workbook, `Uncovered_Potential_${new Date().toISOString().split('T')[0]}.xlsx`);
        setIsExportModalOpen(false);
    };

    const formatNum = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
    const availableCountries = Object.keys(exportHierarchy).sort();
    const availableRegions = useMemo(() => {
        const res = new Set<string>();
        availableCountries.forEach(c => { if (selectedCountries.has(c)) exportHierarchy[c].forEach(r => res.add(r)); });
        return Array.from(res).sort();
    }, [exportHierarchy, selectedCountries]);

    const mainContent = (
        <div className="space-y-4 animate-fade-in">
            <div className="bg-gray-800/50 p-3 rounded-lg text-sm text-gray-400 border border-gray-700 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2 bg-gray-900/50 p-1 pr-3 rounded-lg border border-indigo-500/30">
                    <span className="w-3 h-3 rounded-full bg-indigo-500 ml-2"></span>
                    <label className="font-medium text-gray-300">Повышение:</label>
                    <input type="number" value={baseRate} onChange={(e) => setBaseRate(Number(e.target.value))} className="w-14 bg-gray-800 border-none text-center font-bold text-indigo-400 focus:ring-0" />
                    <span className="font-bold text-indigo-400">%</span>
                </div>
                <button onClick={() => setIsLeagueModalOpen(true)} className="ml-auto flex items-center gap-2 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 px-3 py-1.5 rounded-lg border border-yellow-500/50 shadow-lg text-xs font-bold">🏆 Лига Чемпионов</button>
                {okbData.length > 0 && (
                    <button onClick={prepareExportData} className="flex items-center gap-2 bg-emerald-600/80 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg"><ExportIcon /> Непокрытый потенциал (XLSX)</button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0 z-10">
                        <tr><th className="px-4 py-3 w-8"></th><th className="px-4 py-3">РМ</th><th className="px-4 py-3 text-center">Факт {currentYear}</th><th className="px-4 py-3 text-center">АКБ/ОКБ</th><th className="px-4 py-3 text-center text-indigo-300">Покрытие</th><th className="px-4 py-3 text-center border-l border-gray-700 bg-gray-800/30">План (%)</th><th className="px-4 py-3 text-center bg-gray-800/30">Обоснование</th><th className="px-4 py-3 text-center font-bold bg-gray-800/30">План {nextYear}</th><th className="px-4 py-3 text-center text-amber-400">A</th><th className="px-4 py-3 text-center text-emerald-400">B</th><th className="px-4 py-3 text-center text-slate-400">C</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {metricsData.map(rm => {
                            const isExp = expandedRM === rm.rmName;
                            const share = Number.isNaN(rm.marketShare) ? 0 : rm.marketShare;
                            const growthColor = rm.recommendedGrowthPct > baseRate ? 'text-emerald-400' : 'text-amber-400';
                            return (
                                <React.Fragment key={rm.rmName}>
                                    <tr className={`hover:bg-gray-800/50 cursor-pointer transition-all ${isExp ? 'bg-gray-800/90' : ''}`} onClick={() => setExpandedRM(isExp ? null : rm.rmName)}>
                                        <td className="px-4 py-3 text-gray-500">{isExp ? '▲' : '▼'}</td>
                                        <td className="px-4 py-3 font-medium text-white truncate max-w-[200px]">{rm.rmName}</td>
                                        <td className="px-4 py-3 text-center font-mono text-white">{formatNum(rm.totalFact)}</td>
                                        <td className="px-4 py-3 text-center font-mono text-gray-400">{rm.totalClients}/{rm.totalOkbCount || '?'}</td>
                                        <td className="px-4 py-3 text-center"><div className="flex flex-col items-center"><span className="text-xs font-bold text-indigo-300 mb-1">{share.toFixed(0)}%</span><div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${share}%` }}></div></div></div></td>
                                        <td className={`px-4 py-3 text-center font-bold font-mono border-l border-gray-700 ${growthColor}`}>+{rm.recommendedGrowthPct.toFixed(1)}%</td>
                                        <td className="px-4 py-3 text-center"><button onClick={(e) => { e.stopPropagation(); /* AI Logic here */ }} className="bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px] px-2 py-1 rounded transition-colors uppercase font-bold">AI Анализ</button></td>
                                        <td className="px-4 py-3 text-center font-bold font-mono text-white bg-gray-800/20">{formatNum(rm.nextYearPlan)}</td>
                                        <td className="px-4 py-3 text-center cursor-pointer hover:bg-amber-500/10" onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'A'); }}><div className="font-bold text-amber-400">{rm.countA}</div></td>
                                        <td className="px-4 py-3 text-center cursor-pointer hover:bg-emerald-500/10" onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'B'); }}><div className="font-bold text-emerald-400">{rm.countB}</div></td>
                                        <td className="px-4 py-3 text-center cursor-pointer hover:bg-slate-500/10" onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'C'); }}><div className="font-bold text-slate-400">{rm.countC}</div></td>
                                    </tr>
                                    {isExp && (
                                        <tr>
                                            <td colSpan={11} className="p-0 bg-gray-900/95 border-b border-indigo-500/20">
                                                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/40">
                                                        <div className="bg-gray-800/50 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">Детализация по Регионам</div>
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-gray-800 text-gray-500"><tr><th className="px-3 py-2">Регион</th><th className="px-3 py-2 text-right">Покрытие</th><th className="px-3 py-2 text-right">Факт</th><th className="px-3 py-2 text-right">План {nextYear}</th></tr></thead>
                                                            <tbody className="divide-y divide-gray-700/50">
                                                                {rm.regions.map(reg => (
                                                                    <tr key={reg.name} className="hover:bg-indigo-500/20 cursor-pointer" onClick={() => handleRegionClick(rm.rmName, reg.name)}>
                                                                        <td className="px-3 py-2 font-medium">{reg.name}</td>
                                                                        <td className="px-3 py-2 text-right text-indigo-300 font-bold">{(reg.marketShare || 0).toFixed(0)}%</td>
                                                                        <td className="px-3 py-2 text-right text-gray-400">{formatNum(reg.fact)}</td>
                                                                        <td className="px-3 py-2 text-right text-white font-medium">{formatNum(reg.plan)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/40">
                                                        <div className="bg-gray-800/50 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-700">Бренды в регионе</div>
                                                        <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                                            {rm.regions[0]?.brands?.map(b => (
                                                                <div key={b.name} className="flex justify-between p-3 border-b border-gray-700/30 hover:bg-gray-700/20 transition-colors">
                                                                    <span className="text-gray-200 font-medium">{b.name}</span>
                                                                    <div className="flex gap-4">
                                                                        <span className="text-emerald-400 font-mono">+{b.growthPct.toFixed(1)}%</span>
                                                                        <span className="text-white font-bold">{formatNum(b.plan)}</span>
                                                                    </div>
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
                            <div><h2 className="text-2xl font-bold text-white">Дашборд / План-Факт</h2><p className="text-gray-400 text-sm">Умное планирование и детализация по АКБ/ОКБ.</p></div>
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
                footer={<div className="flex justify-end p-4 gap-2 bg-gray-900/50 border-t border-gray-700"><button onClick={() => setIsExportModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">Отмена</button><button onClick={performExport} className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 transition-all">Скачать XLSX ({uncoveredRowsCache.length})</button></div>}
            >
                <div className="space-y-4">
                    <p className="text-gray-300 text-sm">Система обнаружила <strong>{uncoveredRowsCache.length}</strong> торговых точек в базе ОКБ, которые не сопоставлены с вашими текущими продажами. Вы можете выгрузить их для дальнейшей проработки.</p>
                    <div className="grid grid-cols-2 gap-4 max-h-60 overflow-y-auto custom-scrollbar p-2 bg-black/20 rounded-xl">
                        {availableCountries.map(c => (
                            <label key={c} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer">
                                <input type="checkbox" checked={selectedCountries.has(c)} onChange={() => {
                                    const next = new Set(selectedCountries);
                                    if (next.has(c)) next.delete(c); else next.add(c);
                                    setSelectedCountries(next);
                                }} className="rounded bg-gray-800 border-gray-700 text-emerald-500" />
                                <span className="text-sm text-gray-200">{c}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default RMDashboard;
