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
    // Удален случайный коэффициент для обеспечения стабильности расчетов
    // const randomVariation = 0.8 + (Math.random() * 0.4);
    // growthRate *= randomVariation;
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

// --- START geminiService ---
let baseUrl = ''; // Will be set by the main thread

const normalizeAddress = (addr: string): string => {
    if (!addr) return '';
    return addr.toLowerCase()
        .replace(/[\s.,-/\\()]/g, '')
        .replace(/^(ул|улица|пр|проспект|пер|переулок|д|дом|к|корпус|кв|квартира|стр|строение|обл|область|рн|район|г|город|пос|поселок)\.?/g, '');
};

async function getMarketPotentialFromGemini(locationName: string) {
    const proxyUrl = baseUrl + '/api/gemini-proxy';
    const prompt = `
        You are a market research expert for the Russian market. Your task is to identify potential business clients for Limkorm, a pet food company.
        For the entire region (oblast, krai, republic) of "${locationName}", Russia, please provide a comprehensive list of potential clients. This includes veterinary clinics, pet stores, and pharmacies that might sell pet supplies across all cities and towns within this region.
        The response MUST be a single, valid JSON object that adheres to the provided schema. Do not include any text, notes, or markdown formatting outside of the JSON object.
        Based on your knowledge and available data, provide the following:
        1. A list of potential clients (\`potentialClients\`) from the entire region. For each client, provide:
            - \`name\`: The name of the business.
            - \`address\`: The full address of the business, including the city/town.
            - \`type\`: The type of business (e.g., "Зоомагазин", "Ветклиника", "Ветаптека").
            - \`lat\`: The geographical latitude.
            - \`lon\`: The geographical longitude.
        2. The total count of all potential clients you found (\`potentialTTs\`). This should be the length of the \`potentialClients\` array.
        3. The central coordinates of the main administrative city of the region "${locationName}" (\`cityCenter\`).
    `;
    const schema = {
        type: 'OBJECT',
        properties: {
            potentialTTs: { type: 'INTEGER', description: 'Общее количество найденных потенциальных торговых точек.' },
            cityCenter: {
                type: 'OBJECT',
                description: 'Центральные географические координаты города.',
                properties: { lat: { type: 'NUMBER' }, lon: { type: 'NUMBER' } },
                required: ['lat', 'lon']
            },
            potentialClients: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        name: { type: 'STRING' }, address: { type: 'STRING' }, type: { type: 'STRING' },
                        lat: { type: 'NUMBER' }, lon: { type: 'NUMBER' }
                    },
                    required: ['name', 'address', 'type', 'lat', 'lon']
                }
            }
        },
        required: ['potentialTTs', 'cityCenter', 'potentialClients']
    };

    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema }
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed for ${locationName}: ${errorText}`);
        }
        const data = await response.json();
        return {
            count: data.potentialTTs || 0,
            clients: data.potentialClients || [],
            cityCenter: data.cityCenter || null,
        };
    } catch (error) {
        console.error('Gemini request failed for ' + locationName + ':', error);
        // FIX: Re-throw the error so the main worker handler can catch it and
        // show a detailed, user-friendly message instead of silently failing.
        throw error;
    }
}

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
// --- END geminiService ---

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
    
    onProgress(30, 'Этап 1: Запрос данных у AI-аналитика...', NaN);

    const enqueue = createRequestQueue(4);
    const potentialMap = new Map();

    const normalizedExistingClients = new Map<string, Set<string>>();
    for (const region in existingClientsByRegion) {
        const normalizedSet = new Set(existingClientsByRegion[region].map(normalizeAddress).filter(Boolean));
        normalizedExistingClients.set(region, normalizedSet);
    }

    const promises = locationArray.map(locationName => enqueue(async () => {
        const totalPotential = await getMarketPotentialFromGemini(locationName);
        
        const existingAddressesSet = normalizedExistingClients.get(locationName) || new Set();

        const newPotentialClients = (totalPotential.clients || []).filter((client: PotentialClient) => {
            const normalizedNewAddress = normalizeAddress(client.address);
            return normalizedNewAddress && !existingAddressesSet.has(normalizedNewAddress);
        });
        
        potentialMap.set(locationName, {
            totalCount: totalPotential.count, // Total market size for growth calculation
            clients: newPotentialClients,    // Filtered list of NEW clients
            cityCenter: totalPotential.cityCenter,
            okb: newPotentialClients.length, // OKB is the count of NEW clients
        });

        processedCount++;
        const etr = calculateEtr(startTime, processedCount, totalLocations);
        onProgress(30 + (processedCount / totalLocations) * 65, `Анализ регионов... (${processedCount}/${totalLocations})`, etr);
    }));

    await Promise.all(promises);
    
    for (const item of initialData) {
        const regionPotential = potentialMap.get(item.city);
        if (regionPotential) {
            const totalMarketTTs = regionPotential.totalCount;
            const growthRate = calculateRealisticGrowthRate(item.fact, totalMarketTTs);
            const potential = item.fact * (1 + growthRate);
            dataWithPotential.push({ 
                ...item, 
                potential, 
                growthPotential: potential - item.fact, 
                growthRate: growthRate * 100, 
                potentialTTs: regionPotential.okb,
                totalMarketTTs: totalMarketTTs, 
                potentialClients: regionPotential.clients, 
                cityCenter: regionPotential.cityCenter 
            });
        } else {
            dataWithPotential.push({ ...item, potential: item.fact, growthPotential: 0, growthRate: 0, potentialTTs: 0, totalMarketTTs: 0, potentialClients: [], cityCenter: null });
        }
    }
    
    return dataWithPotential;
};


// --- WORKER MAIN LOGIC ---
self.onmessage = async (e: MessageEvent<{ 
    processedData: ProcessedDataRow[], 
    uniqueLocations: string[], 
    existingClientsByRegion: Record<string, string[]>,
    baseUrl: string 
}>) => {
    const { processedData, uniqueLocations, existingClientsByRegion, baseUrl: newBaseUrl } = e.data;
    baseUrl = newBaseUrl;

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
        let errorMessage = "Произошла неизвестная ошибка в фоновом обработчике.";
        if (error instanceof Error) {
            if (error.message.toLowerCase().includes('api request failed') || error.message.toLowerCase().includes('failed to fetch')) {
                errorMessage = "Не удалось подключиться к серверу аналитики. Это может быть связано с тем, что изменения в настройках (например, API ключ) еще не применились. Пожалуйста, попробуйте **перезапустить развертывание (Redeploy)** вашего проекта в Vercel и убедитесь, что ваш API ключ действителен в Google AI Studio.";
            } else {
                errorMessage = error.message;
            }
        }
        self.postMessage({ type: 'error', payload: errorMessage });
    }
};