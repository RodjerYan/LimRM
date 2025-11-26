
import { AggregatedDataRow, MapPoint } from '../../types';
import { PlanningEngine } from './engine';

/**
 * Enriches the raw aggregated data with "Smart Plan" calculations.
 * Ensures differentiation between brands within the same region based on their individual performance (Velocity).
 */
export function enrichDataWithSmartPlan(
    data: AggregatedDataRow[],
    okbRegionCounts: { [key: string]: number } | null,
    baseRate: number = 15
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
    // We first need to know the total active clients in the region to calculate Market Share.
    // This applies to all brands in that region equally.
    type RegionContext = {
        activeUniqueClients: Set<string>;
        matchedOkbCoords: number;
        totalOkbCapacity: number;
        rmGlobalListings: number; // For acquisition bonus logic
        rmGlobalFact: number;
    };

    const regionContextMap = new Map<string, RegionContext>(); // Key: "RM|Region"
    const rmStats = new Map<string, { totalFact: number; totalListings: number }>();

    data.forEach(row => {
        const rm = row.rm;
        const region = row.region;
        const regKey = `${rm}|${region}`;

        // 2.1 Update RM Global Stats
        if (!rmStats.has(rm)) rmStats.set(rm, { totalFact: 0, totalListings: 0 });
        const stat = rmStats.get(rm)!;
        stat.totalFact += row.fact;
        stat.totalListings += row.clients.length;

        // 2.2 Update Region Context
        if (!regionContextMap.has(regKey)) {
            regionContextMap.set(regKey, {
                activeUniqueClients: new Set(),
                matchedOkbCoords: 0,
                totalOkbCapacity: globalOkbRegionCounts[region] || 0,
                rmGlobalListings: 0,
                rmGlobalFact: 0
            });
        }
        const ctx = regionContextMap.get(regKey)!;
        
        row.clients.forEach(c => {
            if (!ctx.activeUniqueClients.has(c.key)) {
                ctx.activeUniqueClients.add(c.key);
                // Approximate matching logic for share calculation
                if (c.lat && c.lon) ctx.matchedOkbCoords++;
            }
        });
    });

    // --- STEP 3: Row (Brand) Level Calculation ---
    return data.map(row => {
        const rm = row.rm;
        const region = row.region;
        const regKey = `${rm}|${region}`;
        const ctx = regionContextMap.get(regKey)!;
        const rmStat = rmStats.get(rm)!;

        // Brand Specific Metrics
        const brandFact = row.fact;
        const brandListings = row.clients.length; // Number of clients buying THIS brand
        const brandUniqueClients = new Set(row.clients.map(c => c.key)).size;

        // 3.1 Calculate Brand Velocity (Kg per Point for this brand)
        const brandVelocity = brandListings > 0 ? brandFact / brandListings : 0;

        // 3.2 Calculate Brand Width (Saturation within its own clients)
        // If row represents a single brand, AvgSku is typically 1. 
        // If it's a category row, it might be higher. Assuming 1 for single brand rows.
        const brandAvgSku = 1; 

        // 3.3 Calculate RM Global Velocity (Proxy for acquisition potential)
        const rmGlobalVelocity = rmStat.totalListings > 0 ? rmStat.totalFact / rmStat.totalListings : 0;

        // 3.4 Call Engine for this specific Brand
        const result = PlanningEngine.calculateRMPlan(
            {
                totalFact: brandFact,
                // For a single brand, "potential" is hard to define without external data.
                // We rely on the engine's growth logic relative to the Region's capacity.
                totalPotential: ctx.totalOkbCapacity, 
                
                // REGIONAL Context (Shared)
                matchedCount: ctx.matchedOkbCoords,
                totalRegionOkb: ctx.totalOkbCapacity,
                
                // BRAND Specifics
                avgSku: brandAvgSku,
                avgVelocity: brandVelocity, // Crucial: Use this brand's velocity
                
                // Fallback
                rmGlobalVelocity: rmGlobalVelocity
            },
            {
                baseRate: baseRate,
                globalAvgSku: globalAvgSkuPerClient,
                globalAvgSales: globalAvgSalesPerSku,
                riskLevel: 'low'
            }
        );

        // Special case for new entry logic
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
            growthPercentage: rate
        };
    });
}
