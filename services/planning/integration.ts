
import { AggregatedDataRow } from '../../types';
import { PlanningEngine } from './engine';
import { normalizeRmNameForMatching } from '../../utils/dataUtils';

/**
 * Enriches the raw aggregated data with "Smart Plan" calculations.
 * Ensures differentiation between brands within the same region based on their individual performance (Velocity).
 */
export function enrichDataWithSmartPlan(
    data: AggregatedDataRow[],
    okbRegionCounts: { [key: string]: number } | null,
    baseRate: number = 15,
    okbCoordSet?: Set<string>
): AggregatedDataRow[] {
    if (!data || data.length === 0) return data;

    const globalOkbRegionCounts = okbRegionCounts || {};

    // --- STEP 1: Global Benchmarks (Company Wide) ---
    let globalTotalListings = 0;
    let globalTotalVolume = 0;
    const allUniqueClientKeys = new Set<string>();

    data.forEach(row => {
        globalTotalVolume += row.fact;
        globalTotalListings += row.clients.length;
        row.clients.forEach(c => allUniqueClientKeys.add(c.key));
    });
    const globalTotalUniqueClients = allUniqueClientKeys.size;

    // Calculate Global Averages
    const globalAvgSkuPerClient = globalTotalUniqueClients > 0 ? globalTotalListings / globalTotalUniqueClients : 0;
    const globalAvgSalesPerSku = globalTotalListings > 0 ? globalTotalVolume / globalTotalListings : 0;

    // --- STEP 2: Region Level Aggregation (Context) ---
    type RegionContext = {
        activeUniqueClients: Set<string>;
        matchedOkbCoords: number;
        totalOkbCapacity: number;
    };

    const regionContextMap = new Map<string, RegionContext>(); // Key: "RM|Region"
    const rmStats = new Map<string, { totalFact: number; totalListings: number }>();

    data.forEach(row => {
        const rm = normalizeRmNameForMatching(row.rm);
        const region = row.region;
        const regKey = `${rm}|${region}`;

        if (!rmStats.has(rm)) rmStats.set(rm, { totalFact: 0, totalListings: 0 });
        const stat = rmStats.get(rm)!;
        stat.totalFact += row.fact;
        stat.totalListings += row.clients.length;

        if (!regionContextMap.has(regKey)) {
            regionContextMap.set(regKey, {
                activeUniqueClients: new Set(),
                matchedOkbCoords: 0,
                totalOkbCapacity: globalOkbRegionCounts[region] || 0
            });
        }
        const ctx = regionContextMap.get(regKey)!;
        
        row.clients.forEach(c => {
            if (!ctx.activeUniqueClients.has(c.key)) {
                ctx.activeUniqueClients.add(c.key);
                if (c.lat && c.lon) {
                    if (okbCoordSet) {
                        const hash = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
                        if (okbCoordSet.has(hash)) {
                            ctx.matchedOkbCoords++;
                        }
                    } else {
                        ctx.matchedOkbCoords++;
                    }
                }
            }
        });
    });

    // --- STEP 3: Row (Brand/Packaging) Level Calculation ---
    return data.map(row => {
        const rm = normalizeRmNameForMatching(row.rm);
        const region = row.region;
        const regKey = `${rm}|${region}`;
        const ctx = regionContextMap.get(regKey)!;
        const rmStat = rmStats.get(rm)!;

        const brandFact = row.fact;
        const brandListings = row.clients.length;
        const brandVelocity = brandListings > 0 ? brandFact / brandListings : 0;
        const brandAvgSku = 1; 
        const rmGlobalVelocity = rmStat.totalListings > 0 ? rmStat.totalFact / rmStat.totalListings : 0;

        const result = PlanningEngine.calculateRMPlan(
            {
                totalFact: brandFact,
                totalPotential: ctx.totalOkbCapacity, 
                matchedCount: ctx.matchedOkbCoords,
                activeCount: ctx.activeUniqueClients.size,
                totalRegionOkb: ctx.totalOkbCapacity,
                avgSku: brandAvgSku,
                avgVelocity: brandVelocity,
                rmGlobalVelocity: rmGlobalVelocity
            },
            {
                baseRate: baseRate,
                globalAvgSku: globalAvgSkuPerClient,
                globalAvgSales: globalAvgSalesPerSku,
                riskLevel: 'low'
            }
        );

        let rate = result.growthPct;
        if (brandFact === 0 && result.plan > 0) {
            rate = 100; 
        }

        const newPlan = brandFact * (1 + rate / 100);
        const growthAbs = newPlan - brandFact;

        return {
            ...row,
            potential: newPlan,
            growthPotential: Math.max(0, growthAbs),
            growthPercentage: rate,
            planMetric: {
                name: `${row.brand} (${row.packaging})`,
                fact: brandFact,
                plan: newPlan,
                growthPct: rate,
                factors: result.factors,
                details: result.details
            }
        };
    });
}
