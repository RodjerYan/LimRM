// services/processing.worker.ts
import * as xlsx from 'xlsx';
// FIX: The ParsedAddress type is defined in `../types.ts` and should be imported from there,
// not from the address parser module which does not export it.
import { AggregatedDataRow, OkbDataRow, WorkerMessage, ParsedAddress } from '../types';
import { parseRussianAddress } from './addressParser';

const CHUNK_SIZE = 5000; // Process 5,000 rows at a time

self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    const postMessage = (message: WorkerMessage) => self.postMessage(message);

    try {
        postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла в память...' } });
        const data = await file.arrayBuffer();
        const workbook = xlsx.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false });

        if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');
        
        const totalRows = jsonData.length;
        postMessage({ type: 'progress', payload: { percentage: 5, message: `Найдено ${totalRows} строк. Начинаем анализ...` } });

        const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || '').toLowerCase());
        const hasPotentialColumn = headers.includes('потенциал');
        const hasFactColumn = headers.includes('вес, кг');

        if (!hasFactColumn) throw new Error('Файл должен содержать колонку "Вес, кг".');

        const aggregatedData: { [key: string]: Omit<AggregatedDataRow, 'clients'> & { clients: Set<string> } } = {};
        const addressCache = new Map<string, ParsedAddress>();
        
        let processedRows = 0;

        for (let i = 0; i < totalRows; i++) {
            const row = jsonData[i];
            const address = row['Адрес ТТ LimKorm'] || `Строка #${i + 2}`;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            
            let parsedAddress: ParsedAddress;
            if (addressCache.has(address)) {
                parsedAddress = addressCache.get(address)!;
            } else {
                // PERFORMANCE FIX: AI call is disabled by default for mass processing.
                parsedAddress = parseRussianAddress(address);
                addressCache.set(address, parsedAddress);
            }
            
            const region = parsedAddress.region;
            const factString = String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.');
            const fact = parseFloat(factString);

            if (isNaN(fact)) continue;
            
            const key = `${region}-${brand}-${rm}`.toLowerCase();

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, clientName: `${region} (${brand})`, brand, rm,
                    city: parsedAddress.city || region,
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
            
            processedRows++;
            // Report progress every 1000 rows to avoid flooding the main thread
            if (processedRows % 1000 === 0 || processedRows === totalRows) {
                 const percentage = 5 + Math.round((processedRows / totalRows) * 75);
                 postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${processedRows} из ${totalRows} строк...` } });
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
