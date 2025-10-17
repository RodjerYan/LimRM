
/// <reference lib="webworker" />

// NOTE: Types are self-contained here to avoid complex worker bundling configurations.
interface PotentialClient {
    name: string;
    address: string;
    type: string;
    lat?: number;
    lon?: number;
}

interface ProcessedDataRow {
    rm: string;
    brand: string;
    city: string; // This is now the region
    fact: number;
    fullAddress: string;
    potential?: number;
    growthPotential?: number;
    growthRate?: number;
    potentialTTs?: number; // This will be the count of NEW clients (OKB)
    totalMarketTTs?: number;
    potentialClients?: PotentialClient[];
    cityCenter?: { lat: number; lon: number; };
    activeTT?: number; // Added for aggregation
}

// --- START timeUtils ---
function formatTime(seconds: number) {
    if (isNaN(seconds) || seconds <= 0 || !isFinite(seconds)) {
        return '';
    }
    if (seconds < 1) {
        return 'Осталось менее секунды';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    let result = '~';
    if (minutes > 0) {
        result += ' ' + minutes + ' мин';
    }
    if (remainingSeconds > 0) {
        result += ' ' + remainingSeconds + ' сек';
    }
    return 'Осталось ' + result.trim();
}
function calculateEtr(startTime: number, done: number, total: number) {
    if (done === 0) return Infinity;
    const elapsedTime = (Date.now() - startTime) / 1000;
    const timePerItem = elapsedTime / done;
    const remainingItems = total - done;
    return timePerItem * remainingItems;
}
// --- END timeUtils ---

// --- START dataUtils ---
const MIN_GROWTH_RATE = 0.05;
const MAX_GROWTH_RATE = 0.80;
const BASE_GROWTH_RATE = 0.15;
function calculateRealisticGrowthRate(fact: number, potentialTTs: number) {
    let growthRate = BASE_GROWTH_RATE;
    const saturationFactor = Math.max(0.1, 1 - (fact / 10000));
    growthRate *= saturationFactor;
    let cityMultiplier = 1.0;
    if (potentialTTs <= 10) cityMultiplier = 1.0;
    else if (potentialTTs <= 30) cityMultiplier = 1.3;
    else if (potentialTTs <= 100) cityMultiplier = 1.6;
    else cityMultiplier = 2.0;
    growthRate *= cityMultiplier;
    return Math.max(MIN_GROWTH_RATE, Math.min(growthRate, MAX_GROWTH_RATE));
}

function aggregateData(data: ProcessedDataRow[]) {
    const aggregationMap = new Map();
    const cityPotentialMap = new Map();

    const seenSettlements = new Set();
    data.forEach(item => {
        if (item.city && !seenSettlements.has(item.city)) {
            cityPotentialMap.set(item.city, { 
                potentialTTs: item.potentialTTs || 0,
                totalMarketTTs: item.totalMarketTTs || 0, 
                potentialClients: item.potentialClients || [], 
                cityCenter: item.cityCenter 
            });
            seenSettlements.add(item.city);
        }
    });

    data.forEach(item => {
        const key = `${item.rm}|${item.brand}|${item.city}`;
        if (!aggregationMap.has(key)) {
            const potentials = cityPotentialMap.get(item.city) || { potentialTTs: 0, totalMarketTTs: 0, potentialClients: [], cityCenter: null };
            aggregationMap.set(key, {
                rm: item.rm,
                brand: item.brand,
                city: item.city,
                fact: 0,
                potential: 0,
                growthPotential: 0,
                growthRateSum: 0,
                count: 0,
                potentialTTs: potentials.potentialTTs,
                totalMarketTTs: potentials.totalMarketTTs,
                potentialClients: potentials.potentialClients,
                cityCenter: potentials.cityCenter,
                addresses: new Set<string>(),
            });
        }
        const current = aggregationMap.get(key);
        current.fact += item.fact;
        current.potential += item.potential;
        current.growthPotential += item.growthPotential;
        current.growthRateSum += item.growthRate;
        current.count += 1;
        if (item.fullAddress) {
            current.addresses.add(item.fullAddress);
        }
    });

    return Array.from(aggregationMap.values()).map(item => {
        const uniqueClients = Array.from(new Map(item.potentialClients.map((c: PotentialClient) => [
            c.lat && c.lon ? `${c.lat},${c.lon}` : `${c.name}-${c.address}`, 
            c
        ])).values());

        return {
            rm: item.rm,
            brand: item.brand,
            city: item.city,
            fact: item.fact,
            potential: item.potential,
            growthPotential: item.growthPotential,
            potentialTTs: item.potentialTTs,
            totalMarketTTs: item.totalMarketTTs,
            potentialClients: uniqueClients,
            cityCenter: item.cityCenter,
            growthRate: item.count > 0 ? (item.growthRateSum / item.count) : 0,
            activeTT: item.addresses.size,
        };
    });
}
// --- END dataUtils ---

// --- START OSM Service (Worker Side) ---
function createRequestQueue(concurrency: number) {
    const queue: any[] = []; let activeRequests = 0;
    function processQueue() {
        if (activeRequests >= concurrency || queue.length === 0) return;
        activeRequests++;
        const { task, resolve, reject } = queue.shift();
        task().then(resolve).catch(reject)
            .finally(() => { activeRequests--; processQueue(); });
    }
    return function enqueue(task: () => Promise<any>) {
        return new Promise((resolve, reject) => {
            queue.push({ task, resolve, reject });
            processQueue();
        });
    };
}

const calculateRealisticPotential = async (
    initialData: ProcessedDataRow[], 
    locationArray: string[], 
    existingClientsByRegion: Record<string, string[]>,
    onProgress: (progress: number, text: string, etr: number) => void
) => {
    const dataWithPotential: ProcessedDataRow[] = [];
    const totalLocations = locationArray.length;
    let processedCount = 0;
    const startTime = Date.now();
    const potentialMap = new Map();
    const enqueue = createRequestQueue(5); // Concurrency control for API calls

    onProgress(30, `Анализ регионов... (0/${totalLocations})`, Infinity);

    const analysisPromises = locationArray.map(locationName => enqueue(async () => {
        try {
            // Call the new stateless analysis endpoint
            const response = await fetch('/api/osm-proxy', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    locationName,
                    existingClients: existingClientsByRegion[locationName] || []
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({error: 'Unknown error during analysis'}));
                throw new Error(`Analysis failed for ${locationName}: ${error.error}`);
            }

            const result = await response.json();
            potentialMap.set(locationName, result);

        } catch (error) {
            console.error(`Error analyzing ${locationName}:`, error);
            // Set default values on error so the process can continue
            potentialMap.set(locationName, { totalMarketCount: 0, newClients: [], okbCount: 0, cityCenter: null });
        } finally {
            processedCount++;
            const etr = calculateEtr(startTime, processedCount, totalLocations);
            onProgress(30 + (processedCount / totalLocations) * 65, `Анализ регионов... (${processedCount}/${totalLocations})`, etr);
        }
    }));
    
    await Promise.all(analysisPromises);
    
    // Process data with the fetched potentials
    for (const item of initialData) {
        const regionPotential = potentialMap.get(item.city);
        if (regionPotential) {
            const growthRate = calculateRealisticGrowthRate(item.fact, regionPotential.totalMarketCount);
            const potential = item.fact * (1 + growthRate);
            dataWithPotential.push({ 
                ...item, 
                potential, 
                growthPotential: potential - item.fact, 
                growthRate: growthRate * 100, 
                potentialTTs: regionPotential.okbCount,
                totalMarketTTs: regionPotential.totalMarketCount, 
                potentialClients: regionPotential.newClients, 
                cityCenter: regionPotential.cityCenter 
            });
        } else {
            // Fallback for failed requests
            dataWithPotential.push({ ...item, potential: item.fact, growthPotential: 0, growthRate: 0, potentialTTs: 0, totalMarketTTs: 0, potentialClients: [], cityCenter: null });
        }
    }
    
    return dataWithPotential;
};


