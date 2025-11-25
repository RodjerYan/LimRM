
import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow } from '../types';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    okbRegionCounts: { [key: string]: number } | null;
    okbData: OkbDataRow[];
}

const BASE_GROWTH_RATE = 13.0; // Base 13%

const normalizeRmNameForMatching = (str: string) => {
    if (!str) return '';
    let clean = str.toLowerCase().trim();
    const surname = clean.split(/[\s.]+/)[0];
    return surname.replace(/[^a-zа-я0-9]/g, '');
};

const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbRegionCounts, okbData }) => {
    const [selectedRMForAnalysis, setSelectedRMForAnalysis] = useState<RMMetrics | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [expandedRM, setExpandedRM] = useState<string | null>(null);

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const metrics = useMemo<RMMetrics[]>(() => {
        const globalOkbRegionCounts = okbRegionCounts || {};
        const isOkbLoaded = okbRegionCounts !== null && okbData.length > 0;

        // --- 1. Pre-process OKB Data for Coordinate Matching ---
        // We build a Set of coordinate hashes for the entire OKB to enable O(1) lookup.
        // This allows us to count exactly how many AKB clients match an OKB point physically.
        const globalOkbCoordSet = new Set<string>();
        if (isOkbLoaded) {
            okbData.forEach(row => {
                if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                    // 4 decimal places = ~11 meters precision. 
                    // This assumes strict matching: if AKB and OKB have same coords, it's the same shop.
                    const hash = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
                    globalOkbCoordSet.add(hash);
                }
            });
        }

        type RegionBucket = {
            fact: number;
            potential: number;
            activeClients: Set<string>;
            // Store unique hashes of active clients that matched OKB
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
                    // CHECK COORDINATE MATCH AGAINST OKB
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
            let rmTotalMatched = 0; // Total number of AKB clients that are in OKB
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

                // Market Share Calculation (STRICT COORDINATE MATCHING)
                // Numerator: Count of Active Clients that PHYSICALLY match an OKB point.
                // Denominator: Total OKB points in that region.
                // This represents "Percentage of the Known Potential Market Captured".
                // This can NEVER exceed 100% because matchedCount <= totalRegionOkb (assuming unique coords in OKB, or effectively so)
                // NOTE: activeCount can be > matchedCount if we have clients NOT in OKB.
                
                let marketShare = NaN;
                if (isOkbLoaded && totalRegionOkb > 0) {
                    marketShare = (matchedCount / totalRegionOkb);
                }

                // Use strict share for plan adjustment
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
                    activeCount: matchedCount, // We display "Matched / Total"
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

            // Weighted share based on Matched Counts
            const weightedShare = (isOkbLoaded && rmTotalOkbRaw > 0) 
                ? (rmTotalMatched / rmTotalOkbRaw) * 100 
                : NaN;

            resultMetrics.push({
                rmName: rmData.originalName,
                totalClients: rmTotalClients, // This remains Total Active from File
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

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Дашборд эффективности РМ и Планирование ${nextYear}`}>
                <div className="space-y-4">
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
                                    <th className="px-4 py-3 text-center text-indigo-300" title="Процент покрытия ОКБ. Рассчитывается как (Кол-во совпадений по координатам / Всего в ОКБ).">Покрытие (по координатам)</th>
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
            </Modal>

            <RMAnalysisModal 
                isOpen={isAnalysisModalOpen}
                onClose={() => setIsAnalysisModalOpen(false)}
                rmData={selectedRMForAnalysis}
                baseRate={BASE_GROWTH_RATE}
            />
        </>
    );
};

export default RMDashboard;
