import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, ParsedAddress, WorkerResultPayload } from '../types';
import { parseRussianAddress } from './addressParser';
import { standardizeRegion } from '../utils/addressMappings';
import { normalizeAddressForSearch } from '../utils/dataUtils';

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

    for (const pKey of prioritizedKeys) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }

    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    
    const fallbackKey = rowKeys.find(key => key.toLowerCase().includes('город') || key.toLowerCase().includes('регион'));
    if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);

    return null;
};

/**
 * Determines the address and region for a given row using local parsing.
 * @param row The data row from the file.
 * @param addressCache A cache to store results for identical addresses.
 * @returns A promise that resolves to the parsed address information.
 */
const getAddressInfoForRow = async (row: { [key: string]: any }, addressCache: Map<string, ParsedAddress>): Promise<ParsedAddress> => {
    const primaryAddress = findAddressInRow(row);
    if (!primaryAddress) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }
    
    if (addressCache.has(primaryAddress)) {
        return addressCache.get(primaryAddress)!;
    }

    const parsed = await parseRussianAddress(primaryAddress);
    addressCache.set(primaryAddress, parsed);
    return parsed;
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
        const regionKey = findValueInRow(row, ['регион'])
        const region = standardizeRegion(regionKey);
        if (region && region !== 'Регион не определен') {
            if (!okbByRegion.has(region)) {
                okbByRegion.set(region, []);
            }
            okbByRegion.get(region)!.push(row);
        }
    }
    return okbByRegion;
};

const findValueInRow = (row: OkbDataRow, keywords: string[]): string => {
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().includes(keyword));
        if (foundKey && row[foundKey]) {
            return String(row[foundKey]);
        }
    }
    return '';
};

/**
 * Finds potential clients from the OKB data for a given region, excluding existing clients.
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
        const normalizedOkbAddress = normalizeAddressForSearch(okbAddress);
        
        if (okbAddress && !existingClients.has(normalizedOkbAddress)) {
            const client: PotentialClient = {
                name: findValueInRow(okbRow, ['наименование', 'клиент']) || 'Без названия',
                address: okbAddress,
                type: findValueInRow(okbRow, ['вид деятельности', 'тип']) || 'н/д',
            };
            if(okbRow.lat && okbRow.lon) {
                client.lat = okbRow.lat;
                client.lon = okbRow.lon;
            }
            potential.push(client);
        }
        if (potential.length >= 200) break; 
    }
    return potential;
}


/**
 * Processes the final aggregated data to calculate growth metrics and find potential clients.
 */
