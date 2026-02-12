
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import ClientsListModal from './ClientsListModal';
import RegionDetailsModal from './RegionDetailsModal';
import GrowthExplanationModal from './GrowthExplanationModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, PotentialClient } from '../types';
import { ExportIcon, SearchIcon, ArrowLeftIcon, CalculatorIcon, BrainIcon, LoaderIcon, ChartBarIcon, TargetIcon, UsersIcon } from './icons';
import { findValueInRow, findAddressInRow, normalizeRmNameForMatching, normalizeAddress, recoverRegion } from '../utils/dataUtils';
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

// Helper for date formatting (FACT = filter period, PLAN = current calendar year)
const formatDateLabel = (
  start?: string,
  end?: string
): { factLabel: string; planYear: number } => {
  const planYear = new Date().getFullYear(); // <-- ALWAYS current user year

  // No filter -> fact is "all loaded data"
  if (!start && !end) {
    return { factLabel: 'Факт (весь период)', planYear };
  }

  const dateOptions: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  };

  const sDate = start ? new Date(start) : null;
  const eDate = end ? new Date(end) : null;

  // Guard against invalid dates
  const sOk = sDate && !isNaN(sDate.getTime());
  const eOk = eDate && !isNaN(eDate.getTime());

  let factLabel = 'Факт (период)';
  if (sOk && eOk) {
    factLabel = `Факт (${sDate!.toLocaleDateString('ru-RU', dateOptions)} - ${eDate!.toLocaleDateString('ru-RU', dateOptions)})`;
  } else if (sOk) {
    factLabel = `Факт (с ${sDate!.toLocaleDateString('ru-RU', dateOptions)})`;
  } else if (eOk) {
    factLabel = `Факт (по ${eDate!.toLocaleDateString('ru-RU', dateOptions)})`;
  }

  return { factLabel, planYear };
};

