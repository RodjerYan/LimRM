import { RawDataRow } from '../types';
import { CITY_TO_REGION_MAP } from './fileParser';

// --- Column Header Mapping ---
// Maps possible input column names to our internal data model keys.
const COLUMN_MAPPINGS: { [key in keyof RawDataRow]: string[] } = {
    rm: ['рм', 'региональный менеджер', 'менеджер'],
    brand: ['бренд', 'brand'],
    fullAddress: ['адрес', 'адрес тт', 'полный адрес', 'торговая точка', 'клиент'],
    city: ['город', 'регион', 'область', 'населенный пункт'],
    fact: ['факт', 'объем', 'объём', 'продажи', 'количество', 'кг', 'сумма']
};

/**
 * Finds the first matching header for a given internal key.
 * @param headers - Array of headers from the Excel file.
 * @param key - The internal key from RawDataRow we're trying to map.
 * @returns The matching header from the file, or null if not found.
 */
function findHeader(headers: string[], key: keyof RawDataRow): string | null {
    const lowerCaseHeaders = headers.map(h => h.toLowerCase().trim());
    const possibleNames = COLUMN_MAPPINGS[key];
    for (const name of possibleNames) {
        const foundHeader = lowerCaseHeaders.find(h => h.includes(name));
        if (foundHeader) {
            // Find the original header to preserve case for indexing
            const originalHeaderIndex = lowerCaseHeaders.indexOf(foundHeader);
            return headers[originalHeaderIndex];
        }
    }
    return null;
}

/**
 * Normalizes a city name to its corresponding region using the map.
 * @param cityName - The city name to normalize.
 * @returns The normalized region name or the original name if not found.
 */
function normalizeRegion(cityName: string): string {
    if (!cityName) return 'Неопределен';
    const lowerCity = cityName.toLowerCase().trim();
    return CITY_TO_REGION_MAP[lowerCity] || cityName;
}

/**
 * Processes raw JSON data from an Excel sheet into a structured format for the application.
 * @param jsonData - An array of objects from the Excel sheet.
 * @returns An object containing processed data, unique locations, and client lists by region.
 */
export const processJsonData = (jsonData: any[]): {
    processedData: RawDataRow[],
    uniqueLocations: Set<string>,
    existingClientsByRegion: Record<string, string[]>
} => {
    if (!jsonData || jsonData.length === 0) {
        throw new Error("Нет данных для обработки.");
    }

    const headers = Object.keys(jsonData[0]);

    // Find the actual header names in the file
    const headerMap = {
        rm: findHeader(headers, 'rm'),
        brand: findHeader(headers, 'brand'),
        fullAddress: findHeader(headers, 'fullAddress'),
        city: findHeader(headers, 'city'),
        fact: findHeader(headers, 'fact')
    };
    
    // Validate that all essential headers are found
    const missingHeaders = Object.entries(headerMap)
        .filter(([_, value]) => value === null)
        .map(([key]) => {
            // Provide more user-friendly names for errors
            const names: Record<string, string> = { rm: 'РМ/Менеджер', brand: 'Бренд', fullAddress: 'Адрес/Клиент', city: 'Город/Регион', fact: 'Факт/Объем' };
            return names[key] || key;
        });

    if (missingHeaders.length > 0) {
        throw new Error(`Не найдены обязательные колонки: ${missingHeaders.join(', ')}. Проверьте заголовки в таблице.`);
    }

    const processedData: RawDataRow[] = [];
    const uniqueLocations = new Set<string>();
    const existingClientsByRegion: Record<string, string[]> = {};

    for (const row of jsonData) {
        const factValue = parseFloat(String(row[headerMap.fact!]).replace(/,/g, '.').replace(/\s/g, ''));

        // Skip rows with invalid or zero fact
        if (isNaN(factValue) || factValue <= 0) {
            continue;
        }

        const rawCity = String(row[headerMap.city!] || '');
        const normalizedCity = normalizeRegion(rawCity);

        const fullAddress = String(row[headerMap.fullAddress!] || 'Не указан');

        processedData.push({
            rm: String(row[headerMap.rm!] || 'Не указан'),
            brand: String(row[headerMap.brand!] || 'Не указан'),
            fullAddress: fullAddress,
            city: normalizedCity,
            fact: factValue
        });

        uniqueLocations.add(normalizedCity);
        if (!existingClientsByRegion[normalizedCity]) {
            existingClientsByRegion[normalizedCity] = [];
        }
        existingClientsByRegion[normalizedCity].push(fullAddress);
    }

    if (processedData.length === 0) {
        throw new Error("Не найдено ни одной строки с корректными данными о продажах (колонка 'Факт' пуста или содержит некорректные значения).");
    }

    return { processedData, uniqueLocations, existingClientsByRegion };
};