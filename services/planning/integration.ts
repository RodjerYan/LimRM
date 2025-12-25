
import { AggregatedDataRow } from '../../types';
import { PlanningEngine } from './engine';
import { normalizeRmNameForMatching } from '../../utils/dataUtils';
import { getMarketData } from '../../utils/marketData';

export function enrichDataWithSmartPlan(
    data: AggregatedDataRow[],
    okbRegionCounts: { [key: string]: number } | null,
    baseRate: number = 15,
    okbCoordSet?: Set<string>
): AggregatedDataRow[] {
    if (!data || data.length === 0) return data;

    const globalOkbRegionCounts = okbRegionCounts || {};
    let globalTotalListings = 0; let globalTotalVolume = 0;
    const allUniqueClientKeys = new Set<string>();

    data.forEach(row => {
        globalTotalVolume += row.fact;
        globalTotalListings += row.clients.length;
        row.clients.forEach(c => allUniqueClientKeys.add(c.key));
    });
    const globalTotalUniqueClients = allUniqueClientKeys.size;
    const globalAvgSkuPerClient = globalTotalUniqueClients > 0 ? globalTotalListings / globalTotalUniqueClients : 0;
    const globalAvgSalesPerSku = globalTotalListings > 0 ? globalTotalVolume / globalTotalListings : 0;

    type RegionContext = {
        activeUniqueClients: Set<string>;
        matchedOkbCoords: number;
        totalOkbCapacity: number;
        rmGlobalListings: number;
        rmGlobalFact: number;
    };

    const regionContextMap = new Map<string, RegionContext>();
    const rmStats = new Map<string, { totalFact: number; totalListings: number }>();

    data.forEach(row => {
        const rm = normalizeRmNameForMatching(row.rm);
        const region = row.region;
        const regKey = `${rm}|${region}`;
        if (!rmStats.has(rm)) rmStats.set(rm, { totalFact: 0, totalListings: 0 });
        const stat = rmStats.get(rm)!; stat.totalFact += row.fact; stat.totalListings += row.clients.length;
        if (!regionContextMap.has(regKey)) regionContextMap.set(regKey, { activeUniqueClients: new Set(), matchedOkbCoords: 0, totalOkbCapacity: globalOkbRegionCounts[region] || 0, rmGlobalListings: 0, rmGlobalFact: 0 });
        const ctx = regionContextMap.get(regKey)!;
        row.clients.forEach(c => {
            if (!ctx.activeUniqueClients.has(c.key)) {
                ctx.activeUniqueClients.add(c.key);
                if (c.lat && c.lon && okbCoordSet) {
                    if (okbCoordSet.has(`${c.lat.toFixed(4)},${c.lon.toFixed(4)}`)) ctx.matchedOkbCoords++;
                } else if (c.lat && c.lon) ctx.matchedOkbCoords++;
            }
        });
    });

    return data.map(row => {
        const rm = normalizeRmNameForMatching(row.rm);
        const region = row.region;
        const regKey = `${rm}|${region}`;
        const ctx = regionContextMap.get(regKey)!;
        const rmStat = rmStats.get(rm)!;
        const brandFact = row.fact;
        const brandListings = row.clients.length;
        const brandVelocity = brandListings > 0 ? brandFact / brandListings : 0;
        const rmGlobalVelocity = rmStat.totalListings > 0 ? rmStat.totalFact / rmStat.totalListings : 0;

        const result = PlanningEngine.calculateRMPlan(
            { totalFact: brandFact, totalPotential: ctx.totalOkbCapacity, matchedCount: ctx.matchedOkbCoords, activeCount: ctx.activeUniqueClients.size, totalRegionOkb: ctx.totalOkbCapacity, avgSku: 1, avgVelocity: brandVelocity, rmGlobalVelocity: rmGlobalVelocity },
            { baseRate, globalAvgSku: globalAvgSkuPerClient, globalAvgSales: globalAvgSalesPerSku, riskLevel: 'low' }
        );

        const market = getMarketData(region);
        return {
            ...row,
            potential: result.plan,
            growthPotential: Math.max(0, result.plan - brandFact),
            growthPercentage: result.growthPct,
            eComShare: market.eComPenetration,
            planMetric: {
                name: `${row.brand}`,
                fact: brandFact,
                plan: result.plan,
                growthPct: result.growthPct,
                factors: result.factors,
                details: result.details
            }
        };
    });
}
