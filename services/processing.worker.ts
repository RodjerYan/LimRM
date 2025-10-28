
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

const capitalize = (str: string): string => {
    return str
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

/**
 * Extracts the highest-level geographical entity (region/oblast) from a full address string.
 * This function is designed to be robust and handle various address formats and inconsistencies.
 * 1. Normalizes the address (lowercase, ё -> е, abbreviations).
 * 2. Tries to find an explicit region mention (e.g., "орловская область").
 * 3. If no region is found, it looks for a known city and maps it to its corresponding region.
 * @param address The full address string.
 * @returns The standardized region name or a default string if not found.
 */
const extractRegionFromAddress = (address: string): string => {
    if (!address || typeof address !== 'string') return 'Регион не определен';

    // 1. Normalize the address string for consistent matching.
    const normalizedAddress = address
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\bобл\.?/g, 'область')
        .replace(/\bг\.?/g, 'город')
        .replace(/\bр-н\.?/g, 'район');

    // 2. Prioritize finding an explicit region name first.
    // This regex looks for phrases like "орловская область", "алтайский край", etc.
    const regionPattern = /([а-яеы-]{5,}\s(?:область|край|республика|округ))/;
    const regionMatch = normalizedAddress.match(regionPattern);
    if (regionMatch && regionMatch[1]) {
        // We found a direct mention of a region.
        return capitalize(regionMatch[1].trim());
    }
    
    // 3. If no region is found, search for a known city and map it back to its region.
    // We check against the `regionCenters` map.
    for (const [city, region] of Object.entries(regionCenters)) {
        // Use a word boundary `\b` to ensure we match the whole city name (e.g., "орел", not "корел").
        const cityPattern = new RegExp(`\\b${city.replace(/ё/g, 'е')}\\b`);
        if (cityPattern.test(normalizedAddress)) {
            // Found a city, return its associated region.
            return capitalize(region);
        }
    }

    // 4. Fallback if no region or city is identified.
    return 'Регион не определен';
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
        
        postMessage({ type: 'progress', payload: { percentage: 5, message: 'Группировка данных по регионам...' } });

        for (let i = 0; i < totalRows; i++) {
            const row = jsonData[i];
            
            const address = row['Адрес ТТ LimKorm'] || `Строка #${i + 2}`;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            
            const region = extractRegionFromAddress(address);
            const fact = parseNumericValue(row['Вес, кг']);

            // The key is now based on the standardized region name, ensuring all variations are grouped.
            const key = `${region}-${brand}-${rm}`.toLowerCase();

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key,
                    clientName: `${region} (${brand})`,
                    brand,
                    rm,
                    city: region, // Use region name for the "City" column for consistency in UI
                    region: region,
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
