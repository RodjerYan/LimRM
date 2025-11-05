import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, ParsedAddress } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
import { normalizeAddressForSearch, extractRegionFromOkb } from '../utils/dataUtils';


type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { 
    [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients' | 'currentClients'> & { 
        clients: Set<string>, // all addresses
        regions: Set<string>,
        brands: Set<string>,
        currentClients: Map<string, PotentialClient> // address -> client object with coords
    } 
};

/**
 * Pre-processes OKB data into multiple Maps for efficient lookups.
 * @param okbData - The raw OKB data array.
 * @returns Maps for lookup by region and by normalized address.
 */
const prepareOkbData = (okbData: OkbDataRow[]): { okbByRegion: Map<string, OkbDataRow[]>, okbByAddress: Map<string, OkbDataRow> } => {
    const okbByRegion = new Map<string, OkbDataRow[]>();
    const okbByAddress = new Map<string, OkbDataRow>();
    if (!okbData) return { okbByRegion, okbByAddress };

    for (const row of okbData) {
        const region = extractRegionFromOkb(row);
        if (region && region !== 'Регион не определен') {
            if (!okbByRegion.has(region)) {
                okbByRegion.set(region, []);
            }
            okbByRegion.get(region)!.push(row);
        }
        const address = row['Юридический адрес'];
        if(address) {
            okbByAddress.set(normalizeAddressForSearch(address), row);
        }
    }
    return { okbByRegion, okbByAddress };
};

/**
 * Finds potential clients from the OKB data for a given set of regions, excluding existing clients.
 * @param regions - The normalized regions to search in.
 * @param existingClients - A Set of addresses of clients already processed from the main file.
 * @param okbByRegion - The pre-processed OKB data Map.
 * @returns An array of potential clients, limited to 500 per RM group.
 */
function findPotentialClients(
    regions: Set<string>,
    existingClients: Set<string>,
    okbByRegion: Map<string, OkbDataRow[]>
): PotentialClient[] {
    const potential: PotentialClient[] = [];
    
    for (const region of regions) {
        const potentialForRegion = okbByRegion.get(region) || [];
        for (const okbRow of potentialForRegion) {
            const okbAddress = okbRow['Юридический адрес'] || '';
            const normalizedAddress = normalizeAddressForSearch(okbAddress);
            if (okbAddress && !existingClients.has(normalizedAddress)) {
                potential.push({
                    name: okbRow['Наименование'] || 'Без названия',
                    address: okbAddress,
                    type: okbRow['Вид деятельности'] || 'н/д',
                    lat: parseFloat(String(okbRow['Широта']).replace(',', '.')) || undefined,
                    lon: parseFloat(String(okbRow['Долгота']).replace(',', '.')) || undefined,
                });
            }
             if (potential.length >= 500) return potential; // Limit results for performance
        }
    }
    return potential;
}


/**
 * Processes the final aggregated data to calculate growth metrics and find potential clients.
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
        
        const existingClientAddresses = new Set(Array.from(item.clients).map(addr => normalizeAddressForSearch(addr)));
        const potentialClients = findPotentialClients(item.regions, existingClientAddresses, okbByRegion);
        
        finalData.push({
            ...item,
            potential,
            growthPotential,
            growthPercentage,
            potentialClients,
            currentClients: Array.from(item.currentClients.values()),
            clients: Array.from(item.clients),
            brand: Array.from(item.brands).join(', '),
            region: Array.from(item.regions).join(', ')
        });
    }
    return finalData;
};


/**
 * Main message handler for the worker.
 */
self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        const { okbByRegion, okbByAddress } = prepareOkbData(okbData);

        if (file.name.toLowerCase().endsWith('.csv')) {
            await processCsv(file, okbByRegion, okbByAddress, postMessage);
        } else {
            await processXlsx(file, okbByRegion, okbByAddress, postMessage);
        }
    } catch (error) {
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};

/**
 * Processes XLSX/XLS files.
 */
