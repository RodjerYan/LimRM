import { parseFile } from './fileParser';
import { RawDataRow, AggregatedDataRow, FilterOptions, WorkerMessage, PotentialClient } from '../types';

// --- Worker self listener ---
self.onmessage = async (event: MessageEvent<{ file: File }>) => {
    const { file } = event.data;

    try {
        // 1. Чтение и парсинг файла
        postMessage({ type: 'progress', payload: { status: 'reading', progress: 10, text: 'Чтение файла...' } });
        const rawData = await parseFile(file);
        
        // 2. Агрегация данных
        postMessage({ type: 'progress', payload: { status: 'processing', progress: 30, text: 'Анализ и агрегация данных...' } });
        const { aggregatedData, filterOptions } = processData(rawData);

        // 3. Геокодинг клиентов (самая долгая часть)
        postMessage({ type: 'progress', payload: { status: 'geocoding', progress: 60, text: 'Геокодирование адресов...' } });
        const geocodedData = await geocodeAddresses(aggregatedData, (progress) => {
            const overallProgress = 60 + progress * 0.4;
            postMessage({ type: 'progress', payload: { status: 'geocoding', progress: overallProgress, text: `Поиск координат... (${Math.round(overallProgress)}%)` } });
        });

        // 4. Финальный результат
        const totalFact = geocodedData.reduce((sum, row) => sum + row.fact, 0);
        const totalPotential = geocodedData.reduce((sum, row) => sum + row.potential, 0);

        postMessage({
            type: 'result',
            payload: {
                aggregatedData: geocodedData,
                filterOptions,
                totalFact,
                totalPotential,
            },
        });

    } catch (error: any) {
        postMessage({ type: 'error', payload: { message: error.message || 'Произошла неизвестная ошибка в воркере.' } });
    }
};

// --- Логика обработки данных ---
function processData(rawData: RawDataRow[]): { aggregatedData: AggregatedDataRow[], filterOptions: FilterOptions } {
    const dataMap = new Map<string, AggregatedDataRow>();
    const rms = new Set<string>();
    const brands = new Set<string>();
    const cities = new Set<string>();

    rawData.forEach(row => {
        // --- ПРИМЕЧАНИЕ: Названия колонок (например, 'РМ', 'Город') должны совпадать с названиями в Excel файле! ---
        const rm = String(row['РМ'] || 'Не указан').trim();
        const city = String(row['Город'] || 'Не указан').trim();
        const brand = String(row['Бренд'] || 'Не указан').trim();
        const fact = Number(row['Факт'] || 0);
        const potential = Number(row['Потенциал'] || 0);
        const clientName = String(row['Наименование ТТ'] || 'Клиент').trim();
        const clientAddress = String(row['Адрес ТТ'] || '').trim();
        const clientType = String(row['Тип ТТ'] || 'Торговая точка').trim();

        if (rm !== 'Не указан' && rm) rms.add(rm);
        if (brand !== 'Не указан' && brand) brands.add(brand);
        if (city !== 'Не указан' && city) cities.add(city);

        const key = `${rm}|${city}|${brand}`;
        
        const client: PotentialClient = { name: clientName, address: clientAddress, type: clientType };

        if (!dataMap.has(key)) {
            dataMap.set(key, {
                key, rm, city, brand,
                fact: 0, potential: 0,
                growthPotential: 0, growthRate: 0,
                potentialTTs: 0,
                potentialClients: []
            });
        }

        const entry = dataMap.get(key)!;
        entry.fact += fact;
        entry.potential += potential;
        // Добавляем клиента, только если есть адрес и имя.
        if (client.name && client.address) {
            entry.potentialClients.push(client);
        }
    });
    
    const aggregatedData = Array.from(dataMap.values()).map(entry => {
        entry.growthPotential = Math.max(0, entry.potential - entry.fact);
        entry.growthRate = entry.fact > 0 ? (entry.growthPotential / entry.fact) * 100 : (entry.potential > 0 ? Infinity : 0);
        entry.potentialTTs = entry.potentialClients.length;
        return entry;
    });

    return {
        aggregatedData,
        filterOptions: {
            rms: Array.from(rms).sort(),
            brands: Array.from(brands).sort(),
            cities: Array.from(cities).sort(),
        }
    };
}


// --- Логика геокодинга ---
// Используем прокси-сервер для Nominatim, чтобы избежать CORS и проблем с User-Agent.
const GEOCODE_PROXY_URL = '/api/osm-proxy'; 

async function geocodeAddresses(data: AggregatedDataRow[], onProgress: (progress: number) => void): Promise<AggregatedDataRow[]> {
    const geocodedResults = new Map<string, { lat: number, lon: number }>();
    let processedCount = 0;
    const totalCount = data.length;

    const geocodeCity = async (city: string): Promise<{ lat: number, lon: number } | undefined> => {
        if (geocodedResults.has(city)) {
            return geocodedResults.get(city);
        }
        try {
            const response = await fetch(`${GEOCODE_PROXY_URL}?q=${encodeURIComponent(city)}&limit=1`);
            if (!response.ok) return undefined;
            const results = await response.json();
            if (results && results.length > 0) {
                const { lat, lon } = results[0];
                const coords = { lat: parseFloat(lat), lon: parseFloat(lon) };
                geocodedResults.set(city, coords);
                return coords;
            }
        } catch (e) {
            console.error(`Geocoding error for city ${city}:`, e);
        }
        return undefined;
    };

    for (const row of data) {
        const cityCoords = await geocodeCity(row.city);
        if (cityCoords) {
            row.cityCenter = cityCoords;
        }
        // В реальном приложении здесь можно было бы геокодировать и каждый адрес клиента (row.potentialClients),
        // но это будет очень долго. Ограничимся центрами городов.
        processedCount++;
        onProgress((processedCount / totalCount) * 100);
    }
    
    return data;
}
