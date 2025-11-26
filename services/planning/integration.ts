
import { AggregatedDataRow, MapPoint } from '../../types';
import { PlanningEngine } from './engine';

/**
 * Enriches the raw aggregated data with "Smart Plan" calculations.
 * This ensures that the "Analysis Results" table in the AMP module matches the 
 * sophisticated logic used in the RM Dashboard (Market Share, SKU Width, Velocity).
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

    const globalAvgSkuPerClient = globalTotalUniqueClients > 0 ? globalTotalListings / globalTotalUniqueClients : 0;
    const globalAvgSalesPerSku = globalTotalListings > 0 ? globalTotalVolume / globalTotalListings : 0;

    // --- STEP 2: Group Data by RM -> Region ---
    // We need to calculate metrics contextually for each RM in each Region to get the correct "Growth Rate"
    type RegionBucket = {
        fact: number;
        activeClients: Set<string>;
        matchedOkbCoords: number; // Count of matches
        listings: number; // Total SKU connections
    };

    // Map: "RM_Name|Region_Name" -> Bucket
    const buckets = new Map<string, RegionBucket>();
    
    // Also track RM-level stats for the "Acquisition Bonus" logic (Strong RM entering new region)
    const rmStats = new Map<string, { totalFact: number; totalListings: number }>();

    data.forEach(row => {
        const rm = row.rm;
        const region = row.region;
        const key = `${rm}|${region}`;

        // Update RM Stats
        if (!rmStats.has(rm)) rmStats.set(rm, { totalFact: 0, totalListings: 0 });
        const rmStat = rmStats.get(rm)!;
        rmStat.totalFact += row.fact;
        rmStat.totalListings += row.clients.length;

        // Update Region Bucket
        if (!buckets.has(key)) {
            buckets.set(key, {
                fact: 0,
                activeClients: new Set(),
                matchedOkbCoords: 0,
                listings: 0
            });
        }
        const bucket = buckets.get(key)!;
        bucket.fact += row.fact;
        bucket.listings += row.clients.length;
        
        row.clients.forEach(c => {
            if (!bucket.activeClients.has(c.key)) {
                bucket.activeClients.add(c.key);
                // Simple match check based on status or coordinates presence logic from aggregation
                // Assuming clients in row are already active/matched if they came from processing
                // For strictness we can re-check coords, but usually 'active' implies match for our purposes or at least presence.
                // Let's assume if it has lat/lon it's "matched" enough for density calc, 
                // though strictly "matched" implies OKB intersection. 
                // For the engine, we use active count as proxy for match if precise matching info isn't attached to row.
                // Ideally `row.matchedCount` should exist, but we can approximate:
                if (c.lat && c.lon) bucket.matchedOkbCoords++;
            }
        });
    });

    // --- STEP 3: Calculate Rate per Bucket ---
    const rateMap = new Map<string, number>(); // Key: "RM|Region", Value: GrowthPct

    buckets.forEach((bucket, key) => {
        const [rm, region] = key.split('|');
        const rmStat = rmStats.get(rm)!;
        
        // Calculate Metrics
        const activeCount = bucket.activeClients.size;
        const regionAvgSku = activeCount > 0 ? bucket.listings / activeCount : 0;
        const regionAvgVelocity = bucket.listings > 0 ? bucket.fact / bucket.listings : 0;
        
        const rmGlobalVelocity = rmStat.totalListings > 0 ? rmStat.totalFact / rmStat.totalListings : 0;
        
        const totalRegionOkb = globalOkbRegionCounts[region] || 0;

        // Call Engine
        const result = PlanningEngine.calculateRMPlan(
            {
                totalFact: bucket.fact,
                totalPotential: totalRegionOkb, // Use OKB capacity as potential reference
                matchedCount: bucket.matchedOkbCoords, // Use coords count as proxy for matched
                totalRegionOkb: totalRegionOkb,
                avgSku: regionAvgSku,
                avgVelocity: regionAvgVelocity,
                rmGlobalVelocity: rmGlobalVelocity
            },
            {
                baseRate: baseRate,
                globalAvgSku: globalAvgSkuPerClient,
                globalAvgSales: globalAvgSalesPerSku,
                riskLevel: 'low'
            }
        );

        // Special case for 0 fact entry
        let rate = result.growthPct;
        if (bucket.fact === 0 && result.plan > 0) {
            rate = 100; // Marker for new entry
        }

        rateMap.set(key, rate);
    });

    // --- STEP 4: Update Original Rows ---
    // Return a NEW array to avoid mutating state directly in unexpected ways (immutability pattern)
    return data.map(row => {
        const key = `${row.rm}|${row.region}`;
        const rate = rateMap.get(key) || baseRate;
        
        const newPlan = row.fact * (1 + rate / 100);
        const growthAbs = newPlan - row.fact;

        return {
            ...row,
            potential: newPlan, // Overwrite "Potential" with "Smart Plan"
            growthPotential: Math.max(0, growthAbs),
            growthPercentage: rate
        };
    });
}