const PackagingCharts: React.FC<{ fact: number; plan: number; growthPct: number; labels: { fact: string; plan: string } }> = ({ fact, plan, growthPct, labels }) => {
    const gap = Math.max(0, plan - fact);
    const percentage = plan > 0 ? (fact / plan) * 100 : 0;
    
    const barData = {
        labels: [labels.fact, labels.plan],
        datasets: [{
            label: 'Объем (кг)',
            data: [fact, plan],
            backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(79, 70, 229, 0.7)'], // Emerald / Indigo
            borderColor: ['#10b981', '#4f46e5'],
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.6,
        }],
    };

    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: 'Динамика Роста', color: '#374151', font: { size: 14 } },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#111827',
                bodyColor: '#374151',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                padding: 10,
                callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${new Intl.NumberFormat('ru-RU').format(ctx.raw)}` }
            }
        },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: (v: any) => new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(v) } },
            x: { grid: { display: false }, ticks: { color: '#374151', font: { size: 12 } } }
        }
    };

    const doughnutData = {
        labels: ['Текущая База (Факт)', 'Цель Роста (Gap)'],
        datasets: [{
            data: [fact, gap],
            backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(251, 191, 36, 0.8)'], // Emerald / Amber
            borderColor: ['#ffffff', '#ffffff'],
            borderWidth: 2,
            hoverOffset: 4
        }],
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: { display: true, position: 'bottom' as const, labels: { color: '#374151', font: { size: 11 }, padding: 20, usePointStyle: true } },
            title: { display: true, text: 'Структура Плана', color: '#374151', font: { size: 14 } },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#111827',
                bodyColor: '#374151',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                callbacks: {
                    label: function(context: any) {
                        const val = context.raw;
                        const total = context.chart._metasets[context.datasetIndex].total;
                        const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                        return `${context.label}: ${pct}`;
                    }
                }
            }
        },
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 h-[300px] flex flex-col justify-center shadow-sm">
                <div className="flex-grow w-full"><Bar data={barData} options={barOptions} /></div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 h-[300px] flex flex-col items-center justify-center relative shadow-sm">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8">
                    <div className="text-center">
                        <div className="text-4xl font-bold text-gray-900 tracking-tight">{percentage.toFixed(0)}%</div>
                        <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">база</div>
                    </div>
                </div>
                <div className="w-full h-full flex items-center justify-center"><Doughnut data={doughnutData} options={doughnutOptions} /></div>
            </div>
        </div>
    );
};

const PackagingAnalysisModal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; content: string; isLoading: boolean; chartData?: { fact: number; plan: number; growthPct: number; labels: { fact: string; plan: string } } | null; }> = ({ isOpen, onClose, title, content, isLoading, chartData }) => {
    const sanitizedHtml = DOMPurify.sanitize(marked.parse(content) as string);
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-4xl" zIndex="z-[1100]">
            <div className="space-y-6">
                {chartData && <PackagingCharts fact={chartData.fact} plan={chartData.plan} growthPct={chartData.growthPct} labels={chartData.labels} />}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-md min-h-[150px]">
                    <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-4 flex items-center gap-2"><BrainIcon small /> Экспертное заключение</h3>
                    {isLoading && !content ? <div className="flex flex-col items-center justify-center h-32 text-indigo-500 gap-3 animate-pulse"><LoaderIcon /><span className="text-sm font-medium">Джемини моделирует сценарии...</span></div> : <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed"><div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} /></div>}
                </div>
            </div>
        </Modal>
    );
};

const BrandPackagingModal: React.FC<{ isOpen: boolean; onClose: () => void; brandMetric: PlanMetric | null; regionName: string; onExplain: (metric: PlanMetric) => void; onAnalyze: (row: any) => void; dateLabels: { fact: string; plan: string } }> = ({ isOpen, onClose, brandMetric, regionName, onExplain, onAnalyze, dateLabels }) => {
    if (!brandMetric || !brandMetric.packagingDetails) return null;
    const rawRows = brandMetric.packagingDetails;
    const aggregatedRows = useMemo(() => {
        const groups = new Map<string, { packaging: string; fact: number; plan: number; rows: AggregatedDataRow[]; skus: Set<string>; channels: Set<string>; }>();
        rawRows.forEach(r => {
            const key = r.packaging || 'Не указана';
            if (!groups.has(key)) groups.set(key, { packaging: key, fact: 0, plan: 0, rows: [], skus: new Set(), channels: new Set() });
            const g = groups.get(key)!;
            g.fact += r.fact;
            g.plan += (r.planMetric?.plan || 0);
            g.rows.push(r);
            if (r.clients) r.clients.forEach(client => {
                if (client.originalRow) {
                    const skuName = findValueInRow(client.originalRow, ['уникальное наименование товара', 'номенклатура', 'наименование', 'товар']);
                    if (skuName) g.skus.add(skuName);
                }
                if (client.type) g.channels.add(client.type);
            });
        });
        return Array.from(groups.values()).map(g => {
            const growth = g.fact > 0 ? ((g.plan - g.fact) / g.fact) * 100 : (g.plan > 0 ? 100 : 0);
            const representativeRow = g.rows.reduce((prev, curr) => (prev.fact > curr.fact) ? prev : curr);
            const metric: PlanMetric = { ...representativeRow.planMetric!, name: `${representativeRow.brand} (${g.packaging})`, fact: g.fact, plan: g.plan, growthPct: growth };
            return { key: g.packaging, packaging: g.packaging, fact: g.fact, plan: g.plan, growthPct: growth, planMetric: metric, skuList: Array.from(g.skus).sort(), channelList: Array.from(g.channels).sort() };
        }).sort((a, b) => b.fact - a.fact);
    }, [rawRows, brandMetric.name]);
    const totalFact = aggregatedRows.reduce((sum, r) => sum + r.fact, 0);
    const totalPlan = aggregatedRows.reduce((sum, r) => sum + r.plan, 0);
    const handleExportXLSX = () => {
        const exportData = aggregatedRows.map(row => ({ 'Фасовка': row.packaging, 'Ассортимент (SKU)': row.skuList.join(', '), 'Канал продаж': row.channelList.join(', '), 'Инд. Рост (%)': row.growthPct.toFixed(2), 'Факт (кг)': row.fact, [`${dateLabels.plan} (кг)`]: row.plan.toFixed(0) }));
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Детализация');
        XLSX.writeFile(workbook, `Detail_${regionName.replace(/[^a-zа-я0-9]/gi, '_')}_${brandMetric.name.replace(/[^a-zа-я0-9]/gi, '_')}.xlsx`);
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детализация ${regionName}: ${brandMetric.name}`} maxWidth="max-w-7xl">
            <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center text-sm shadow-sm">
                    <div className="flex gap-8 items-center">
                        <div className="flex flex-col"><span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Фасовок</span><span className="text-gray-900 font-bold text-lg">{aggregatedRows.length}</span></div>
                        <div className="h-8 w-px bg-gray-200"></div>
                        <div className="flex flex-col"><span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Общий {dateLabels.fact}</span><span className="text-emerald-600 font-mono font-bold text-lg">{new Intl.NumberFormat('ru-RU').format(totalFact)}</span></div>
                        <div className="flex flex-col"><span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Общий {dateLabels.plan}</span><span className="text-gray-900 font-mono font-bold text-lg">{new Intl.NumberFormat('ru-RU').format(totalPlan)}</span></div>
                    </div>
                    <button onClick={handleExportXLSX} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-lg transition-all shadow-md hover:shadow-lg"><ExportIcon />Выгрузить в XLSX</button>
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full text-sm text-left table-fixed">
                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs uppercase tracking-wider sticky top-0 z-20 shadow-sm">
                                <tr><th className="px-6 py-4 w-24 text-gray-600">Фасовка</th><th className="px-6 py-4 w-auto">SKU (Ассортимент)</th><th className="px-6 py-4 w-32 text-gray-600">Канал</th><th className="px-6 py-4 w-32 text-right">Инд. Рост</th><th className="px-6 py-4 w-32 text-right">{dateLabels.fact}</th><th className="px-6 py-4 w-32 text-right">{dateLabels.plan}</th><th className="px-6 py-4 w-24 text-center">Анализ</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700">
                                {aggregatedRows.map((row) => {
                                    const growthPct = row.growthPct;
                                    return (
                                        <tr key={row.key} className="hover:bg-gray-50 transition-colors group align-top">
                                            <td className="px-6 py-4 font-bold text-gray-900 whitespace-nowrap bg-gray-50">{row.packaging}</td>
                                            <td className="px-6 py-4"><div className="max-h-40 overflow-y-auto custom-scrollbar pr-2">{row.skuList.length > 0 ? (<ul className="text-xs text-gray-500 space-y-1.5">{row.skuList.map((sku, idx) => (<li key={idx} className="leading-relaxed flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0 group-hover:bg-indigo-500 transition-colors"></span><span className="group-hover:text-gray-900 transition-colors">{sku}</span></li>))}</ul>) : (<span className="text-xs text-gray-400 italic">Не указано</span>)}</div></td>
                                            <td className="px-6 py-4 text-xs text-indigo-600 font-medium whitespace-normal">{row.channelList.length > 0 ? row.channelList.join(', ') : <span className="text-gray-400">—</span>}</td>
                                            <td className="px-6 py-4 text-right font-mono whitespace-nowrap">{row.planMetric ? (<button onClick={() => onExplain(row.planMetric!)} className={`font-bold py-1 px-2 rounded hover:bg-gray-100 transition-colors ${growthPct > 0 ? 'text-emerald-600' : 'text-amber-600'}`} title="Нажмите для обоснования процента роста">{growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}%</button>) : (<span className="text-gray-400">—</span>)}</td>
                                            <td className="px-6 py-4 text-right font-mono text-gray-600 whitespace-nowrap">{new Intl.NumberFormat('ru-RU').format(row.fact)}</td>
                                            <td className="px-6 py-4 text-right font-mono text-gray-900 font-bold whitespace-nowrap bg-gray-50">{new Intl.NumberFormat('ru-RU').format(row.plan)}</td>
                                            <td className="px-6 py-4 text-center"><button onClick={() => onAnalyze(row)} className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-all border border-indigo-200 hover:border-indigo-300 shadow-sm active:scale-95" title="Получить анализ от Джемини для этой фасовки"><BrainIcon small /></button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

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
    // Add date props for dynamic headers
    startDate?: string;
    endDate?: string;
    dateRange?: string; // Legacy/Additional context
}

type RegionBucket = {
    fact: number;
    potential: number;
    activeClients: Set<string>;
    matchedOkbCoords: Set<string>;
    brandFacts: Map<string, number>;
    brandClientCounts: Map<string, number>;
    brandRows: Map<string, AggregatedDataRow[]>;
    originalRegionName: string;
    regionListings: number;
};

export const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbRegionCounts, okbData, mode = 'modal', metrics, okbStatus, onActiveClientsClick, onEditClient, startDate, endDate, dateRange }) => {
    const [baseRate, setBaseRate] = useState(15);
    const [selectedRMForAnalysis, setSelectedRMForAnalysis] = useState<RMMetrics | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
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
    const [packagingAnalysisContent, setPackagingAnalysisContent] = useState('');
    const [packagingAnalysisTitle, setPackagingAnalysisTitle] = useState('');
    const [isPackagingAnalysisOpen, setIsPackagingAnalysisOpen] = useState(false);
    const [isPackagingAnalysisLoading, setIsPackagingAnalysisLoading] = useState(false);
    const [packagingChartData, setPackagingChartData] = useState<{ fact: number; plan: number; growthPct: number; labels: { fact: string; plan: string } } | null>(null);
    const packagingAbortController = useRef<AbortController | null>(null);
    
    // Dynamic Date Logic
    const { factLabel, planYear } = useMemo(() => formatDateLabel(startDate, endDate), [startDate, endDate]);
    const planLabel = `План ${planYear}`;

    const metricsData = useMemo<RMMetrics[]>(() => {
        const globalOkbRegionCounts = okbRegionCounts || {};
        let globalTotalListings = 0; let globalTotalVolume = 0; const allUniqueClientKeys = new Set<string>();
        data.forEach(row => { globalTotalVolume += row.fact; globalTotalListings += row.clients.length; row.clients.forEach(c => allUniqueClientKeys.add(c.key)); });
        const globalTotalUniqueClients = allUniqueClientKeys.size;
        const globalAvgSkuPerClient = globalTotalUniqueClients > 0 ? globalTotalListings / globalTotalUniqueClients : 0;
        const globalAvgSalesPerSku = globalTotalListings > 0 ? globalTotalVolume / globalTotalListings : 0;
        const globalOkbCoordSet = new Set<string>(); const globalOkbAddressSet = new Set<string>();
        if (okbRegionCounts !== null && okbData.length > 0) {
            okbData.forEach(row => {
                if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) globalOkbCoordSet.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`);
                const addr = findAddressInRow(row);
                if (addr) globalOkbAddressSet.add(normalizeAddress(addr));
            });
        }
        
        const rmBuckets = new Map<string, { originalName: string; regions: Map<string, RegionBucket>; totalFact: number; countA: number; countB: number; countC: number; factA: number; factB: number; factC: number; uniqueClientKeys: Set<string>; totalListings: number; }>();
        
        data.forEach(row => {
            const rmName = row.rm || 'Не указан'; const normRm = normalizeRmNameForMatching(rmName); const regionKey = row.region || 'Регион не определен';
            if (!rmBuckets.has(normRm)) rmBuckets.set(normRm, { originalName: rmName, regions: new Map(), totalFact: 0, countA: 0, countB: 0, countC: 0, factA: 0, factB: 0, factC: 0, uniqueClientKeys: new Set(), totalListings: 0 });
            const rmBucket = rmBuckets.get(normRm)!; rmBucket.totalFact += row.fact; rmBucket.totalListings += row.clients.length;
            if (row.clients) row.clients.forEach(c => { rmBucket.uniqueClientKeys.add(c.key); const clientFact = c.fact || 0; if (c.abcCategory === 'A') { rmBucket.countA++; rmBucket.factA += clientFact; } else if (c.abcCategory === 'B') { rmBucket.countB++; rmBucket.factB += clientFact; } else { rmBucket.countC++; rmBucket.factC += clientFact; } });
            if (!rmBucket.regions.has(regionKey)) rmBucket.regions.set(regionKey, { fact: 0, potential: 0, activeClients: new Set(), matchedOkbCoords: new Set(), brandFacts: new Map<string, number>(), brandClientCounts: new Map<string, number>(), brandRows: new Map<string, AggregatedDataRow[]>(), originalRegionName: row.region, regionListings: 0 });
            const regBucket = rmBucket.regions.get(regionKey)!; regBucket.fact += row.fact; regBucket.potential += row.potential || 0; regBucket.regionListings += row.clients.length;
            if (row.clients) row.clients.forEach(c => { regBucket.activeClients.add(c.key); let isMatch = false; if (c.lat && c.lon && !isNaN(c.lat) && !isNaN(c.lon)) { if (globalOkbCoordSet.has(`${c.lat.toFixed(4)},${c.lon.toFixed(4)}`)) isMatch = true; } if (!isMatch && globalOkbAddressSet.has(normalizeAddress(c.address))) isMatch = true; if (isMatch) regBucket.matchedOkbCoords.add(c.key); });
            const brandName = row.brand || 'No Brand'; regBucket.brandFacts.set(brandName, (regBucket.brandFacts.get(brandName) || 0) + row.fact); regBucket.brandClientCounts.set(brandName, (regBucket.brandClientCounts.get(brandName) || 0) + row.clients.length);
            if (!regBucket.brandRows.has(brandName)) regBucket.brandRows.set(brandName, []);
            regBucket.brandRows.get(brandName)!.push(row);
        });

        const results: RMMetrics[] = [];
        for (const [key, bucket] of rmBuckets) {
            let rmOkbTotal = 0; let rmMatchedCount = 0; const rmRegions: PlanMetric[] = []; const rmBrandsMap = new Map<string, {fact: number, plan: number}>();
            for (const [regKey, regData] of bucket.regions) {
                const regionOkbCount = globalOkbRegionCounts[regData.originalRegionName] || Math.max(regData.activeClients.size * 2, 100);
                rmOkbTotal += regionOkbCount; rmMatchedCount += regData.matchedOkbCoords.size;
                const regionAvgSku = regData.regionListings > 0 ? regData.regionListings / regData.activeClients.size : 1;
                const regionVelocity = regData.regionListings > 0 ? regData.fact / regData.regionListings : 0;
                
                const planResult = PlanningEngine.calculateRMPlan({ totalFact: regData.fact, totalPotential: regionOkbCount, matchedCount: regData.matchedOkbCoords.size, activeCount: regData.activeClients.size, totalRegionOkb: regionOkbCount, avgSku: regionAvgSku, avgVelocity: regionVelocity, rmGlobalVelocity: globalAvgSalesPerSku }, { baseRate: baseRate, globalAvgSku: globalAvgSkuPerClient, globalAvgSales: globalAvgSalesPerSku, riskLevel: 'low' });
                
                const regBrands: PlanMetric[] = [];
                regData.brandRows.forEach((rows, bName) => {
                    let bFact = 0; let bPlan = 0;
                    rows.forEach(r => { bFact += r.fact; if (r.planMetric) bPlan += r.planMetric.plan; else bPlan += r.fact * 1.15; });
                    if (!rmBrandsMap.has(bName)) rmBrandsMap.set(bName, {fact: 0, plan: 0});
                    rmBrandsMap.get(bName)!.fact += bFact; rmBrandsMap.get(bName)!.plan += bPlan;
                    regBrands.push({ name: bName, fact: bFact, plan: bPlan, growthPct: bFact > 0 ? ((bPlan - bFact)/bFact)*100 : 0, packagingDetails: rows });
                });
                
                rmRegions.push({ name: regData.originalRegionName, fact: regData.fact, plan: planResult.plan, growthPct: planResult.growthPct, activeCount: regData.activeClients.size, totalCount: regionOkbCount, factors: planResult.factors, details: planResult.details, brands: regBrands.sort((a,b) => b.fact - a.fact) });
            }
            
            const rmBrands: PlanMetric[] = []; rmBrandsMap.forEach((val, key) => { rmBrands.push({ name: key, fact: val.fact, plan: val.plan, growthPct: val.fact > 0 ? ((val.plan - val.fact)/val.fact)*100 : 0 }); });
            
            const rmAvgSku = bucket.uniqueClientKeys.size > 0 ? bucket.totalListings / bucket.uniqueClientKeys.size : 0;
            const rmVelocity = bucket.totalListings > 0 ? bucket.totalFact / bucket.totalListings : 0;
            const totalRmPlan = rmRegions.reduce((sum, r) => sum + r.plan, 0);
            const totalRmGrowthPct = bucket.totalFact > 0 ? ((totalRmPlan - bucket.totalFact) / bucket.totalFact) * 100 : 0;
            
            results.push({ rmName: bucket.originalName, totalClients: bucket.uniqueClientKeys.size, totalOkbCount: rmOkbTotal, totalFact: bucket.totalFact, totalPotential: rmOkbTotal, avgFactPerClient: bucket.uniqueClientKeys.size > 0 ? bucket.totalFact / bucket.uniqueClientKeys.size : 0, marketShare: rmOkbTotal > 0 ? bucket.uniqueClientKeys.size / rmOkbTotal : 0, countA: bucket.countA, countB: bucket.countB, countC: bucket.countC, factA: bucket.factA, factB: bucket.factB, factC: bucket.factC, recommendedGrowthPct: totalRmGrowthPct, nextYearPlan: totalRmPlan, regions: rmRegions.sort((a,b) => b.fact - a.fact), brands: rmBrands.sort((a,b) => b.fact - a.fact), avgSkuPerClient: rmAvgSku, avgSalesPerSku: rmVelocity, globalAvgSku: globalAvgSkuPerClient, globalAvgSalesSku: globalAvgSalesPerSku });
        }
        return results.sort((a, b) => b.totalFact - a.totalFact);
    }, [data, okbRegionCounts, okbData, baseRate]);

    const handleShowAbcClients = (rmName: string, category: 'A' | 'B' | 'C') => {
        const targetClients: MapPoint[] = [];
        data.forEach(row => {
            if (row.rm === rmName) {
                row.clients.forEach(c => {
                    if (c.abcCategory === category) {
                        targetClients.push(c);
                    }
                });
            }
        });
        setAbcClients(targetClients);
        setAbcModalTitle(
            <div className="flex flex-col">
                <span className={`text-xl font-bold ${category === 'A' ? 'text-amber-600' : category === 'B' ? 'text-emerald-600' : 'text-gray-600'}`}>Клиенты Категории {category}</span>
                <span className="text-sm text-gray-500 mt-1">Менеджер: {rmName}</span>
            </div>
        );
        setIsAbcModalOpen(true);
    };

    const handleGlobalExportUncovered = () => {
        if (!okbData || okbData.length === 0) {
            alert("Нет данных ОКБ для экспорта");
            return;
        }
        const allActiveClients = data.flatMap(d => d.clients);
        const activeAddressSet = new Set(allActiveClients.map(c => normalizeAddress(c.address)));
        const uncoveredClients = okbData.filter(row => {
            const addr = findAddressInRow(row);
            if (!addr) return false;
            return !activeAddressSet.has(normalizeAddress(addr));
        }).map(row => ({
            'Наименование': findValueInRow(row, ['наименование', 'клиент']) || 'ТТ',
            'Регион': findValueInRow(row, ['субъект', 'регион', 'область']) || 'Не указан',
            'Город': findValueInRow(row, ['город', 'населенный пункт']) || 'Не указан',
            'Адрес': findAddressInRow(row) || '',
            'Тип/Канал': findValueInRow(row, ['тип', 'канал']) || 'Не указан',
        }));
        const ws = XLSX.utils.json_to_sheet(uncoveredClients);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Global_Uncovered");
        XLSX.writeFile(wb, `Global_Uncovered_Potential_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExportUncovered = (rmMetrics: RMMetrics) => {
        const activeClients = data.filter(d => d.rm === rmMetrics.rmName).flatMap(d => d.clients);
        const activeAddressSet = new Set(activeClients.map(c => normalizeAddress(c.address)));
        const rmRegions = new Set(rmMetrics.regions.map(r => r.name.toLowerCase().replace(/(г\.|город|область|край|республика)/g, '').trim()));
        const uncoveredClients = okbData.filter(row => {
            const rowRegion = findValueInRow(row, ['субъект', 'регион', 'область'])?.toLowerCase() || '';
            const rowCity = findValueInRow(row, ['город', 'населенный пункт'])?.toLowerCase() || '';
            const matchesRegion = Array.from(rmRegions).some(rmReg => rowRegion.includes(rmReg) || rowCity.includes(rmReg));
            if (!matchesRegion) return false;
            const addr = findAddressInRow(row);
            if (!addr) return false;
            return !activeAddressSet.has(normalizeAddress(addr));
        }).map(row => ({
            'Наименование': findValueInRow(row, ['наименование', 'клиент']) || 'ТТ',
            'Регион': findValueInRow(row, ['субъект', 'регион', 'область']) || 'Не указан',
            'Город': findValueInRow(row, ['город', 'населенный пункт']) || 'Не указан',
            'Адрес': findAddressInRow(row) || '',
            'Тип/Канал': findValueInRow(row, ['тип', 'канал']) || 'Не указан',
            'Менеджер': rmMetrics.rmName
        }));
        const ws = XLSX.utils.json_to_sheet(uncoveredClients);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Uncovered_Potential");
        XLSX.writeFile(wb, `Uncovered_Potential_${rmMetrics.rmName.replace(/[^a-zа-я0-9]/gi, '_')}.xlsx`);
    };

    const renderContent = () => (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md flex flex-col md:flex-row justify-between items-center gap-6">
                <div><h3 className="text-xl font-bold text-gray-900 mb-1">Управление Целями</h3><p className="text-sm text-gray-500">Настройка базового сценария роста для всей компании. Влияет на расчет индивидуальных планов.</p></div>
                
                <div className="flex items-center gap-4">
                    <button 
                        onClick={handleGlobalExportUncovered}
                        disabled={!okbData || okbData.length === 0}
                        className="flex items-center gap-2 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold rounded-xl border border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed h-full shadow-sm"
                        title="Скачать полный список непокрытых точек по всей компании"
                    >
                        <ExportIcon small /> Выгрузить весь потенциал (ОКБ)
                    </button>

                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex items-center gap-6 w-full md:w-auto shadow-inner">
                        <div className="flex-grow">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Базовый рост (ставка)</label>
                            <input type="range" min="0" max="50" step="1" value={baseRate} onChange={(e) => setBaseRate(Number(e.target.value))} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-amber-400" />
                            <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>0%</span><span>25%</span><span>50%</span></div>
                        </div>
                        <div className="text-center w-24">
                            <div className="text-3xl font-mono font-bold text-amber-500">+{baseRate}%</div>
                            <div className="text-[10px] text-gray-400 uppercase font-bold">Цель {planYear}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-6">
                {metricsData.map((rm, idx) => (
                    <div key={rm.rmName} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-md transition-all hover:border-indigo-200">
                        <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpandedRM(expandedRM === rm.rmName ? null : rm.rmName)}>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm ${idx < 3 ? 'bg-amber-400 text-black' : 'bg-gray-200 text-gray-600'}`}>{idx + 1}</div><div><h3 className="text-lg font-bold text-gray-900">{rm.rmName}</h3><div className="flex items-center gap-3 text-xs text-gray-500 mt-1"><span>{rm.totalClients} активных клиентов</span><span className="w-1 h-1 rounded-full bg-gray-300"></span><span>{rm.totalOkbCount.toLocaleString()} потенциал (ОКБ)</span></div></div></div>
                                <div className="flex items-center gap-8 text-right">
                                    <div><div className="text-[10px] uppercase text-gray-400 font-bold mb-1">{factLabel}</div><div className="text-xl font-mono font-bold text-gray-900">{new Intl.NumberFormat('ru-RU').format(rm.totalFact)}</div></div>
                                    <div><div className="text-[10px] uppercase text-gray-400 font-bold mb-1">{planLabel}</div><div className="text-xl font-mono font-bold text-indigo-600">{new Intl.NumberFormat('ru-RU').format(Math.round(rm.nextYearPlan))}</div></div>
                                    <div><div className="text-[10px] uppercase text-gray-400 font-bold mb-1">Прирост</div><div className={`text-xl font-mono font-bold ${rm.recommendedGrowthPct > baseRate ? 'text-emerald-500' : 'text-amber-500'}`}>+{rm.recommendedGrowthPct.toFixed(1)}%</div></div>
                                    <div className="hidden md:block w-px h-10 bg-gray-200 mx-2"></div>
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedRMForAnalysis(rm); setIsAnalysisModalOpen(true); }} className="p-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors border border-indigo-100 group"><BrainIcon small /></button>
                                    <div className={`transform transition-transform duration-300 ${expandedRM === rm.rmName ? 'rotate-180' : ''}`}><ArrowLeftIcon className="w-5 h-5 text-gray-400 -rotate-90" /></div>
                                </div>
                            </div>
                            <div className="mt-4 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${Math.min(100, (rm.totalFact / metricsData[0].totalFact) * 100)}%` }}></div></div>
                        </div>
                        {expandedRM === rm.rmName && (
                            <div className="border-t border-gray-200 bg-gray-50/50 p-6 animate-fade-in-down">
                                <div className="flex justify-end mb-4">
                                    <button 
                                        onClick={() => handleExportUncovered(rm)}
                                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-indigo-600 text-xs font-bold rounded-lg border border-indigo-100 transition-colors shadow-sm"
                                        title="Скачать список всех непокрытых точек по регионам этого менеджера"
                                    >
                                        <ExportIcon small /> Скачать отчет: Непокрытый Потенциал (ОКБ)
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                        <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2"><TargetIcon small /> Эффективность Клиентской Базы</h4>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors" onClick={() => handleShowAbcClients(rm.rmName, 'A')} title="Показать список клиентов категории A">
                                                <span className="text-xs text-amber-500 font-bold underline decoration-dotted underline-offset-2">Категория A (80% объема)</span>
                                                <span className="text-xs text-gray-700">{rm.countA} клиентов / {new Intl.NumberFormat('ru-RU').format(rm.factA)} кг</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(rm.factA / rm.totalFact) * 100}%` }}></div></div>
                                            
                                            <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors" onClick={() => handleShowAbcClients(rm.rmName, 'B')} title="Показать список клиентов категории B">
                                                <span className="text-xs text-emerald-500 font-bold underline decoration-dotted underline-offset-2">Категория B (15% объема)</span>
                                                <span className="text-xs text-gray-700">{rm.countB} клиентов / {new Intl.NumberFormat('ru-RU').format(rm.factB)} кг</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${(rm.factB / rm.totalFact) * 100}%` }}></div></div>
                                            
                                            <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors" onClick={() => handleShowAbcClients(rm.rmName, 'C')} title="Показать список клиентов категории C">
                                                <span className="text-xs text-gray-400 font-bold underline decoration-dotted underline-offset-2">Категория C (5% объема)</span>
                                                <span className="text-xs text-gray-700">{rm.countC} клиентов / {new Intl.NumberFormat('ru-RU').format(rm.factC)} кг</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-gray-400" style={{ width: `${(rm.factC / rm.totalFact) * 100}%` }}></div></div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                        <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2"><CalculatorIcon small /> KPI и Качество Продаж</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100"><div className="text-xs text-gray-500 mb-1">Доля рынка (Покрытие)</div><div className="text-lg font-bold text-gray-900">{(rm.marketShare * 100).toFixed(1)}%</div><div className="text-[10px] text-gray-400 mt-1">от всей базы ОКБ</div></div>
                                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100"><div className="text-xs text-gray-500 mb-1">Средний чек (Объем)</div><div className="text-lg font-bold text-gray-900">{new Intl.NumberFormat('ru-RU').format(Math.round(rm.avgFactPerClient))} кг</div><div className="text-[10px] text-gray-400 mt-1">на 1 активную ТТ</div></div>
                                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100"><div className="text-xs text-gray-500 mb-1">Ширина полки (SKU)</div><div className="text-lg font-bold text-gray-900">{rm.avgSkuPerClient?.toFixed(1)}</div><div className="text-[10px] text-gray-400 mt-1">ср. позиций в точке</div></div>
                                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100"><div className="text-xs text-gray-500 mb-1">Качество (Velocity)</div><div className="text-lg font-bold text-gray-900">{new Intl.NumberFormat('ru-RU').format(Math.round(rm.avgSalesPerSku || 0))} кг</div><div className="text-[10px] text-gray-400 mt-1">продаж на 1 SKU</div></div>
                                        </div>
                                    </div>
                                </div>
                                <h4 className="text-sm font-bold text-gray-600 uppercase mb-4">Детализация по Регионам</h4>
                                <div className="overflow-x-auto"><table className="w-full text-left text-sm text-gray-600">
                                    <thead className="text-xs text-gray-500 bg-gray-100 uppercase"><tr><th className="px-4 py-3 rounded-l-lg">Регион</th><th className="px-4 py-3">{factLabel}</th><th className="px-4 py-3">{planLabel}</th><th className="px-4 py-3">Рост</th><th className="px-4 py-3 text-center rounded-r-lg">Действия</th></tr></thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {rm.regions.map((reg) => (
                                            <tr key={reg.name} className="hover:bg-white transition-colors group">
                                                <td className="px-4 py-3 font-medium text-gray-900">{reg.name}</td>
                                                <td className="px-4 py-3 font-mono text-gray-600">{new Intl.NumberFormat('ru-RU').format(reg.fact)}</td>
                                                <td className="px-4 py-3 font-mono text-gray-900 font-bold">{new Intl.NumberFormat('ru-RU').format(Math.round(reg.plan))}</td>
                                                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${reg.growthPct > baseRate ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>+{reg.growthPct.toFixed(1)}%</span></td>
                                                <td className="px-4 py-3 text-center flex justify-center gap-2">
                                                    <button onClick={() => { setExplanationData(reg); }} className="p-1.5 hover:bg-gray-200 rounded text-indigo-500 transition-colors" title="Почему такой план?"><CalculatorIcon small /></button>
                                                    <button onClick={() => { 
                                                        const normRm = normalizeRmNameForMatching(rm.rmName);
                                                        const activeClients = data.filter(d => 
                                                            normalizeRmNameForMatching(d.rm) === normRm && 
                                                            d.region === reg.name
                                                        ).flatMap(d => d.clients); 
                                                        
                                                        const cleanRegionName = (str: string) => str.toLowerCase()
                                                            .replace(/\b(область|обл|край|республика|респ|автономный округ|ао|г|город)\.?\b/gi, '')
                                                            .replace(/[.,()]/g, ' ')
                                                            .replace(/\s+/g, ' ')
                                                            .trim();

                                                        const targetRegionClean = cleanRegionName(reg.name);
                                                        
                                                        const activeCoordSet = new Set<string>();
                                                        const activeAddressSet = new Set<string>();
                                                        
                                                        activeClients.forEach(c => {
                                                            if (c.lat && c.lon) {
                                                                activeCoordSet.add(`${c.lat.toFixed(4)},${c.lon.toFixed(4)}`);
                                                            }
                                                            if (c.address) {
                                                                activeAddressSet.add(normalizeAddress(c.address));
                                                            }
                                                        });

                                                        const regionOkb = okbData.filter(row => {
                                                            const rowRegionRaw = findValueInRow(row, ['субъект', 'регион', 'область']) || '';
                                                            const rowCityRaw = findValueInRow(row, ['город', 'населенный пункт']) || '';
                                                            
                                                            const rowRegionClean = cleanRegionName(rowRegionRaw);
                                                            const rowCityClean = cleanRegionName(rowCityRaw);

                                                            return (rowRegionClean && rowRegionClean.includes(targetRegionClean)) || 
                                                                   (rowCityClean && rowCityClean.includes(targetRegionClean));
                                                        });
                                                        
                                                        const potentialClients: PotentialClient[] = regionOkb.filter(row => {
                                                            if (row.lat && row.lon) {
                                                                const key = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
                                                                if (activeCoordSet.has(key)) return false; 
                                                            }
                                                            const addr = findAddressInRow(row);
                                                            if (!addr) return false;
                                                            return !activeAddressSet.has(normalizeAddress(addr));
                                                        }).map(row => ({
                                                            name: findValueInRow(row, ['наименование', 'клиент']) || 'ТТ',
                                                            address: findAddressInRow(row) || '',
                                                            type: findValueInRow(row, ['тип', 'канал']) || 'Не указан',
                                                            lat: row.lat,
                                                            lon: row.lon
                                                        }));

                                                        setSelectedRegionDetails({ rmName: rm.rmName, regionName: reg.name, activeClients, potentialClients });
                                                        setIsRegionModalOpen(true); 
                                                    }} className="p-1.5 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-900 transition-colors" title="Список клиентов (Активные/Потенциал)"><SearchIcon small /></button>
                                                    <div className="relative group/brands">
                                                        <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-900 transition-colors" title="Бренды"><ChartBarIcon small /></button>
                                                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 hidden group-hover/brands:block p-2"><div className="text-[10px] uppercase text-gray-400 font-bold mb-2 px-2">Бренды в регионе</div>
                                                            {reg.brands && reg.brands.length > 0 ? (
                                                                <ul className="space-y-1">
                                                                    {reg.brands.map(b => (
                                                                        <li key={b.name} className="flex justify-between items-center text-xs px-2 py-1 hover:bg-gray-100 rounded cursor-pointer" onClick={() => { setSelectedBrandForDetails(b); setSelectedBrandRegion(reg.name); setIsBrandModalOpen(true); }}>
                                                                            <span className="text-gray-700">{b.name}</span>
                                                                            <span className="text-emerald-600 font-mono">{new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(b.fact)}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : <div className="text-xs text-gray-400 px-2">Нет данных</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table></div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    if (mode === 'page') {
        return (
            <div className="min-h-screen bg-gray-50 text-gray-900">
                <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"><ArrowLeftIcon /></button>
                        <div><h1 className="text-xl font-bold text-gray-900">Дашборд План/Факт</h1><p className="text-xs text-gray-500">Стратегическое планирование {planYear}</p></div>
                    </div>
                </div>
                <div className="p-8 max-w-[1600px] mx-auto">{renderContent()}</div>
                <RMAnalysisModal isOpen={isAnalysisModalOpen} onClose={() => setIsAnalysisModalOpen(false)} rmData={selectedRMForAnalysis} baseRate={baseRate} dateRange={dateRange} />
                <GrowthExplanationModal isOpen={!!explanationData} onClose={() => setExplanationData(null)} data={explanationData} baseRate={baseRate} />
                <RegionDetailsModal isOpen={isRegionModalOpen} onClose={() => setIsRegionModalOpen(false)} rmName={selectedRegionDetails?.rmName || ''} regionName={selectedRegionDetails?.regionName || ''} activeClients={selectedRegionDetails?.activeClients || []} potentialClients={selectedRegionDetails?.potentialClients || []} onEditClient={onEditClient} />
                <BrandPackagingModal isOpen={isBrandModalOpen} onClose={() => setIsBrandModalOpen(false)} brandMetric={selectedBrandForDetails} regionName={selectedBrandRegion} onExplain={(m) => setExplanationData(m)} dateLabels={{ fact: factLabel, plan: planLabel }} onAnalyze={(row) => {
                    const skuList = row.skuList || [];
                    setPackagingAnalysisTitle(`Анализ: ${row.packaging} (${selectedBrandRegion})`);
                    setPackagingChartData({ fact: row.fact, plan: row.plan, growthPct: row.growthPct, labels: { fact: factLabel, plan: planLabel } });
                    setPackagingAnalysisContent('');
                    setIsPackagingAnalysisOpen(true);
                    setIsPackagingAnalysisLoading(true);
                    if (packagingAbortController.current) packagingAbortController.current.abort();
                    packagingAbortController.current = new AbortController();
                    streamPackagingInsights(
                        row.packaging, skuList, row.fact, row.plan, row.growthPct, selectedBrandRegion,
                        (chunk) => setPackagingAnalysisContent(prev => prev + chunk),
                        (err) => { console.error(err); setIsPackagingAnalysisLoading(false); },
                        packagingAbortController.current.signal
                    ).finally(() => setIsPackagingAnalysisLoading(false));
                }} />
                <PackagingAnalysisModal isOpen={isPackagingAnalysisOpen} onClose={() => setIsPackagingAnalysisOpen(false)} title={packagingAnalysisTitle} content={packagingAnalysisContent} isLoading={isPackagingAnalysisLoading} chartData={packagingChartData} />
                
                <ClientsListModal 
                    isOpen={isAbcModalOpen}
                    onClose={() => setIsAbcModalOpen(false)}
                    title={abcModalTitle}
                    clients={abcClients}
                    onClientSelect={() => {}}
                    onStartEdit={(client) => {
                        setIsAbcModalOpen(false);
                        if (onEditClient) onEditClient(client);
                    }}
                    showAbcLegend={true}
                />
            </div>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Дашборд План/Факт" maxWidth="max-w-[95vw]">
            {renderContent()}
            <RMAnalysisModal isOpen={isAnalysisModalOpen} onClose={() => setIsAnalysisModalOpen(false)} rmData={selectedRMForAnalysis} baseRate={baseRate} dateRange={dateRange} />
            <GrowthExplanationModal isOpen={!!explanationData} onClose={() => setExplanationData(null)} data={explanationData} baseRate={baseRate} />
            <RegionDetailsModal isOpen={isRegionModalOpen} onClose={() => setIsRegionModalOpen(false)} rmName={selectedRegionDetails?.rmName || ''} regionName={selectedRegionDetails?.regionName || ''} activeClients={selectedRegionDetails?.activeClients || []} potentialClients={selectedRegionDetails?.potentialClients || []} onEditClient={onEditClient} />
            <BrandPackagingModal isOpen={isBrandModalOpen} onClose={() => setIsBrandModalOpen(false)} brandMetric={selectedBrandForDetails} regionName={selectedBrandRegion} onExplain={(m) => setExplanationData(m)} dateLabels={{ fact: factLabel, plan: planLabel }} onAnalyze={(row) => {
                const skuList = row.skuList || [];
                setPackagingAnalysisTitle(`Анализ: ${row.packaging} (${selectedBrandRegion})`);
                setPackagingChartData({ fact: row.fact, plan: row.plan, growthPct: row.growthPct, labels: { fact: factLabel, plan: planLabel } });
                setPackagingAnalysisContent('');
                setIsPackagingAnalysisOpen(true);
                setIsPackagingAnalysisLoading(true);
                if (packagingAbortController.current) packagingAbortController.current.abort();
                packagingAbortController.current = new AbortController();
                streamPackagingInsights(
                    row.packaging, skuList, row.fact, row.plan, row.growthPct, selectedBrandRegion,
                    (chunk) => setPackagingAnalysisContent(prev => prev + chunk),
                    (err) => { console.error(err); setIsPackagingAnalysisLoading(false); },
                    packagingAbortController.current.signal
                ).finally(() => setIsPackagingAnalysisLoading(false));
            }} />
            <PackagingAnalysisModal isOpen={isPackagingAnalysisOpen} onClose={() => setIsPackagingAnalysisOpen(false)} title={packagingAnalysisTitle} content={packagingAnalysisContent} isLoading={isPackagingAnalysisLoading} chartData={packagingChartData} />
            
            <ClientsListModal 
                isOpen={isAbcModalOpen}
                onClose={() => setIsAbcModalOpen(false)}
                title={abcModalTitle}
                clients={abcClients}
                onClientSelect={() => {}}
                onStartEdit={(client) => {
                    setIsAbcModalOpen(false);
                    if (onEditClient) onEditClient(client);
                }}
                showAbcLegend={true}
            />
        </Modal>
    );
};
