
import * as xlsx from 'xlsx';
import { RawDataRow, OkbDataRow, AggregatedDataRow } from '../types';
import { normalizeString, findBestOkbMatch, extractRegionFromOkb } from '../utils/dataUtils';

// Helper to post progress messages
const postProgress = (percentage: number, message: string) => {
    self.postMessage({ type: 'progress', payload: { percentage, message } });
};

self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;

    try {
        postProgress(5, 'Чтение файла...');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = xlsx.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData: RawDataRow[] = xlsx.utils.sheet_to_json(worksheet);

        postProgress(15, 'Нормализация данных ОКБ...');
        const normalizedOkb = okbData.map(item => ({
            ...item,
            normalizedName: normalizeString(item['Наименование полное']),
        }));

        postProgress(25, 'Агрегация данных...');
        const totalRows = rawData.length;
        const aggregationMap = new Map<string, AggregatedDataRow>();

        rawData.forEach((row, index) => {
            // Assume column names from the problem description
            const rm = row['РМ']?.toString().trim() || 'Не указан';
            const clientName = row['Клиент']?.toString().trim();
            const brand = row['Бренд']?.toString().trim() || 'Не указан';
            const city = row['Город']?.toString().trim() || 'Не указан';
            const fact = parseFloat(row['Факт, кг/ед']?.toString().replace(',', '.') || '0') || 0;
            const potential = parseFloat(row['Потенциал, кг/ед']?.toString().replace(',', '.') || '0') || 0;
            
            if (!clientName) return; // Skip rows without a client name

            const key = `${rm}-${clientName}-${brand}-${city}`;
            
            let entry = aggregationMap.get(key);
            if (!entry) {
                // Find matching OKB data to get region
                const bestMatch = findBestOkbMatch(clientName, city, normalizedOkb);
                const region = bestMatch ? extractRegionFromOkb(bestMatch) : 'Регион не определен';
                
                entry = {
                    key,
                    rm,
                    clientName,
                    brand,
                    city,
                    region,
                    fact: 0,
                    potential: 0,
                    growthPotential: 0,
                    growthPercentage: 0, // This will be recalculated at the end
                };
            }
            
            entry.fact += fact;
            entry.potential += potential;
            aggregationMap.set(key, entry);

            if ((index + 1) % 100 === 0) {
                const percentage = 25 + Math.round(((index + 1) / totalRows) * 70);
                postProgress(percentage, `Обработка строки ${index + 1} из ${totalRows}`);
            }
        });

        postProgress(95, 'Завершение агрегации...');
        const finalData: AggregatedDataRow[] = Array.from(aggregationMap.values()).map(item => {
            const growthPotential = Math.max(0, item.potential - item.fact);
            const growthPercentage = item.potential > 0 ? (growthPotential / item.potential) * 100 : 0;
            return {
                ...item,
                growthPotential,
                growthPercentage,
            };
        });

        postProgress(100, 'Готово!');
        self.postMessage({ type: 'result', payload: finalData });
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({ type: 'error', payload: (error as Error).message });
    }
};

export {};
