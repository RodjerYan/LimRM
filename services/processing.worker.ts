
import * as xlsx from 'xlsx';
import { AggregatedDataRow, OkbDataRow, WorkerMessage } from '../types';
import { regionCenters } from '../utils/regionCenters';

// Helper to parse numeric values safely
const parseNumericValue = (value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') {
        return isNaN(value) ? 0 : value;
    }
    if (typeof value === 'string') {
        const cleanedString = value.replace(/\s/g, '').replace(',', '.');
        const number = parseFloat(cleanedString);
        return isNaN(number) ? 0 : number;
    }
    const converted = Number(value);
    return isNaN(converted) ? 0 : converted;
};

/**
 * Extracts a city name from a full address string with improved accuracy.
 * It prioritizes explicit city markers like "г." and falls back to searching a list of known cities.
 * @param address The full address string.
 * @returns The extracted city name or a default string if not found.
 */
const extractCityFromAddress = (address: string): string => {
    if (!address) return 'Город не определен';

    // Pattern 1: Highly reliable search for "г. [CityName]" or "г [CityName]".
    // It looks for the city name and stops at common delimiters like commas or other address parts.
    const prefixCityPattern = /\bг(?:\.|\s)?\s*([а-яё\s-]+?)(?:,|$|\sул|\sобл|\sр-н|ул\.|обл\.)/i;
    const prefixMatch = address.match(prefixCityPattern);
    if (prefixMatch && prefixMatch[1]) {
        const cityName = prefixMatch[1].trim();
        if (cityName.length > 1) { // Avoid matching single letters
            return cityName.charAt(0).toUpperCase() + cityName.slice(1);
        }
    }

    // Pattern 2: Search for known city names from the `regionCenters` list.
    // This is effective when the "г." prefix is missing.
    const addressLower = address.toLowerCase();
    // Sort known cities by length descending to match longer names first (e.g., "нижний новгород" before "новгород")
    const sortedKnownCities = Object.keys(regionCenters).sort((a, b) => b.length - a.length);

    for (const knownCity of sortedKnownCities) {
        const cityPattern = new RegExp(`\\b${knownCity}\\b`, 'i');
        if (cityPattern.test(addressLower)) {
            return knownCity.charAt(0).toUpperCase() + knownCity.slice(1);
        }
    }
    
    // Pattern 3: Fallback logic for complex cases.
    // Tries to find a plausible candidate that is not a common abbreviation.
    const parts = address.split(',').map(p => p.trim());
    for (const part of parts) {
        // Remove known abbreviations and check if what's left is a plausible city name
        const potentialCity = part.replace(/\b(обл|р-н|ул|пр-т|пер|зд|пос|д|г|область|край|республика)\b\.?/ig, '').trim();
        // Check if it has letters, isn't just a number, and has a reasonable length
        if (potentialCity.length > 2 && /[а-яё]/i.test(potentialCity) && !/^\d+$/.test(potentialCity)) {
            return potentialCity.charAt(0).toUpperCase() + potentialCity.slice(1);
        }
    }

    return 'Город не определен';
};


self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file } = e.data;

    const postMessage = (message: WorkerMessage) => self.postMessage(message);

    try {
        postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла...' } });
        const data = await file.arrayBuffer();
        const workbook = xlsx.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false });

        const totalRows = jsonData.length;
        if (totalRows === 0) throw new Error('Файл пуст или имеет неверный формат.');

        const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
        const hasPotentialColumn = headers.some(h => h.toLowerCase().trim() === 'потенциал');
        const hasFactColumn = headers.some(h => h.toLowerCase().trim() === 'вес, кг');

        if (!hasFactColumn) throw new Error('Файл должен содержать колонку "Вес, кг" для расчета факта продаж.');
        
        // This intermediate structure uses a Set for efficient de-duplication of clients within a group.
        const aggregatedData: { [key: string]: Omit<AggregatedDataRow, 'clients'> & { clients: Set<string> } } = {};
        
        postMessage({ type: 'progress', payload: { percentage: 5, message: 'Группировка данных по городам...' } });

        for (let i = 0; i < totalRows; i++) {
            const row = jsonData[i];
            
            const address = row['Адрес ТТ LimKorm'] || `Строка #${i + 2}`;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            
            const city = extractCityFromAddress(address);
            const fact = parseNumericValue(row['Вес, кг']);

            const key = `${city}-${brand}-${rm}`.toLowerCase();

            if (!aggregatedData[key]) {
                const region = regionCenters[city.toLowerCase()] || city;
                aggregatedData[key] = {
                    key,
                    clientName: `${city} (${brand})`,
                    brand,
                    rm,
                    city: city,
                    region: region.charAt(0).toUpperCase() + region.slice(1),
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
                aggregatedData[key].potential += parseNumericValue(row['Потенциал']);
            }

             if ((i % 100 === 0 || i === totalRows - 1) && i > 0) {
                const percentage = 5 + Math.round((i / totalRows) * 85);
                postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i + 1} из ${totalRows} строк...` } });
            }
        }
        
        // Convert the Set of clients to an array for the final data structure.
        const finalData: AggregatedDataRow[] = Object.values(aggregatedData).map(item => ({...item, clients: Array.from(item.clients)}));
        
        postMessage({ type: 'progress', payload: { percentage: 90, message: 'Расчет потенциала...' } });

        for (const item of finalData) {
            // If the 'Potential' column wasn't in the source file, calculate a default potential.
            if (!hasPotentialColumn) {
                item.potential = item.fact * 1.15; // Default 15% potential growth
            }
            
            // Ensure potential is never less than fact.
            if (item.potential < item.fact) {
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
