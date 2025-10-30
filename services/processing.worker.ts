import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient } from '../types';
import { parseRussianAddress } from './addressParser';
import { normalizeRegion } from '../utils/addressMappings';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };

/**
 * Pre-processes OKB data into a Map for efficient lookups by region.
 * @param okbData - The raw OKB data array.
 * @returns A Map where keys are normalized region names and values are arrays of OKB rows.
 */
const prepareOkbData = (okbData: OkbDataRow[]): Map<string, OkbDataRow[]> => {
    const okbByRegion = new Map<string, OkbDataRow[]>();
    if (!okbData) return okbByRegion;
    for (const row of okbData) {
        const region = normalizeRegion(row['Регион'] || '');
        if (region) {
            if (!okbByRegion.has(region)) {
                okbByRegion.set(region, []);
            }
            okbByRegion.get(region)!.push(row);
        }
    }
    return okbByRegion;
};

/**
 * Finds potential clients from the OKB data for a given region, excluding existing clients.
 * @param region - The normalized region to search in.
 * @param existingClients - A Set of addresses of clients already processed from the main file.
 * @param okbByRegion - The pre-processed OKB data Map.
 * @returns An array of potential clients, limited to 100 per group.
 */
function findPotentialClients(
    region: string,
    existingClients: Set<string>,
    okbByRegion: Map<string, OkbDataRow[]>
): PotentialClient[] {
    const potentialForRegion = okbByRegion.get(region) || [];
    if (potentialForRegion.length === 0) return [];

    const potential: PotentialClient[] = [];
    for (const okbRow of potentialForRegion) {
        const okbAddress = okbRow['Юридический адрес'] || '';
        if (okbAddress && !existingClients.has(okbAddress)) {
            potential.push({
                name: okbRow['Наименование'] || 'Без названия',
                address: okbAddress,
                type: okbRow['Вид деятельности'] || 'н/д',
            });
        }
        if (potential.length >= 100) break; // Limit results for performance
    }
    return potential;
}


/**
 * Processes the final aggregated data to calculate growth metrics and find potential clients.
 * @param aggregatedData - The map of aggregated data.
 * @param okbByRegion - The pre-processed OKB data.
 * @param hasPotentialColumn - Flag indicating if the source file had a 'Потенциал' column.
 * @param postMessage - The function to send progress messages back to the main thread.
 */
const finalizeProcessing = (
    aggregatedData: AggregationMap,
    okbByRegion: Map<string, OkbDataRow[]>,
    hasPotentialColumn: boolean,
    postMessage: PostMessageFn
): AggregatedDataRow[] => {
    
    postMessage({ type: 'progress', payload: { percentage: 85, message: 'Расчет потенциала и поиск клиентов...' } });
    
    const finalData: AggregatedDataRow[] = [];
    const aggregatedValues = Object.values(aggregatedData);

    for (const item of aggregatedValues) {
        let potential = item.potential;
        if (!hasPotentialColumn) {
            potential = item.fact * 1.15; // Fallback potential calculation
        } else if (potential < item.fact) {
            potential = item.fact; // Potential cannot be less than fact
        }
        
        const growthPotential = Math.max(0, potential - item.fact);
        const growthPercentage = potential > 0 ? (growthPotential / potential) * 100 : 0;
        
        const potentialClients = findPotentialClients(item.region, item.clients, okbByRegion);
        
        finalData.push({
            ...item,
            potential,
            growthPotential,
            growthPercentage,
            potentialClients,
            clients: Array.from(item.clients)
        });
    }
    return finalData;
};


/**
 * Main message handler for the worker.
 * Determines the file type and calls the appropriate processor.
 */
self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        const okbByRegion = prepareOkbData(okbData);

        if (file.name.toLowerCase().endsWith('.csv')) {
            await processCsv(file, okbByRegion, postMessage);
        } else {
            await processXlsx(file, okbByRegion, postMessage);
        }
    } catch (error) {
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};

/**
 * Processes XLSX/XLS files using batching for improved performance.
 */
