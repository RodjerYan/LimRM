
import * as XLSX from 'xlsx';
import { AggregatedDataRow, OkbDataRow } from '../types';
import { normalizeString, findBestOkbMatch, extractRegionFromOkb } from '../utils/dataUtils';

// Определяем интерфейс для промежуточной сгруппированной структуры данных, чтобы обеспечить строгую типизацию
interface GroupedRow {
    rm: string;
    clientName: string;
    brand: string;
    city: string;
    fact: number;
    potential: number;
    clients: string[];
}


// Define expected column names from the input file for robustness
const COLUMNS = {
    RM: 'РМ',
    CLIENT_NAME: 'Клиент',
    BRAND: 'Бренд',
    CITY: 'Город',
    FACT: 'Факт',
    POTENTIAL: 'Потенциал'
};

/**
 * Handles incoming messages to the worker, triggering the file processing logic.
 */
self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;

    try {
        postMessage({ type: 'progress', payload: { percentage: 5, message: 'Чтение файла...' } });
        
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
            throw new Error('Файл пуст или имеет неверный формат.');
        }
        
        postMessage({ type: 'progress', payload: { percentage: 15, message: 'Нормализация данных ОКБ...' } });

        // Pre-normalize OKB data for faster matching during processing
        const normalizedOkbData = okbData.map(okb => ({
            ...okb,
            normalizedName: normalizeString(okb['Наименование']),
        }));

        postMessage({ type: 'progress', payload: { percentage: 25, message: 'Группировка данных...' } });
        
        const groupedData: Map<string, GroupedRow> = new Map();
        const totalRows = jsonData.length;

        jsonData.forEach((row, index) => {
            const rm = row[COLUMNS.RM] || 'Не указан';
            const clientName = row[COLUMNS.CLIENT_NAME] || 'Не указан';
            const brand = row[COLUMNS.BRAND] || 'Не указан';
            const city = row[COLUMNS.CITY] || 'Не указан';
            
            // Ensure numeric values, defaulting to 0 if invalid
            const fact = Number(row[COLUMNS.FACT]) || 0;
            const potential = Number(row[COLUMNS.POTENTIAL]) || 0;
            
            if (clientName === 'Не указан') return; // Skip rows without a client name

            // Group by a composite key of RM, normalized client name, brand, and city
            const groupKey = `${rm}|${normalizeString(clientName)}|${brand}|${city}`;

            if (!groupedData.has(groupKey)) {
                groupedData.set(groupKey, {
                    rm,
                    clientName,
                    brand,
                    city,
                    fact: 0,
                    potential: 0,
                    clients: [],
                });
            }

            const group = groupedData.get(groupKey)!;
            group.fact += fact;
            group.potential += potential;
            // Store original client names for display in the modal
            group.clients.push(clientName);

            // Send progress update every 100 rows to avoid spamming the main thread
            if (index > 0 && index % 100 === 0) {
                const percentage = 25 + Math.round((index / totalRows) * 50);
                postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${index} из ${totalRows} строк...` } });
            }
        });

        postMessage({ type: 'progress', payload: { percentage: 80, message: 'Расчет и обогащение данных...' } });

        const aggregatedResults: AggregatedDataRow[] = [];

        for (const group of groupedData.values()) {
            const growthPotential = Math.max(0, group.potential - group.fact);
            const growthPercentage = group.potential > 0 ? (growthPotential / group.potential) * 100 : 0;
            
            // Enrich with region data by finding the best match in the OKB
            const okbMatch = findBestOkbMatch(group.clientName, group.city, normalizedOkbData);
            const region = okbMatch ? extractRegionFromOkb(okbMatch) : 'Регион не определен';

            aggregatedResults.push({
                key: `${group.rm}-${group.clientName}-${group.brand}-${group.city}`,
                rm: group.rm,
                clientName: group.clientName,
                brand: group.brand,
                city: group.city,
                region: region,
                fact: group.fact,
                potential: group.potential,
                growthPotential,
                growthPercentage,
                clients: [...new Set(group.clients)], // Ensure unique client names
            });
        }

        postMessage({ type: 'progress', payload: { percentage: 100, message: 'Готово!' } });
        postMessage({ type: 'result', payload: aggregatedResults });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Произошла неизвестная ошибка в воркере.';
        console.error('Processing worker error:', error);
        postMessage({ type: 'error', payload: errorMessage });
    }
};