import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { AggregatedDataRow, OkbDataRow, WorkerMessage, PotentialClient, ParsedAddress } from '../types';
import { parseRussianAddress } from './addressParser';

const normalizeAddressForSearch = (address: string): string => {
    if (!address) return '';
    return address
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[,.]/g, ' ')
        .replace(/\b(ул|улица|д|дом|к|корп|корпус|стр|строение|обл|область|г|город|р-н|район)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};


type PostMessageFn = (message: WorkerMessage) => void;
type AggregationMap = { 
    [key: string]: Omit<AggregatedDataRow, 'clients' | 'potentialClients' | 'currentClients'> & { 
        clients: Set<string>, // all addresses
        cities: Set<string>,
        brands: Set<string>,
        currentClients: Map<string, PotentialClient> // address -> client object with coords
    } 
};

/**
 * Main message handler for the worker.
 */
self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        if (file.name.toLowerCase().endsWith('.csv')) {
            await processCsv(file, okbData, postMessage);
        } else {
            await processXlsx(file, okbData, postMessage);
        }
    } catch (error) {
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};

const processData = async (
    jsonData: any[], 
    okbData: OkbDataRow[],
    postMessage: PostMessageFn
) => {
    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');
    
    const headers = Object.keys(jsonData[0] || {});
    const hasPotentialColumn = headers.some(h => (h || '').toLowerCase() === 'потенциал');
    if (!headers.some(h => (h || '').toLowerCase() === 'вес, кг')) throw new Error('Файл должен содержать колонку "Вес, кг".');
    
    const aggregatedData: AggregationMap = {};
    
    const okbByAddress = new Map<string, OkbDataRow>();
    if (okbData) {
        for (const row of okbData) {
            const address = row['Юридический адрес'];
            if(address) {
                okbByAddress.set(normalizeAddressForSearch(address), row);
            }
        }
    }

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        const address = row['Адрес ТТ LimKorm'] || `Строка #${row._originalIndex || i + 2}`;
        const { city, region } = await parseRussianAddress(address);

        const rm = row['РМ'] || 'Неизвестный РМ';
        const key = rm.toLowerCase(); // Aggregate by RM
        
        const brand = row['Торговая марка'] || 'Неизвестный бренд';
        const fact = parseFloat(String(row['Вес, кг'] || '0').replace(/\s/g, '').replace(',', '.'));

        if (isNaN(fact)) continue;

        if (!aggregatedData[key]) {
            aggregatedData[key] = {
                // FIX: Removed 'region' property which does not exist on the AggregatedDataRow type.
                key, groupName: rm, brand: '', rm, city: '',
                fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Set<string>(),
                cities: new Set<string>(),
                brands: new Set<string>(),
                currentClients: new Map<string, PotentialClient>()
            };
        }
        
        const agg = aggregatedData[key];
        agg.fact += fact;
        agg.clients.add(address);
        agg.brands.add(brand);
        if (city && city !== 'Город не определён') {
            agg.cities.add(city);
        }

        const normalizedAddress = normalizeAddressForSearch(address);
        if (!agg.currentClients.has(normalizedAddress)) {
            const okbMatch = okbByAddress.get(normalizedAddress);
            agg.currentClients.set(normalizedAddress, {
                name: row['Наименование ТТ'] || 'Без названия',
                address: address,
                type: okbMatch?.['Вид деятельности'] || 'н/д',
                lat: okbMatch ? parseFloat(String(okbMatch['Широта']).replace(',', '.')) || undefined : undefined,
                lon: okbMatch ? parseFloat(String(okbMatch['Долгота']).replace(',', '.')) || undefined : undefined
            });
        }
        
        if (hasPotentialColumn) {
            const potential = parseFloat(String(row['Потенциал'] || '0').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(potential)) agg.potential += potential;
        }

        if (i % 100 === 0) {
            const percentage = Math.round((i / jsonData.length) * 85);
            postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${i} из ${jsonData.length} строк...` } });
        }
    }
    
    postMessage({ type: 'progress', payload: { percentage: 85, message: 'Расчет потенциала...' } });
    
    const finalData: AggregatedDataRow[] = Object.values(aggregatedData).map(item => {
        let potential = item.potential;
        if (!hasPotentialColumn) {
            potential = item.fact * 1.15;
        } else if (potential < item.fact) {
            potential = item.fact;
        }
        
        const growthPotential = Math.max(0, potential - item.fact);
        const growthPercentage = potential > 0 ? (growthPotential / potential) * 100 : 0;
        
        return {
            ...item,
            potential,
            growthPotential,
            growthPercentage,
            potentialClients: [], // Simplified
            currentClients: Array.from(item.currentClients.values()),
            clients: Array.from(item.clients),
            brand: Array.from(item.brands).join(', '),
            city: Array.from(item.cities).join(', ') || 'Город не определён',
            clientName: item.groupName // For compatibility with table
        };
    });

    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершение...' } });
    postMessage({ type: 'result', payload: finalData });
};


/**
 * Processes XLSX/XLS files.
 */
async function processXlsx(file: File, okbData: OkbDataRow[], postMessage: PostMessageFn) {
    postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла XLSX...' } });
    const data = await file.arrayBuffer();
    const workbook = xlsx.read(data, { type: 'array', cellDates: false, cellNF: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' })
      .map((row, index) => (row ? { ...row, _originalIndex: index + 2 } : null))
      .filter(Boolean);
    
    await processData(jsonData, okbData, postMessage);
}

/**
 * Processes CSV files.
 */
async function processCsv(file: File, okbData: OkbDataRow[], postMessage: PostMessageFn) {
    postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла CSV...' } });

    return new Promise<void>((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true,
            complete: async (results) => {
                try {
                    // FIX: Added a check to ensure `row` is an object before spreading to prevent "Spread types may only be created from object types" error.
                    const jsonData = (results.data as any[]).map((row, index) => (row ? {...row, _originalIndex: index + 2} : null)).filter(Boolean);
                    await processData(jsonData, okbData, postMessage);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            },
            error: (err) => reject(err),
        });
    });
}