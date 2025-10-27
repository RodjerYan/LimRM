import * as xlsx from 'xlsx';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient } from '../types';
import { normalizeString, findBestOkbMatch, extractRegionFromOkb } from '../utils/dataUtils';

// A simple in-memory cache for geocoding results to avoid redundant API calls
const geoCache = new Map<string, { lat: number, lon: number }>();

// This is a placeholder for a real geocoding service.
// In a real app, you would call an API like Yandex Maps, Google Maps, or Nominatim.
// For this example, we'll use a mock function that returns random coordinates.
const geocodeAddress = async (address: string, city: string): Promise<{ lat: number; lon: number } | null> => {
    const cacheKey = `${address}, ${city}`.toLowerCase();
    if (geoCache.has(cacheKey)) {
        return geoCache.get(cacheKey)!;
    }

    // --- MOCK IMPLEMENTATION ---
    // In a real scenario, this would be an API call.
    // To simulate network delay and variability:
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
    
    // Simulate some addresses not being found
    if (Math.random() < 0.1) { 
        return null;
    }
    
    // Generate pseudo-random coordinates based on the address hash for consistency
    let hash = 0;
    for (let i = 0; i < cacheKey.length; i++) {
        const char = cacheKey.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }

    // Moscow-ish coordinates as a base
    const baseLat = 55.751244;
    const baseLon = 37.618423;

    const lat = baseLat + (hash % 10000) / 100000;
    const lon = baseLon + (hash % 10000) / 100000;
    // --- END MOCK ---
    
    const result = { lat, lon };
    geoCache.set(cacheKey, result);
    return result;
};


const findPotentialClients = async (row: AggregatedDataRow, okbData: OkbDataRow[]): Promise<PotentialClient[]> => {
    // This is a simplified logic. A real implementation would query a database or an API
    // based on the client's location, industry, etc.
    // Here, we'll just find a few other clients from the OKB in the same city.
    const potential = okbData
        .filter(okb => okb['Город']?.toLowerCase() === row.city.toLowerCase() && normalizeString(okb['Наименование']) !== normalizeString(row.clientName))
        .slice(0, 5) // Limit to 5 for performance
        .map(okb => ({
            name: okb['Наименование'] || 'N/A',
            address: okb['Юридический адрес'] || 'N/A',
            type: okb['Вид деятельности'] || 'N/A',
        }));

    // Geocode the potential clients
    const geocodedClients: PotentialClient[] = [];
    for (const client of potential) {
        const coords = await geocodeAddress(client.address, row.city);
        if (coords) {
            geocodedClients.push({ ...client, lat: coords.lat, lon: coords.lon });
        } else {
             geocodedClients.push(client);
        }
    }

    return geocodedClients;
};


self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    const okbDataWithNormalizedNames = okbData.map(d => ({...d, normalizedName: normalizeString(d['Наименование'])}));

    const postMessage = (message: WorkerMessage) => self.postMessage(message);

    try {
        postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла...' } });
        const data = await file.arrayBuffer();
        const workbook = xlsx.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet);

        const totalRows = jsonData.length;
        if (totalRows === 0) {
            throw new Error('Файл пуст или имеет неверный формат.');
        }

        const aggregatedData: { [key: string]: AggregatedDataRow } = {};
        
        postMessage({ type: 'progress', payload: { percentage: 5, message: 'Анализ строк...' } });

        for (let i = 0; i < totalRows; i++) {
            const row = jsonData[i];
            const clientName = row['Клиент'] || 'Неизвестный клиент';
            const brand = row['Бренд'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            const city = row['Город'] || 'Неизвестный город';
            const fact = parseFloat(row['Факт']) || 0;
            const potential = parseFloat(row['Потенциал']) || 0;

            const key = `${clientName}-${brand}-${city}-${rm}`.toLowerCase();

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key,
                    clientName,
                    brand,
                    rm,
                    city,
                    region: 'Определение...',
                    fact: 0,
                    potential: 0,
                    growthPotential: 0,
                    growthPercentage: 0,
                    potentialClients: []
                };
            }
            aggregatedData[key].fact += fact;
            if (aggregatedData[key].potential < potential) {
                aggregatedData[key].potential = potential; // Assume potential is per-client, not cumulative
            }
             if ((i % 100 === 0 || i === totalRows - 1) && i > 0) {
                const percentage = 5 + Math.round((i / totalRows) * 75); // Aggregation is 75% of the work
                postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i + 1} из ${totalRows} строк...` } });
            }
        }
        
        let processedCount = 0;
        const finalData = Object.values(aggregatedData);
        const totalAggregated = finalData.length;

        postMessage({ type: 'progress', payload: { percentage: 80, message: 'Обогащение данных...' } });

        for (const item of finalData) {
            item.growthPotential = Math.max(0, item.potential - item.fact);
            item.growthPercentage = item.potential > 0 ? (item.growthPotential / item.potential) * 100 : 0;
            
            const okbMatch = findBestOkbMatch(item.clientName, item.city, okbDataWithNormalizedNames);
            item.region = okbMatch ? extractRegionFromOkb(okbMatch) : 'Регион не определен';
            
            item.potentialClients = await findPotentialClients(item, okbData);
            
            processedCount++;
            if (processedCount % 20 === 0 || processedCount === totalAggregated) {
                 const percentage = 80 + Math.round((processedCount / totalAggregated) * 20);
                 postMessage({ type: 'progress', payload: { percentage, message: `Обогащение записи ${processedCount} из ${totalAggregated}...` } });
            }
        }

        postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
        postMessage({ type: 'result', payload: finalData });

    } catch (error) {
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};
