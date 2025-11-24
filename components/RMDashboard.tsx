
import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import { AggregatedDataRow, MapPoint, RMMetrics, OkbDataRow, PlanMetric } from '../types';
import { findValueInRow } from '../utils/dataUtils';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    okbData: OkbDataRow[];
}

// Icons
const BrainIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
);
const ChevronDownIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
);
const ChevronUpIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path></svg>
);

const BASE_GROWTH_RATE = 13.0; // Base 13%

// Normalizer for RM name matching (remove spaces, dots, lowercase)
const normalizeKey = (str: string) => str.toLowerCase().replace(/[^a-zа-я0-9]/g, '');

const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbData }) => {
    const [selectedRMForAnalysis, setSelectedRMForAnalysis] = useState<RMMetrics | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [expandedRM, setExpandedRM] = useState<string | null>(null);

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const metrics = useMemo<RMMetrics[]>(() => {
        // 1. Index OKB Data: Map<NormalizedRM, Map<NormalizedRegion, Count>>
        const okbRegionCounts = new Map<string, Map<string, number>>();
        
        okbData.forEach(row => {
            const rawRm = findValueInRow(row, ['рм', 'менеджер', 'ответственный', 'ка']);
            if (!rawRm) return;
            
            const normRm = normalizeKey(rawRm);
            
            // Try to find region in OKB row
            const rawRegion = findValueInRow(row, ['регион', 'область', 'край', 'республика']);
            // If no region column, we count it towards 'unknown' region for that RM, or skip?
            // Let's use 'unknown' if missing to account for it in total load.
            const normRegion = rawRegion ? normalizeKey(rawRegion) : 'unknown';

            if (!okbRegionCounts.has(normRm)) {
                okbRegionCounts.set(normRm, new Map());
            }
            const regionMap = okbRegionCounts.get(normRm)!;
            regionMap.set(normRegion, (regionMap.get(normRegion) || 0) + 1);
        });

        // 2. Aggregate Data from Sales File
        // Structure: RM -> Region -> { fact, clientsSet, brandStats }
        type RegionBucket = {
            fact: number;
            potential: number; // from file
            activeClients: Set<string>; // for counting unique
            brandFacts: Map<string, number>; // BrandName -> Fact
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
            const normRm = normalizeKey(rmName);
            const regionName = row.region || 'Регион не определен';
            // Normalize region to match with OKB index
            // Note: Region names in file might slightly differ from OKB (e.g. "обл." vs "область"). 
            // Our `normalizeKey` strips all non-alphanumeric, so "московскаяобл" matches "московскаяобласть" mostly if truncated, 
            // but better to rely on the root name. Ideally `standardizeRegion` in parser handled this.
            const normRegion = normalizeKey(regionName); 

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

            // ABC Counts
            if (row.clients) {
                row.clients.forEach(c => {
                    if (c.abcCategory === 'A') rmBucket.countA++;
                    else if (c.abcCategory === 'B') rmBucket.countB++;
                    else rmBucket.countC++;
                });
            }

            // Region Bucket
            if (!rmBucket.regions.has(normRegion)) {
                rmBucket.regions.set(normRegion, { 
                    fact: 0, 
                    potential: 0, 
                    activeClients: new Set(),
                    brandFacts: new Map()
                });
            }
            const regBucket = rmBucket.regions.get(normRegion)!;
            
            regBucket.fact += row.fact;
            regBucket.potential += row.potential;
            
            if (row.clients) {
                row.clients.forEach(c => regBucket.activeClients.add(c.key));
            }

            // Brand Fact accumulator within this region
            const brandName = row.brand || 'No Brand';
            regBucket.brandFacts.set(brandName, (regBucket.brandFacts.get(brandName) || 0) + row.fact);
        });

        // 3. Calculate Plans (Bottom-Up)
        const resultMetrics: RMMetrics[] = [];

        rmBuckets.forEach((rmData, normRmKey) => {
            const regionMetrics: PlanMetric[] = [];
            const brandAggregates = new Map<string, { fact: number, plan: number }>();
            
            let rmTotalOkb = 0;
            let rmTotalClients = 0;
            let rmTotalCalculatedPlan = 0;
            let rmTotalPotentialFile = 0;

            // Get OKB map for this RM
            const okbMap = okbRegionCounts.get(normRmKey);

            rmData.regions.forEach((regData, normRegionKey) => {
                const activeCount = regData.activeClients.size;
                rmTotalClients += activeCount;
                rmTotalPotentialFile += regData.potential;

                // Find Total OKB count for this region
                // We try exact match first. 
                let totalRegionOkb = okbMap?.get(normRegionKey) || 0;
                
                // Fallback: if OKB keys are slightly different (e.g. missing "oblast"), try fuzzy find? 
                // For now rely on normalizeKey. If 0, we assume Blue Ocean.
                
                rmTotalOkb += totalRegionOkb;

                // --- SMART PLAN LOGIC PER REGION ---
                let marketShare = 0;
                if (totalRegionOkb > 0) {
                    marketShare = Math.min(1, activeCount / totalRegionOkb);
                } else if (okbData.length === 0) {
                    // Fallback if no OKB loaded
                    marketShare = regData.potential > 0 ? (regData.fact / regData.potential) : 0.5;
                }
                // If OKB loaded but region not found in OKB for this RM -> Assume 0 share (Blue Ocean)

                const sensitivity = 20; 
                // Pivot at 40%. Share < 40% -> High Growth. Share > 40% -> Lower Growth.
                let adjustment = (0.4 - marketShare) * sensitivity;
                const minRate = 5; 
                const maxRate = 25;
                
                let calculatedRate = BASE_GROWTH_RATE + adjustment;
                calculatedRate = Math.max(minRate, Math.min(maxRate, calculatedRate));
                
                const regionPlan = regData.fact * (1 + calculatedRate / 100);
                rmTotalCalculatedPlan += regionPlan;

                // Store Region Metric
                // Find original region name from data (we only have normalized key in loop)
                // In a real app, we'd store the display name in the bucket.
                // Optimization: We assume at least one match exists to grab name, or capitalize key.
                const displayRegionName = [...regData.activeClients][0]?.split(',')[0] || normRegionKey; 

                regionMetrics.push({
                    name: displayRegionName, // Simplified, ideally pass name through bucket
                    fact: regData.fact,
                    plan: regionPlan,
                    growthPct: calculatedRate,
                    marketShare: marketShare * 100,
                    activeCount: activeCount,
                    totalCount: totalRegionOkb
                });

                // Distribute Plan to Brands in this Region
                regData.brandFacts.forEach((bFact, bName) => {
                    const bPlan = bFact * (1 + calculatedRate / 100);
                    
                    if (!brandAggregates.has(bName)) {
                        brandAggregates.set(bName, { fact: 0, plan: 0 });
                    }
                    const agg = brandAggregates.get(bName)!;
                    agg.fact += bFact;
                    agg.plan += bPlan;
                });
            });

            // Create Brand Metrics List
            const brandMetrics: PlanMetric[] = Array.from(brandAggregates.entries()).map(([name, val]) => ({
                name,
                fact: val.fact,
                plan: val.plan,
                growthPct: val.fact > 0 ? ((val.plan - val.fact) / val.fact) * 100 : 0
            })).sort((a, b) => b.plan - a.plan);

            // Final RM Aggregates
            const effectiveGrowthPct = rmData.totalFact > 0 
                ? ((rmTotalCalculatedPlan - rmData.totalFact) / rmData.totalFact) * 100 
                : BASE_GROWTH_RATE;

            // Weighted Market Share (for display)
            const weightedShare = rmTotalOkb > 0 ? (rmTotalClients / rmTotalOkb) * 100 : 0;

            resultMetrics.push({
                rmName: rmData.originalName,
                totalClients: rmTotalClients,
                totalOkbCount: rmTotalOkb,
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

        return resultMetrics.sort((a, b) => b.totalFact - a.totalFact);
    }, [data, okbData]);

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
                        {okbData.length === 0 && (
                            <div className="ml-auto text-xs text-red-400 border border-red-500/30 px-2 py-1 rounded">
                                ⚠️ База ОКБ не загружена. Расчет приблизительный.
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
                                    <th className="px-4 py-3 text-center">АКБ / ОКБ (шт)</th>
                                    <th className="px-4 py-3 text-center text-indigo-300" title="Покрытие территории (АКБ / ОКБ)">Доля рынка</th>
                                    <th className="px-4 py-3 text-center border-l border-gray-700 bg-gray-800/30">Рек. План (%)</th>
                                    <th className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/30">Обоснование</th>
                                    <th className="px-4 py-3 text-center font-bold bg-gray-800/30">План {nextYear} (кг)</th>
                                    <th className="px-4 py-3 text-center text-amber-400" title="Клиенты категории A">A</th>
                                    <th className="px-4 py-3 text-center text-emerald-400" title="Клиенты категории B">B</th>
                                    <th className="px-4 py-3 text-center text-slate-400" title="Клиенты категории C">C</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.map((rm) => {
                                    const isHighGrowth = rm.recommendedGrowthPct > BASE_GROWTH_RATE;
                                    const isLowGrowth = rm.recommendedGrowthPct < BASE_GROWTH_RATE;
                                    const pctColor = isHighGrowth ? 'text-emerald-400' : isLowGrowth ? 'text-amber-400' : 'text-gray-300';
                                    const isExpanded = expandedRM === rm.rmName;

                                    return (
                                        <React.Fragment key={rm.rmName}>
                                            <tr 
                                                className={`border-b border-gray-700 hover:bg-indigo-500/10 transition-colors cursor-pointer ${isExpanded ? 'bg-indigo-500/5' : ''}`}
                                                onClick={() => toggleExpand(rm.rmName)}
                                            >
                                                <td className="px-4 py-3 text-gray-500">
                                                    {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-white">{rm.rmName}</td>
                                                <td className="px-4 py-3 text-center font-bold text-gray-200">{formatNum(rm.totalFact)}</td>
                                                <td className="px-4 py-3 text-center text-gray-500">
                                                    {rm.totalClients} / {rm.totalOkbCount > 0 ? rm.totalOkbCount : '?'}
                                                </td>
                                                <td className="px-4 py-3 text-center font-mono text-indigo-300">
                                                    {rm.marketShare.toFixed(1)}%
                                                </td>
                                                
                                                {/* Smart Planning Columns */}
                                                <td className={`px-4 py-3 text-center font-bold border-l border-gray-700 bg-gray-800/30 ${pctColor}`}>
                                                    {rm.recommendedGrowthPct > 0 ? '+' : ''}{rm.recommendedGrowthPct.toFixed(1)}%
                                                </td>
                                                <td className="px-4 py-3 text-center border-r border-gray-700 bg-gray-800/30">
                                                    <button 
                                                        onClick={(e) => handleAnalyzeClick(e, rm)}
                                                        className="text-xs bg-indigo-600/80 hover:bg-indigo-500 text-white py-1 px-3 rounded-md flex items-center gap-1 mx-auto transition-all shadow-md hover:shadow-indigo-500/30"
                                                        title="Получить анализ и обоснование от AI"
                                                    >
                                                        <BrainIcon />
                                                        Анализ
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-center font-bold text-white bg-gray-800/30">
                                                    {formatNum(rm.nextYearPlan)}
                                                    <div className="text-[10px] text-gray-500 font-normal">+{formatNum(rm.nextYearPlan - rm.totalFact)}</div>
                                                </td>

                                                <td className="px-4 py-3 text-center text-amber-400">{rm.countA}</td>
                                                <td className="px-4 py-3 text-center text-emerald-400">{rm.countB}</td>
                                                <td className="px-4 py-3 text-center text-slate-400">{rm.countC}</td>
                                            </tr>
                                            
                                            {/* Expanded Detail View */}
                                            {isExpanded && (
                                                <tr className="bg-gray-800/30 shadow-inner">
                                                    <td colSpan={11} className="p-4">
                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                            {/* Regional Breakdown */}
                                                            <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                                                                <h4 className="px-4 py-2 bg-gray-800 text-xs font-bold uppercase text-gray-400 border-b border-gray-700">
                                                                    Детализация по регионам
                                                                </h4>
                                                                <table className="w-full text-xs text-left">
                                                                    <thead className="text-gray-500 border-b border-gray-700 bg-gray-800/50">
                                                                        <tr>
                                                                            <th className="px-3 py-2">Регион</th>
                                                                            <th className="px-3 py-2 text-right">Доля рынка</th>
                                                                            <th className="px-3 py-2 text-right">Рост (%)</th>
                                                                            <th className="px-3 py-2 text-right">Факт</th>
                                                                            <th className="px-3 py-2 text-right">План {nextYear}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {rm.regions.map((reg, idx) => (
                                                                            <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                                                                <td className="px-3 py-2 font-medium text-gray-300">{reg.name}</td>
                                                                                <td className="px-3 py-2 text-right text-indigo-300">
                                                                                    {reg.activeCount}/{reg.totalCount} ({reg.marketShare?.toFixed(0)}%)
                                                                                </td>
                                                                                <td className={`px-3 py-2 text-right font-bold ${reg.growthPct > BASE_GROWTH_RATE ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                                                    {reg.growthPct.toFixed(1)}%
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right text-gray-400">{formatNum(reg.fact)}</td>
                                                                                <td className="px-3 py-2 text-right text-white">{formatNum(reg.plan)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>

                                                            {/* Brand Breakdown */}
                                                            <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden h-fit">
                                                                <h4 className="px-4 py-2 bg-gray-800 text-xs font-bold uppercase text-gray-400 border-b border-gray-700">
                                                                    План по брендам (Агрегированный)
                                                                </h4>
                                                                <table className="w-full text-xs text-left">
                                                                    <thead className="text-gray-500 border-b border-gray-700 bg-gray-800/50">
                                                                        <tr>
                                                                            <th className="px-3 py-2">Бренд</th>
                                                                            <th className="px-3 py-2 text-right">Средний Рост</th>
                                                                            <th className="px-3 py-2 text-right">Факт</th>
                                                                            <th className="px-3 py-2 text-right">План {nextYear}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {rm.brands.map((br, idx) => (
                                                                            <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                                                                <td className="px-3 py-2 font-medium text-gray-300">{br.name}</td>
                                                                                <td className="px-3 py-2 text-right text-gray-400">
                                                                                    ~{br.growthPct.toFixed(1)}%
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right text-gray-400">{formatNum(br.fact)}</td>
                                                                                <td className="px-3 py-2 text-right text-white font-semibold">{formatNum(br.plan)}</td>
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
                                {metrics.length === 0 && (
                                     <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-500">Нет данных для отображения</td></tr>
                                )}
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
