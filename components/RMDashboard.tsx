
import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow } from '../types';
import { ExportIcon, SearchIcon, CheckIcon, ArrowLeftIcon } from './icons';
import { findValueInRow } from '../utils/dataUtils';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    okbRegionCounts: { [key: string]: number } | null;
    okbData: OkbDataRow[];
    mode?: 'modal' | 'page'; // New prop to control rendering mode
}

const BASE_GROWTH_RATE = 13.0; // Base 13%

const normalizeRmNameForMatching = (str: string) => {
    if (!str) return '';
    let clean = str.toLowerCase().trim();
    const surname = clean.split(/[\s.]+/)[0];
    return surname.replace(/[^a-zа-я0-9]/g, '');
};

const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbRegionCounts, okbData, mode = 'modal' }) => {
    const [selectedRMForAnalysis, setSelectedRMForAnalysis] = useState<RMMetrics | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [expandedRM, setExpandedRM] = useState<string | null>(null);

    // --- Export Modal State ---
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [uncoveredRowsCache, setUncoveredRowsCache] = useState<OkbDataRow[]>([]);
    const [exportHierarchy, setExportHierarchy] = useState<Record<string, Set<string>>>({});
    const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [regionSearch, setRegionSearch] = useState('');

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const metrics = useMemo<RMMetrics[]>(() => {
        const globalOkbRegionCounts = okbRegionCounts || {};
        const isOkbLoaded = okbRegionCounts !== null && okbData.length > 0;

        const globalOkbCoordSet = new Set<string>();
        if (isOkbLoaded) {
            okbData.forEach(row => {
                if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                    const hash = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
                    globalOkbCoordSet.add(hash);
                }
            });
        }

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
            countA: number;
            countB: number;
            countC: number;
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
                    countA: 0, countB: 0, countC: 0
                });
            }
            const rmBucket = rmBuckets.get(normRm)!;
            rmBucket.totalFact += row.fact;

            if (row.clients) {
                row.clients.forEach(c => {
                    if (c.abcCategory === 'A') rmBucket.countA++;
                    else if (c.abcCategory === 'B') rmBucket.countB++;
                    else rmBucket.countC++;
                });
            }

            if (!rmBucket.regions.has(regionKey)) {
                rmBucket.regions.set(regionKey, {
                    fact: 0,
                    potential: 0,
                    activeClients: new Set(),
                    matchedOkbCoords: new Set(),
                    brandFacts: new Map(),
                    originalRegionName: row.region
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

        rmBuckets.forEach((rmData, normRmKey) => {
            const regionMetrics: PlanMetric[] = [];
            const brandAggregates = new Map<string, { fact: number, plan: number }>();

            let rmTotalOkbRaw = 0;
            let rmTotalMatched = 0;
            let rmTotalClients = 0;
            let rmTotalCalculatedPlan = 0;
            let rmTotalPotentialFile = 0;

            rmData.regions.forEach((regData, regionKey) => {
                const activeCount = regData.activeClients.size;
                const matchedCount = regData.matchedOkbCoords.size;
                
                rmTotalClients += activeCount;
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

                let marketShare = NaN;
                if (isOkbLoaded && totalRegionOkb > 0) {
                    marketShare = (matchedCount / totalRegionOkb);
                }

                const effectiveShareForCalc = Number.isNaN(marketShare) ? 0 : marketShare;

                const sensitivity = 20;
                let adjustment = (0.4 - effectiveShareForCalc) * sensitivity;
                const minRate = 5;
                const maxRate = 25;

                let calculatedRate = BASE_GROWTH_RATE + adjustment;
                calculatedRate = Math.max(minRate, Math.min(maxRate, calculatedRate));

                const regionPlan = regData.fact * (1 + calculatedRate / 100);
                rmTotalCalculatedPlan += regionPlan;

                regionMetrics.push({
                    name: regionKey,
                    fact: regData.fact,
                    plan: regionPlan,
                    growthPct: calculatedRate,
                    marketShare: !Number.isNaN(marketShare) ? marketShare * 100 : NaN,
                    activeCount: matchedCount,
                    totalCount: totalRegionOkb
                });

                regData.brandFacts.forEach((bFact, bName) => {
                    const bPlan = bFact * (1 + calculatedRate / 100);
                    if (!brandAggregates.has(bName)) brandAggregates.set(bName, { fact: 0, plan: 0 });
                    const agg = brandAggregates.get(bName)!;
                    agg.fact += bFact;
                    agg.plan += bPlan;
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
                : BASE_GROWTH_RATE;

            const weightedShare = (isOkbLoaded && rmTotalOkbRaw > 0) 
                ? (rmTotalMatched / rmTotalOkbRaw) * 100 
                : NaN;

            resultMetrics.push({
                rmName: rmData.originalName,
                totalClients: rmTotalClients,
                totalOkbCount: rmTotalOkbRaw,
                totalFact: rmData.totalFact,
                totalPotential: rmTotalPotentialFile,
                avgFactPerClient: rmTotalClients > 0 ? rmData.totalFact / rmTotalClients : 0,
                marketShare: weightedShare,
                countA: rmData.countA,
                countB: rmData.countB,
                countC: rmData.countC,
                recommendedGrowthPct: effectiveGrowthPct,
                nextYearPlan: rmTotalCalculatedPlan,
                regions: regionMetrics.sort((a, b) => b.fact - a.fact),
                brands: brandMetrics
            });
        });

        (resultMetrics as any).__missingOkbRegions = Array.from(missingRegionNames.values());
        return resultMetrics.sort((a, b) => b.totalFact - a.totalFact);

    }, [data, okbRegionCounts, okbData]);

    // --- EXPORT LOGIC ---

    const prepareExportData = () => {
        // 1. Find all unmatched rows
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

        // 2. Build Hierarchy: Country -> Regions
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
        setSelectedCountries(countries); // Select all by default
        setSelectedRegions(regions); // Select all by default
        setRegionSearch('');
        setIsExportModalOpen(true);
    };

    const performExport = () => {
        // Filter rows based on selection
        const rowsToExport = uncoveredRowsCache.filter(row => {
            const country = findValueInRow(row, ['страна', 'country']) || 'Не указана';
            const region = findValueInRow(row, ['субъект', 'регион', 'region', 'область']) || 'Не указан';
            return selectedCountries.has(country) && selectedRegions.has(region);
        });

        // Map to columns
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

    // Toggles
    const toggleCountry = (country: string) => {
        const newSet = new Set(selectedCountries);
        if (newSet.has(country)) {
            newSet.delete(country);
            // Optional: Deselect regions of this country? Or keep them in state but filter in UI?
            // Let's keep them in state to allow re-checking country to restore region selection easily.
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

    const missingOkbRegions: string[] = (metrics as any).__missingOkbRegions || [];
    const formatNum = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

    const handleAnalyzeClick = (e: React.MouseEvent, rm: RMMetrics) => {
        e.stopPropagation();
        setSelectedRMForAnalysis(rm);
        setIsAnalysisModalOpen(true);
    };

    const toggleExpand = (rmName: string) => {
        setExpandedRM(prev => prev === rmName ? null : rmName);
    };

    // Derived list for UI
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

    // --- Main Content (Extracted for reuse in Page/Modal) ---
    const mainContent = (
        <div className="space-y-4 animate-fade-in">
            <div className="bg-gray-800/50 p-3 rounded-lg text-sm text-gray-400 border border-gray-700 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                    <span>Базовое повышение: <b>{BASE_GROWTH_RATE}%</b></span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <span>Низкая доля рынка (Высокий план)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <span>Высокая доля рынка (Сниженный план)</span>
                </div>
                
                {/* Export Button */}
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
                            <th className="px-4 py-3 text-center text-indigo-300" title="Процент покрытия ОКБ. Рассчитывается как (Кол-во совпадений по координатам / Всего в ОКБ).">Покрытие (Совпадения/Всего)</th>
                            <th className="px-4 py-3 text-center border-l border-gray-700 bg-gray-800/30">Рек. План (%)</th>
                            <th className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/30">Обоснование</th>
                            <th className="px-4 py-3 text-center font-bold bg-gray-800/30">План {nextYear} (кг)</th>
                            <th className="px-4 py-3 text-center text-amber-400" title="Клиенты категории A">A</th>
                            <th className="px-4 py-3 text-center text-emerald-400" title="Клиенты категории B">B</th>
                            <th className="px-4 py-3 text-center text-slate-400" title="Клиенты категории C">C</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {metrics.map(rm => {
                            const isExpanded = expandedRM === rm.rmName;
                            const shareValue = Number.isNaN(rm.marketShare) ? null : rm.marketShare;
                            const shareColor = (shareValue === null) ? 'text-yellow-300' : (shareValue >= 90 ? 'text-emerald-400' : (shareValue < 40 ? 'text-yellow-400' : 'text-indigo-300'));
                            const growthColor = rm.recommendedGrowthPct > BASE_GROWTH_RATE ? 'text-emerald-400' : (rm.recommendedGrowthPct < BASE_GROWTH_RATE ? 'text-amber-400' : 'text-indigo-300');

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
                                        <td className="px-4 py-3 text-center font-mono text-amber-400">{rm.countA}</td>
                                        <td className="px-4 py-3 text-center font-mono text-emerald-400">{rm.countB}</td>
                                        <td className="px-4 py-3 text-center font-mono text-slate-400">{rm.countC}</td>
                                    </tr>

                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={11} className="p-0 bg-gray-900/40 border-b border-gray-700 shadow-inner">
                                                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-down">
                                                    <div className="border border-gray-700 rounded-lg overflow-hidden">
                                                        <div className="bg-gray-800/50 px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Детализация по Регионам</div>
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-gray-800 text-gray-400 font-normal">
                                                                <tr>
                                                                    <th className="px-3 py-2">Регион</th>
                                                                    <th className="px-3 py-2 text-right" title="Кол-во совпадений с ОКБ / Всего в ОКБ">Покрытие (Координаты)</th>
                                                                    <th className="px-3 py-2 text-right">Рост (%)</th>
                                                                    <th className="px-3 py-2 text-right">Факт</th>
                                                                    <th className="px-3 py-2 text-right">План {nextYear}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-700/50 text-gray-300">
                                                                {rm.regions.map(reg => {
                                                                    const regShareKnown = !Number.isNaN(reg.marketShare);
                                                                    const regShareColor = !regShareKnown ? 'text-yellow-300' : (reg.marketShare! >= 90 ? 'text-emerald-400' : (reg.marketShare! < 40 ? 'text-yellow-400' : 'text-indigo-300'));
                                                                    const regGrowthColor = reg.growthPct > BASE_GROWTH_RATE ? 'text-emerald-400' : 'text-amber-400';
                                                                    return (
                                                                        <tr key={reg.name} className="hover:bg-gray-700/20">
                                                                            <td className="px-3 py-2">{reg.name}</td>
                                                                            <td className={`px-3 py-2 text-right font-mono`}>
                                                                                <span className="text-gray-400" title="Совпадений / Всего ОКБ">{reg.activeCount}/{reg.totalCount}</span>
                                                                                <span className={`ml-2 font-bold ${regShareColor}`}>
                                                                                    {regShareKnown ? `(${reg.marketShare?.toFixed(0)}%)` : '(неизв.)'}
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

                                                    <div className="border border-gray-700 rounded-lg overflow-hidden h-fit">
                                                        <div className="bg-gray-800/50 px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">План по Брендам (Агрегированный)</div>
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-gray-800 text-gray-400 font-normal">
                                                                <tr>
                                                                    <th className="px-3 py-2">Бренд</th>
                                                                    <th className="px-3 py-2 text-right">Средний Рост</th>
                                                                    <th className="px-3 py-2 text-right">Факт</th>
                                                                    <th className="px-3 py-2 text-right">План {nextYear}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-700/50 text-gray-300">
                                                                {rm.brands.map(br => (
                                                                    <tr key={br.name} className="hover:bg-gray-700/20">
                                                                        <td className="px-3 py-2">{br.name}</td>
                                                                        <td className="px-3 py-2 text-right font-mono text-gray-400">~{br.growthPct.toFixed(1)}%</td>
                                                                        <td className="px-3 py-2 text-right font-mono text-gray-400">{formatNum(br.fact)}</td>
                                                                        <td className="px-3 py-2 text-right font-mono text-white font-medium">{formatNum(br.plan)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
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

    // --- RENDER ---
    if (mode === 'page') {
        return (
            <>
                <div className="flex justify-between items-end border-b border-gray-800 pb-4 mb-6 animate-fade-in">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Дашборд План/Факт <span className="text-gray-500 font-normal text-lg">/ Эффективность</span></h2>
                        <p className="text-gray-400 text-sm mt-1">Анализ выполнения планов, покрытие территории и ABC-анализ.</p>
                    </div>
                </div>
                {mainContent}
                <RMAnalysisModal 
                    isOpen={isAnalysisModalOpen}
                    onClose={() => setIsAnalysisModalOpen(false)}
                    rmData={selectedRMForAnalysis}
                    baseRate={BASE_GROWTH_RATE}
                />
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
                        {/* Left Col: Countries */}
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

                        {/* Right Col: Regions */}
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
    }

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Дашборд эффективности РМ и Планирование ${nextYear}`}>
                {mainContent}
            </Modal>

            <RMAnalysisModal 
                isOpen={isAnalysisModalOpen}
                onClose={() => setIsAnalysisModalOpen(false)}
                rmData={selectedRMForAnalysis}
                baseRate={BASE_GROWTH_RATE}
            />
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
                {/* Export Modal Content is same as above, just duplicated logic for the two return paths */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[60vh]">
                    {/* Left Col: Countries */}
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

                    {/* Right Col: Regions */}
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
};

export default RMDashboard;