async function processXlsx(file: File, okbByRegion: Map<string, OkbDataRow[]>, postMessage: PostMessageFn) {
    postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла XLSX...' } });
    const data = await file.arrayBuffer();
    const workbook = xlsx.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false });

    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');
    
    const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase() === 'потенциал');
    if (!headers.some(h => (h || '').toLowerCase() === 'вес, кг')) throw new Error('Файл должен содержать колонку "Вес, кг".');
    
    const aggregatedData: AggregationMap = {};
    const BATCH_SIZE = 500;
    
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Анализ и группировка данных...' } });

    for (let i = 0; i < jsonData.length; i += BATCH_SIZE) {
        const batch = jsonData.slice(i, i + BATCH_SIZE);
        const parsedAddresses = await Promise.all(
            batch.map(row => parseRussianAddress(row['Адрес ТТ LimKorm'] || `Строка #${i + batch.indexOf(row) + 2}`))
        );

        batch.forEach((row, index) => {
            const address = row['Адрес ТТ LimKorm'] || `Строка #${i + index + 2}`;
            const parsedAddress = parsedAddresses[index];
            const region = parsedAddress.region || 'Регион не определён';
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            const fact = parseFloat(String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.'));

            if (isNaN(fact)) return;

            const key = `${region}-${brand}-${rm}`.toLowerCase();
            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, clientName: `${region} (${brand})`, brand, rm, city: parsedAddress.city || region,
                    region: region, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                    clients: new Set<string>(),
                };
            }
            aggregatedData[key].fact += fact;
            aggregatedData[key].clients.add(address);

            if (hasPotentialColumn) {
                const potential = parseFloat(String(row['Потенциал'] || '0').replace(/\s/g, '').replace(',', '.'));
                if (!isNaN(potential)) aggregatedData[key].potential += potential;
            }
        });

        const percentage = 5 + Math.round(((i + batch.length) / jsonData.length) * 80);
        postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i + batch.length} из ${jsonData.length} строк...` } });
    }
    
    const finalData = finalizeProcessing(aggregatedData, okbByRegion, hasPotentialColumn, postMessage);
    
    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
    postMessage({ type: 'result', payload: finalData });
}

/**
 * Processes CSV files using a streaming parser for high performance and low memory usage.
 */
async function processCsv(file: File, okbByRegion: Map<string, OkbDataRow[]>, postMessage: PostMessageFn) {
    postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла CSV...' } });

    const aggregatedData: AggregationMap = {};
    const BATCH_SIZE = 500;
    let rowBatch: any[] = [];
    const processingPromises: Promise<void>[] = [];
    let hasPotentialColumn = false;

    const processAndAggregateBatch = async (batch: any[]) => {
        const parsedAddresses = await Promise.all(
            batch.map(row => parseRussianAddress(row['Адрес ТТ LimKorm'] || ''))
        );
        
        batch.forEach((row, i) => {
            const parsedAddress = parsedAddresses[i];
            const region = parsedAddress.region || 'Регион не определён';
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            const fact = parseFloat(String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.'));

            if (isNaN(fact)) return;

            const key = `${region}-${brand}-${rm}`.toLowerCase();
            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, clientName: `${region} (${brand})`, brand, rm, city: parsedAddress.city || region,
                    region: region, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                    clients: new Set<string>(),
                };
            }
            aggregatedData[key].fact += fact;
            aggregatedData[key].clients.add(row['Адрес ТТ LimKorm'] || `Строка #${i + 2}`);
            
            if (hasPotentialColumn) {
                const potential = parseFloat(String(row['Потенциал'] || '0').replace(/\s/g, '').replace(',', '.'));
                if (!isNaN(potential)) aggregatedData[key].potential += potential;
            }
        });
    };

    return new Promise<void>((resolve, reject) => {
        // FIX: Corrected typo 'letrowCount' to 'let rowCount'. This resolves the 'Cannot find name' errors for rowCount.
        let rowCount = 0;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true, // Use PapaParse's internal worker for parsing
            step: (results) => {
                rowCount++;
                if (!hasPotentialColumn && results.meta.fields) {
                    hasPotentialColumn = results.meta.fields.some(h => (h || '').toLowerCase() === 'потенциал');
                }
                
                rowBatch.push(results.data);
                if (rowBatch.length >= BATCH_SIZE) {
                    processingPromises.push(processAndAggregateBatch([...rowBatch]));
                    rowBatch = [];
                }
                
                const percentage = Math.round((results.meta.cursor / file.size) * 85);
                postMessage({ type: 'progress', payload: { percentage, message: `Обработано строк: ${rowCount}...` } });
            },
            complete: async () => {
                try {
                    if (rowBatch.length > 0) {
                        processingPromises.push(processAndAggregateBatch(rowBatch));
                    }
                    await Promise.all(processingPromises);

                    const finalData = finalizeProcessing(aggregatedData, okbByRegion, hasPotentialColumn, postMessage);
                    
                    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
                    postMessage({ type: 'result', payload: finalData });
                    resolve();
                } catch (e) {
                    reject(e);
                }
            },
            error: (err) => reject(err),
        });
    });
}