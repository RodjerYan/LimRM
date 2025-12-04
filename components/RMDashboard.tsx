
import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import RMAnalysisModal from './RMAnalysisModal';
import ClientsListModal from './ClientsListModal';
import RegionDetailsModal from './RegionDetailsModal';
import GrowthExplanationModal from './GrowthExplanationModal';
import { AggregatedDataRow, RMMetrics, PlanMetric, OkbDataRow, SummaryMetrics, OkbStatus, MapPoint, PotentialClient } from '../types';
import { ExportIcon, SearchIcon, ArrowLeftIcon, CalculatorIcon } from './icons';
import { findValueInRow, findAddressInRow, normalizeRmNameForMatching } from '../utils/dataUtils';
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

// Internal Modal for Brand Packaging Breakdown
const BrandPackagingModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    brandMetric: PlanMetric | null;
    onExplain: (metric: PlanMetric) => void;
}> = ({ isOpen, onClose, brandMetric, onExplain }) => {
    if (!brandMetric || !brandMetric.packagingDetails) return null;

    const rows = brandMetric.packagingDetails;
    const totalFact = rows.reduce((sum, r) => sum + r.fact, 0);
    const totalPlan = rows.reduce((sum, r) => sum + (r.planMetric?.plan || 0), 0);

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Детализация: ${brandMetric.name}`} 
            maxWidth="max-w-4xl"
            zIndex="z-[50]" // Standard level
        >
            <div className="space-y-4">
                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 flex justify-between items-center text-sm text-gray-300">
                    <div>Всего фасовок: <span className="text-white font-bold">{rows.length}</span></div>
                    <div>Общий Факт: <span className="text-emerald-400 font-mono font-bold">{new Intl.NumberFormat('ru-RU').format(totalFact)}</span></div>
                    <div>Общий План: <span className="text-white font-mono font-bold">{new Intl.NumberFormat('ru-RU').format(totalPlan)}</span></div>
                </div>
                
                <div className="overflow-x-auto rounded-lg border border-gray-700">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-800 text-gray-400 font-semibold sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Фасовка</th>
                                <th className="px-4 py-3 text-right">Инд. Рост</th>
                                <th className="px-4 py-3 text-right">Факт</th>
                                <th className="px-4 py-3 text-right">План 2026</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-gray-900/30 text-gray-300">
                            {rows.map((row) => {
                                const growthPct = row.planMetric?.growthPct || 0;
                                const plan = row.planMetric?.plan || 0;
                                return (
                                    <tr key={row.key} className="hover:bg-indigo-500/10 transition-colors">
                                        <td className="px-4 py-3 font-medium text-white">{row.packaging}</td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {row.planMetric ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onExplain(row.planMetric!);
                                                    }}
                                                    className={`font-bold hover:underline decoration-dotted underline-offset-4 decoration-2 ${growthPct > 0 ? 'text-emerald-400 decoration-emerald-500/50' : 'text-amber-400 decoration-amber-500/50'} hover:text-white transition-colors cursor-pointer`}
                                                    title="Нажмите для обоснования процента роста именно этой фасовки"
                                                >
                                                    {growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}%
                                                </button>
                                            ) : (
                                                <span className="text-gray-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-gray-400">
                                            {new Intl.NumberFormat('ru-RU').format(row.fact)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-white font-bold">
                                            {new Intl.NumberFormat('ru-RU').format(plan)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
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

    // --- Region Details Modal State ---
    const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
    const [selectedRegionDetails, setSelectedRegionDetails] = useState<{
        rmName: string;
        regionName: string;
        activeClients: MapPoint[];
        potentialClients: PotentialClient[];
    } | null>(null);

    // --- Growth Explanation Modal States ---
    // 1. General Explanation (Brand Level or Region Level from Main Table)
    const [explanationData, setExplanationData] = useState<PlanMetric | null>(null);
    
    // 2. Specific Packaging Explanation (Stacked on top of Brand Modal)
    const [packagingExplanationData, setPackagingExplanationData] = useState<PlanMetric | null>(null);

    // --- Brand Packaging Modal State ---
    const [selectedBrandForDetails, setSelectedBrandForDetails] = useState<PlanMetric | null>(null);
    const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);

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
            regBucket.brandClientCounts.set(brandName, (regBucket.brandClientCounts.get(brandName) || 0) + row.clients.length);
            
            if (!regBucket.brandRows.has(brandName)) regBucket.brandRows.set(brandName, []);
            regBucket.brandRows.get(brandName)!.push(row);
        });

        const missingRegionNames = new Set<string>();
        const resultMetrics: RMMetrics[] = [];

        // --- STEP 3: Final Calculation ---
        rmBuckets.forEach((rmData, normRmKey) => {
            const regionMetrics: PlanMetric[] = [];
            const brandAggregates = new Map<string, { fact: number, plan: number }>();

            let rmTotalOkbRaw = 0;
            let rmTotalMatched = 0;
            let rmTotalCalculatedPlan = 0;
            let rmTotalPotentialFile = 0;
            
            const rmUniqueClientsCount = rmData.uniqueClientKeys.size;
            const rmGlobalAvgVelocity = rmData.totalListings > 0 ? rmData.totalFact / rmData.totalListings : 0;
            const rmAvgSkuPerClient = rmUniqueClientsCount > 0 ? rmData.totalListings / rmUniqueClientsCount : 0;

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

                const marketShare = totalRegionOkb > 0 ? (matchedCount / totalRegionOkb) : NaN;

                regionMetrics.push({
                    name: regionKey,
                    fact: regData.fact,
                    plan: regionCalculatedPlan,
                    growthPct: regionGrowthPct,
                    marketShare: !Number.isNaN(marketShare) ? marketShare * 100 : NaN,
                    activeCount: matchedCount,
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
                avgSalesPerSku: rmGlobalAvgVelocity, 
                globalAvgSku: globalAvgSkuPerClient,
                globalAvgSalesSku: globalAvgSalesPerSku
            };

            resultMetrics.push(extendedMetrics as unknown as RMMetrics);
        });

        (resultMetrics as any).__missingOkbRegions = Array.from(missingRegionNames.values());
        return resultMetrics.sort((a, b) => b.totalFact - a.totalFact);

    }, [data, okbRegionCounts, okbData, baseRate]);

    const handleExplainBrandDetails = (metric: PlanMetric) => {
        setPackagingExplanationData(metric);
    };

    const renderDashboardContent = () => (
        <div className="space-y-6">
            {metricsData.map(rm => (
                <div key={rm.rmName} className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700 shadow-xl transition-all hover:border-gray-600">
                    {/* RM Card Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-700 pb-4 mb-4 gap-4">
                        <div className="flex items-center gap-4">
                            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
                                {rm.rmName.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white tracking-tight">{rm.rmName}</h3>
                                <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        Факт: {new Intl.NumberFormat('ru-RU').format(rm.totalFact)}
                                    </span>
                                    <span className="w-px h-3 bg-gray-600"></span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                        План: {new Intl.NumberFormat('ru-RU').format(rm.nextYearPlan)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setSelectedRMForAnalysis(rm);
                                    setIsAnalysisModalOpen(true);
                                }}
                                className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <CalculatorIcon small />
                                Анализ эффективности
                            </button>
                        </div>
                    </div>

                    {/* Regions Detail Table */}
                    <div className="grid grid-cols-1 gap-6">
                        {rm.regions.map(region => (
                            <div key={region.name} className="bg-gray-800/30 rounded-xl border border-gray-700/50 overflow-hidden">
                                <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
                                    <h4 className="font-bold text-white flex items-center gap-2">
                                        {region.name}
                                        <span className={`text-xs px-2 py-0.5 rounded ${region.growthPct > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                            {region.growthPct > 0 ? '+' : ''}{region.growthPct.toFixed(1)}%
                                        </span>
                                    </h4>
                                    <div className="text-xs text-gray-400">
                                        Доля рынка: <span className="text-white font-mono">{region.marketShare ? region.marketShare.toFixed(1) + '%' : 'н/д'}</span>
                                    </div>
                                </div>
                                
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-900/30 border-b border-gray-700">
                                            <tr>
                                                <th className="px-4 py-3">Бренд</th>
                                                <th className="px-4 py-3 text-right">Инд. Рост</th>
                                                <th className="px-4 py-3 text-right">Факт</th>
                                                <th className="px-4 py-3 text-right">План 2026</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700/30 text-gray-300">
                                            {region.brands?.map((brand) => (
                                                <tr key={brand.name} className="hover:bg-indigo-500/5 transition-colors group">
                                                    <td className="px-4 py-2.5 font-medium text-white">
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedBrandForDetails(brand);
                                                                setIsBrandModalOpen(true);
                                                            }}
                                                            className="hover:text-accent hover:underline decoration-dotted underline-offset-4 decoration-2 transition-all flex items-center gap-2"
                                                            title="Нажмите для детализации по фасовке"
                                                        >
                                                            {brand.name}
                                                            <ArrowLeftIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity transform rotate-180 text-accent" />
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-mono">
                                                        <button 
                                                            onClick={() => setExplanationData(brand)}
                                                            className={`font-bold hover:underline decoration-dotted underline-offset-4 decoration-2 ${brand.growthPct > 0 ? 'text-emerald-400 decoration-emerald-500/50' : 'text-amber-400 decoration-amber-500/50'} hover:text-white transition-colors cursor-pointer`}
                                                            title="Нажмите для обоснования процента"
                                                        >
                                                            {brand.growthPct > 0 ? '+' : ''}{brand.growthPct.toFixed(1)}%
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-mono text-gray-400">
                                                        {new Intl.NumberFormat('ru-RU').format(brand.fact)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-mono text-white font-bold">
                                                        {new Intl.NumberFormat('ru-RU').format(brand.plan)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <>
            {mode === 'modal' ? (
                <Modal isOpen={isOpen} onClose={onClose} title="Панель Региональных Менеджеров" maxWidth="max-w-[95vw]">
                    {renderDashboardContent()}
                </Modal>
            ) : (
                renderDashboardContent()
            )}

            {/* --- MODALS STACK --- */}

            {/* 1. Brand Packaging Breakdown (Z-50) */}
            <BrandPackagingModal 
                isOpen={isBrandModalOpen}
                onClose={() => setIsBrandModalOpen(false)}
                brandMetric={selectedBrandForDetails}
                onExplain={handleExplainBrandDetails}
            />

            {/* 2. Specific Packaging Explanation (Z-60 - Stacked on top) */}
            {packagingExplanationData && (
                <GrowthExplanationModal
                    isOpen={!!packagingExplanationData}
                    onClose={() => setPackagingExplanationData(null)}
                    data={packagingExplanationData}
                    baseRate={baseRate}
                />
            )}

            {/* 3. Generic/Region Explanation (Legacy) */}
            {explanationData && (
                <GrowthExplanationModal
                    isOpen={!!explanationData}
                    onClose={() => setExplanationData(null)}
                    data={explanationData}
                    baseRate={baseRate}
                />
            )}
            
            {/* 4. RM Analysis */}
            <RMAnalysisModal 
                isOpen={isAnalysisModalOpen}
                onClose={() => setIsAnalysisModalOpen(false)}
                rmData={selectedRMForAnalysis}
                baseRate={baseRate}
            />
        </>
    );
};

export default RMDashboard;
