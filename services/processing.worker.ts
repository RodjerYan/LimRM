import * as xlsx from 'xlsx';
import { AggregatedDataRow, OkbDataRow, WorkerMessage } from '../types';
import { normalizeAddressForSearch } from '../utils/dataUtils';
import { parseRussianAddress } from './addressParser'; // Import the new expert parser

self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    
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
            
            // Use the new async expert address parser
            const parsedAddress = await parseRussianAddress(address);
            const region = parsedAddress.region || 'Регион не определен';
            
            const factString = String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.');
            const fact = parseFloat(factString);

            if (isNaN(fact)) {
                console.warn(`Invalid number for 'Вес, кг' at row ${i+2}: ${row['Вес, кг']}`);
                continue; // Skip row if fact is not a valid number
            }
            
            const key = `${region}-${brand}-${rm}`.toLowerCase();

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, clientName: `${region} (${brand})`, brand, rm,
                    city: parsedAddress.city || region, // Use parsed city or fallback to region
                    region: region,
                    fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                    clients: new Set<string>(),
                };
            }
            aggregatedData[key].fact += fact;
            aggregatedData[key].clients.add(address);

            if (hasPotentialColumn) {
                const potentialString = String(row['Потенциал'] || '0').replace(/\s/g, '').replace(',', '.');
                const potential = parseFloat(potentialString);
                if (!isNaN(potential)) {
                    aggregatedData[key].potential += potential;
                }
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
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};