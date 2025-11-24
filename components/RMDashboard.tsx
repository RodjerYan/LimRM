import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import { AggregatedDataRow, RMMetrics, OkbDataRow, PlanMetric } from '../types';
import { findValueInRow, findAddressInRow } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    okbData: OkbDataRow[];
}

const BASE_GROWTH_RATE = 13.0; // Base 13%

const normalizeRmNameForMatching = (str: string) => {
    if (!str) return '';
    let clean = str.toLowerCase().trim();
    const surname = clean.split(/[\s.]+/)[0];
    return surname.replace(/[^a-zа-я0-9]/g, '');
};

const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, okbData }) => {
    const [selectedRMForAnalysis, setSelectedRMForAnalysis] = useState<RMMetrics | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [expandedRM, setExpandedRM] = useState<string | null>(null);

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const metrics = useMemo<RMMetrics[]>(() => {
        // Index OKB Data BY REGION — using the same core logic as the worker
        const globalOkbRegionCounts = new Map<string, number>();

        okbData.forEach(row => {
            const address = findAddressInRow(row);
            const distributor = findValueInRow(row, ['дистрибьютор']);

            let parsed = { region: 'Регион не определен' } as any;
            try {
                parsed = parseRussianAddress(address || '', distributor) || parsed;
            } catch (e) {
                // parser may fail on dirty input, ignore
            }

            const region = parsed.region || 'Регион не определен';

            if (region !== 'Регион не определен') {
                const norm = region.trim();
                globalOkbRegionCounts.set(norm, (globalOkbRegionCounts.get(norm) || 0) + 1);
            }
        });

        // RM aggregation
        type RegionBucket = {
            fact: number;
            potential: number;
            activeClients: Set<string>;
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

            // Trust the region from the worker. Do not re-process it.
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
                    brandFacts: new Map(),
                    originalRegionName: row.region
                });
            }
            const regBucket = rmBucket.regions.get(regionKey)!;

            regBucket.fact += row.fact;
            regBucket.potential += row.potential || 0;

            if (row.clients) row.clients.forEach(c => regBucket.activeClients.add(c.key));

            const brandName = row.brand || 'No Brand';
            regBucket.brandFacts.set(brandName, (regBucket.brandFacts.get(brandName) || 0) + row.fact);
        });

        // Track globally which regions from RM have no OKB entries (for diagnostics)
        const missingRegionNames = new Set<string>();

        const resultMetrics: RMMetrics[] = [];

        rmBuckets.forEach((rmData, normRmKey) => {
            const regionMetrics: PlanMetric[] = [];
            const brandAggregates = new Map<string, { fact: number, plan: number }>();

            let rmTotalOkb = 0; // sum of OKB counts for regions where OKB exists
            let rmTotalClients = 0;
            let rmTotalCalculatedPlan = 0;
            let rmTotalPotentialFile = 0;

            rmData.regions.forEach((regData, regionKey) => {
                const activeCount = regData.activeClients.size;
                rmTotalClients += activeCount;
                rmTotalPotentialFile += regData.potential;

                let totalRegionOkb = 0;
                const exact = globalOkbRegionCounts.get(regionKey);
                if (exact) {
                    totalRegionOkb = exact;
                } else {
                    const fuzzyKey = Array.from(globalOkbRegionCounts.keys()).find(k => k.toLowerCase() === regionKey.toLowerCase());
                    if (fuzzyKey) totalRegionOkb = globalOkbRegionCounts.get(fuzzyKey)!;
                }

                if (totalRegionOkb === 0 && regionKey !== 'Регион не определен') {
                    missingRegionNames.add(regionKey);
                }

                rmTotalOkb += totalRegionOkb;

                // **CRITICAL CHANGE**: Do not cap market share at 100%.
                let marketShare = 0;
                if (totalRegionOkb > 0) {
                    marketShare = activeCount / totalRegionOkb;
                }
                
                // The plan calculation logic is robust to marketShare > 1
                const sensitivity = 20;
                let adjustment = (0.4 - marketShare) * sensitivity;
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
                    marketShare: totalRegionOkb > 0 ? marketShare * 100 : NaN,
                    activeCount: activeCount,
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

            const weightedShare = rmTotalOkb > 0 ? (rmTotalClients / rmTotalOkb) * 100 : NaN;

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

        (resultMetrics as any).__missingOkbRegions = Array.from(missingRegionNames.values());

        return resultMetrics.sort((a, b) => b.totalFact - a.totalFact);

    }, [data, okbData]);

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
                        {okbData.length === 0 && (
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
                            <tbody className="divide-y divide-gray-700">
                                {metrics.map(rm => {
                                    const isExpanded = expandedRM === rm.rmName;
                                    const shareValue = Number.isNaN(rm.marketShare) ? null : rm.marketShare;
                                    
                                    let shareColor = 'text-emerald-400'; // default for good share
                                    if (shareValue === null) {
                                        shareColor = 'text-yellow-300'; // unknown
                                    } else if (shareValue > 100) {
                                        shareColor = 'text-red-400 font-bold'; // ERROR
                                    } else if (shareValue < 10) {
                                        shareColor = 'text-red-400'; // Very low
                                    } else if (shareValue < 40) {
                                        shareColor = 'text-yellow-400'; // Low
                                    }

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
                                                    <span className="text-white">{rm.totalClients}</span>
                                                    <span className="mx-1">/</span>
                                                    <span>{rm.totalOkbCount > 0 ? formatNum(rm.totalOkbCount) : '?'}</span>
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
                                                                            <th className="px-3 py-2 text-right">Доля рынка</th>
                                                                            <th className="px-3 py-2 text-right">Рост (%)</th>
                                                                            <th className="px-3 py-2 text-right">Факт</th>
                                                                            <th className="px-3 py-2 text-right">План {nextYear}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-700/50 text-gray-300">
                                                                        {rm.regions.map(reg => {
                                                                            const regShare = reg.marketShare ?? NaN;
                                                                            const regShareKnown = !Number.isNaN(regShare);
                                                                            const regGrowthColor = reg.growthPct > BASE_GROWTH_RATE ? 'text-emerald-400' : 'text-amber-400';
                                                                            
                                                                            let regShareColor = 'text-gray-400';
                                                                            if (!regShareKnown) {
                                                                                regShareColor = 'text-yellow-300';
                                                                            } else if (regShare > 100) {
                                                                                regShareColor = 'text-red-400 font-bold';
                                                                            } else if (regShare < 40) {
                                                                                regShareColor = 'text-indigo-300';
                                                                            }

                                                                            return (
                                                                                <tr key={reg.name} className="hover:bg-gray-700/20">
                                                                                    <td className="px-3 py-2">{reg.name}</td>
                                                                                    <td className={`px-3 py-2 text-right font-mono ${regShareColor}`}>
                                                                                        {regShareKnown ? `${reg.activeCount}/${reg.totalCount} (${reg.marketShare?.toFixed(0)}%)` : `${reg.activeCount}/? (неизв.)`}
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