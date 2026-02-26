
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import ClientsListModal from './ClientsListModal';
import RegionDetailsModal from './RegionDetailsModal';
import GrowthExplanationModal from './GrowthExplanationModal';
import NBAPanel from './modules/NBAPanel'; 
import TaskActionModal from './TaskActionModal'; // NEW
import { generateNextBestActions, calculateChurnMetrics } from '../services/analytics/advancedAnalytics';
import { useAuth } from './auth/AuthContext';
import { useTaskManager } from '../hooks/useTaskManager'; // NEW

import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, PotentialClient, SuggestedAction, ChurnMetric } from '../types';
import { ExportIcon, SearchIcon, ArrowLeftIcon, CalculatorIcon, BrainIcon, LoaderIcon, ChartBarIcon, TargetIcon, UsersIcon, CalendarIcon, CheckIcon, TrashIcon } from './icons';
import DateRangePicker from './DateRangePicker';
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

// --- Date Utils for Annualization ---
const safeParseDate = (s?: string) => {
  if (!s) return null;
  const d = s.includes('T') ? new Date(s) : new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
};

const daysBetweenInclusive = (start: Date, end: Date) => {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
};

const getLastSaleDate = (client: MapPoint): Date | null => {
    if (!client.monthlyFact) return null;
    const months = Object.keys(client.monthlyFact).filter(m => (client.monthlyFact![m] || 0) > 0).sort();
    if (months.length === 0) return null;
    const lastMonth = months[months.length - 1];
    return new Date(`${lastMonth}-01`);
};

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);

// Helper for date formatting
const formatDateLabel = (
  start?: string,
  end?: string
): { factLabel: string; planYear: number } => {
  const planYear = new Date().getFullYear(); 

  if (!start && !end) {
    return { factLabel: 'Факт (весь период)', planYear };
  }

  const dateOptions: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  };

  const sDate = safeParseDate(start);
  const eDate = safeParseDate(end);
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
            backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(79, 70, 229, 0.7)'], 
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
            backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(251, 191, 36, 0.8)'], 
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

const BrandPackagingModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    brandMetric: PlanMetric | null; 
    regionName: string; 
    onExplain: (metric: PlanMetric) => void; 
    onAnalyze: (row: any) => void; 
    dateLabels: { fact: string; plan: string };
    periodAnnualizeK: number;
    baseRate: number;
    planScalingFactor: number; // New: Scales annual plan to selected period
}> = ({ isOpen, onClose, brandMetric, regionName, onExplain, onAnalyze, dateLabels, periodAnnualizeK, baseRate, planScalingFactor }) => {
    if (!brandMetric || !brandMetric.packagingDetails) return null;
    const rawRows = brandMetric.packagingDetails;
    const aggregatedRows = useMemo(() => {
        const groups = new Map<string, { packaging: string; fact: number; plan: number; rows: AggregatedDataRow[]; skus: Set<string>; channels: Set<string>; }>();
        rawRows.forEach(r => {
            const key = r.packaging || 'Не указана';
            if (!groups.has(key)) groups.set(key, { packaging: key, fact: 0, plan: 0, rows: [], skus: new Set(), channels: new Set() });
            const g = groups.get(key)!;
            g.fact += r.fact;
            
            // Annualize then scale to target period
            const annualFact = r.fact * periodAnnualizeK;
            const growth = r.planMetric ? r.planMetric.growthPct : baseRate;
            const annualPlan = annualFact * (1 + growth / 100);
            
            g.plan += annualPlan * planScalingFactor;
            
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
            // Growth is calculated against the projected fact for the same period length
            const targetFact = g.fact * periodAnnualizeK * planScalingFactor;
            const growth = targetFact > 0 ? ((g.plan - targetFact) / targetFact) * 100 : (g.plan > 0 ? 100 : 0);
            const representativeRow = g.rows.reduce((prev, curr) => (prev.fact > curr.fact) ? prev : curr);
            
            const metric: PlanMetric = {
                ...(representativeRow.planMetric ?? { name: '', fact: 0, plan: 0, growthPct: 0 }),
                name: `${representativeRow.brand} (${g.packaging})`,
                fact: g.fact,
                plan: g.plan,
                growthPct: growth
            };
            
            return { key: g.packaging, packaging: g.packaging, fact: g.fact, plan: g.plan, growthPct: growth, planMetric: metric, skuList: Array.from(g.skus).sort(), channelList: Array.from(g.channels).sort() };
        }).sort((a, b) => b.fact - a.fact);
    }, [rawRows, brandMetric.name, periodAnnualizeK, baseRate, planScalingFactor]);
    
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
    startDate?: string;
    endDate?: string;
    dateRange?: string;
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

// --- PLAN CONFIGURATION STATE ---
interface PlanConfig {
    isActive: boolean;
    start: string;
    end: string;
}

export const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbRegionCounts, okbData, mode = 'modal', metrics, okbStatus, onActiveClientsClick, onEditClient, startDate, endDate, dateRange }) => {
    const { user, token } = useAuth();
    const isAdmin = user?.role === 'admin';
    const taskManager = useTaskManager();
    
    const [baseRate, setBaseRate] = useState(15);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    
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
    
    // --- PLAN CALCULATION STATES ---
    const [planConfig, setPlanConfig] = useState<PlanConfig>({ isActive: false, start: '', end: '' });
    const [isPlanSettingsOpen, setIsPlanSettingsOpen] = useState(false);
    const [tempPlanStart, setTempPlanStart] = useState('');
    const [tempPlanEnd, setTempPlanEnd] = useState('');

    // --- TASK ACTION STATES ---
    const [taskActionTarget, setTaskActionTarget] = useState<{id: string, name: string, rm: string, address: string} | null>(null); // <--- Added RM and Address
    // NEW: Add state to track which action type to open immediately
    const [taskActionType, setTaskActionType] = useState<'delete' | 'snooze'>('delete'); 
    const [isTaskActionModalOpen, setIsTaskActionModalOpen] = useState(false);
    const [isTaskHistoryModalOpen, setIsTaskHistoryModalOpen] = useState(false);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Load base rate from server on mount
    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoadingSettings(true);
            try {
                const res = await fetch(`/api/get-full-cache?action=get-settings&t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && typeof data.baseRate === 'number') {
                        setBaseRate(data.baseRate);
                    }
                }
            } catch (e) {
                console.error("Failed to load settings:", e);
            } finally {
                setIsLoadingSettings(false);
            }
        };
        fetchSettings();
    }, []);

    // ... (rest of code similar, until handleTaskAction) ...
    // Save base rate to server (Admin only)
    const handleSaveRateSettings = async () => {
        if (!isAdmin) return;
        try {
            await fetch(`/api/get-full-cache?action=save-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseRate })
            });
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
    };

    // Dynamic Date Logic for FACT column (what is currently filtered)
    const { factLabel } = useMemo(() => formatDateLabel(startDate, endDate), [startDate, endDate]);
    
    // Dynamic Label for PLAN column
    const planLabel = useMemo(() => {
        if (planConfig.isActive && planConfig.start && planConfig.end) {
             const sDate = safeParseDate(planConfig.start);
             const eDate = safeParseDate(planConfig.end);
             const sStr = sDate ? sDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '...';
             const eStr = eDate ? eDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '...';
             return `План (${sStr} - ${eStr})`;
        }
        return `План (—)`;
    }, [planConfig]);

    // --- COEFFS for Fact Annualization (Current View) ---
    const periodAnnualizeK = useMemo(() => {
        const y = new Date().getFullYear();
        const daysInYear = isLeapYear(y) ? 366 : 365;
        const sRaw = safeParseDate(startDate);
        const eRaw = safeParseDate(endDate);
        if (!sRaw && !eRaw) return 1;
        const start = sRaw ?? new Date(y, 0, 1);
        const end = eRaw ?? new Date();
        if (end < start) return 1;
        const days = daysBetweenInclusive(start, end);
        return days > 0 ? (daysInYear / days) : 1;
    }, [startDate, endDate]);

    // --- COEFFS for Plan Scaling (Target Period) ---
    const planScalingFactor = useMemo(() => {
        if (!planConfig.isActive || !planConfig.start || !planConfig.end) return 0; // Show 0 if no plan set
        
        const y = new Date().getFullYear();
        const daysInYear = isLeapYear(y) ? 366 : 365;
        
        const s = safeParseDate(planConfig.start);
        const e = safeParseDate(planConfig.end);
        
        if (s && e && e >= s) {
            const targetDays = daysBetweenInclusive(s, e);
            // Factor = Portion of Year for the plan
            return targetDays / daysInYear; 
        }
        return 0;
    }, [planConfig]);

    const handleCalculatePlan = () => {
        if (tempPlanStart && tempPlanEnd) {
            setPlanConfig({ isActive: true, start: tempPlanStart, end: tempPlanEnd });
            setIsPlanSettingsOpen(false);
        }
    };

    const metricsData = useMemo<RMMetrics[]>(() => {
        // ... (Metrics aggregation code is identical to original, keeping it concise) ...
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
                
                const annualFact = regData.fact * periodAnnualizeK;
                const planResult = PlanningEngine.calculateRMPlan({ 
                    totalFact: annualFact, 
                    totalPotential: regionOkbCount, 
                    matchedCount: regData.matchedOkbCoords.size, 
                    activeCount: regData.activeClients.size, 
                    totalRegionOkb: regionOkbCount, 
                    avgSku: regionAvgSku, 
                    avgVelocity: regionVelocity, 
                    rmGlobalVelocity: globalAvgSalesPerSku 
                }, { baseRate: baseRate, globalAvgSku: globalAvgSkuPerClient, globalAvgSales: globalAvgSalesPerSku, riskLevel: 'low' });
                
                const scaledPlan = planResult.plan * planScalingFactor;

                const regBrands: PlanMetric[] = [];
                regData.brandRows.forEach((rows, bName) => {
                    let bFact = 0; let bPlan = 0;
                    rows.forEach(r => { 
                        bFact += r.fact; 
                        const annualBFact = r.fact * periodAnnualizeK;
                        const growth = r.planMetric ? r.planMetric.growthPct : baseRate;
                        bPlan += (annualBFact * (1 + growth / 100)) * planScalingFactor;
                    });
                    if (!rmBrandsMap.has(bName)) rmBrandsMap.set(bName, {fact: 0, plan: 0});
                    rmBrandsMap.get(bName)!.fact += bFact; 
                    rmBrandsMap.get(bName)!.plan += bPlan;
                    
                    const projectedTargetFact = bFact * periodAnnualizeK * planScalingFactor;
                    regBrands.push({ 
                        name: bName, 
                        fact: bFact, 
                        plan: bPlan, 
                        growthPct: projectedTargetFact > 0 ? ((bPlan - projectedTargetFact)/projectedTargetFact)*100 : 0, 
                        packagingDetails: rows 
                    });
                });
                
                rmRegions.push({ name: regData.originalRegionName, fact: regData.fact, plan: scaledPlan, growthPct: planResult.growthPct, activeCount: regData.activeClients.size, totalCount: regionOkbCount, factors: planResult.factors, details: planResult.details, brands: regBrands.sort((a,b) => b.fact - a.fact) });
            }
            const rmBrands: PlanMetric[] = []; 
            rmBrandsMap.forEach((val, key) => { 
                const projectedTargetFact = val.fact * periodAnnualizeK * planScalingFactor;
                rmBrands.push({ 
                    name: key, 
                    fact: val.fact, 
                    plan: val.plan, 
                    growthPct: projectedTargetFact > 0 ? ((val.plan - projectedTargetFact)/projectedTargetFact)*100 : 0 
                }); 
            });
            const rmAvgSku = bucket.uniqueClientKeys.size > 0 ? bucket.totalListings / bucket.uniqueClientKeys.size : 0;
            const rmVelocity = bucket.totalListings > 0 ? bucket.totalFact / bucket.totalListings : 0;
            const totalRmPlan = rmRegions.reduce((sum, r) => sum + r.plan, 0);
            const totalRmProjectedFact = bucket.totalFact * periodAnnualizeK * planScalingFactor;
            const totalRmGrowthPct = totalRmProjectedFact > 0 ? ((totalRmPlan - totalRmProjectedFact) / totalRmProjectedFact) * 100 : 0;
            
            results.push({ rmName: bucket.originalName, totalClients: bucket.uniqueClientKeys.size, totalOkbCount: rmOkbTotal, totalFact: bucket.totalFact, totalPotential: rmOkbTotal, avgFactPerClient: bucket.uniqueClientKeys.size > 0 ? bucket.totalFact / bucket.uniqueClientKeys.size : 0, marketShare: rmOkbTotal > 0 ? bucket.uniqueClientKeys.size / rmOkbTotal : 0, countA: bucket.countA, countB: bucket.countB, countC: bucket.countC, factA: bucket.factA, factB: bucket.factB, factC: bucket.factC, recommendedGrowthPct: totalRmGrowthPct, nextYearPlan: totalRmPlan, regions: rmRegions.sort((a,b) => b.fact - a.fact), brands: rmBrands.sort((a,b) => b.fact - a.fact), avgSkuPerClient: rmAvgSku, avgSalesPerSku: rmVelocity, globalAvgSku: globalAvgSkuPerClient, globalAvgSalesSku: globalAvgSalesPerSku });
        }
        return results.sort((a, b) => b.totalFact - a.totalFact);
    }, [data, okbRegionCounts, okbData, baseRate, periodAnnualizeK, planScalingFactor]);

    // --- NBA LOGIC ---
    const nbaActions = useMemo(() => {
        const allClients = data.flatMap(d => d.clients);
        const churnMetrics = calculateChurnMetrics(allClients);
        const rawActions = generateNextBestActions(data, churnMetrics);
        
        // FILTER: Remove deleted/snoozed items
        return rawActions.filter(a => taskManager.isItemVisible(a.clientId));
    }, [data, taskManager.isItemVisible]);

    const handleActionClick = (action: SuggestedAction) => {
        let targetClient: MapPoint | undefined;
        data.some(row => {
            const found = row.clients.find(c => c.key === action.clientId);
            if (found) {
                targetClient = found;
                return true;
            }
            return false;
        });

        if (targetClient && onEditClient) {
            onEditClient(targetClient);
        }
    };

    // UPDATE: Now we accept RM and Address in handleTaskAction
    const handleTaskAction = (target: {id: string, name: string, rm: string, address: string}, type: 'delete' | 'snooze') => {
        setTaskActionTarget(target);
        setTaskActionType(type); // Store the type so modal opens correct tab
        setIsTaskActionModalOpen(true);
    };

    // ... (rest of helper functions) ...
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
                <span className={`text-xl font-bold ${category === 'A' ? 'text-emerald-600' : category === 'B' ? 'text-amber-600' : 'text-gray-600'}`}>Клиенты Категории {category}</span>
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

    const handleExportOption = (option: 'uncovered' | 'active_6m' | 'active_6_12m' | 'lost_12m') => {
        const now = new Date();
        const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(now.getMonth() - 6);
        const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(now.getMonth() - 12);

        if (option === 'uncovered') {
            handleGlobalExportUncovered();
            setIsExportModalOpen(false);
            return;
        }

        const allClients = data.flatMap(d => d.clients);
        let filteredClients: MapPoint[] = [];
        let fileName = '';

        if (option === 'active_6m') {
            filteredClients = allClients.filter(c => {
                const lastSale = getLastSaleDate(c);
                return lastSale && lastSale >= sixMonthsAgo;
            });
            fileName = 'Active_Sales_Last_6_Months';
        } else if (option === 'active_6_12m') {
            filteredClients = allClients.filter(c => {
                const lastSale = getLastSaleDate(c);
                return lastSale && lastSale >= twelveMonthsAgo && lastSale < sixMonthsAgo;
            });
            fileName = 'Sales_6_to_12_Months';
        } else if (option === 'lost_12m') {
            filteredClients = allClients.filter(c => {
                const lastSale = getLastSaleDate(c);
                return lastSale && lastSale < twelveMonthsAgo;
            });
            fileName = 'Lost_Points_Over_12_Months';
        }

        if (filteredClients.length === 0) {
            alert("Нет данных для выбранного периода");
            return;
        }

        const exportData = filteredClients.map(c => ({
            'Наименование': c.name,
            'Адрес': c.address,
            'Регион': c.region,
            'Город': c.city,
            'РМ': c.rm,
            'Последняя продажа': getLastSaleDate(c)?.toLocaleDateString() || 'Неизвестно',
            'Объем продаж': c.fact || 0
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Export");
        XLSX.writeFile(wb, `${fileName}_${now.toISOString().split('T')[0]}.xlsx`);
        setIsExportModalOpen(false);
    };

    const renderContent = () => (
        <div className="space-y-6">
            {/* NBA PANEL - TOP PRIORITY */}
            <div className="mb-8">
                <div className="flex justify-end mb-2">
                    <button 
                        onClick={() => setIsTaskHistoryModalOpen(true)}
                        className="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                    >
                        <TrashIcon small /> Отработанные задачи
                    </button>
                </div>
                <NBAPanel 
                    actions={nbaActions} 
                    onActionClick={handleActionClick} 
                    // PASS RM and Address to handler
                    onDelete={(a) => handleTaskAction({id: a.clientId, name: a.clientName, rm: a.rm, address: a.address}, 'delete')}
                    onSnooze={(a) => handleTaskAction({id: a.clientId, name: a.clientName, rm: a.rm, address: a.address}, 'snooze')}
                />
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md flex flex-col md:flex-row justify-between items-center gap-6">
                <div><h3 className="text-xl font-bold text-gray-900 mb-1">Управление Целями</h3><p className="text-sm text-gray-500">Настройка базового сценария роста для всей компании. Влияет на расчет индивидуальных планов.</p></div>
                
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsPlanSettingsOpen(true)}
                        className={`flex items-center gap-2 px-4 py-3 text-xs font-bold rounded-xl border transition-colors shadow-sm h-full ${planConfig.isActive ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                        title="Настроить период и рассчитать план"
                    >
                        <CalendarIcon small /> 
                        {planConfig.isActive ? 'План рассчитан (Настроить)' : 'Рассчитать план'}
                    </button>

                    <button 
                        onClick={() => setIsExportModalOpen(true)}
                        disabled={!okbData || okbData.length === 0}
                        className="flex items-center gap-2 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold rounded-xl border border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed h-full shadow-sm"
                        title="Выгрузить данные"
                    >
                        <ExportIcon small /> Выгрузить точки
                    </button>

                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex items-center gap-6 w-full md:w-auto shadow-inner">
                        <div className="flex-grow">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                Базовый рост (ставка)
                                {isLoadingSettings && <LoaderIcon small className="animate-spin text-gray-400" />}
                                {!isAdmin && <span className="text-[9px] bg-gray-200 px-1.5 rounded text-gray-500">READ ONLY</span>}
                            </label>
                            <input 
                                type="range" 
                                min="0" 
                                max="50" 
                                step="1" 
                                value={baseRate} 
                                disabled={!isAdmin || isLoadingSettings}
                                onChange={(e) => setBaseRate(Number(e.target.value))} 
                                onMouseUp={handleSaveRateSettings}
                                onTouchEnd={handleSaveRateSettings}
                                className={`w-full h-2 bg-gray-300 rounded-lg appearance-none accent-amber-400 ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} 
                            />
                            <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>0%</span><span>25%</span><span>50%</span></div>
                        </div>
                        <div className="text-center w-24">
                            <div className="text-3xl font-mono font-bold text-amber-500">+{baseRate}%</div>
                            <div className="text-[10px] text-gray-400 uppercase font-bold">Цель</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Plan Calculation Info Banner */}
            {planConfig.isActive && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                     <div className="text-blue-500 mt-0.5"><CheckIcon small /></div>
                     <div>
                         <h4 className="text-sm font-bold text-blue-800">Режим планирования активен</h4>
                         <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                            План рассчитан на период: <strong>{new Date(planConfig.start).toLocaleDateString()} — {new Date(planConfig.end).toLocaleDateString()}</strong>.
                            <br/>
                            Расчет производится на основе показателей предыдущего года (или загруженного периода). 
                            Если у клиента/региона не было продаж в прошлом периоде, используется индивидуальная модель оценки потенциала (Acquisition Model) на основе текущих данных.
                         </p>
                     </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6">
                {metricsData.map((rm, idx) => (
                    <div key={rm.rmName} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-md transition-all hover:border-indigo-200">
                        {/* ... (RM Card content same as original) ... */}
                        <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpandedRM(expandedRM === rm.rmName ? null : rm.rmName)}>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm ${idx < 3 ? 'bg-amber-400 text-black' : 'bg-gray-200 text-gray-600'}`}>{idx + 1}</div><div><h3 className="text-lg font-bold text-gray-900">{rm.rmName}</h3><div className="flex items-center gap-3 text-xs text-gray-500 mt-1"><span>{rm.totalClients} активных клиентов</span><span className="w-1 h-1 rounded-full bg-gray-300"></span><span>{rm.totalOkbCount.toLocaleString()} потенциал (ОКБ)</span></div></div></div>
                                <div className="flex items-center gap-8 text-right">
                                    <div><div className="text-[10px] uppercase text-gray-400 font-bold mb-1">{factLabel}</div><div className="text-xl font-mono font-bold text-gray-900">{new Intl.NumberFormat('ru-RU').format(rm.totalFact)}</div></div>
                                    <div>
                                        <div className="text-[10px] uppercase text-gray-400 font-bold mb-1">{planLabel}</div>
                                        <div className="text-xl font-mono font-bold text-indigo-600">
                                            {planConfig.isActive ? new Intl.NumberFormat('ru-RU').format(Math.round(rm.nextYearPlan)) : '—'}
                                        </div>
                                    </div>
                                    <div><div className="text-[10px] uppercase text-gray-400 font-bold mb-1">Прирост</div><div className={`text-xl font-mono font-bold ${rm.recommendedGrowthPct > baseRate ? 'text-emerald-500' : 'text-amber-500'}`}>{planConfig.isActive ? `+${rm.recommendedGrowthPct.toFixed(1)}%` : '—'}</div></div>
                                    <div className="hidden md:block w-px h-10 bg-gray-200 mx-2"></div>
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedRMForAnalysis(rm); setIsAnalysisModalOpen(true); }} className="p-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors border border-indigo-100 group"><BrainIcon small /></button>
                                    <div className={`transform transition-transform duration-300 ${expandedRM === rm.rmName ? 'rotate-180' : ''}`}><ArrowLeftIcon className="w-5 h-5 text-gray-400 -rotate-90" /></div>
                                </div>
                            </div>
                            <div className="mt-4 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${Math.min(100, (rm.totalFact / metricsData[0].totalFact) * 100)}%` }}></div></div>
                        </div>
                        {expandedRM === rm.rmName && (
                            <div className="border-t border-gray-200 bg-gray-50/50 p-6 animate-fade-in-down">
                                {/* ... (Expanded RM content same as original) ... */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                        <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2"><TargetIcon small /> Эффективность Клиентской Базы</h4>
                                        <div className="space-y-4">
                                            {/* Updated Colors for Category A */}
                                            <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors" onClick={() => handleShowAbcClients(rm.rmName, 'A')} title="Показать список клиентов категории A">
                                                <span className="text-xs text-emerald-500 font-bold underline decoration-dotted underline-offset-2">Категория A (80% объема)</span>
                                                <span className="text-xs text-gray-700">{rm.countA} клиентов / {new Intl.NumberFormat('ru-RU').format(rm.factA)} кг</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${(rm.factA / rm.totalFact) * 100}%` }}></div></div>
                                            
                                            {/* Updated Colors for Category B */}
                                            <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors" onClick={() => handleShowAbcClients(rm.rmName, 'B')} title="Показать список клиентов категории B">
                                                <span className="text-xs text-amber-500 font-bold underline decoration-dotted underline-offset-2">Категория B (15% объема)</span>
                                                <span className="text-xs text-gray-700">{rm.countB} клиентов / {new Intl.NumberFormat('ru-RU').format(rm.factB)} кг</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(rm.factB / rm.totalFact) * 100}%` }}></div></div>
                                            
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
                                                <td className="px-4 py-3 font-mono text-gray-900 font-bold">
                                                    {planConfig.isActive ? new Intl.NumberFormat('ru-RU').format(Math.round(reg.plan)) : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {planConfig.isActive ? (
                                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${reg.growthPct > baseRate ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>+{reg.growthPct.toFixed(1)}%</span>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-center flex justify-center gap-2">
                                                    <button onClick={() => { setExplanationData(reg); }} className="p-1.5 hover:bg-gray-200 rounded text-indigo-500 transition-colors" title="Почему такой план?"><CalculatorIcon small /></button>
                                                    <button onClick={() => { 
                                                        // ... (region selection logic) ...
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
            
            {/* PLAN SETTINGS MODAL */}
            <Modal
                isOpen={isPlanSettingsOpen}
                onClose={() => setIsPlanSettingsOpen(false)}
                title="Настройка периода планирования"
                maxWidth="max-w-md"
            >
                <div className="p-2 space-y-6">
                    <p className="text-sm text-slate-600 leading-relaxed">
                        Выберите период, на который необходимо рассчитать план продаж.
                        Система автоматически учтет сезонность и исторические данные для построения прогноза.
                    </p>
                    
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Период планирования</label>
                            <DateRangePicker
                                startDate={tempPlanStart}
                                endDate={tempPlanEnd}
                                onStartDateChange={setTempPlanStart}
                                onEndDateChange={setTempPlanEnd}
                                className="!w-full !h-10"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button onClick={() => setIsPlanSettingsOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Отмена</button>
                        <button 
                            onClick={handleCalculatePlan}
                            disabled={!tempPlanStart || !tempPlanEnd}
                            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Рассчитать
                        </button>
                    </div>
                </div>
            </Modal>

            {/* TASK ACTION MODAL */}
            <TaskActionModal
                isOpen={isTaskActionModalOpen}
                onClose={() => setIsTaskActionModalOpen(false)}
                mode="action"
                targetItem={taskActionTarget || undefined}
                initialActionType={taskActionType} // PASS NEW PROP HERE
                history={[]}
                onConfirmAction={async (type, reason, snoozeDate) => {
                    if (taskActionTarget) {
                        // 1. Perform Task Action (Snooze/Delete)
                        taskManager.performAction(
                            taskActionTarget.id,
                            taskActionTarget.name,
                            type,
                            reason,
                            taskActionTarget.rm, // NEW: PASS OWNER RM
                            snoozeDate ? new Date(snoozeDate).getTime() : undefined
                        );

                        // 2. Add History Entry (Comment)
                        if (token) {
                            try {
                                const commentText = type === 'delete' 
                                    ? `Задача удалена: ${reason}` 
                                    : `Задача отложена до ${snoozeDate}: ${reason}`;
                                
                                await fetch('/api/get-full-cache?action=update-address', {
                                    method: 'POST',
                                    headers: { 
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        rmName: taskActionTarget.rm,
                                        oldAddress: taskActionTarget.address,
                                        newAddress: taskActionTarget.address,
                                        comment: commentText,
                                        skipHistory: false
                                    })
                                });
                            } catch (e) {
                                console.error("Failed to save task history comment:", e);
                            }
                        }
                    }
                }}
                onRestore={() => {}}
            />

            <TaskActionModal
                isOpen={isTaskHistoryModalOpen}
                onClose={() => setIsTaskHistoryModalOpen(false)}
                mode="history"
                history={taskManager.processedTasks}
                onConfirmAction={() => {}}
                onRestore={(id) => taskManager.restoreTask(id)}
            />

            <Modal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                title="Выгрузка данных"
                maxWidth="max-w-md"
            >
                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => handleExportOption('uncovered')}
                        className="w-full text-left px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-sm transition-colors border border-indigo-200 flex items-center justify-between group"
                    >
                        <span>Выгрузить весь непокрытый потенциал (ОКБ)</span>
                        <ExportIcon small className="opacity-50 group-hover:opacity-100" />
                    </button>
                    <button
                        onClick={() => handleExportOption('active_6m')}
                        className="w-full text-left px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-medium text-sm transition-colors border border-gray-200 flex items-center justify-between group"
                    >
                        <span>Активные продажи (последние 6 мес.)</span>
                        <ExportIcon small className="opacity-50 group-hover:opacity-100" />
                    </button>
                    <button
                        onClick={() => handleExportOption('active_6_12m')}
                        className="w-full text-left px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-medium text-sm transition-colors border border-gray-200 flex items-center justify-between group"
                    >
                        <span>Продажи от 6 до 12 мес.</span>
                        <ExportIcon small className="opacity-50 group-hover:opacity-100" />
                    </button>
                    <button
                        onClick={() => handleExportOption('lost_12m')}
                        className="w-full text-left px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-medium text-sm transition-colors border border-gray-200 flex items-center justify-between group"
                    >
                        <span>Потерянные точки (продажи &gt; 12 мес. назад)</span>
                        <ExportIcon small className="opacity-50 group-hover:opacity-100" />
                    </button>
                </div>
            </Modal>
        </div>
    );

    if (!isOpen && mode === 'modal') return null;

    return (
        <>
            {mode === 'modal' ? (
                <Modal isOpen={isOpen} onClose={onClose} title="Дашборд эффективности" maxWidth="max-w-[95vw]">
                    {renderContent()}
                </Modal>
            ) : (
                <div className="h-full w-full">
                    {renderContent()}
                </div>
            )}

            <RMAnalysisModal 
                isOpen={isAnalysisModalOpen} 
                onClose={() => setIsAnalysisModalOpen(false)} 
                rmData={selectedRMForAnalysis} 
                baseRate={baseRate}
                dateRange={dateRange}
            />

            <ClientsListModal 
                isOpen={isAbcModalOpen} 
                onClose={() => setIsAbcModalOpen(false)} 
                title={abcModalTitle} 
                clients={abcClients} 
                onClientSelect={() => {}} 
                onStartEdit={onEditClient || (() => {})} 
                showAbcLegend={true}
            />

            <RegionDetailsModal 
                isOpen={isRegionModalOpen} 
                onClose={() => setIsRegionModalOpen(false)} 
                rmName={selectedRegionDetails?.rmName || ''} 
                regionName={selectedRegionDetails?.regionName || ''} 
                activeClients={selectedRegionDetails?.activeClients || []} 
                potentialClients={selectedRegionDetails?.potentialClients || []} 
                onEditClient={onEditClient}
            />

            <GrowthExplanationModal 
                isOpen={!!explanationData} 
                onClose={() => setExplanationData(null)} 
                data={explanationData} 
                baseRate={baseRate}
                zIndex="z-[1050]" 
            />

            <BrandPackagingModal 
                isOpen={isBrandModalOpen} 
                onClose={() => setIsBrandModalOpen(false)} 
                brandMetric={selectedBrandForDetails} 
                regionName={selectedBrandRegion} 
                onExplain={(metric) => setExplanationData(metric)} 
                onAnalyze={(row) => {
                    const packagingName = row.packaging;
                    const skus = row.skuList || [];
                    const fact = row.fact;
                    const plan = row.plan;
                    const growthPct = row.growthPct;
                    const region = selectedBrandRegion;

                    setPackagingAnalysisTitle(`Анализ сегмента: ${packagingName}`);
                    setPackagingAnalysisContent('');
                    setPackagingChartData({ 
                        fact, 
                        plan, 
                        growthPct, 
                        labels: { fact: factLabel, plan: planLabel } 
                    });
                    setIsPackagingAnalysisOpen(true);
                    setIsPackagingAnalysisLoading(true);

                    if (packagingAbortController.current) {
                        packagingAbortController.current.abort();
                    }
                    packagingAbortController.current = new AbortController();

                    streamPackagingInsights(
                        packagingName,
                        skus,
                        fact,
                        plan,
                        growthPct,
                        region,
                        (chunk) => setPackagingAnalysisContent(prev => prev + chunk),
                        (err) => {
                            if (err.name !== 'AbortError') {
                                setPackagingAnalysisContent(prev => prev + `\n\n**Ошибка:** ${err.message}`);
                            }
                            setIsPackagingAnalysisLoading(false);
                        },
                        packagingAbortController.current.signal
                    ).finally(() => setIsPackagingAnalysisLoading(false));
                }}
                dateLabels={{ fact: factLabel, plan: planLabel }} 
                periodAnnualizeK={periodAnnualizeK} 
                baseRate={baseRate} 
                planScalingFactor={planScalingFactor}
            />

            <PackagingAnalysisModal 
                isOpen={isPackagingAnalysisOpen} 
                onClose={() => { 
                    setIsPackagingAnalysisOpen(false); 
                    if (packagingAbortController.current) {
                        packagingAbortController.current.abort();
                        packagingAbortController.current = null;
                    }
                }} 
                title={packagingAnalysisTitle} 
                content={packagingAnalysisContent} 
                isLoading={isPackagingAnalysisLoading} 
                chartData={packagingChartData}
            />
        </>
    );
};
