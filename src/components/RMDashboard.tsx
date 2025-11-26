
import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import ClientsListModal from './ClientsListModal';
import RegionDetailsModal from './RegionDetailsModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, PotentialClient } from '../types';
import { ExportIcon, SearchIcon, ArrowLeftIcon, CalculatorIcon } from './icons';
import { findValueInRow } from '../utils/dataUtils';
// NEW: Import Planning Engine
import { PlanningEngine } from '../services/planning/engine';

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

const normalizeRmNameForMatching = (str: string) => {
    if (!str) return '';
    let clean = str.toLowerCase().trim();
    const surname = clean.split(/[\s.]+/)[0];
    return surname.replace(/[^a-zа-я0-9]/g, '');
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

    // --- Export Modal State ---
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [uncoveredRowsCache, setUncoveredRowsCache] = useState<OkbDataRow[]>([]);
    const [exportHierarchy, setExportHierarchy] = useState<Record<string, Set<string>>>({});
    const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [regionSearch, setRegionSearch] = useState('');

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const metricsData = useMemo<RMMetrics[]>(() => {
        const globalOkbRegionCounts = okbRegionCounts || {};
        const isOkbLoaded = okbRegionCounts !== null && okbData.length > 0;

        // --- STEP 1: Global Benchmarks ---
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

        // --- STEP 2: Aggregate RM Data ---
        const globalOkbCoordSet = new Set<string>();
        if (isOkbLoaded) {
            okbData.forEach(row => {
                if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                    const hash = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
                    globalOkbCoordSet.add(hash);
                }
            });
        }

        // Helper type for aggregation
        type RegionBucket = {
            fact: number;
            potential: number;
            activeClients: Set<string>;
            matchedOkbCoords: Set<string>;
            brandFacts: Map<string, number>;
            originalRegionName?: string;
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
                    fact: 0, potential: 0, activeClients: new Set(), matchedOkbCoords: new Set(), brandFacts: new Map(), originalRegionName: row.region
                });
            }
            const regBucket = rmBucket.regions.get(regionKey)!;
            regBucket.fact += row.fact;
            regBucket.potential += row.potential || 0;

            if (row.clients) {
                row.clients.forEach(c => {
                    regBucket.activeClients.add(c.key);
                    if (c.lat && c.lon && !isNaN(c.lat) && !isNaN(c.lon)) {
                        const hash = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
                        if (globalOkbCoordSet.has(hash)) {
                            regBucket.matchedOkbCoords.add(hash);
                        }
                    }
                });
            }
            const brandName = row.brand || 'No Brand';
            regBucket.brandFacts.set(brandName, (regBucket.brandFacts.get(brandName) || 0) + row.fact);
        });

        const missingRegionNames = new Set<string>();
        const resultMetrics: RMMetrics[] = [];

        // --- STEP 3: Final Calculation using Planning Engine ---
        rmBuckets.forEach((rmData, normRmKey) => {
            const regionMetrics: PlanMetric[] = [];
            const brandAggregates = new Map<string, { fact: number, plan: number }>();

            let rmTotalOkbRaw = 0;
            let rmTotalMatched = 0;
            let rmTotalCalculatedPlan = 0;
            let rmTotalPotentialFile = 0;
            
            const rmUniqueClientsCount = rmData.uniqueClientKeys.size;
            const rmAvgSkuPerClient = rmUniqueClientsCount > 0 ? rmData.totalListings / rmUniqueClientsCount : 0;
            const rmAvgSalesPerSku = rmData.totalListings > 0 ? rmData.totalFact / rmData.totalListings : 0;

            // Iterate Regions
            rmData.regions.forEach((regData, regionKey) => {
                const activeCount = regData.activeClients.size;
                const matchedCount = regData.matchedOkbCoords.size;
                rmTotalMatched += matchedCount;
                rmTotalPotentialFile += regData.potential;

                let totalRegionOkb = 0;
                if (globalOkbRegionCounts && globalOkbRegionCounts[regionKey]) {
                    totalRegionOkb = globalOkbRegionCounts[regionKey];
                }
                if (totalRegionOkb === 0 && regionKey !== 'Регион не определен') {
                    missingRegionNames.add(regionKey);
                }
                rmTotalOkbRaw += totalRegionOkb;

                // --- NEW: USE PLANNING ENGINE ---
                const calculationResult = PlanningEngine.calculateRMPlan(
                    {
                        totalFact: regData.fact,
                        totalPotential: totalRegionOkb, // Use OKB count as proxy for potential capacity in this context if absolute potential is missing
                        matchedCount: matchedCount,
                        totalRegionOkb: totalRegionOkb,
                        avgSku: rmAvgSkuPerClient, // Using RM avg as proxy for region (can be refined)
                        avgVelocity: rmAvgSalesPerSku
                    },
                    {
                        baseRate: baseRate,
                        globalAvgSku: globalAvgSkuPerClient,
                        globalAvgSales: globalAvgSalesPerSku,
                        riskLevel: 'low'
                    }
                );

                const regionPlan = calculationResult.plan;
                const calculatedRate = calculationResult.growthPct;
                rmTotalCalculatedPlan += regionPlan;

                // Brands breakdown
                const regionBrands: PlanMetric[] = [];
                regData.brandFacts.forEach((bFact, bName) => {
                    const bPlan = bFact * (1 + calculatedRate / 100);
                    regionBrands.push({
                        name: bName,
                        fact: bFact,
                        plan: bPlan,
                        growthPct: calculatedRate 
                    });
                    if (!brandAggregates.has(bName)) brandAggregates.set(bName, { fact: 0, plan: 0 });
                    const agg = brandAggregates.get(bName)!;
                    agg.fact += bFact;
                    agg.plan += bPlan;
                });
                regionBrands.sort((a, b) => b.fact - a.fact);

                const marketShare = totalRegionOkb > 0 ? (matchedCount / totalRegionOkb) : NaN;

                regionMetrics.push({
                    name: regionKey,
                    fact: regData.fact,
                    plan: regionPlan,
                    growthPct: calculatedRate,
                    marketShare: !Number.isNaN(marketShare) ? marketShare * 100 : NaN,
                    activeCount: matchedCount,
                    totalCount: totalRegionOkb,
                    brands: regionBrands 
                });
            });

            // Final Aggregations
            const brandMetrics: PlanMetric[] = Array.from(brandAggregates.entries()).map(([name, val]) => ({
                name,
                fact: val.fact,
                plan: val.plan,
                growthPct: val.fact > 0 ? ((val.plan - val.fact) / val.fact) * 100 : 0
            })).sort((a, b) => b.plan - a.plan);

            const effectiveGrowthPct = rmData.totalFact > 0
                ? ((rmTotalCalculatedPlan - rmData.totalFact) / rmData.totalFact) * 100
                : baseRate;

            const weightedShare = (rmTotalOkbRaw > 0) 
                ? (rmTotalMatched / rmTotalOkbRaw) * 100 
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
                avgSalesPerSku: rmAvgSalesPerSku,
                globalAvgSku: globalAvgSkuPerClient,
                globalAvgSalesSku: globalAvgSalesPerSku
            };

            resultMetrics.push(extendedMetrics as unknown as RMMetrics);
        });

        (resultMetrics as any).__missingOkbRegions = Array.from(missingRegionNames.values());
        return resultMetrics.sort((a, b) => b.totalFact - a.totalFact);

    }, [data, okbRegionCounts, okbData, baseRate]);

    // ... (Rest of the component logic like Export, Render, etc. remains unchanged) ...
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
                                    className="w-14 bg-gray-800 border border-gray-600 rounded px-1 text-center font-bold text-indigo-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all appearance-none"
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
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 w-8"></th>
                                <th className="px-4 py-3">РМ</th>
                                <th className="px-4 py-3 text-center">Факт {currentYear} (кг)</th>
                                <th className="px-4 py-3 text-center" title="Левое число: Всего активных клиентов. Правое: Размер ОКБ.">АКБ / ОКБ (шт)</th>
                                <th className="px-4 py-3 text-center text-indigo-300" title="Доля активных клиентов (Penetration)">Покрытие</th>
                                <th className="px-4 py-3 text-center text-emerald-300" title="Среднее количество уникальных брендов/SKU, продаваемых в одну точку">Ср. SKU/ТТ</th>
                                <th className="px-4 py-3 text-center text-cyan-300" title="Средний объем продаж на одну позицию">Ср. Продажи/SKU</th>
                                <th className="px-4 py-3 text-center border-l border-gray-700 bg-gray-800/30">Рек. План (%)</th>
                                <th className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/30">Обоснование</th>
                                <th className="px-4 py-3 text-center font-bold bg-gray-800/30">План {nextYear} (кг)</th>
                                <th className="px-4 py-3 text-center text-amber-400" title="Клиенты категории A">A</th>
                                <th className="px-4 py-3 text-center text-emerald-400" title="Клиенты категории B">B</th>
                                <th className="px-4 py-3 text-center text-slate-400" title="Клиенты категории C">C</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {metricsData.map(rm => {
                                const isExpanded = expandedRM === rm.rmName;
                                const shareValue = Number.isNaN(rm.marketShare) ? null : rm.marketShare;
                                const shareColor = (shareValue === null) ? 'text-yellow-300' : (shareValue >= 90 ? 'text-emerald-400' : (shareValue < 40 ? 'text-yellow-400' : 'text-indigo-300'));
                                const growthColor = rm.recommendedGrowthPct > baseRate ? 'text-emerald-400' : (rm.recommendedGrowthPct < baseRate ? 'text-amber-400' : 'text-indigo-300');

                                const skuMetric = (rm as any).avgSkuPerClient || 0;
                                const salesMetric = (rm as any).avgSalesPerSku || 0;
                                const globalSku = (rm as any).globalAvgSku || 0;
                                const globalSales = (rm as any).globalAvgSalesSku || 0;

                                const skuColor = skuMetric < globalSku * 0.8 ? 'text-amber-400' : (skuMetric > globalSku * 1.2 ? 'text-emerald-400' : 'text-gray-300');
                                const salesColor = salesMetric < globalSales * 0.8 ? 'text-amber-400' : (salesMetric > globalSales * 1.2 ? 'text-emerald-400' : 'text-gray-300');

                                return (
                                    <React.Fragment key={rm.rmName}>
                                        <tr 
                                            className={`hover:bg-gray-800/50 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-800/30' : ''}`}
                                            onClick={() => toggleExpand(rm.rmName)}
                                        >
                                            <td className="px-4 py-3 text-gray-500">
                                                {isExpanded ? '▲' : '▼'}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-white">{rm.rmName}</td>
                                            <td className="px-4 py-3 text-center font-mono text-white">{formatNum(rm.totalFact)}</td>
                                            <td className="px-4 py-3 text-center font-mono text-gray-400">
                                                <span className="text-white" title="Всего активных ТТ">{rm.totalClients}</span>
                                                <span className="mx-1">/</span>
                                                <span title="Размер базы ОКБ">{rm.totalOkbCount > 0 ? formatNum(rm.totalOkbCount) : '?'}</span>
                                            </td>
                                            <td className={`px-4 py-3 text-center font-bold font-mono ${shareColor}`}>
                                                {shareValue === null ? '—' : `${shareValue.toFixed(1)}%`}
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
                                            <td className="px-4 py-3 text-center font-bold font-mono text-white bg-gray-800/20">
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
                                            <tr>
                                                <td colSpan={13} className="p-0 bg-gray-900/40 border-b border-gray-700 shadow-inner">
                                                    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-down">
                                                        
                                                        <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/20">
                                                            <div className="bg-gray-800/50 px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">
                                                                Детализация по Регионам (Нажмите на строку для списка)
                                                            </div>
                                                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                                                <table className="w-full text-xs text-left">
                                                                    <thead className="bg-gray-800 text-gray-400 font-normal sticky top-0 z-10">
                                                                        <tr>
                                                                            <th className="px-3 py-2">Регион</th>
                                                                            <th className="px-3 py-2 text-right" title="Кол-во совпадений с ОКБ / Всего в ОКБ">Покрытие</th>
                                                                            <th className="px-3 py-2 text-right">Рост</th>
                                                                            <th className="px-3 py-2 text-right">Факт</th>
                                                                            <th className="px-3 py-2 text-right">План {nextYear}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-700/50 text-gray-300">
                                                                        {rm.regions.map(reg => {
                                                                            const regShareKnown = !Number.isNaN(reg.marketShare);
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
                                                                                    <td className={`px-3 py-2 text-right font-mono`}>
                                                                                        <span className="text-gray-500 text-[10px]">{reg.activeCount}/{reg.totalCount}</span>
                                                                                        <span className={`ml-2 font-bold ${regShareColor}`}>
                                                                                            {regShareKnown ? `(${reg.marketShare?.toFixed(0)}%)` : '(0%)'}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className={`px-3 py-2 text-right font-mono font-bold ${regGrowthColor}`}>
                                                                                        {reg.growthPct.toFixed(1)}%
                                                                                    </td>
                                                                                    <td className="px-3 py-2 text-right font-mono text-gray-400">{formatNum(reg.fact)}</td>
                                                                                    <td className="px-3 py-2 text-right font-mono text-white font-medium">{formatNum(reg.plan)}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>

                                                        <div className="border border-gray-700 rounded-lg overflow-hidden h-fit bg-gray-800/20">
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
                                                                                        <td className="px-3 py-2 pl-6 text-gray-300">{br.name}</td>
                                                                                        <td className="px-3 py-2 text-right font-mono text-gray-500">+{br.growthPct.toFixed(1)}%</td>
                                                                                        <td className="px-3 py-2 text-right font-mono text-gray-400">{formatNum(br.fact)}</td>
                                                                                        <td className="px-3 py-2 text-right font-mono text-white font-bold">{formatNum(br.plan)}</td>
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
                />
            )}
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
