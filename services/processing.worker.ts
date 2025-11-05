import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, ParsedAddress } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';

type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients'> & { clients: Set<string> } };

/**
 * A robust helper function to find an address value within a data row.
 * It searches for keys in a prioritized order, using both exact and partial matches.
 * @param row The data row object.
 * @returns The found address string or null.
 */
const findAddressInRow = (row: { [key: string]: any }): string | null => {
    const rowKeys = Object.keys(row);
    const prioritizedKeys = ['адрес тт limkorm', 'юридический адрес', 'адрес'];

    // 1. Prioritized exact match (case-insensitive)
    for (const pKey of prioritizedKeys) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }

    // 2. Substring match for 'адрес'
    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    
    // 3. Fallback to 'город' or 'регион'
    const fallbackKey = rowKeys.find(key => key.toLowerCase().includes('город') || key.toLowerCase().includes('регион'));
    if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);

    return null;
};


/**
 * Pre-processes OKB data into a Map for efficient lookups by region.
 * @param okbData - The raw OKB data array.
 * @returns A Map where keys are normalized region names and values are arrays of OKB rows.
 */
const prepareOkbData = (okbData: OkbDataRow[]): Map<string, OkbDataRow[]> => {
    const okbByRegion = new Map<string, OkbDataRow[]>();
    if (!okbData) return okbByRegion;
    for (const row of okbData) {
        const region = standardizeRegion(row['Регион'] || '');
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
        const okbAddress = findAddressInRow(okbRow) || '';
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
    const workbook = xlsx.read(data, { type: 'array', cellDates: false, cellNF: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });

    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');
    
    const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase() === 'потенциал');
    if (!headers.some(h => (h || '').toLowerCase() === 'вес, кг')) throw new Error('Файл должен содержать колонку "Вес, кг".');
    
    const aggregatedData: AggregationMap = {};
    const addressCache = new Map<string, ParsedAddress>();
    const BATCH_SIZE = 500;
    
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Параллельный парсинг адресов...' } });

    for (let i = 0; i < jsonData.length; i += BATCH_SIZE) {
        const batch = jsonData.slice(i, i + BATCH_SIZE);
        
        const addressParsingJobs = batch.map(async (row, index) => {
            const address = findAddressInRow(row) || `Строка #${i + index + 2}`;
            
            if (addressCache.has(address)) {
                return { row, parsedAddress: addressCache.get(address)! };
            }
            
            let parsedAddress = await parseRussianAddress(address);

            // NEW: Fallback logic using the distributor column
            if (parsedAddress.region === 'Регион не определен') {
                const distributor = row['Дистрибьютор'] || '';
                const cityMatch = distributor.match(/\(([^)]+)\)/);
                if (cityMatch && cityMatch[1]) {
                    const cityFromDistributor = cityMatch[1];
                    const fallbackParsed = await parseRussianAddress(cityFromDistributor);
                    if (fallbackParsed.region !== 'Регион не определен') {
                        parsedAddress = fallbackParsed;
                    }
                }
            }

            addressCache.set(address, parsedAddress);
            return { row, parsedAddress };
        });

        const resolvedAddresses = await Promise.all(addressParsingJobs);

        resolvedAddresses.forEach(({ row, parsedAddress }) => {
            if (!parsedAddress) return;

            const region = parsedAddress.region;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            const fact = parseFloat(String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.'));
            const clientAddress = findAddressInRow(row) || `Строка #${jsonData.indexOf(row) + 2}`;

            if (isNaN(fact) || region === 'Регион не определен') return;

            const key = `${region}-${brand}-${rm}`.toLowerCase();
            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, clientName: `${region} (${brand})`, brand, rm, city: parsedAddress.city || region,
                    region: region, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                    clients: new Set<string>(),
                };
            }
            aggregatedData[key].fact += fact;
            aggregatedData[key].clients.add(clientAddress);

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
    const addressCache = new Map<string, ParsedAddress>();
    const BATCH_SIZE = 1000;
    let rowBatch: any[] = [];
    let processingPromises: Promise<void>[] = [];
    let hasPotentialColumn = false;
    let headersChecked = false;
    let rowCounter = 0;

    const processAndAggregateBatch = async (batch: any[]) => {
        const addressParsingJobs = batch.map(async (row) => {
            const address = findAddressInRow(row) || `Строка #${row._originalIndex}`;
             if (addressCache.has(address)) {
                return { row, parsedAddress: addressCache.get(address)! };
            }
            
            let parsedAddress = await parseRussianAddress(address);

            if (parsedAddress.region === 'Регион не определен') {
                const distributor = row['Дистрибьютор'] || '';
                const cityMatch = distributor.match(/\(([^)]+)\)/);
                if (cityMatch && cityMatch[1]) {
                    const cityFromDistributor = cityMatch[1];
                    const fallbackParsed = await parseRussianAddress(cityFromDistributor);
                    if (fallbackParsed.region !== 'Регион не определен') {
                        parsedAddress = fallbackParsed;
                    }
                }
            }

            addressCache.set(address, parsedAddress);
            return { row, parsedAddress };
        });

        const resolvedAddresses = await Promise.all(addressParsingJobs);

        resolvedAddresses.forEach(({ row, parsedAddress }) => {
            if (!parsedAddress) return;

            const region = parsedAddress.region;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const rm = row['РМ'] || 'Неизвестный РМ';
            const fact = parseFloat(String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.'));
            const clientAddress = findAddressInRow(row) || `Строка #${row._originalIndex}`;

            if (isNaN(fact) || region === 'Регион не определен') return;

            const key = `${region}-${brand}-${rm}`.toLowerCase();
            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, clientName: `${region} (${brand})`, brand, rm, city: parsedAddress.city || region,
                    region: region, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                    clients: new Set<string>(),
                };
            }
            aggregatedData[key].fact += fact;
            aggregatedData[key].clients.add(clientAddress);
            
            if (hasPotentialColumn) {
                const potential = parseFloat(String(row['Потенциал'] || '0').replace(/\s/g, '').replace(',', '.'));
                if (!isNaN(potential)) aggregatedData[key].potential += potential;
            }
        });
    };

    return new Promise<void>((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true,
            step: (results) => {
                rowCounter++;
                if (!headersChecked && results.meta.fields) {
                    hasPotentialColumn = results.meta.fields.some(h => (h || '').toLowerCase() === 'потенциал');
                    headersChecked = true;
                }
                
                const dataWithIndex = { ...results.data as object, _originalIndex: rowCounter + 1 };
                rowBatch.push(dataWithIndex);

                if (rowBatch.length >= BATCH_SIZE) {
                    const batchToProcess = [...rowBatch];
                    rowBatch = [];
                    processingPromises.push(processAndAggregateBatch(batchToProcess));
                }
                
                const percentage = Math.round((results.meta.cursor / file.size) * 85);
                 if (rowCounter % BATCH_SIZE === 0) { // Update progress less frequently
                    postMessage({ type: 'progress', payload: { percentage, message: `Обработано строк: ${rowCounter.toLocaleString('ru-RU')}...` } });
                }
            },
            complete: async () => {
                try {
                    if (rowBatch.length > 0) {
                        processingPromises.push(processAndAggregateBatch(rowBatch));
                    }
                    
                    // Throttle promises to avoid overwhelming the system
                    const CONCURRENCY_LIMIT = 4;
                    for (let i = 0; i < processingPromises.length; i += CONCURRENCY_LIMIT) {
                        const batch = processingPromises.slice(i, i + CONCURRENCY_LIMIT);
                        await Promise.all(batch);
                    }

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