// --- WORKER MAIN LOGIC ---
self.onmessage = async (e: MessageEvent<{ 
    processedData: ProcessedDataRow[], 
    uniqueLocations: string[], 
    existingClientsByRegion: Record<string, string[]>
}>) => {
    const { processedData, uniqueLocations, existingClientsByRegion } = e.data;

    try {
        const locationCount = uniqueLocations.length;
        self.postMessage({ type: 'progress', payload: { status: 'fetching', progress: 30, text: `Найдено ${locationCount} уникальных регионов. Запрос данных...`, etr: '' } });
        
        if (locationCount === 0) {
            self.postMessage({ type: 'error', payload: "В файле не найдено локаций для анализа. Проверьте данные." });
            return;
        }
        
        const onProgress = (progress: number, text: string, etr: number) => {
            self.postMessage({ type: 'progress', payload: { status: 'fetching', progress, text, etr: formatTime(etr) } });
        };
        
        const dataWithPotential = await calculateRealisticPotential(processedData, uniqueLocations, existingClientsByRegion, onProgress);
        
        self.postMessage({ type: 'progress', payload: { status: 'aggregating', progress: 95, text: 'Агрегация результатов...', etr: '' } });
        const finalAggregatedData = aggregateData(dataWithPotential);
        self.postMessage({ type: 'result', payload: finalAggregatedData });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Произошла неизвестная ошибка в фоновом обработчике.";
        self.postMessage({ type: 'error', payload: errorMessage });
    }
};
