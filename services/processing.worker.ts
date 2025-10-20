import { RawDataRow, ProcessedData, AggregatedDataRow, PotentialClient, FilterOptions, WorkerMessage } from '../types';
import { mapHeaders, normalizeRow } from '../utils/columnMapper';

// --- Глобальные переменные воркера ---
const geocodingCache = new Map<string, { lat: number, lon: number } | null>();

// --- Вспомогательные функции для отправки сообщений ---
const postProgress = (text: string, progress: number) => {
    const message: WorkerMessage = { type: 'progress', payload: { text, progress } };
    postMessage(message);
};

const postError = (error: string) => {
    const message: WorkerMessage = { type: 'error', payload: error };
    postMessage(message);
};

const postResult = (result: ProcessedData) => {
    const message: WorkerMessage = { type: 'result', payload: result };
    postMessage(message);
};

// --- Геокодирование через прокси ---
async function geocode(query: string): Promise<{ lat: number, lon: number } | null> {
    if (!query || query.trim().length < 3) return null;
    const cacheKey = query.toLowerCase().trim();
    if (geocodingCache.has(cacheKey)) {
        return geocodingCache.get(cacheKey)!;
    }
    try {
        const response = await fetch(`/api/osm-proxy?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            geocodingCache.set(cacheKey, null); // Кэшируем неудачу, чтобы не повторять запрос
            return null;
        }

        const data = await response.json();
        if (data && data.length > 0) {
            const bestResult = data.sort((a: any, b: any) => b.importance - a.importance)[0];
            const coords = { lat: bestResult.lat, lon: bestResult.lon };
            geocodingCache.set(cacheKey, coords);
            return coords;
        }
        geocodingCache.set(cacheKey, null);
        return null;
    } catch (e) {
        console.error(`Ошибка геокодирования для "${query}":`, e);
        geocodingCache.set(cacheKey, null);
        return null;
    }
}

// --- Основная логика обработки ---
async function processData(rawData: RawDataRow[]) {

    // 1. Валидация заголовков
    postProgress('Проверка заголовков...', 5);
    const headers = Object.keys(rawData[0] || {});
    const { mapped: mappedHeaders, errors } = mapHeaders(headers);
    if (errors.length > 0) {
        postError(`Ошибка в заголовках файла: ${errors.join(', ')}`);
        return;
    }

    // 2. Нормализация и группировка данных
    postProgress('Нормализация данных...', 15);
    const groupedData = new Map<string, { rm: string; city: string; brand: string; clients: any[] }>();
    
    rawData.forEach(row => {
        const normalized = normalizeRow(row, mappedHeaders);
        // Пропускаем строки без ключевых данных
        if (!normalized.city || !normalized.brand || !normalized.clientName) return;

        const key = `${normalized.city}|${normalized.brand}|${normalized.rm}`;
        
        if (!groupedData.has(key)) {
            groupedData.set(key, {
                rm: normalized.rm,
                city: normalized.city,
                brand: normalized.brand,
                clients: []
            });
        }
        groupedData.get(key)!.clients.push(normalized);
    });
    
    // 3. Агрегация данных и геокодирование городов
    postProgress('Анализ и геокодирование городов...', 40);
    const aggregatedData: AggregatedDataRow[] = [];
    const rms = new Set<string>();
    const brands = new Set<string>();
    const cities = new Set<string>();
    let totalFact = 0;
    let totalPotential = 0;

    const groupEntries = Array.from(groupedData.entries());
    let geocodedCount = 0;

    for (const [key, group] of groupEntries) {
        const cityCenter = await geocode(group.city);
        geocodedCount++;
        const progress = 40 + (geocodedCount / groupEntries.length) * 30; // 40% -> 70%
        postProgress(`Анализ региона: ${group.city}`, progress);

        let fact = 0;
        let potential = 0;
        const potentialClients: PotentialClient[] = [];

        group.clients.forEach(client => {
            fact += client.salesFact;
            potential += client.salesPotential;
            potentialClients.push({
                name: client.clientName,
                address: client.clientAddress,
                type: client.clientType,
            });
        });

        const growthPotential = Math.max(0, potential - fact);
        const growthRate = fact > 0 ? (growthPotential / fact) * 100 : Infinity;
        
        aggregatedData.push({
            key,
            rm: group.rm,
            city: group.city,
            brand: group.brand,
            fact,
            potential,
            growthPotential,
            growthRate,
            potentialTTs: group.clients.length,
            potentialClients,
            cityCenter: cityCenter || undefined,
        });

        rms.add(group.rm);
        brands.add(group.brand);
        cities.add(group.city);

        totalFact += fact;
        totalPotential += potential;
    }
    
    // 4. Геокодирование клиентов
    postProgress('Поиск координат клиентов...', 75);
    const allClientsToGeocode = aggregatedData.flatMap(row => 
        row.potentialClients.slice(0, 50).map(c => ({ client: c, city: row.city })) // Ограничение на 50 клиентов на группу
    );
    let geocodedClients = 0;
    
    for (const { client, city } of allClientsToGeocode) {
        const fullAddress = `${city}, ${client.address}`;
        const clientCoords = await geocode(fullAddress);
        if (clientCoords) {
            client.lat = clientCoords.lat;
            client.lon = clientCoords.lon;
        }
        geocodedClients++;
        const progress = 75 + (geocodedClients / allClientsToGeocode.length) * 20; // 75% -> 95%
        if (geocodedClients % 10 === 0) { // Обновляем прогресс не так часто
             postProgress(`Поиск координат: ${client.name.substring(0, 20)}...`, progress);
        }
    }

    postProgress('Формирование отчета...', 98);

    const filterOptions: FilterOptions = {
        rms: Array.from(rms).sort((a,b) => a.localeCompare(b)),
        brands: Array.from(brands).sort((a,b) => a.localeCompare(b)),
        cities: Array.from(cities).sort((a,b) => a.localeCompare(b)),
    };

    const result: ProcessedData = {
        aggregatedData,
        filterOptions,
        totalFact,
        totalPotential,
    };

    postResult(result);
}


// --- Обработчик сообщений воркера ---
self.onmessage = (e: MessageEvent<{ fileData: RawDataRow[] }>) => {
    const { fileData } = e.data;
    if (fileData) {
        processData(fileData).catch(err => {
            postError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка в воркере.');
        });
    }
};

// Экспорт для соответствия требованиям TypeScript к модулям
export {};
