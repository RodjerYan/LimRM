
import { AggregatedDataRow, SuggestedAction, ChurnMetric, CoverageMetric, MapPoint, OkbDataRow, ChurnRiskLevel } from '../../types';
import { normalizeAddress } from '../../utils/dataUtils';

// --- HELPERS ---

const parseDateSafe = (dateStr: string): number | null => {
    // Supports YYYY-MM-DD
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.getTime();
};

const getDaysSince = (timestamp: number) => {
    return (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
};

// --- 1. CHURN ENGINE ---

export const calculateChurnMetrics = (clients: MapPoint[]): ChurnMetric[] => {
    const results: ChurnMetric[] = [];

    clients.forEach(client => {
        // We rely on dailyFact for precision. If missing, we can't calculate granular churn.
        if (!client.dailyFact || Object.keys(client.dailyFact).length < 2) return;

        const dates = Object.keys(client.dailyFact)
            .filter(d => d !== 'unknown')
            .map(d => ({ dateStr: d, ts: parseDateSafe(d) }))
            .filter(d => d.ts !== null)
            .sort((a, b) => (a.ts as number) - (b.ts as number));

        if (dates.length < 2) return;

        const lastOrder = dates[dates.length - 1];
        const daysSinceLastOrder = getDaysSince(lastOrder.ts!);

        // Calculate Average Frequency (Gap)
        let totalGap = 0;
        for (let i = 1; i < dates.length; i++) {
            totalGap += (dates[i].ts! - dates[i-1].ts!) / (1000 * 60 * 60 * 24);
        }
        const avgOrderGap = totalGap / (dates.length - 1);

        // Volume Drop Analysis (Last 30 days vs Previous 30 days)
        // Simplified: compare last order value to average order value
        const lastOrderValue = client.dailyFact![lastOrder.dateStr] || 0;
        const totalVolume = Object.values(client.dailyFact!).reduce((a, b) => a + b, 0);
        const avgVolume = totalVolume / dates.length;
        
        let volumeDropPct = 0;
        if (avgVolume > 0 && lastOrderValue < avgVolume) {
            volumeDropPct = ((avgVolume - lastOrderValue) / avgVolume) * 100;
        }

        // --- SCORING LOGIC ---
        let riskScore = 0;

        // 1. Silence Trigger
        if (daysSinceLastOrder > avgOrderGap * 1.5) riskScore += 40;
        if (daysSinceLastOrder > avgOrderGap * 3) riskScore += 20; // Critical silence

        // 2. Volume Drop
        if (volumeDropPct > 30) riskScore += 30;

        // 3. ABC Factor
        if (client.abcCategory === 'A') riskScore += 20; // High value client at risk
        else if (client.abcCategory === 'B') riskScore += 10;

        // Cap at 100
        riskScore = Math.min(100, riskScore);

        let riskLevel: ChurnRiskLevel = 'OK';
        if (riskScore > 80) riskLevel = 'Critical';
        else if (riskScore > 60) riskLevel = 'High';
        else if (riskScore > 30) riskLevel = 'Monitor';

        if (riskLevel !== 'OK') {
            results.push({
                clientId: client.key,
                clientName: client.name,
                address: client.address,
                rm: client.rm,
                riskScore,
                riskLevel,
                daysSinceLastOrder: Math.round(daysSinceLastOrder),
                avgOrderGap: Math.round(avgOrderGap),
                volumeDropPct: Math.round(volumeDropPct),
                fact: client.fact || 0
            });
        }
    });

    return results.sort((a, b) => b.riskScore - a.riskScore);
};


// --- 2. ACTION ENGINE (NBA) ---

export const generateNextBestActions = (
    data: AggregatedDataRow[], 
    churnMetrics: ChurnMetric[]
): SuggestedAction[] => {
    const actions: SuggestedAction[] = [];
    const churnMap = new Map(churnMetrics.map(c => [c.clientId, c]));

    // Iterate through all active clients
    data.forEach(row => {
        row.clients.forEach(client => {
            let priorityScore = 0;
            const churnData = churnMap.get(client.key);

            // 1. CHURN ACTIONS (Highest Priority)
            if (churnData && churnData.riskScore > 50) {
                actions.push({
                    clientId: client.key,
                    clientName: client.name,
                    address: client.address,
                    rm: client.rm,
                    type: 'churn',
                    priorityScore: churnData.riskScore + (client.abcCategory === 'A' ? 20 : 0),
                    reason: `${churnData.daysSinceLastOrder} дн. без заказа (норма ${churnData.avgOrderGap})`,
                    recommendedStep: 'Срочный звонок / Визит. Предложить акцию на возврат.',
                    fact: client.fact || 0,
                    potential: client.potential || 0
                });
                return; // Stop here for this client
            }

            // 2. DATA FIX ACTIONS
            if (!client.lat || !client.lon || client.coordStatus === 'invalid') {
                actions.push({
                    clientId: client.key,
                    clientName: client.name,
                    address: client.address,
                    rm: client.rm,
                    type: 'data_fix',
                    priorityScore: 40 + (client.fact ? Math.min(20, client.fact / 100) : 0),
                    reason: 'Нет координат или адрес не распознан',
                    recommendedStep: 'Исправить адрес вручную в модуле AMP.',
                    fact: client.fact || 0,
                    potential: 0
                });
                // Continue, as we might also want growth
            }

            // 3. ACTIVATION / GROWTH ACTIONS
            const potential = client.potential || (client.fact ? client.fact * 1.2 : 0);
            const gap = Math.max(0, potential - (client.fact || 0));
            const growthPct = (client.fact || 0) > 0 ? (gap / client.fact!) * 100 : 0;

            if (gap > 200 || growthPct > 50) {
                // Determine if Activation (low base) or Growth (high base)
                const type = (client.fact || 0) < 50 ? 'activation' : 'growth';
                
                // Score based on absolute money on table + ease of win (ABC)
                const abcWeight = client.abcCategory === 'A' ? 30 : client.abcCategory === 'B' ? 15 : 0;
                priorityScore = Math.min(80, (gap / 100) * 10 + abcWeight);

                actions.push({
                    clientId: client.key,
                    clientName: client.name,
                    address: client.address,
                    rm: client.rm,
                    type: type,
                    priorityScore,
                    reason: `Потенциал роста +${Math.round(gap)} кг (${Math.round(growthPct)}%)`,
                    recommendedStep: type === 'activation' 
                        ? 'Предложить "Стартовый пакет" или пробную партию.'
                        : 'Расширение ассортимента (Cross-sell).',
                    fact: client.fact || 0,
                    potential: potential
                });
            }
        });
    });

    return actions.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 50); // Limit to top 50
};


