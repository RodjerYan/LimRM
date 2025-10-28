
import * as xlsx from 'xlsx';
import { AggregatedDataRow, OkbDataRow, WorkerMessage } from '../types';
import { normalizeString, findBestOkbMatch, extractRegionFromOkb } from '../utils/dataUtils';
import { regionCenters } from '../utils/regionCenters';

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
        const cleanedString = value
            .replace(/\s/g, '')
            .replace(',', '.');
        
        const number = parseFloat(cleanedString);
        return isNaN(number) ? 0 : number;
    }
    const converted = Number(value);
    return isNaN(converted) ? 0 : converted;
};

/**
 * Extracts city and region details from a complex address string.
 * It first attempts to find the city using robust patterns, then determines the region
 * by either finding it directly in the string or mapping the found city to its region.
 * @param address The address string to parse.
 * @returns An object containing the extracted city and region.
 */
const extractLocationDetails = (address: string): { city: string, region: string } => {
    if (!address) return { city: 'Неизвестный город', region: 'Регион не определен' };

    // --- Find City First (using robust logic) ---
    let city = 'Неизвестный город';
    const prefixCityPattern = /\bг(?:\.|\s)?\s*([а-яё\s-]+?)(?:,|$|\sул|\sобл|\sр-н)/i;
    const prefixMatch = address.match(prefixCityPattern);
    if (prefixMatch && prefixMatch[1]) {
        const cityName = prefixMatch[1].trim();
        if (cityName.length > 1) {
            city = cityName.charAt(0).toUpperCase() + cityName.slice(1);
        }
    }

    if (city === 'Неизвестный город') {
        const postfixCityPattern = /(?:,\s*|(?:\d{6},\s*))([а-яё\s-]+?)\s*г\b/i;
        const postfixMatch = address.match(postfixCityPattern);
        if (postfixMatch && postfixMatch[1]) {
            city = postfixMatch[1].trim().replace(/^\w/, c => c.toUpperCase());
        }
    }

    if (city === 'Неизвестный город') {
        const parts = address.split(',').map(p => p.trim()).filter(Boolean);
        for (const part of parts) {
            const isNumeric = /^\d+$/.test(part);
            const isAbbreviation = /\b(обл|р-н|ул|пр-т|пер|зд|пос|д)\b/i.test(part);
            const hasLetters = /[а-яё]/i.test(part);
            if (hasLetters && !isNumeric && !isAbbreviation && part.length > 2) {
                city = part.replace(/^\w/, c => c.toUpperCase());
                break;
            }
        }
    }

    // --- Now, determine Region ---
    let region = 'Регион не определен';
    
    // 1. Direct search for full region name in the address
    const regionPattern = /([а-яё\s-]+(?:область|край|республика|автономный округ))/i;
    const regionMatch = address.match(regionPattern);
    if (regionMatch && regionMatch[1]) {
        const regionName = regionMatch[1].trim();
        region = regionName.charAt(0).toUpperCase() + regionName.slice(1);
        return { city, region };
    }

    // 2. Map the extracted city to a region
    if (city !== 'Неизвестный город') {
        const normalizedCity = city.toLowerCase();
        if (regionCenters[normalizedCity]) {
            const mappedRegion = regionCenters[normalizedCity];
            region = mappedRegion.charAt(0).toUpperCase() + mappedRegion.slice(1);
            return { city, region };
        }
    }

    // 3. Fallback: search for patterns like "Смоленская обл"
    const abbreviatedRegionPattern = /([а-яё-]+(?:ая|ий))\s+(обл|край|респ)/i;
    const abbreviatedMatch = address.match(abbreviatedRegionPattern);
    if (abbreviatedMatch && abbreviatedMatch[1] && abbreviatedMatch[2]) {
        const regionBase = abbreviatedMatch[1];
        const regionType = abbreviatedMatch[2].startsWith('обл') ? 'область' : abbreviatedMatch[2].startsWith('край') ? 'край' : 'республика';
        const fullRegion = `${regionBase} ${regionType}`;
        region = fullRegion.charAt(0).toUpperCase() + fullRegion.slice(1);
        return { city, region };
    }
     
    return { city, region };
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
        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false });

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

        const aggregatedData: { [key: string]: Omit<AggregatedDataRow, 'clients'> & { clients: Set<string> } } = {};
        
        postMessage({ type: 'progress', payload: { percentage: 5, message: 'Группировка данных по регионам...' } });

        for (let i = 0; i < totalRows; i++) {
            const row = jsonData[i];
            
            const address = row['Адрес ТТ LimKorm'] || `Строка #${i + 2}`;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            
            const { city, region } = extractLocationDetails(address);
            const fact = parseNumericValue(row['Вес, кг']);

            const key = `${region}-${brand}-${rm}`.toLowerCase();

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key,
                    clientName: `${region} (${brand})`,
                    brand,
                    rm,
                    city: region, // The 'city' column in the table will display the region
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
                const percentage = 5 + Math.round((i / totalRows) * 75);
                postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i + 1} из ${totalRows} строк...` } });
            }
        }
        
        const finalData = Object.values(aggregatedData).map(item => ({...item, clients: Array.from(item.clients)}));
        const totalAggregated = finalData.length;

        postMessage({ type: 'progress', payload: { percentage: 80, message: 'Расчет потенциала...' } });

        for (const item of finalData) {
            if (!hasPotentialColumn) {
                item.potential = item.fact * 1.15;
            } else {
                 if (item.potential < item.fact) {
                    item.potential = item.fact;
                }
            }

            item.growthPotential = Math.max(0, item.potential - item.fact);
            item.growthPercentage = item.potential > 0 ? (item.growthPotential / item.potential) * 100 : 0;
            
            // Re-check region from OKB for grouped data for better accuracy if needed
            const firstClientName = item.clients?.[0];
            if (firstClientName) {
                const okbMatch = findBestOkbMatch(firstClientName, item.city, okbDataWithNormalizedNames);
                 // We prioritize the region found by our new logic, but OKB can be a fallback.
                if (item.region === 'Регион не определен' && okbMatch) {
                    item.region = extractRegionFromOkb(okbMatch);
                }
            }

            item.potentialClients = [];
        }

        postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
        postMessage({ type: 'result', payload: finalData });

    } catch (error) {
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};
