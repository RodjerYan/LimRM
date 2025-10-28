import * as xlsx from 'xlsx';
import { AggregatedDataRow, OkbDataRow, WorkerMessage } from '../types';
import { normalizeAddressForSearch, levenshteinDistance, findBestOkbMatch, extractRegionFromOkb } from '../utils/dataUtils';
import { regionCenters } from '../utils/regionCenters';

// Pre-computation for performance: create normalized maps once when the worker starts.
const cityToRegionMap = new Map<string, string>();
const normalizedRegionNames = new Map<string, string>(); // a map from a normalized region name to its canonical form
const allCities = Object.keys(regionCenters);

for (const city in regionCenters) {
    cityToRegionMap.set(normalizeAddressForSearch(city), regionCenters[city]);
}

// Create a unique list of canonical region names
const canonicalRegions = [...new Set(Object.values(regionCenters))];
for (const region of canonicalRegions) {
    // Normalize the region name for searching (e.g., "орловская область" -> "орловская")
    const normalized = normalizeAddressForSearch(region)
        .replace(/область|край|республика|город федерального значения|автономный округ/g, '')
        .trim();
    normalizedRegionNames.set(normalized, region);
}


/**
 * Safely parses a numeric value from a spreadsheet cell.
 * Handles formats like "1 234,56".
 */
const parseNumericValue = (value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (typeof value === 'string') {
        const cleanedString = value.replace(/\s/g, '').replace(',', '.');
        const number = parseFloat(cleanedString);
        return isNaN(number) ? 0 : number;
    }
    return isNaN(Number(value)) ? 0 : Number(value);
};

/**
 * Determines the region from a given address string using a hierarchical and fuzzy matching algorithm.
 * @param address The raw address string.
 * @returns The canonical region name or a default fallback string.
 */
function determineRegion(address: string): string {
    const fallbackRegion = 'Регион не определен';
    if (!address || typeof address !== 'string') return fallbackRegion;

    const normalizedAddress = normalizeAddressForSearch(address);

    // 1. Explicit Region Search: Check for direct mentions of region names.
    for (const [normRegion, canonicalRegion] of normalizedRegionNames.entries()) {
        if (normalizedAddress.includes(normRegion)) {
            return canonicalRegion.charAt(0).toUpperCase() + canonicalRegion.slice(1);
        }
    }

    // 2. City-to-Region Mapping (Exact and Fuzzy)
    const addressParts = normalizedAddress.split(/\s+/);
    let bestMatch: { city: string, score: number } | null = null;

    for (const part of addressParts) {
        if (part.length < 3) continue; // Ignore very short parts

        // Exact match
        if (cityToRegionMap.has(part)) {
            const region = cityToRegionMap.get(part)!;
            return region.charAt(0).toUpperCase() + region.slice(1);
        }
        
        // Fuzzy match preparation
        for (const city of allCities) {
            const distance = levenshteinDistance(part, city);
            const maxLength = Math.max(part.length, city.length);
            const similarity = 1 - distance / maxLength;
            
            // Set a high threshold for similarity to avoid incorrect matches
            if (similarity > 0.85) { 
                if (!bestMatch || similarity > bestMatch.score) {
                    bestMatch = { city: city, score: similarity };
                }
            }
        }
    }

    if (bestMatch) {
        const region = regionCenters[bestMatch.city];
        return region.charAt(0).toUpperCase() + region.slice(1);
    }
    
    // If no city or region is found, return the fallback.
    return fallbackRegion;
}

self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    const okbDataWithNormalizedNames = okbData.map(d => ({...d, normalizedName: normalizeAddressForSearch(d['Наименование'])}));

    const postMessage = (message: WorkerMessage) => self.postMessage(message);

    try {
        postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла...' } });
        const data = await file.arrayBuffer();
        const workbook = xlsx.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false });

        if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');
        
        const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
        const hasPotentialColumn = headers.some(h => normalizeAddressForSearch(h) === 'потенциал');
        const hasFactColumn = headers.some(h => normalizeAddressForSearch(h) === 'вес кг');

        if (!hasFactColumn) throw new Error('Файл должен содержать колонку "Вес, кг".');
        
        const aggregatedData: { [key: string]: Omit<AggregatedDataRow, 'clients'> & { clients: Set<string> } } = {};
        
        postMessage({ type: 'progress', payload: { percentage: 5, message: 'Анализ и группировка данных...' } });

        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            const address = row['Адрес ТТ LimKorm'] || `Строка #${i + 2}`;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            
            const region = determineRegion(address);
            const fact = parseNumericValue(row['Вес, кг']);
            const key = `${region}-${brand}-${rm}`.toLowerCase();

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, clientName: `${region} (${brand})`, brand, rm,
                    city: region, // Keep city for compatibility, but it holds the region name.
                    region: region,
                    fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                    clients: new Set<string>(),
                };
            }
            aggregatedData[key].fact += fact;
            aggregatedData[key].clients.add(address);

            if (hasPotentialColumn) {
                aggregatedData[key].potential += parseNumericValue(row['Потенциал']);
            }

            if ((i % 100 === 0 || i === jsonData.length - 1) && i > 0) {
                const percentage = 5 + Math.round((i / jsonData.length) * 75);
                postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i + 1} из ${jsonData.length} строк...` } });
            }
        }
        
        const finalData = Object.values(aggregatedData).map(item => ({...item, clients: Array.from(item.clients)}));
        postMessage({ type: 'progress', payload: { percentage: 80, message: 'Расчет потенциала...' } });

        for (const item of finalData) {
            if (!hasPotentialColumn) {
                item.potential = item.fact * 1.15;
            } else if (item.potential < item.fact) {
                item.potential = item.fact;
            }
            item.growthPotential = Math.max(0, item.potential - item.fact);
            item.growthPercentage = item.potential > 0 ? (item.growthPotential / item.potential) * 100 : 0;
            item.potentialClients = [];
        }

        postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
        postMessage({ type: 'result', payload: finalData });

    } catch (error) {
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};