async function processXlsx(file: File, okbByRegion: Map<string, OkbDataRow[]>, okbByAddress: Map<string, OkbDataRow>, postMessage: PostMessageFn) {
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
            const address = row['Адрес ТТ LimKorm'] || `Строка #${i + index + 2}`;
            
            if (addressCache.has(address)) return { row, parsedAddress: addressCache.get(address)! };
            
            let parsedAddress = await parseRussianAddress(address);

            if (parsedAddress.region === 'Регион не определен') {
                const distributor = row['Дистрибьютор'] || '';
                const cityMatch = distributor.match(/\(([^)]+)\)/);
                if (cityMatch && cityMatch[1]) {
                    const cityFromDistributor = cityMatch[1];
                    const fallbackParsed = await parseRussianAddress(cityFromDistributor);
                    if (fallbackParsed.region !== 'Регион не определен') parsedAddress = fallbackParsed;
                }
            }
            addressCache.set(address, parsedAddress);
            return { row, parsedAddress };
        });

        const resolvedAddresses = await Promise.all(addressParsingJobs);

        resolvedAddresses.forEach(({ row, parsedAddress }) => {
            if (!parsedAddress) return;

            const rm = row['РМ'] || 'Неизвестный РМ';
            const key = rm.toLowerCase();
            
            const region = parsedAddress.region;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const fact = parseFloat(String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.'));
            const address = row['Адрес ТТ LimKorm'] || `Строка #${jsonData.indexOf(row) + 2}`;

            if (isNaN(fact) || region === 'Регион не определен') return;

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, groupName: rm, brand: '', rm, city: '', region: '', 
                    fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                    clients: new Set<string>(),
                    regions: new Set<string>(),
                    brands: new Set<string>(),
                    currentClients: new Map<string, PotentialClient>()
                };
            }
            
            const agg = aggregatedData[key];
            agg.fact += fact;
            agg.clients.add(address);
            agg.regions.add(region);
            agg.brands.add(brand);

            const normalizedAddress = normalizeAddressForSearch(address);
            if (!agg.currentClients.has(normalizedAddress)) {
                const okbMatch = okbByAddress.get(normalizedAddress);
                agg.currentClients.set(normalizedAddress, {
                    name: row['Наименование ТТ'] || 'Без названия',
                    address: address,
                    type: okbMatch?.['Вид деятельности'] || 'н/д',
                    lat: parseFloat(String(okbMatch?.['Широта']).replace(',', '.')) || undefined,
                    lon: parseFloat(String(okbMatch?.['Долгота']).replace(',', '.')) || undefined
                });
            }

            if (hasPotentialColumn) {
                const potential = parseFloat(String(row['Потенциал'] || '0').replace(/\s/g, '').replace(',', '.'));
                if (!isNaN(potential)) agg.potential += potential;
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
 * Processes CSV files.
 */
async function processCsv(file: File, okbByRegion: Map<string, OkbDataRow[]>, okbByAddress: Map<string, OkbDataRow>, postMessage: PostMessageFn) {
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
            const address = row['Адрес ТТ LimKorm'] || `Строка #${row._originalIndex}`;
            if (addressCache.has(address)) return { row, parsedAddress: addressCache.get(address)! };

            let parsedAddress = await parseRussianAddress(address);
            if (parsedAddress.region === 'Регион не определен') {
                const distributor = row['Дистрибьютор'] || '';
                const cityMatch = distributor.match(/\(([^)]+)\)/);
                if (cityMatch && cityMatch[1]) {
                    const fallbackParsed = await parseRussianAddress(cityMatch[1]);
                    if (fallbackParsed.region !== 'Регион не определен') parsedAddress = fallbackParsed;
                }
            }
            addressCache.set(address, parsedAddress);
            return { row, parsedAddress };
        });

        const resolvedAddresses = await Promise.all(addressParsingJobs);

        resolvedAddresses.forEach(({ row, parsedAddress }) => {
            if (!parsedAddress) return;
            
            const rm = row['РМ'] || 'Неизвестный РМ';
            const key = rm.toLowerCase();

            const region = parsedAddress.region;
            const brand = row['Торговая марка'] || 'Неизвестный бренд';
            const fact = parseFloat(String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.'));

            if (isNaN(fact) || region === 'Регион не определен') return;

            if (!aggregatedData[key]) {
                aggregatedData[key] = {
                    key, groupName: rm, brand: '', rm, city: '', region: '',
                    fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                    clients: new Set<string>(),
                    regions: new Set<string>(),
                    brands: new Set<string>(),
                    currentClients: new Map<string, PotentialClient>()
                };
            }

            const agg = aggregatedData[key];
            const address = row['Адрес ТТ LimKorm'] || `Строка #${row._originalIndex}`;
            agg.fact += fact;
            agg.clients.add(address);
            agg.regions.add(region);
            agg.brands.add(brand);

            const normalizedAddress = normalizeAddressForSearch(address);
            if (!agg.currentClients.has(normalizedAddress)) {
                const okbMatch = okbByAddress.get(normalizedAddress);
                agg.currentClients.set(normalizedAddress, {
                    name: row['Наименование ТТ'] || 'Без названия',
                    address: address,
                    type: okbMatch?.['Вид деятельности'] || 'н/д',
                    lat: parseFloat(String(okbMatch?.['Широта']).replace(',', '.')) || undefined,
                    lon: parseFloat(String(okbMatch?.['Долгота']).replace(',', '.')) || undefined,
                });
            }
            
            if (hasPotentialColumn) {
                const potential = parseFloat(String(row['Потенциал'] || '0').replace(/\s/g, '').replace(',', '.'));
                if (!isNaN(potential)) agg.potential += potential;
            }
        });
    };

    return new Promise<void>((resolve, reject) => {
        Papa.parse(file, {
            header: true, skipEmptyLines: true, worker: true,
            step: (results) => {
                rowCounter++;
                if (!headersChecked && results.meta.fields) {
                    hasPotentialColumn = results.meta.fields.some(h => (h || '').toLowerCase() === 'потенциал');
                    headersChecked = true;
                }
                
                const dataWithIndex = { ...results.data as object, _originalIndex: rowCounter + 1 };
                rowBatch.push(dataWithIndex);

                if (rowBatch.length >= BATCH_SIZE) {
                    processingPromises.push(processAndAggregateBatch([...rowBatch]));
                    rowBatch = [];
                }
                
                if (rowCounter % BATCH_SIZE === 0) {
                    const percentage = Math.round((results.meta.cursor / file.size) * 85);
                    postMessage({ type: 'progress', payload: { percentage, message: `Обработано строк: ${rowCounter.toLocaleString('ru-RU')}...` } });
                }
            },
            complete: async () => {
                try {
                    if (rowBatch.length > 0) processingPromises.push(processAndAggregateBatch(rowBatch));
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