

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

/**
 * Safely parses a numeric value from a spreadsheet cell, which might be a number or a string.
 * Handles common European number formats (e.g., "1 234,56").
 * @param value The value from the spreadsheet cell.
 * @returns The parsed number, or 0 if parsing fails.
 */
const parseNumericValue = (value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') {
        return isNaN(value) ? 0 : value;
    }
    if (typeof value === 'string') {
        // 1. Remove all non-breaking spaces and regular spaces (like thousands separators).
        // 2. Replace comma decimal separator with a period.
        // 3. Remove any characters that are not digits, minus sign, or the decimal point.
        const cleanedString = value
            .replace(/\s/g, '')
            .replace(',', '.');
        
        const number = parseFloat(cleanedString);
        return isNaN(number) ? 0 : number;
    }
    // Attempt to convert other types, default to 0.
    const converted = Number(value);
    return isNaN(converted) ? 0 : converted;
};

/**
 * Extracts a city name from a complex address string using a series of patterns.
 * @param address The address string to parse.
 * @returns The extracted city name or a default value.
 */
const extractCityFromAddress = (address: string): string => {
    if (!address) return 'Неизвестный город';

    // Best case: "г. Смоленск", "Смоленск г,", "302002, ... Орёл г,"
    const cityPattern = /(?:,\s*|(?:\d{6},\s*))([а-яё\s-]+?)\s*г\b/i;
    const match = address.match(cityPattern);
    if (match && match[1]) {
        const cityName = match[1].trim();
        return cityName.charAt(0).toUpperCase() + cityName.slice(1);
    }
    
    // Next best: Look for region and derive city from it. e.g. "Смоленская обл" -> "Смоленск"
    const regionPattern = /([а-яё-]+)ая\s+обл/i;
    const regionMatch = address.match(regionPattern);
    if (regionMatch && regionMatch[1]) {
        const city = regionMatch[1].toLowerCase();
        return city.charAt(0).toUpperCase() + city.slice(1);
    }

    // Fallback: split by comma and take the first "wordy" part after a potential postcode
    const parts = address.split(',').map(p => p.trim()).filter(Boolean);
    const startIndex = /^\d{6}$/.test(parts[0]) ? 1 : 0;
    for (let i = startIndex; i < parts.length; i++) {
        if (parts[i].length > 3 && !parts[i].includes('обл') && !parts[i].includes('р-н')) {
            return parts[i].charAt(0).toUpperCase() + parts[i].slice(1);
        }
    }

    return 'Неизвестный город';
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

        const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
        const hasPotentialColumn = headers.some(h => h.toLowerCase().trim() === 'потенциал');
        const hasFactColumn = headers.some(h => h.toLowerCase().trim() === 'вес, кг');

        if (!hasFactColumn) {
            throw new Error('Файл должен содержать колонку "Вес, кг" для расчета факта продаж.');
        }

        // FIX: The original type `AggregatedDataRow & { clients: Set<string> }` created an impossible
        // intersection type for the `clients` property (`string[] & Set<string>`).
        // By using `Omit`, we remove the original `clients` property from `AggregatedDataRow` and
        // replace it with one correctly typed as `Set<string>` for this intermediate processing step.
        const aggregatedData: { [key: string]: Omit<AggregatedDataRow, 'clients'> & { clients: Set<string> } } = {};
        
        postMessage({ type: 'progress', payload: { percentage: 5, message: 'Группировка данных...' } });

        for (let i = 0; i < totalRows; i++) {
            const row = jsonData[i];
            
            const address = row['Адрес ТТ LimKorm'] || `Строка #${i + 2}`;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            const city = extractCityFromAddress(address);
            const fact = parseNumericValue(row['Вес, кг']);

            const key = `${city}-${brand}-${rm}`.toLowerCase();

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key,
                    clientName: `г. ${city} (${brand})`,
                    brand,
                    rm,
                    city,
                    region: 'Определение...',
                    fact: 0,
                    potential: 0,
                    growthPotential: 0,
                    growthPercentage: 0,
                    clients: new Set<string>(),
                };
            }
            aggregatedData[key].fact += fact;
            aggregatedData[key].clients.add(address);

            if (hasPotentialColumn) {
                // Sum up potential from all individual clients in the group
                aggregatedData[key].potential += parseNumericValue(row['Потенциал']);
            }

             if ((i % 100 === 0 || i === totalRows - 1) && i > 0) {
                const percentage = 5 + Math.round((i / totalRows) * 75); // Aggregation is 75% of the work
                postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i + 1} из ${totalRows} строк...` } });
            }
        }
        
        let processedCount = 0;
        const finalData = Object.values(aggregatedData).map(item => ({...item, clients: Array.from(item.clients)}));
        const totalAggregated = finalData.length;

        postMessage({ type: 'progress', payload: { percentage: 80, message: 'Расчет потенциала...' } });

        for (const item of finalData) {
            // If potential wasn't in the file, calculate it now based on aggregated fact with a 15% growth factor.
            if (!hasPotentialColumn) {
                item.potential = item.fact * 1.15;
            } else {
                 // If total potential from file is less than total fact (data error), adjust it.
                 if (item.potential < item.fact) {
                    item.potential = item.fact;
                }
            }

            item.growthPotential = Math.max(0, item.potential - item.fact);
            item.growthPercentage = item.potential > 0 ? (item.growthPotential / item.potential) * 100 : 0;
            
            // Determine region from the first client in the group
            const firstClientName = item.clients?.[0];
            if (firstClientName) {
                const okbMatch = findBestOkbMatch(firstClientName, item.city, okbDataWithNormalizedNames);
                item.region = okbMatch ? extractRegionFromOkb(okbMatch) : 'Регион не определен';
            } else {
                 item.region = 'Регион не определен';
            }

            // Potential clients logic is not applicable for grouped views, so we leave it empty.
            item.potentialClients = [];
            
            processedCount++;
            if (processedCount % 50 === 0 || processedCount === totalAggregated) {
                 const percentage = 80 + Math.round((processedCount / totalAggregated) * 20);
                 postMessage({ type: 'progress', payload: { percentage, message: `Расчет для группы ${processedCount} из ${totalAggregated}...` } });
            }
        }

        postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
        postMessage({ type: 'result', payload: finalData });

    } catch (error) {
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};
