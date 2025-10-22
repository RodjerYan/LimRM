import { OKBDataRow, AggregatedDataRow, PotentialClient } from '../types';

// --- Helper Functions ---
const normalizeString = (str: string | undefined): string => {
    if (!str) return '';
    return str.toLowerCase().trim();
};

const MIN_GROWTH_RATE = 0.05;
const MAX_GROWTH_RATE = 0.80;
const BASE_GROWTH_RATE = 0.15;

function calculateRealisticGrowthRate(fact: number, potentialTTs: number): number {
    if (potentialTTs === 0) return 0;
    
    let growthRate = BASE_GROWTH_RATE;
    const saturationFactor = Math.max(0.1, 1 - (fact / (potentialTTs * 5000))); // Assume 5k potential per TT
    growthRate *= saturationFactor;
    
    let cityMultiplier = 1.0;
    if (potentialTTs <= 10) cityMultiplier = 1.0;
    else if (potentialTTs <= 30) cityMultiplier = 1.3;
    else if (potentialTTs <= 100) cityMultiplier = 1.6;
    else cityMultiplier = 2.0;
    growthRate *= cityMultiplier;

    const randomVariation = 0.8 + (Math.random() * 0.4);
    growthRate *= randomVariation;

    return Math.max(MIN_GROWTH_RATE, Math.min(growthRate, MAX_GROWTH_RATE));
}


// --- Main Worker Logic ---
self.onmessage = async () => {
    try {
        self.postMessage({ type: 'progress', payload: { status: 'fetching', progress: 10, text: 'Загрузка мастер-базы из Google Sheets...' } });
        
        // FIX: Changed from GET to POST to align with the unified server API
        const okbResponse = await fetch('/api/get-okb', { method: 'POST' });
        if (!okbResponse.ok) {
            const errorData = await okbResponse.json();
            throw new Error(errorData.details || 'Не удалось загрузить базу ОКБ с сервера.');
        }
        const okbData: OKBDataRow[] = await okbResponse.json();
        
        if (!okbData || okbData.length === 0) {
            throw new Error('База ОКБ пуста или не была загружена. Проверьте Google Sheet.');
        }

        self.postMessage({ type: 'progress', payload: { status: 'aggregating', progress: 40, text: 'Агрегация данных и расчет потенциала...' } });

        const aggregatedMap = new Map<string, AggregatedDataRow>();

        // This will store all clients grouped by their city for potential calculation
        const allClientsByCity = new Map<string, PotentialClient[]>();

        okbData.forEach(row => {
            const city = normalizeString(row['Город или населенный пункт']);
            if (!city) return;

            // Safely parse coordinates
            const latString = row['Широта'] ? String(row['Широта']).replace(',', '.') : undefined;
            const lonString = row['Долгота'] ? String(row['Долгота']).replace(',', '.') : undefined;
            const lat = latString ? parseFloat(latString) : undefined;
            const lon = lonString ? parseFloat(lonString) : undefined;

            const client: PotentialClient = {
                name: row['Наименование'],
                address: row['Адрес'],
                phone: row['Контакты'],
                type: row['Категория'],
                lat: (lat !== undefined && !isNaN(lat)) ? lat : undefined,
                lon: (lon !== undefined && !isNaN(lon)) ? lon : undefined,
            };

            if (!allClientsByCity.has(city)) {
                allClientsByCity.set(city, []);
            }
            allClientsByCity.get(city)!.push(client);
        });


        okbData.forEach(row => {
             // Use normalized values for keys, but original values for display
            const rm = row['РМ'] || 'Не указан';
            const brand = row['Бренд'] || 'Не указан';
            const city = row['Город или населенный пункт'] || 'Не указан';
            const fact = Number(String(row['Факт (кг/ед)'] || '0').replace(',', '.'));
            
            if (city === 'Не указан' || rm === 'Не указан') return;

            const key = `${normalizeString(rm)}|${normalizeString(brand)}|${normalizeString(city)}`;

            if (!aggregatedMap.has(key)) {
                const cityClients = allClientsByCity.get(normalizeString(city)) || [];
                const potentialTTs = cityClients.length;

                aggregatedMap.set(key, {
                    rm,
                    brand,
                    city,
                    fact: 0,
                    potential: 0, // will be calculated after summing up facts
                    growthPotential: 0,
                    growthRate: 0,
                    potentialTTs,
                    potentialClients: cityClients,
                });
            }

            const entry = aggregatedMap.get(key)!;
            entry.fact += isNaN(fact) ? 0 : fact;
        });

        self.postMessage({ type: 'progress', payload: { status: 'aggregating', progress: 80, text: 'Финальные расчеты...' } });

        // Now calculate potential based on the aggregated facts
        for (const entry of aggregatedMap.values()) {
            const growthRate = calculateRealisticGrowthRate(entry.fact, entry.potentialTTs);
            entry.potential = entry.fact * (1 + growthRate);
            entry.growthPotential = entry.potential - entry.fact;
            entry.growthRate = growthRate * 100;
        }

        const finalData = Array.from(aggregatedMap.values());
        
        self.postMessage({ type: 'progress', payload: { status: 'done', progress: 100, text: 'Анализ завершен!' } });
        
        self.postMessage({ type: 'result', payload: finalData });

    } catch (error) {
        self.postMessage({ type: 'error', payload: error instanceof Error ? error.message : "Произошла неизвестная ошибка в фоновом обработчике." });
    }
};