const finalizeProcessing = async (
    aggregatedData: AggregationMap,
    okbByRegion: Map<string, OkbDataRow[]>,
    hasPotentialColumn: boolean,
    postMessage: PostMessageFn
): Promise<AggregatedDataRow[]> => {
    
    postMessage({ type: 'progress', payload: { percentage: 85, message: 'Расчет потенциала и поиск клиентов...' } });
    
    const finalData: AggregatedDataRow[] = [];
    const aggregatedValues = Object.values(aggregatedData);

    for (const item of aggregatedValues) {
        let potential = item.potential;
        if (!hasPotentialColumn) {
            potential = item.fact * 1.15; 
        } else if (potential < item.fact) {
            potential = item.fact; 
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
 * A multi-stage algorithm to reliably find the header for the client's name.
 * It prioritizes specific headers, then looks for "clean" generic headers,
 * and finally falls back to the first available generic header to prevent failure.
 * @param headers An array of header strings from the file.
 * @returns The determined client name header string, or undefined if none found.
 */
const findClientNameHeader = (headers: string[]): string | undefined => {
    const lowerHeaders = headers.map(h => h.toLowerCase());

    // 1. Highest priority: specific, unambiguous terms.
    const priorityTerms = ['наименование клиента', 'контрагент', 'клиент'];
    for (const term of priorityTerms) {
        const foundIndex = lowerHeaders.findIndex(h => h.includes(term));
        if (foundIndex !== -1) {
            return headers[foundIndex];
        }
    }

    // 2. Medium priority: find columns named 'наименование'.
    const nameColumns = headers.filter(h => h.toLowerCase().includes('наименование'));
    if (nameColumns.length === 0) {
        return undefined; // No column with 'наименование' found.
    }

    // Try to find a "clean" name column that is NOT product-related.
    const cleanNameColumn = nameColumns.find(h => {
        const lH = h.toLowerCase();
        return !lH.includes('номенклатур') && !lH.includes('товар') && !lH.includes('продук');
    });

    if (cleanNameColumn) {
        return cleanNameColumn; // Found a good candidate.
    }

    // 3. Fallback: If all 'наименование' columns seemed product-related (or we couldn't tell),
    // return the very first one we found. This is better than returning nothing and showing "Без названия".
    return nameColumns[0];
};


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


async function processXlsx(file: File, okbByRegion: Map<string, OkbDataRow[]>, postMessage: PostMessageFn) {
    postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла XLSX...' } });
    const data = await file.arrayBuffer();
    const workbook = xlsx.read(data, { type: 'array', cellDates: false, cellNF: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });

    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');
    
    const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase().includes('потенциал'));
    if (!headers.some(h => (h || '').toLowerCase().includes('вес'))) throw new Error('Файл должен содержать колонку "Вес".');
    
    const clientNameHeader = findClientNameHeader(headers);
    const aggregatedData: AggregationMap = {};
    const addressCache = new Map<string, ParsedAddress>();
    const activeAddresses = new Set<string>();
    
    postMessage({ type: 'progress', payload: { percentage: 5, message: 'Анализ данных...' } });

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const parsedAddress = await getAddressInfoForRow(row, addressCache);

        const region = parsedAddress.region;
        const brandKey = Object.keys(row).find(k => k.toLowerCase().includes('торговая марка')) || 'Торговая марка';
        const brand = row[brandKey] || 'Неизвестный бренд';
        const rmKey = Object.keys(row).find(k => k.toLowerCase().includes('рм')) || 'РМ';
        const rm = row[rmKey] || 'Неизвестный РМ';
        const weightKey = Object.keys(row).find(k => k.toLowerCase().includes('вес')) || 'Вес, кг';
        const fact = parseFloat(String(row[weightKey] || '0').replace(/\s/g, '').replace(',', '.'));
        
        const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
        const clientAddress = findAddressInRow(row);
        
        // Use address for display list if available, otherwise fall back to name
        const clientDisplayValue = clientAddress || clientName;

        // Use address for matching, with a more robust fallback
        const addressForMatching = clientAddress || `${clientName} (строка #${i + 2})`;
        if (addressForMatching) {
            activeAddresses.add(normalizeAddressForSearch(addressForMatching));
        }

        if (isNaN(fact) || region === 'Регион не определен') continue;

        const key = `${region}-${brand}-${rm}`.toLowerCase();
        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                key, clientName: `${region} (${brand})`, brand, rm, city: parsedAddress.city || region,
                region: region, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Set<string>(),
            };
        }
        aggregatedData[key].fact += fact;
        aggregatedData[key].clients.add(clientDisplayValue);

        if (hasPotentialColumn) {
            const potentialKey = Object.keys(row).find(k => k.toLowerCase().includes('потенциал')) || 'Потенциал';
            const potential = parseFloat(String(row[potentialKey] || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) aggregatedData[key].potential += potential;
        }

        if(i % 100 === 0) {
            const percentage = 5 + Math.round((i / jsonData.length) * 80);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i} из ${jsonData.length} строк...` } });
        }
    }
    
    const finalData = await finalizeProcessing(aggregatedData, okbByRegion, hasPotentialColumn, postMessage);
    
    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
    const resultPayload: WorkerResultPayload = { aggregatedData: finalData, activeAddresses: Array.from(activeAddresses) };
    postMessage({ type: 'result', payload: resultPayload });
}


async function processCsv(file: File, okbByRegion: Map<string, OkbDataRow[]>, postMessage: PostMessageFn) {
    postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла CSV...' } });

    const aggregatedData: AggregationMap = {};
    const addressCache = new Map<string, ParsedAddress>();
    const activeAddresses = new Set<string>();
    let hasPotentialColumn = false;
    let clientNameHeader: string | undefined = undefined;

    return new Promise<void>((resolve, reject) => {
        let rowCounter = 0;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true, 
            step: async (results, parser) => {
                parser.pause();
                try {
                    const row = results.data as any;
                     if(rowCounter === 0) {
                        const headers = Object.keys(row);
                        hasPotentialColumn = headers.some(h => (h || '').toLowerCase().includes('потенциал'));
                        if (!headers.some(h => (h || '').toLowerCase().includes('вес'))) {
                           throw new Error('Файл должен содержать колонку "Вес".');
                        }
                        clientNameHeader = findClientNameHeader(headers);
                    }

                    const parsedAddress = await getAddressInfoForRow(row, addressCache);
                    const region = parsedAddress.region;

                    const brandKey = Object.keys(row).find(k => k.toLowerCase().includes('торговая марка')) || 'Торговая марка';
                    const brand = row[brandKey] || 'Неизвестный бренд';
                    const rmKey = Object.keys(row).find(k => k.toLowerCase().includes('рм')) || 'РМ';
                    const rm = row[rmKey] || 'Неизвестный РМ';
                    const weightKey = Object.keys(row).find(k => k.toLowerCase().includes('вес')) || 'Вес, кг';
                    const fact = parseFloat(String(row[weightKey] || '0').replace(/\s/g, '').replace(',', '.'));
                    
                    const clientName = (clientNameHeader && row[clientNameHeader]) ? String(row[clientNameHeader]) : 'Без названия';
                    const clientAddress = findAddressInRow(row);

                    // Use address for display list if available, otherwise fall back to name
                    const clientDisplayValue = clientAddress || clientName;

                    // Use address for matching, with a more robust fallback
                    const addressForMatching = clientAddress || `${clientName} (строка #${rowCounter + 2})`;
                    if (addressForMatching) {
                        activeAddresses.add(normalizeAddressForSearch(addressForMatching));
                    }

                    if (!isNaN(fact) && region !== 'Регион не определен') {
                        const key = `${region}-${brand}-${rm}`.toLowerCase();
                        if (!aggregatedData[key]) {
                            aggregatedData[key] = {
                                key, clientName: `${region} (${brand})`, brand, rm, city: parsedAddress.city || region,
                                region: region, fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                                clients: new Set<string>(),
                            };
                        }
                        aggregatedData[key].fact += fact;
                        aggregatedData[key].clients.add(clientDisplayValue);
                        
                        if (hasPotentialColumn) {
                            const potentialKey = Object.keys(row).find(k => k.toLowerCase().includes('потенциал')) || 'Потенциал';
                            const potential = parseFloat(String(row[potentialKey] || '0').replace(/\s/g, '').replace(',', '.'));
                            if (!isNaN(potential)) aggregatedData[key].potential += potential;
                        }
                    }

                    rowCounter++;
                    if(rowCounter % 200 === 0) {
                        const percentage = Math.round((results.meta.cursor / file.size) * 85);
                        postMessage({ type: 'progress', payload: { percentage, message: `Обработано строк: ${rowCounter.toLocaleString('ru-RU')}...` } });
                    }
                } catch(e) {
                    parser.abort();
                    reject(e);
                } finally {
                    parser.resume();
                }
            },
            complete: async () => {
                try {
                    const finalData = await finalizeProcessing(aggregatedData, okbByRegion, hasPotentialColumn, postMessage);
                    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
                    const resultPayload: WorkerResultPayload = { aggregatedData: finalData, activeAddresses: Array.from(activeAddresses) };
                    postMessage({ type: 'result', payload: resultPayload });
                    resolve();
                } catch (e) {
                    reject(e);
                }
            },
            error: (err) => reject(err),
        });
    });
}