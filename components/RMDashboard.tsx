
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import ClientsListModal from './ClientsListModal';
import RegionDetailsModal from './RegionDetailsModal';
import GrowthExplanationModal from './GrowthExplanationModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, PotentialClient } from '../types';
import { ExportIcon, SearchIcon, ArrowLeftIcon, CalculatorIcon, BrainIcon, LoaderIcon, ChartBarIcon } from './icons';
import { findValueInRow, findAddressInRow, normalizeRmNameForMatching, normalizeAddress } from '../utils/dataUtils';
import { PlanningEngine } from '../services/planning/engine';
import { streamPackagingInsights } from '../services/aiService';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
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
    metrics?: SummaryMetrics | null;
    okbStatus?: OkbStatus | null;
    onActiveClientsClick?: () => void;
    onEditClient?: (client: MapPoint) => void;
}

// --- VISUALIZATION COMPONENT FOR AI MODAL ---
const PackagingCharts: React.FC<{ fact: number; plan: number; growthPct: number }> = ({ fact, plan, growthPct }) => {
    // Gap Calculation
    const gap = Math.max(0, plan - fact);
    // Percentage of the 2026 Plan covered by existing 2025 Fact
    const percentage = plan > 0 ? (fact / plan) * 100 : 0;
    
    // Chart 1: Bar Data (Fact vs Plan)
    const barData = {
        labels: ['Факт 2025', 'План 2026'],
        datasets: [
            {
                label: 'Объем (кг)',
                data: [fact, plan],
                backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(99, 102, 241, 0.7)'],
                borderColor: ['#10b981', '#6366f1'],
                borderWidth: 1,
                borderRadius: 6,
                barPercentage: 0.6,
            },
        ],
    };

    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: 'Динамика Роста', color: '#9ca3af', font: { size: 14 } },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                titleColor: '#fff',
                bodyColor: '#cbd5e1',
                padding: 10,
                callbacks: {
                    label: (ctx: any) => `${ctx.dataset.label}: ${new Intl.NumberFormat('ru-RU').format(ctx.raw)}`
                }
            }
        },
        scales: {
            y: { 
                beginAtZero: true, 
                grid: { color: 'rgba(255,255,255,0.05)' }, 
                ticks: { color: '#9ca3af', font: { size: 10 }, callback: (v: any) => new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(v) } 
            },
            x: { 
                grid: { display: false }, 
                ticks: { color: '#e5e7eb', font: { size: 12 } } 
            }
        }
    };

    // Chart 2: Doughnut Data (Execution / Gap)
    // Clarification: This shows how much of the Future Plan is already covered by Current Fact.
    const doughnutData = {
        labels: ['Текущая База (Факт)', 'Цель Роста (Gap)'],
        datasets: [
            {
                data: [fact, gap],
                backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(251, 191, 36, 0.8)'], // Green / Amber
                borderColor: ['#064e3b', '#78350f'],
                borderWidth: 0,
                hoverOffset: 4
            },
        ],
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: { 
                display: true, 
                position: 'bottom' as const, 
                labels: { color: '#d1d5db', font: { size: 11 }, padding: 20, usePointStyle: true } 
            },
            title: { display: true, text: 'Структура Плана', color: '#9ca3af', font: { size: 14 } },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
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
            <div className="bg-gray-800/40 p-5 rounded-2xl border border-gray-700 h-[300px] flex flex-col justify-center shadow-inner">
                <div className="flex-grow w-full">
                    <Bar data={barData} options={barOptions} />
                </div>
            </div>
            <div className="bg-gray-800/40 p-5 rounded-2xl border border-gray-700 h-[300px] flex flex-col items-center justify-center relative shadow-inner">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8">
                    <div className="text-center">
                        <div className="text-4xl font-bold text-white tracking-tight">{percentage.toFixed(0)}%</div>
                        <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mt-1">база</div>
                    </div>
                </div>
                <div className="w-full h-full flex items-center justify-center">
                    <Doughnut data={doughnutData} options={doughnutOptions} />
                </div>
            </div>
        </div>
    );
};