// --- 3. COVERAGE ENGINE ---

export const calculateCoverageMetrics = (
    activeClients: MapPoint[],
    okbData: OkbDataRow[],
    okbRegionCounts: { [key: string]: number }
): CoverageMetric[] => {
    // Group Active by Region
    const activeByRegion = new Map<string, number>();
    activeClients.forEach(c => {
        if (c.region) {
            activeByRegion.set(c.region, (activeByRegion.get(c.region) || 0) + 1);
        }
    });

    // OKB Counts provided directly or fallback
    const regions = new Set([...Object.keys(okbRegionCounts), ...activeByRegion.keys()]);
    
    const results: CoverageMetric[] = [];

    regions.forEach(region => {
        if (region === 'Регион не определен') return;

        const activeCount = activeByRegion.get(region) || 0;
        // Use supplied OKB count, or at least active count if data missing
        const okbCount = Math.max(activeCount, okbRegionCounts[region] || 0); 
        
        const coveragePct = okbCount > 0 ? (activeCount / okbCount) * 100 : 0;
        const gap = okbCount - activeCount;

        // Priority Score: 
        // Focus on regions with LOW coverage but HIGH absolute gap
        // Formula: (1 - coverage) * 0.4 + (gap_normalized) * 0.6
        const gapScore = Math.min(100, gap / 5); // 500 points gap = 100 score
        const coverageScore = (100 - coveragePct);
        
        const priorityScore = (coverageScore * 0.4) + (gapScore * 0.6);

        if (okbCount > 5) { // Filter out noise
            results.push({
                region,
                activeCount,
                okbCount,
                coveragePct,
                gap,
                priorityScore
            });
        }
    });

    return results.sort((a, b) => b.priorityScore - a.priorityScore);
};