// Updated modal to show Charts + Markdown content
const PackagingAnalysisModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    content: string;
    isLoading: boolean;
    chartData?: { fact: number; plan: number; growthPct: number } | null;
}> = ({ isOpen, onClose, title, content, isLoading, chartData }) => {
    const sanitizedHtml = DOMPurify.sanitize(marked.parse(content) as string);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-4xl" zIndex="z-[70]">
            <div className="space-y-6">
                
                {/* Visual Analytics Section */}
                {chartData && (
                    <PackagingCharts 
                        fact={chartData.fact} 
                        plan={chartData.plan} 
                        growthPct={chartData.growthPct} 
                    />
                )}

                {/* AI Text Content */}
                <div className="bg-gray-900/50 p-6 rounded-xl border border-indigo-500/20 min-h-[150px]">
                    <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <BrainIcon small /> Экспертное заключение
                    </h3>
                    
                    {isLoading && !content ? (
                        <div className="flex flex-col items-center justify-center h-32 text-cyan-400 gap-3 animate-pulse">
                            <LoaderIcon />
                            <span className="text-sm font-medium">Джемини моделирует сценарии...</span>
                        </div>
                    ) : (
                        <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed">
                            <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

// Internal Modal for Brand Packaging Breakdown
const BrandPackagingModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    brandMetric: PlanMetric | null;
    regionName: string;
    onExplain: (metric: PlanMetric) => void;
    onAnalyze: (row: any) => void; // New callback for AI analysis
}> = ({ isOpen, onClose, brandMetric, regionName, onExplain, onAnalyze }) => {
    if (!brandMetric || !brandMetric.packagingDetails) return null;

    const rawRows = brandMetric.packagingDetails;

    // Aggregate rows by packaging name to remove duplicates
    const aggregatedRows = useMemo(() => {
        const groups = new Map<string, {
            packaging: string;
            fact: number;
            plan: number;
            rows: AggregatedDataRow[];
            skus: Set<string>; // Set to store unique SKU names
        }>();

        rawRows.forEach(r => {
            const key = r.packaging || 'Не указана';
            if (!groups.has(key)) {
                groups.set(key, { packaging: key, fact: 0, plan: 0, rows: [], skus: new Set() });
            }
            const g = groups.get(key)!;
            g.fact += r.fact;
            g.plan += (r.planMetric?.plan || 0);
            g.rows.push(r);

            // Extract SKUs from all clients in this row
            if (r.clients) {
                r.clients.forEach(client => {
                    if (client.originalRow) {
                        // Look for "Unique Product Name" or fallbacks
                        const skuName = findValueInRow(client.originalRow, [
                            'уникальное наименование товара', 
                            'номенклатура', 
                            'наименование', 
                            'товар'
                        ]);
                        if (skuName) {
                            g.skus.add(skuName);
                        }
                    }
                });
            }
        });

        return Array.from(groups.values()).map(g => {
            // Recalculate weighted growth for the aggregated packaging
            const growth = g.fact > 0 ? ((g.plan - g.fact) / g.fact) * 100 : (g.plan > 0 ? 100 : 0);
            
            // Find representative row (max fact) to use its factors for explanation context
            // This ensures the explanation makes sense for the dominant part of this packaging group
            const representativeRow = g.rows.reduce((prev, curr) => (prev.fact > curr.fact) ? prev : curr);
            
            // Clone metric and override totals with aggregated values
            const metric: PlanMetric = {
                ...representativeRow.planMetric!, // Base structure
                name: `${representativeRow.brand} (${g.packaging})`, // Specific name for modal title
                fact: g.fact,
                plan: g.plan,
                growthPct: growth
            };

            return {
                key: g.packaging,
                packaging: g.packaging,
                fact: g.fact,
                plan: g.plan,
                growthPct: growth,
                planMetric: metric,
                skuList: Array.from(g.skus).sort() // Convert Set to sorted Array
            };
        }).sort((a, b) => b.fact - a.fact);
    }, [rawRows]);

    const totalFact = aggregatedRows.reduce((sum, r) => sum + r.fact, 0);
    const totalPlan = aggregatedRows.reduce((sum, r) => sum + r.plan, 0);

    const handleExportXLSX = () => {
        const exportData = aggregatedRows.map(row => ({
            'Фасовка': row.packaging,
            'Ассортимент (SKU)': row.skuList.join(', '),
            'Инд. Рост (%)': row.growthPct.toFixed(2),
            'Факт (кг)': row.fact,
            'План 2026 (кг)': row.plan.toFixed(0)
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Детализация');
        
        // Sanitize filename
        const safeRegion = regionName.replace(/[^a-zа-я0-9]/gi, '_');
        const safeBrand = brandMetric.name.replace(/[^a-zа-я0-9]/gi, '_');
        XLSX.writeFile(workbook, `Detail_${safeRegion}_${safeBrand}.xlsx`);
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Детализация ${regionName}: ${brandMetric.name}`} 
            maxWidth="max-w-7xl" 
        >
            <div className="space-y-4">
                {/* Stats Header */}
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex justify-between items-center text-sm shadow-sm backdrop-blur-sm">
                    <div className="flex gap-8 items-center">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Фасовок</span>
                            <span className="text-white font-bold text-lg">{aggregatedRows.length}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-700"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Общий Факт</span>
                            <span className="text-emerald-400 font-mono font-bold text-lg">{new Intl.NumberFormat('ru-RU').format(totalFact)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Общий План</span>
                            <span className="text-white font-mono font-bold text-lg">{new Intl.NumberFormat('ru-RU').format(totalPlan)}</span>
                        </div>
                    </div>
                    <button 
                        onClick={handleExportXLSX}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-lg transition-all border border-emerald-500/50 shadow-lg hover:shadow-emerald-500/20"
                    >
                        <ExportIcon />
                        Выгрузить в XLSX
                    </button>
                </div>
                
                {/* Main Data Table */}
                <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900/40 shadow-inner">
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full text-sm text-left table-fixed">
                            <thead className="bg-gray-800/90 text-gray-400 font-semibold text-xs uppercase tracking-wider sticky top-0 z-20 backdrop-blur-md shadow-sm">
                                <tr>
                                    {/* Fixed narrow width for Packaging to save space, but enough for text */}
                                    <th className="px-6 py-4 w-28 text-gray-300">Фасовка</th>
                                    
                                    {/* Flexible width for SKU - takes all remaining space */}
                                    <th className="px-6 py-4 w-auto">SKU (Ассортимент)</th>
                                    
                                    {/* Fixed widths for numeric metrics to align perfectly */}
                                    <th className="px-6 py-4 w-32 text-right">Инд. Рост</th>
                                    <th className="px-6 py-4 w-32 text-right">Факт</th>
                                    <th className="px-6 py-4 w-32 text-right">План 2026</th>
                                    
                                    {/* Fixed width for action button */}
                                    <th className="px-6 py-4 w-24 text-center">Анализ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-gray-300">
                                {aggregatedRows.map((row) => {
                                    const growthPct = row.growthPct;
                                    return (
                                        <tr key={row.key} className="hover:bg-gray-800/60 transition-colors group align-top">
                                            <td className="px-6 py-4 font-bold text-white whitespace-nowrap bg-gray-900/30">
                                                {row.packaging}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="max-h-40 overflow-y-auto custom-scrollbar pr-2">
                                                    {row.skuList.length > 0 ? (
                                                        <ul className="text-xs text-gray-400 space-y-1.5">
                                                            {row.skuList.map((sku, idx) => (
                                                                <li key={idx} className="leading-relaxed flex items-start gap-2">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1.5 flex-shrink-0 group-hover:bg-indigo-500 transition-colors"></span>
                                                                    <span className="group-hover:text-gray-200 transition-colors">{sku}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-xs text-gray-600 italic">Не указано</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono whitespace-nowrap">
                                                {row.planMetric ? (
                                                    <button
                                                        onClick={() => onExplain(row.planMetric!)}
                                                        className={`font-bold py-1 px-2 rounded hover:bg-gray-700 transition-colors ${growthPct > 0 ? 'text-emerald-400' : 'text-amber-400'}`}
                                                        title="Нажмите для обоснования процента роста"
                                                    >
                                                        {growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}%
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-500">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-gray-300 whitespace-nowrap">
                                                {new Intl.NumberFormat('ru-RU').format(row.fact)}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-white font-bold whitespace-nowrap bg-gray-800/10">
                                                {new Intl.NumberFormat('ru-RU').format(row.plan)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => onAnalyze(row)}
                                                    className="p-2 bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition-all border border-indigo-500/20 hover:border-indigo-500 shadow-sm hover:shadow-indigo-500/40 active:scale-95"
                                                    title="Получить анализ от Джемини для этой фасовки"
                                                >
                                                    <BrainIcon small />
                                                </button>
                                            </td>
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


const RMDashboard: React.FC<RMDashboardProps> = ({ 
    isOpen, 
    onClose, 
    data, 
    okbRegionCounts, 
    okbData, 
    mode = 'modal',
    metrics,
    okbStatus,
    onActiveClientsClick,
    onEditClient
}) => {
    const [baseRate, setBaseRate] = useState(15);
    const [selectedRMForAnalysis, setSelectedRMForAnalysis] = useState<RMMetrics | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [expandedRM, setExpandedRM] = useState<string | null>(null);

    // --- ABC Modal State ---
    const [isAbcModalOpen, setIsAbcModalOpen] = useState(false);
    const [abcClients, setAbcClients] = useState<MapPoint[]>([]);
    const [abcModalTitle, setAbcModalTitle] = useState('');

    // --- Region Details Modal State ---
    const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
    const [selectedRegionDetails, setSelectedRegionDetails] = useState<{
        rmName: string;
        regionName: string;
        activeClients: MapPoint[];
        potentialClients: PotentialClient[];
    } | null>(null);

    // --- Growth Explanation Modal State ---
    const [explanationData, setExplanationData] = useState<PlanMetric | null>(null);

    // --- Brand Packaging Modal State ---
    const [selectedBrandForDetails, setSelectedBrandForDetails] = useState<PlanMetric | null>(null);
    const [selectedBrandRegion, setSelectedBrandRegion] = useState<string>('');
    const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);

    // --- Packaging Analysis State ---
    const [packagingAnalysisContent, setPackagingAnalysisContent] = useState('');
    const [packagingAnalysisTitle, setPackagingAnalysisTitle] = useState('');
    const [isPackagingAnalysisOpen, setIsPackagingAnalysisOpen] = useState(false);
    const [isPackagingAnalysisLoading, setIsPackagingAnalysisLoading] = useState(false);
    const [packagingChartData, setPackagingChartData] = useState<{ fact: number; plan: number; growthPct: number } | null>(null);
    const packagingAbortController = useRef<AbortController | null>(null);

    // --- Export Modal State ---
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [uncoveredRowsCache, setUncoveredRowsCache] = useState<OkbDataRow[]>([]);
    const [exportHierarchy, setExportHierarchy] = useState<Record<string, Set<string>>>({});
    const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [regionSearch, setRegionSearch] = useState('');

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    // RE-INSERTING THE METRICSDATA CALCULATION TO ENSURE FILE INTEGRITY
    const metricsData = useMemo<RMMetrics[]>(() => {
        const globalOkbRegionCounts = okbRegionCounts || {};
        const isOkbLoaded = okbRegionCounts !== null && okbData.length > 0;

        let globalTotalListings = 0; 
        let globalTotalUniqueClients = 0;
        let globalTotalVolume = 0;
        const allUniqueClientKeys = new Set<string>();

        data.forEach(row => {
            globalTotalVolume += row.fact;
            globalTotalListings += row.clients.length;
            row.clients.forEach(c => allUniqueClientKeys.add(c.key));
        });
        globalTotalUniqueClients = allUniqueClientKeys.size;

        const globalAvgSkuPerClient = globalTotalUniqueClients > 0 ? globalTotalListings / globalTotalUniqueClients : 0;
        const globalAvgSalesPerSku = globalTotalListings > 0 ? globalTotalVolume / globalTotalListings : 0;

        // Build Set for Coordinate Matching
        const globalOkbCoordSet = new Set<string>();
        // Build Set for Address String Matching (Normalization)
        const globalOkbAddressSet = new Set<string>();

        if (isOkbLoaded) {
            okbData.forEach(row => {
                if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                    const hash = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
                    globalOkbCoordSet.add(hash);
                }
                const addr = findAddressInRow(row);
                if (addr) {
                    globalOkbAddressSet.add(normalizeAddress(addr));
                }
            });
        }

        type RegionBucket = {
            fact: number;
            potential: number;
            activeClients: Set<string>;
            matchedOkbCoords: Set<string>;
            brandFacts: Map<string, number>; 
            brandClientCounts: Map<string, number>;
            brandRows: Map<string, AggregatedDataRow[]>;
            originalRegionName?: string;
            regionListings: number; 
        };

        const rmBuckets = new Map<string, {
            originalName: string;
            regions: Map<string, RegionBucket>;
            totalFact: number;
            countA: number; countB: number; countC: number;
            factA: number; factB: number; factC: number;
            uniqueClientKeys: Set<string>;
            totalListings: number;
        }>();

        data.forEach(row => {
            const rmName = row.rm || 'Не указан';
            const normRm = normalizeRmNameForMatching(rmName);
            const regionKey = row.region || 'Регион не определен';
            
            if (!rmBuckets.has(normRm)) {
                rmBuckets.set(normRm, {
                    originalName: rmName,
                    regions: new Map(),
                    totalFact: 0,
                    countA: 0, countB: 0, countC: 0,
                    factA: 0, factB: 0, factC: 0,
                    uniqueClientKeys: new Set(),
                    totalListings: 0
                });
            }
            const rmBucket = rmBuckets.get(normRm)!;
            rmBucket.totalFact += row.fact;
            rmBucket.totalListings += row.clients.length;

            if (row.clients) {
                row.clients.forEach(c => {
                    rmBucket.uniqueClientKeys.add(c.key);
                    const clientFact = c.fact || 0;
                    if (c.abcCategory === 'A') {
                        rmBucket.countA++; rmBucket.factA += clientFact;
                    } else if (c.abcCategory === 'B') {
                        rmBucket.countB++; rmBucket.factB += clientFact;
                    } else {
                        rmBucket.countC++; rmBucket.factC += clientFact;
                    }
                });
            }

            if (!rmBucket.regions.has(regionKey)) {
                rmBucket.regions.set(regionKey, {
                    fact: 0, 
                    potential: 0, 
                    activeClients: new Set(), 
                    matchedOkbCoords: new Set(), 
                    brandFacts: new Map(),
                    brandClientCounts: new Map(),
                    brandRows: new Map(),
                    originalRegionName: row.region,
                    regionListings: 0
                });
            }
            const regBucket = rmBucket.regions.get(regionKey)!;
            regBucket.fact += row.fact;
            regBucket.potential += row.potential || 0;
            regBucket.regionListings += row.clients.length; 

            if (row.clients) {
                row.clients.forEach(c => {
                    regBucket.activeClients.add(c.key);
                    
                    // Enhanced Matching Logic: Check Geo OR String
                    let isMatch = false;
                    if (c.lat && c.lon && !isNaN(c.lat) && !isNaN(c.lon)) {
                        const hash = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
                        if (globalOkbCoordSet.has(hash)) {
                            isMatch = true;
                        }
                    }
                    if (!isMatch) {
                        const normAddr = normalizeAddress(c.address);
                        if (globalOkbAddressSet.has(normAddr)) {
                            isMatch = true;
                        }
                    }

                    if (isMatch) {
                        // Use a key to track matches. String based since coords might be missing.
                        regBucket.matchedOkbCoords.add(c.key); 
                    }
                });
            }
            const brandName = row.brand || 'No Brand';
            regBucket.brandFacts.set(brandName, (regBucket.brandFacts.get(brandName) || 0) + row.fact);
            regBucket.brandClientCounts.set(brandName, (regBucket.brandClientCounts.get(brandName) || 0) + row.clients.length);
            
            if (!regBucket.brandRows.has(brandName)) regBucket.brandRows.set(brandName, []);
            regBucket.brandRows.get(brandName)!.push(row);
        });

        const missingRegionNames = new Set<string>();
        const resultMetrics: RMMetrics[] = [];

        rmBuckets.forEach((rmData, normRmKey) => {
            const regionMetrics: PlanMetric[] = [];
            const brandAggregates = new Map<string, { fact: number, plan: number }>();

            let rmTotalOkbRaw = 0;
            let rmTotalMatched = 0;
            let rmTotalActive = 0; 
            let rmTotalCalculatedPlan = 0;
            let rmTotalPotentialFile = 0;
            
            const rmUniqueClientsCount = rmData.uniqueClientKeys.size;
            const rmGlobalAvgVelocity = rmData.totalListings > 0 ? rmData.totalFact / rmData.totalListings : 0;
            const rmAvgSkuPerClient = rmUniqueClientsCount > 0 ? rmData.totalListings / rmUniqueClientsCount : 0;

            rmData.regions.forEach((regData, regionKey) => {
                const activeCount = regData.activeClients.size;
                const matchedCount = regData.matchedOkbCoords.size;
                rmTotalMatched += matchedCount;
                rmTotalActive += activeCount; 
                rmTotalPotentialFile += regData.potential;

                let totalRegionOkb = 0;
                if (globalOkbRegionCounts && globalOkbRegionCounts[regionKey]) {
                    totalRegionOkb = globalOkbRegionCounts[regionKey];
                }
                if (totalRegionOkb === 0 && regionKey !== 'Регион не определен') {
                    missingRegionNames.add(regionKey);
                }
                rmTotalOkbRaw += totalRegionOkb;

                let regionCalculatedPlan = 0;
                const regionBrands: PlanMetric[] = [];

                regData.brandFacts.forEach((bFact, bName) => {
                    const bClientCount = regData.brandClientCounts.get(bName) || 0;
                    const bVelocity = bClientCount > 0 ? bFact / bClientCount : 0;
                    const bWidth = 1; 

                    const calculationResult = PlanningEngine.calculateRMPlan(
                        {
                            totalFact: bFact,
                            totalPotential: totalRegionOkb, 
                            matchedCount: matchedCount,
                            activeCount: activeCount,
                            totalRegionOkb: totalRegionOkb,
                            avgSku: bWidth, 
                            avgVelocity: bVelocity,
                            rmGlobalVelocity: rmGlobalAvgVelocity
                        },
                        {
                            baseRate: baseRate,
                            globalAvgSku: globalAvgSkuPerClient,
                            globalAvgSales: globalAvgSalesPerSku,
                            riskLevel: 'low'
                        }
                    );

                    let bRate = calculationResult.growthPct;
                    if (bFact === 0 && calculationResult.plan > 0) {
                        bRate = 100;
                    }

                    const bPlan = bFact * (1 + bRate / 100);
                    regionCalculatedPlan += bPlan;

                    regionBrands.push({
                        name: bName,
                        fact: bFact,
                        plan: bPlan,
                        growthPct: bRate,
                        factors: calculationResult.factors,
                        details: calculationResult.details, 
                        packagingDetails: regData.brandRows.get(bName) || []
                    });

                    if (!brandAggregates.has(bName)) brandAggregates.set(bName, { fact: 0, plan: 0 });
                    const agg = brandAggregates.get(bName)!;
                    agg.fact += bFact;
                    agg.plan += bPlan;
                });

                regionBrands.sort((a, b) => b.fact - a.fact);
                rmTotalCalculatedPlan += regionCalculatedPlan;

                const regionGrowthPct = regData.fact > 0 
                    ? ((regionCalculatedPlan - regData.fact) / regData.fact) * 100
                    : (regionCalculatedPlan > 0 ? 100 : 0);

                // STRICT COVERAGE CALCULATION: Active / (Active + Uncovered)
                // Uncovered = Total Region OKB - Matched.
                // Formula effectively: Active / (Active + OKB - Matched)
                // This represents "Share of Total Known Potential" (Union of Active and OKB).
                const uncoveredCount = Math.max(0, totalRegionOkb - matchedCount);
                const totalUniverse = activeCount + uncoveredCount;
                
                const marketShare = totalUniverse > 0 ? (activeCount / totalUniverse) : NaN;

                regionMetrics.push({
                    name: regionKey,
                    fact: regData.fact,
                    plan: regionCalculatedPlan,
                    growthPct: regionGrowthPct,
                    marketShare: !Number.isNaN(marketShare) ? marketShare * 100 : NaN,
                    activeCount: activeCount,
                    totalCount: totalRegionOkb,
                    brands: regionBrands,
                });
            });

            const brandMetrics: PlanMetric[] = Array.from(brandAggregates.entries()).map(([name, val]) => ({
                name,
                fact: val.fact,
                plan: val.plan,
                growthPct: val.fact > 0 ? ((val.plan - val.fact) / val.fact) * 100 : 0
            })).sort((a, b) => b.plan - a.plan);

            const effectiveGrowthPct = rmData.totalFact > 0
                ? ((rmTotalCalculatedPlan - rmData.totalFact) / rmData.totalFact) * 100
                : baseRate;

            // Strict Weighted Share for RM (Active / Total Universe)
            const rmUncovered = Math.max(0, rmTotalOkbRaw - rmTotalMatched);
            const rmTotalUniverse = rmTotalActive + rmUncovered;
            const weightedShare = (rmTotalUniverse > 0) 
                ? (rmTotalActive / rmTotalUniverse) * 100
                : NaN;

            const extendedMetrics = {
                rmName: rmData.originalName,
                totalClients: rmUniqueClientsCount,
                totalOkbCount: rmTotalOkbRaw,
                totalFact: rmData.totalFact,
                totalPotential: rmTotalPotentialFile,
                avgFactPerClient: rmUniqueClientsCount > 0 ? rmData.totalFact / rmUniqueClientsCount : 0,
                marketShare: weightedShare,
                countA: rmData.countA, countB: rmData.countB, countC: rmData.countC,
                factA: rmData.factA, factB: rmData.factB, factC: rmData.factC,
                recommendedGrowthPct: effectiveGrowthPct,
                nextYearPlan: rmTotalCalculatedPlan,
                regions: regionMetrics.sort((a, b) => b.fact - a.fact),
                brands: brandMetrics,
                avgSkuPerClient: rmAvgSkuPerClient,
                avgSalesPerSku: rmGlobalAvgVelocity, 
                globalAvgSku: globalAvgSkuPerClient,
                globalAvgSalesSku: globalAvgSalesPerSku
            };

            resultMetrics.push(extendedMetrics as unknown as RMMetrics);
        });

        (resultMetrics as any).__missingOkbRegions = Array.from(missingRegionNames.values());
        return resultMetrics.sort((a, b) => b.totalFact - a.totalFact);

    }, [data, okbRegionCounts, okbData, baseRate]);

    const handleAnalyzePackaging = (row: any) => {
        // row contains: key, packaging, fact, plan, growthPct, skuList
        if (packagingAbortController.current) {
            packagingAbortController.current.abort();
        }
        packagingAbortController.current = new AbortController();

        setPackagingAnalysisTitle(`Анализ фасовки: ${row.packaging}`);
        setPackagingChartData({ fact: row.fact, plan: row.plan, growthPct: row.growthPct }); // Set chart data
        setPackagingAnalysisContent('');
        setIsPackagingAnalysisOpen(true);
        setIsPackagingAnalysisLoading(true);

        streamPackagingInsights(
            row.packaging,
            row.skuList,
            row.fact,
            row.plan,
            row.growthPct,
            selectedBrandRegion, // Context from parent selection
            (chunk) => setPackagingAnalysisContent(prev => prev + chunk),
            (err) => {
                if (err.name !== 'AbortError') {
                    setPackagingAnalysisContent(`**Ошибка:** ${err.message}`);
                }
                setIsPackagingAnalysisLoading(false);
            },
            packagingAbortController.current.signal
        ).finally(() => {
            setIsPackagingAnalysisLoading(false);
        });
    };

    const prepareExportData = () => {
        const activeCoordSet = new Set<string>();
        data.forEach(group => {
            group.clients.forEach(c => {
                if (c.lat && c.lon) {
                    const hash = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
                    activeCoordSet.add(hash);
                }
            });
        });

        const uncovered = okbData.filter(row => {
            if (!row.lat || !row.lon || isNaN(row.lat) || isNaN(row.lon)) return true;
            const hash = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
            return !activeCoordSet.has(hash);
        });

        setUncoveredRowsCache(uncovered);

        const hierarchy: Record<string, Set<string>> = {};
        const countries = new Set<string>();
        const regions = new Set<string>();

        uncovered.forEach(row => {
            const country = findValueInRow(row, ['страна', 'country']) || 'Не указана';
            const region = findValueInRow(row, ['субъект', 'регион', 'region', 'область']) || 'Не указан';
            
            if (!hierarchy[country]) {
                hierarchy[country] = new Set();
            }
            hierarchy[country].add(region);
            countries.add(country);
            regions.add(region);
        });

        setExportHierarchy(hierarchy);
        setSelectedCountries(countries);
        setSelectedRegions(regions);
        setRegionSearch('');
        setIsExportModalOpen(true);
    };

    const performExport = () => {
        const rowsToExport = uncoveredRowsCache.filter(row => {
            const country = findValueInRow(row, ['страна', 'country']) || 'Не указана';
            const region = findValueInRow(row, ['субъект', 'регион', 'region', 'область']) || 'Не указан';
            return selectedCountries.has(country) && selectedRegions.has(region);
        });

        const worksheetData = rowsToExport.map(row => ({
            'Страна': findValueInRow(row, ['страна', 'country']) || '',
            'Субъект': findValueInRow(row, ['субъект', 'регион', 'region', 'область']),
            'Город': findValueInRow(row, ['город', 'city', 'населенный пункт']),
            'Категория': findValueInRow(row, ['вид деятельности', 'тип', 'категория']),
            'Наименование': findValueInRow(row, ['наименование', 'клиент', 'название']),
            'Адрес': findValueInRow(row, ['юридический адрес', 'адрес', 'фактический адрес']),
            'Контакты': findValueInRow(row, ['контакты', 'телефон', 'email']),
        }));

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Непокрытый Потенциал');
        XLSX.writeFile(workbook, `Uncovered_Potential_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        setIsExportModalOpen(false);
    };

    const handleExportRMDetails = (rm: RMMetrics) => {
        const exportData: any[] = [];

        rm.regions.forEach(reg => {
            if (reg.brands && reg.brands.length > 0) {
                reg.brands.forEach(br => {
                    exportData.push({
                        'Регион': reg.name,
                        'Бренд': br.name,
                        'Инд. Рост (%)': (br.growthPct || 0).toFixed(1),
                        'Факт (кг)': br.fact,
                        'План (кг)': br.plan.toFixed(0)
                    });
                });
            } else {
                 exportData.push({
                    'Регион': reg.name,
                    'Бренд': 'Сводный',
                    'Инд. Рост (%)': (reg.growthPct || 0).toFixed(1),
                    'Факт (кг)': reg.fact,
                    'План (кг)': reg.plan.toFixed(0)
                });
            }
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Детализация');
        XLSX.writeFile(workbook, `Plan_Details_${rm.rmName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const toggleCountry = (country: string) => {
        const newSet = new Set(selectedCountries);
        if (newSet.has(country)) {
            newSet.delete(country);
        } else {
            newSet.add(country);
        }
        setSelectedCountries(newSet);
    };

    const toggleRegion = (region: string) => {
        const newSet = new Set(selectedRegions);
        if (newSet.has(region)) {
            newSet.delete(region);
        } else {
            newSet.add(region);
        }
        setSelectedRegions(newSet);
    };

    const missingOkbRegions: string[] = (metricsData as any).__missingOkbRegions || [];
    const formatNum = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

    const handleAnalyzeClick = (e: React.MouseEvent, rm: RMMetrics) => {
        e.stopPropagation();
        setSelectedRMForAnalysis(rm);
        setIsAnalysisModalOpen(true);
    };

    const handleAbcClick = (rmName: string, category: 'A' | 'B' | 'C') => {
        const clients: MapPoint[] = [];
        const normalizedTargetRm = normalizeRmNameForMatching(rmName);

        data.forEach(group => {
            const normalizedGroupRm = normalizeRmNameForMatching(group.rm);
            if (normalizedGroupRm === normalizedTargetRm) {
                group.clients.forEach(client => {
                    if (client.abcCategory === category) {
                        clients.push(client);
                    }
                });
            }
        });
        
        clients.sort((a, b) => (b.fact || 0) - (a.fact || 0));

        setAbcClients(clients);
        setAbcModalTitle(`${rmName}: Клиенты категории ${category} (${clients.length})`);
        setIsAbcModalOpen(true);
    };

    const handleRegionClick = (rmName: string, regionName: string) => {
        const active: MapPoint[] = [];
        let potential: PotentialClient[] = [];
        const normalizedTargetRm = normalizeRmNameForMatching(rmName);

        data.forEach(group => {
            if (normalizeRmNameForMatching(group.rm) === normalizedTargetRm && group.region === regionName) {
                active.push(...group.clients);
                if (potential.length === 0 && group.potentialClients && group.potentialClients.length > 0) {
                    potential = group.potentialClients;
                }
            }
        });

        setSelectedRegionDetails({
            rmName,
            regionName,
            activeClients: active,
            potentialClients: potential
        });
        setIsRegionModalOpen(true);
    };

    const toggleExpand = (rmName: string) => {
        setExpandedRM(prev => prev === rmName ? null : rmName);
    };

    const handleExplanationClick = (e: React.MouseEvent, metric: PlanMetric) => {
        e.stopPropagation();
        setExplanationData(metric);
    };

    const handleBrandClick = (metric: PlanMetric, region: string) => {
        setSelectedBrandForDetails(metric);
        setSelectedBrandRegion(region);
        setIsBrandModalOpen(true);
    };

    const availableCountries = Object.keys(exportHierarchy).sort();
    const availableRegions = useMemo(() => {
        const regions = new Set<string>();
        availableCountries.forEach(c => {
            if (selectedCountries.has(c)) {
                exportHierarchy[c].forEach(r => regions.add(r));
            }
        });
        return Array.from(regions).sort();
    }, [exportHierarchy, selectedCountries]);

    const filteredRegions = availableRegions.filter(r => r.toLowerCase().includes(regionSearch.toLowerCase()));

    const mainContent = (
        <>
            <div className="space-y-4 animate-fade-in">
                {/* ... (Status bar with baseRate input remains the same) ... */}
                <div className="bg-gray-800/50 p-3 rounded-lg text-sm text-gray-400 border border-gray-700 flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2 bg-gray-900/50 p-1 pr-3 rounded-lg border border-indigo-500/30 shadow-sm">
                        <span className="w-3 h-3 rounded-full bg-indigo-500 ml-2"></span>
                        <div className="flex items-center gap-2">
                            <label htmlFor="baseRateInput" className="cursor-pointer font-medium text-gray-300 select-none">Базовое повышение:</label>
                            <div className="relative">
                                <input
                                    id="baseRateInput"
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={baseRate}
                                    onChange={(e) => setBaseRate(Number(e.target.value))}
                                    className="w-14 bg-gray-800 border border-gray-600 rounded px-1 text-center font-bold text-indigo-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all appearance-none no-spinner"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none select-none invisible">%</span>
                            </div>
                            <span className="font-bold text-indigo-400">%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><span>Высокий План (Есть потенциал)</span></div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span><span>Сниженный План (Насыщение)</span></div>
                    </div>
                    
                    {okbData.length > 0 && (
                        <button 
                            onClick={prepareExportData}
                            className="ml-auto flex items-center gap-2 bg-emerald-600/80 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors text-xs font-bold shadow-lg border border-emerald-500/50"
                            title="Скачать строки из ОКБ, которые не совпадают с активными клиентами по координатам"
                        >
                            <ExportIcon />
                            Скачать непокрытый потенциал (XLSX)
                        </button>
                    )}

                    {!okbRegionCounts && (
                        <div className="ml-auto text-xs text-red-400 border border-red-500/30 px-2 py-1 rounded">
                            ⚠️ База ОКБ не загружена. Расчет приблизительный.
                        </div>
                    )}
                    {missingOkbRegions.length > 0 && (
                        <div className="ml-auto text-xs text-yellow-300 border border-yellow-500/20 px-2 py-1 rounded">
                            ⚠️ Найдены регионы без записей в ОКБ: {missingOkbRegions.slice(0,5).join(', ')}{missingOkbRegions.length > 5 ? ` и ещё ${missingOkbRegions.length - 5}` : ''}.
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300 border-separate border-spacing-y-0">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 w-8"></th>
                                <th className="px-4 py-3">РМ</th>
                                <th className="px-4 py-3 text-center whitespace-nowrap">Факт {currentYear} (кг)</th>
                                <th className="px-4 py-3 text-center whitespace-nowrap" title="Левое число: Всего активных клиентов. Правое: Размер ОКБ.">АКБ / ОКБ (шт)</th>
                                <th className="px-4 py-3 text-center text-indigo-300 whitespace-nowrap" title="Доля активных клиентов от всей известной базы (Active + Uncovered).">Покрытие</th>
                                <th className="px-4 py-3 text-center text-emerald-300 whitespace-nowrap" title="Среднее количество уникальных брендов/SKU, продаваемых в одну точку">Ср. SKU/ТТ</th>
                                <th className="px-4 py-3 text-center text-cyan-300 whitespace-nowrap" title="Средний объем продаж на одну позицию">Ср. Продажи/SKU</th>
                                <th className="px-4 py-3 text-center border-l border-gray-700 bg-gray-800/30 whitespace-nowrap">Рек. План (%)</th>
                                <th className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/30">Обоснование</th>
                                <th className="px-4 py-3 text-center font-bold bg-gray-800/30 whitespace-nowrap">План {nextYear} (кг)</th>
                                <th className="px-4 py-3 text-center text-amber-400" title="Клиенты категории A">A</th>
                                <th className="px-4 py-3 text-center text-emerald-400" title="Клиенты категории B">B</th>
                                <th className="px-4 py-3 text-center text-slate-400" title="Клиенты категории C">C</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {metricsData.map(rm => {
                                const isExpanded = expandedRM === rm.rmName;
                                const isAnyExpanded = expandedRM !== null;
                                
                                const shareValue = Number.isNaN(rm.marketShare) ? null : rm.marketShare;
                                const shareColor = (shareValue === null) ? 'text-yellow-300' : (shareValue >= 90 ? 'text-emerald-400' : (shareValue < 40 ? 'text-yellow-400' : 'text-indigo-300'));
                                const growthColor = rm.recommendedGrowthPct > baseRate ? 'text-emerald-400' : (rm.recommendedGrowthPct < baseRate ? 'text-amber-400' : 'text-indigo-300');

                                const skuMetric = (rm as any).avgSkuPerClient || 0;
                                const salesMetric = (rm as any).avgSalesPerSku || 0;
                                const globalSku = (rm as any).globalAvgSku || 0;
                                const globalSales = (rm as any).globalAvgSalesSku || 0;

                                const skuColor = skuMetric < globalSku * 0.8 ? 'text-amber-400' : (skuMetric > globalSku * 1.2 ? 'text-emerald-400' : 'text-gray-300');
                                const salesColor = salesMetric < globalSales * 0.8 ? 'text-amber-400' : (salesMetric > globalSales * 1.2 ? 'text-emerald-400' : 'text-gray-300');

                                // Dynamic classes for row focus effect
                                let rowClasses = "transition-all duration-300 cursor-pointer ";
                                
                                if (isAnyExpanded) {
                                    if (isExpanded) {
                                        // Active row: Highlight, slightly larger, shadow
                                        rowClasses += "bg-gray-800/90 z-20 relative shadow-2xl scale-[1.005] border-y border-indigo-500/30 ";
                                    } else {
                                        // Inactive rows: Dimmed, blurred, grayscale
                                        rowClasses += "opacity-20 blur-[1px] grayscale hover:bg-transparent pointer-events-none border-b border-gray-800 ";
                                    }
                                } else {
                                    // Normal state
                                    rowClasses += "hover:bg-gray-800/50 border-b border-gray-700 ";
                                }

                                const covered = shareValue ? Math.min(100, shareValue) : 0;
                                const totalActive = rm.totalClients || 0;
                                const totalOkbMatched = Math.round(rm.totalOkbCount * (covered / 100)); // Approx matched count for tooltip
                                const totalUncovered = Math.max(0, rm.totalOkbCount - totalOkbMatched);

                                return (
                                    <React.Fragment key={rm.rmName}>
                                        <tr 
                                            className={rowClasses}
                                            onClick={() => toggleExpand(rm.rmName)}
                                        >
                                            <td className="px-4 py-3 text-gray-500">
                                                {isExpanded ? '▲' : '▼'}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-white truncate max-w-[200px]" title={rm.rmName}>{rm.rmName}</td>
                                            <td className="px-4 py-3 text-center font-mono text-white whitespace-nowrap">{formatNum(rm.totalFact)}</td>
                                            <td className="px-4 py-3 text-center font-mono text-gray-400 whitespace-nowrap">
                                                <span className="text-white" title="Всего активных ТТ">{rm.totalClients}</span>
                                                <span className="mx-1">/</span>
                                                <span title="Размер базы ОКБ">{rm.totalOkbCount > 0 ? formatNum(rm.totalOkbCount) : '?'}</span>
                                            </td>
                                            <td 
                                                className="px-4 py-3 text-center align-middle"
                                                title={`Покрытие: ${covered.toFixed(1)}%\nАктивные (Файл): ${totalActive}\nСовпадений (Matched): ${totalOkbMatched}\nСвободно в базе (Potential): ${totalUncovered}`}
                                            >
                                                <div className="flex flex-col items-center justify-center w-full">
                                                    <div className={`text-xs font-bold font-mono mb-1 ${shareColor}`}>
                                                        {shareValue === null ? '—' : `${covered.toFixed(0)}%`}
                                                    </div>
                                                    {shareValue !== null && (
                                                        <div className="w-24 h-1.5 bg-gray-700/50 rounded-full overflow-hidden flex">
                                                            <div 
                                                                className={`h-full ${shareValue >= 90 ? 'bg-emerald-500' : 'bg-emerald-500'}`} 
                                                                style={{ width: `${covered}%` }}
                                                            ></div>
                                                            {/* Explicitly visualizing the gap with darker background */}
                                                            <div className="h-full bg-gray-700 flex-grow"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            
                                            <td className={`px-4 py-3 text-center font-mono ${skuColor}`} title={`В среднем ${skuMetric.toFixed(2)} SKU на точку. Среднее по компании: ${globalSku.toFixed(2)}`}>
                                                {skuMetric.toFixed(2)}
                                            </td>
                                            <td className={`px-4 py-3 text-center font-mono ${salesColor}`} title={`В среднем ${formatNum(salesMetric)} кг на одно SKU. Среднее по компании: ${formatNum(globalSales)}`}>
                                                {formatNum(salesMetric)}
                                            </td>

                                            <td className={`px-4 py-3 text-center font-bold font-mono border-l border-gray-700 ${growthColor}`}>
                                                {rm.recommendedGrowthPct > 0 ? '+' : ''}{rm.recommendedGrowthPct.toFixed(1)}%
                                            </td>
                                            <td className="px-4 py-3 text-center border-r border-gray-700">
                                                <button
                                                    onClick={(e) => handleAnalyzeClick(e, rm)}
                                                    className="bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1.5 mx-auto transition-colors"
                                                >
                                                    Анализ
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold font-mono text-white bg-gray-800/20 whitespace-nowrap">
                                                {formatNum(rm.nextYearPlan)}
                                                <div className="text-[10px] text-gray-500 font-normal">
                                                    +{formatNum(rm.nextYearPlan - rm.totalFact)}
                                                </div>
                                            </td>
                                            <td 
                                                className="px-4 py-3 text-center cursor-pointer transition-colors hover:bg-amber-500/10"
                                                title={`Показать клиентов A для ${rm.rmName}`}
                                                onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'A'); }}
                                            >
                                                <div className="flex flex-col items-center justify-center group/cell">
                                                    <div className="text-[10px] font-mono text-amber-200/70">{formatNum(rm.factA)}</div>
                                                    <div className="font-bold font-mono text-amber-400 text-lg group-hover/cell:scale-110 transition-transform">{rm.countA}</div>
                                                </div>
                                            </td>
                                            <td 
                                                className="px-4 py-3 text-center cursor-pointer transition-colors hover:bg-emerald-500/10"
                                                title={`Показать клиентов B для ${rm.rmName}`}
                                                onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'B'); }}
                                            >
                                                <div className="flex flex-col items-center justify-center group/cell">
                                                    <div className="text-[10px] font-mono text-emerald-200/70">{formatNum(rm.factB)}</div>
                                                    <div className="font-bold font-mono text-emerald-400 text-lg group-hover/cell:scale-110 transition-transform">{rm.countB}</div>
                                                </div>
                                            </td>
                                            <td 
                                                className="px-4 py-3 text-center cursor-pointer transition-colors hover:bg-slate-500/10"
                                                title={`Показать клиентов C для ${rm.rmName}`}
                                                onClick={(e) => { e.stopPropagation(); handleAbcClick(rm.rmName, 'C'); }}
                                            >
                                                <div className="flex flex-col items-center justify-center group/cell">
                                                    <div className="text-[10px] font-mono text-slate-300/70">{formatNum(rm.factC)}</div>
                                                    <div className="font-bold font-mono text-slate-400 text-lg group-hover/cell:scale-110 transition-transform">{rm.countC}</div>
                                                </div>
                                            </td>
                                        </tr>

                                        {isExpanded && (
                                            <tr className="z-20 relative shadow-2xl scale-[1.005]">
                                                <td colSpan={13} className="p-0 bg-gray-900/95 border-b border-x border-indigo-500/30 rounded-b-lg shadow-inner">
                                                    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-down">
                                                        
                                                        <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/40">
                                                            <div className="bg-gray-800/50 px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">
                                                                Детализация по Регионам (Нажмите на строку для списка)
                                                            </div>
                                                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                                                <table className="w-full text-xs text-left">
                                                                    <thead className="bg-gray-800 text-gray-400 font-normal sticky top-0 z-10">
                                                                        <tr>
                                                                            <th className="px-3 py-2">Регион</th>
                                                                            <th className="px-3 py-2 text-right" title="Доля рынка (Active / (Active + Uncovered))">Покрытие</th>
                                                                            <th className="px-3 py-2 text-right">Рост</th>
                                                                            <th className="px-3 py-2 text-right">Факт</th>
                                                                            <th className="px-3 py-2 text-right">План {nextYear}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-700/50 text-gray-300">
                                                                        {rm.regions.map(reg => {
                                                                            const regShareKnown = !Number.isNaN(reg.marketShare);
                                                                            const regCovered = reg.marketShare ? Math.min(100, reg.marketShare) : 0;
                                                                            const regUncoveredCount = Math.max(0, (reg.totalCount || 0) - ((reg.totalCount || 0) * (regCovered / 100))); // Rough estimate for tooltip
                                                                            
                                                                            const regShareColor = !regShareKnown ? 'text-yellow-300' : (reg.marketShare! >= 90 ? 'text-emerald-400' : (reg.marketShare! < 40 ? 'text-yellow-400' : 'text-indigo-300'));
                                                                            const regGrowthColor = reg.growthPct > baseRate ? 'text-emerald-400' : 'text-amber-400';
                                                                            
                                                                            return (
                                                                                <tr 
                                                                                    key={reg.name} 
                                                                                    className="hover:bg-indigo-500/20 cursor-pointer transition-colors"
                                                                                    onClick={() => handleRegionClick(rm.rmName, reg.name)}
                                                                                >
                                                                                    <td className="px-3 py-2 font-medium flex items-center gap-1">
                                                                                        {reg.name}
                                                                                        <span className="text-[10px] text-gray-500 ml-1">↗</span>
                                                                                    </td>
                                                                                    <td 
                                                                                        className={`px-3 py-2 text-right font-mono`}
                                                                                        title={regShareKnown ? `АКБ: ${reg.activeCount}\nОКБ: ${reg.totalCount}\nПокрытие: ${regCovered.toFixed(1)}%` : ''}
                                                                                    >
                                                                                        <div className="flex flex-col items-end">
                                                                                            <div className="text-gray-500 text-[10px] mb-0.5">{reg.activeCount}/{reg.totalCount} <span className={`ml-1 font-bold ${regShareColor}`}>({regShareKnown ? `${regCovered.toFixed(0)}%` : '0%'})</span></div>
                                                                                            {regShareKnown && (
                                                                                                <div className="w-20 h-1 bg-gray-700/50 rounded-full overflow-hidden flex">
                                                                                                    <div 
                                                                                                        className={`h-full ${reg.marketShare! >= 90 ? 'bg-emerald-500' : 'bg-emerald-500'}`} 
                                                                                                        style={{ width: `${Math.min(100, reg.marketShare!)}%` }}
                                                                                                    ></div>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className={`px-3 py-2 text-right font-mono font-bold ${regGrowthColor}`}>
                                                                                        {reg.growthPct.toFixed(1)}%
                                                                                    </td>
                                                                                    <td className="px-3 py-2 text-right font-mono text-gray-400 whitespace-nowrap">{formatNum(reg.fact)}</td>
                                                                                    <td className="px-3 py-2 text-right font-mono text-white font-medium whitespace-nowrap">{formatNum(reg.plan)}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>

                                                        <div className="border border-gray-700 rounded-lg overflow-hidden h-fit bg-gray-800/40">
                                                            <div className="bg-gray-800/50 px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700 flex justify-between items-center">
                                                                <span>Детализация: Регионы и Бренды</span>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleExportRMDetails(rm); }}
                                                                    className="text-gray-500 hover:text-emerald-400 transition-colors"
                                                                    title="Выгрузить в Excel"
                                                                >
                                                                    <ExportIcon />
                                                                </button>
                                                            </div>
                                                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                                                <table className="w-full text-xs text-left">
                                                                    <thead className="bg-gray-800 text-gray-400 font-normal sticky top-0 z-10">
                                                                        <tr>
                                                                            <th className="px-3 py-2 pl-6">Бренд</th>
                                                                            <th className="px-3 py-2 text-right">Инд. Рост</th>
                                                                            <th className="px-3 py-2 text-right">Факт</th>
                                                                            <th className="px-3 py-2 text-right">План {nextYear}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="text-gray-300">
                                                                        {rm.regions.map(reg => (
                                                                            <React.Fragment key={`breakdown-${reg.name}`}>
                                                                                <tr className="bg-gray-800/60 border-y border-gray-700/50 sticky top-[32px] z-0 backdrop-blur-sm">
                                                                                    <td colSpan={4} className="px-3 py-1.5 font-bold text-indigo-300 text-[11px] uppercase tracking-wide">
                                                                                        {reg.name}
                                                                                    </td>
                                                                                </tr>
                                                                                {reg.brands?.map(br => (
                                                                                    <tr key={`${reg.name}-${br.name}`} className="hover:bg-gray-700/20 border-b border-gray-800/50 last:border-0">
                                                                                        <td className="px-3 py-2 pl-6 text-gray-300">
                                                                                            <button 
                                                                                                onClick={() => handleBrandClick(br, reg.name)}
                                                                                                className="w-full text-left text-accent hover:text-white transition-colors underline decoration-dotted underline-offset-4 hover:decoration-solid font-medium truncate max-w-[150px]"
                                                                                                title="Нажмите для детализации по фасовке"
                                                                                            >
                                                                                                {br.name}
                                                                                            </button>
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-right font-mono">
                                                                                            <button
                                                                                                onClick={(e) => handleExplanationClick(e, br)}
                                                                                                className="hover:underline text-emerald-400 font-bold"
                                                                                                title="Нажмите для обоснования процента роста"
                                                                                            >
                                                                                                +{br.growthPct.toFixed(1)}%
                                                                                            </button>
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-right font-mono text-gray-400 whitespace-nowrap">{formatNum(br.fact)}</td>
                                                                                        <td className="px-3 py-2 text-right font-mono text-white font-bold whitespace-nowrap">{formatNum(br.plan)}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </React.Fragment>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
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
            
            {/* Modals */}
            {selectedRegionDetails && (
                <RegionDetailsModal 
                    isOpen={isRegionModalOpen}
                    onClose={() => setIsRegionModalOpen(false)}
                    rmName={selectedRegionDetails.rmName}
                    regionName={selectedRegionDetails.regionName}
                    activeClients={selectedRegionDetails.activeClients}
                    potentialClients={selectedRegionDetails.potentialClients}
                />
            )}

            {/* Analysis Modal */}
            {selectedRMForAnalysis && (
                <RMAnalysisModal
                    isOpen={isAnalysisModalOpen}
                    onClose={() => { setIsAnalysisModalOpen(false); setSelectedRMForAnalysis(null); }}
                    rmData={selectedRMForAnalysis}
                    baseRate={baseRate}
                />
            )}

            {/* ABC Modal */}
            {isAbcModalOpen && (
                <ClientsListModal
                    isOpen={isAbcModalOpen}
                    onClose={() => setIsAbcModalOpen(false)}
                    clients={abcClients}
                    onClientSelect={() => {}} 
                    onStartEdit={(client) => {
                        if (onEditClient) onEditClient(client);
                        setIsAbcModalOpen(false);
                    }}
                    showAbcLegend={true}
                />
            )}

            {selectedBrandForDetails && (
                <BrandPackagingModal
                    isOpen={isBrandModalOpen}
                    onClose={() => setIsBrandModalOpen(false)}
                    brandMetric={selectedBrandForDetails}
                    regionName={selectedBrandRegion}
                    onExplain={(metric) => setExplanationData(metric)}
                    onAnalyze={handleAnalyzePackaging}
                />
            )}

            {/* Packaging Analysis Modal */}
            <PackagingAnalysisModal
                isOpen={isPackagingAnalysisOpen}
                onClose={() => setIsPackagingAnalysisOpen(false)}
                title={packagingAnalysisTitle}
                content={packagingAnalysisContent}
                isLoading={isPackagingAnalysisLoading}
                chartData={packagingChartData} // Pass chart data to the modal
            />

            {/* Render Explanation Modal LAST to ensure it appears on top of BrandPackagingModal */}
            {explanationData && (
                <GrowthExplanationModal
                    isOpen={!!explanationData}
                    onClose={() => setExplanationData(null)}
                    data={explanationData}
                    baseRate={baseRate}
                    zIndex="z-[60]" // Higher Z-Index to float above other modals
                />
            )}

            {/* Reuse Export Modal for 'modal' mode */}
            <Modal 
                isOpen={isExportModalOpen} 
                onClose={() => setIsExportModalOpen(false)} 
                title="Настройка выгрузки непокрытого потенциала"
                footer={
                    <div className="flex justify-between p-4 bg-gray-900/50 rounded-b-2xl border-t border-gray-700 flex-shrink-0">
                        <button
                            onClick={() => setIsExportModalOpen(false)}
                            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition duration-200 flex items-center gap-2"
                        >
                            <ArrowLeftIcon /> Отмена
                        </button>
                        <button
                            onClick={performExport}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-6 rounded-lg transition duration-200 flex items-center gap-2"
                        >
                            <ExportIcon /> Скачать Excel ({uncoveredRowsCache.filter(r => selectedCountries.has(findValueInRow(r, ['страна', 'country']) || 'Не указана') && selectedRegions.has(findValueInRow(r, ['субъект', 'регион', 'region', 'область']) || 'Не указан')).length} строк)
                        </button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[60vh]">
                    <div className="flex flex-col bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                        <div className="p-3 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                            <h4 className="font-bold text-gray-300">Страны</h4>
                            <div className="text-xs flex gap-2">
                                <button onClick={() => setSelectedCountries(new Set(availableCountries))} className="text-indigo-400 hover:text-white">Все</button>
                                <button onClick={() => setSelectedCountries(new Set())} className="text-gray-500 hover:text-white">Сброс</button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto custom-scrollbar p-2">
                            {availableCountries.map(c => (
                                <label key={c} className="flex items-center p-2 hover:bg-gray-700 rounded cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedCountries.has(c)}
                                        onChange={() => toggleCountry(c)}
                                        className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out bg-gray-900 border-gray-600 rounded focus:ring-indigo-500"
                                    />
                                    <span className="ml-2 text-sm text-gray-200">{c}</span>
                                    <span className="ml-auto text-xs text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded-full">
                                        {exportHierarchy[c]?.size || 0} рег.
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                        <div className="p-3 bg-gray-800 border-b border-gray-700 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <h4 className="font-bold text-gray-300">Регионы</h4>
                                <div className="text-xs flex gap-2">
                                    <button onClick={() => setSelectedRegions(new Set(availableRegions))} className="text-indigo-400 hover:text-white">Все</button>
                                    <button onClick={() => setSelectedRegions(new Set())} className="text-gray-500 hover:text-white">Сброс</button>
                                </div>
                            </div>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    placeholder="Поиск региона..." 
                                    value={regionSearch}
                                    onChange={(e) => setRegionSearch(e.target.value)}
                                    className="w-full p-1.5 pl-8 bg-gray-900 border border-gray-600 rounded text-xs text-white focus:ring-1 focus:ring-indigo-500"
                                />
                                <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none text-gray-500"><SearchIcon /></div>
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto custom-scrollbar p-2">
                            {filteredRegions.length > 0 ? (
                                filteredRegions.map(r => (
                                    <label key={r} className="flex items-center p-2 hover:bg-gray-700 rounded cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedRegions.has(r)}
                                            onChange={() => toggleRegion(r)}
                                            className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out bg-gray-900 border-gray-600 rounded focus:ring-indigo-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-200">{r}</span>
                                    </label>
                                ))
                            ) : (
                                <div className="text-center py-10 text-gray-500 text-sm">
                                    {selectedCountries.size === 0 ? 'Выберите страну слева' : 'Ничего не найдено'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );

    if (mode === 'page') {
        return (
             <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                    <div className="flex items-center gap-4">
                         <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg">
                            <ArrowLeftIcon />
                        </button>
                        <div>
                            <h2 className="text-2xl font-bold text-white">Дашборд <span className="text-gray-500 font-normal text-lg">/ План-Факт</span></h2>
                            <p className="text-gray-400 text-sm mt-1">Детальное планирование и анализ эффективности (Sales Efficiency).</p>
                        </div>
                    </div>
                </div>
                {mainContent}
             </div>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Панель управления: План/Факт">
            {mainContent}
        </Modal>
    );
};

export default RMDashboard;
