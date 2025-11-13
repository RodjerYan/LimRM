import * as xlsx from 'xlsx';
import { parse as PapaParse, type ParseResult, type ParseMeta } from 'papaparse';
import { AggregatedDataRow, WorkerMessage, AkbRow, WorkerResultPayload, MapPoint } from '../types';
import { parseRussianAddress } from './addressParser';

type PostMessageFn = (message: WorkerMessage) => void;

// Helper to group array of objects by a key
const groupBy = <T extends Record<string, any>>(array: T[], key: keyof T): Record<string, T[]> => {
    return array.reduce((result, currentValue) => {
        const groupKey = String(currentValue[key] || 'Неопределенный РМ');
        (result[groupKey] = result[groupKey] || []).push(currentValue);
        return result;
    }, {} as Record<string, T[]>);
};

const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword));
        if (foundKey && row[foundKey]) {
            return String(row[foundKey]);
        }
    }
    return '';
};


self.onmessage = async (e: MessageEvent<{ file: File }>) => {
    const { file } = e.data;
    const postMessage: PostMessageFn = (message) => self.postMessage(message);

    try {
        if (file.name.toLowerCase().endsWith('.csv')) {
            await processCsv(file, { postMessage });
        } else {
            await processXlsx(file, { postMessage });
        }
    } catch (error) {
        console.error("Worker Error:", error);
        postMessage({ type: 'error', payload: (error as Error).message });
    }
};

interface CommonProcessArgs {
    postMessage: PostMessageFn;
}

async function processFile(jsonData: AkbRow[], headers: string[], { postMessage }: CommonProcessArgs) {
    if (jsonData.length === 0) throw new Error('Файл пуст или имеет неверный формат.');

    const requiredHeaders = ['рм', 'адрес тт limkorm', 'вес'];
    const lowerCaseHeaders = headers.map(h => (h || '').toLowerCase().trim());

    for (const required of requiredHeaders) {
        if (!lowerCaseHeaders.some(h => h.includes(required))) {
            throw new Error(`Отсутствует обязательный столбец, содержащий "${required}".`);
        }
    }

    // --- STAGE 1: PARSE AND SYNC WITH AKB GOOGLE SHEET ---
    postMessage({ type: 'progress', payload: { percentage: 10, message: 'Группировка данных по РМ...' } });
    const groupedByRM = groupBy(jsonData, 'РМ');

    postMessage({ type: 'progress', payload: { percentage: 20, message: 'Синхронизация с АКБ... (может занять время)' } });
    
    const syncResponse = await fetch('/api/akb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SYNC', payload: groupedByRM }),
    });

    if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        throw new Error(`Ошибка синхронизации с АКБ: ${errorData.details || errorData.error}`);
    }
    
    let { allData: akbData, newlyAddedAddresses } = await syncResponse.json();
    
    postMessage({ type: 'progress', payload: { percentage: 40, message: `Синхронизация завершена. Найдено ${Object.values(newlyAddedAddresses).flat().length} новых адресов.` } });

    // --- STAGE 2: POLL FOR COORDINATES FOR NEWLY ADDED ROWS ---
    const totalNew = Object.values(newlyAddedAddresses).flat().length;
    if (totalNew > 0) {
        for (let i = 1; i <= 3; i++) {
            const stillNeedCoordsCount = Object.values(newlyAddedAddresses).flat().length;
            if (stillNeedCoordsCount === 0) break;

            postMessage({ type: 'progress', payload: { percentage: 40 + (i * 15), message: `Ожидание координат (${i}/3)... Осталось: ${stillNeedCoordsCount}` } });
            await new Promise(resolve => setTimeout(resolve, 5000));

            const pollResponse = await fetch('/api/akb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'POLL', payload: newlyAddedAddresses }),
            });
            
            if (pollResponse.ok) {
                const updatedRows: AkbRow[] = await pollResponse.json();
                
                // Create a map for quick updates
                const updatedMap = new Map<string, AkbRow>();
                updatedRows.forEach(row => {
                    const address = row['Адрес ТТ LimKorm'];
                    if (address) updatedMap.set(address, row);
                });

                // Update our main data source
                akbData = akbData.map((row: AkbRow) => {
                    const address = row['Адрес ТТ LimKorm'];
                    return address && updatedMap.has(address) ? updatedMap.get(address)! : row;
                });
                
                // Update the list of addresses that still need coordinates
                const stillNeedCoords: { [rmName: string]: string[] } = {};
                updatedRows.forEach(row => {
                    if (!row.lat || !row.lon) {
                        const rm = row['РМ'];
                        if (rm) {
                            if (!stillNeedCoords[rm]) stillNeedCoords[rm] = [];
                            stillNeedCoords[rm].push(row['Адрес ТТ LimKorm']);
                        }
                    }
                });
                newlyAddedAddresses = stillNeedCoords;
            }
        }
    }

    // --- STAGE 3: AGGREGATE FINAL DATA ---
    postMessage({ type: 'progress', payload: { percentage: 90, message: 'Агрегация данных...' } });

    const aggregationMap: { [key: string]: Omit<AggregatedDataRow, 'clients'> & { clients: Set<string> } } = {};
    const plottableActiveClients: MapPoint[] = [];

    akbData.forEach((row: AkbRow, index: number) => {
        const address = row['Адрес ТТ LimKorm'] || '';
        const rm = row['РМ'] || 'Неопределенный РМ';
        const brand = row['Торговая марка'] || 'Неизвестный бренд';
        
        const weightStr = (row['Вес, кг'] || '0').toString().replace(/\s/g, '').replace(',', '.');
        const weight = parseFloat(weightStr);

        const { region, city } = parseRussianAddress(address);
        
        if (isNaN(weight) || region === 'Регион не определен') {
            return;
        }

        const groupKey = `${region}-${brand}-${rm}`.toLowerCase();
        
        if (!aggregationMap[groupKey]) {
            aggregationMap[groupKey] = {
                key: groupKey,
                clientName: `${region} (${brand})`,
                brand,
                rm,
                city: city !== 'Город не определен' ? city : region,
                region,
                fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0,
                clients: new Set<string>()
            };
        }

        aggregationMap[groupKey].fact += weight;
        
        // This logic is made intentionally verbose to resolve a stubborn build error in Vercel's TSC environment,
        // which was repeatedly failing to infer the correct type from short-circuiting logical operators.
        let clientIdentifier: string;
        const uniqueNameStr = row['Уникальное наименование товара'];

        // 'address' is guaranteed to be a string from the top of the loop.
        if (address) {
            clientIdentifier = address;
        } else if (uniqueNameStr) {
            // Here, uniqueNameStr is narrowed from 'string | undefined' to 'string'.
            clientIdentifier = uniqueNameStr;
        } else {
            clientIdentifier = `Клиент ${index}`;
        }
        aggregationMap[groupKey].clients.add(clientIdentifier);

        const lat = row.lat ? parseFloat(String(row.lat).replace(',', '.')) : undefined;
        const lon = row.lon ? parseFloat(String(row.lon).replace(',', '.')) : undefined;
        
        plottableActiveClients.push({
            key: `${address}-${index}`,
            lat: !isNaN(lat!) ? lat : undefined,
            lon: !isNaN(lon!) ? lon : undefined,
            status: 'match',
            name: row['Уникальное наименование товара'] || 'Без названия',
            address: address,
            city: city,
            region: region,
            rm: rm,
            brand: brand,
            type: row['Канал продаж'] || '',
            contacts: row['Контакты'] || '',
        });
    });

    const finalData: AggregatedDataRow[] = Object.values(aggregationMap).map(item => {
        let potential = item.fact * 1.15; // Default potential logic
        if (potential < item.fact) {
            potential = item.fact;
        }
        const growthPotential = Math.max(0, potential - item.fact);
        const growthPercentage = potential > 0 ? (growthPotential / potential) * 100 : 0;
        
        return {
            ...item,
            potential,
            growthPotential,
            growthPercentage,
            clients: Array.from(item.clients)
        };
    });

    postMessage({ type: 'progress', payload: { percentage: 100, message: 'Завершено!' } });
    const resultPayload: WorkerResultPayload = { 
        aggregatedData: finalData, 
        plottableActiveClients 
    };
    postMessage({ type: 'result', payload: resultPayload });
}


async function processXlsx(file: File, args: CommonProcessArgs) {
    args.postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла XLSX...' } });
    const data = await file.arrayBuffer();
    const workbook = xlsx.read(data, { type: 'array', cellDates: false, cellNF: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: AkbRow[] = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
    const headers = (xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[] || []).map(h => String(h || ''));
    
    await processFile(jsonData, headers, args);
}


async function processCsv(file: File, args: CommonProcessArgs) {
    args.postMessage({ type: 'progress', payload: { percentage: 0, message: 'Чтение файла CSV...' } });
    
    const parsePromise = new Promise<{ data: AkbRow[], meta: ParseMeta }>((resolve, reject) => {
        PapaParse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: ParseResult<AkbRow>) => {
                if (results.errors.length > 0) {
                    console.warn('CSV parsing errors:', results.errors);
                }
                resolve({ data: results.data, meta: results.meta });
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    });

    try {
        const { data: jsonData, meta } = await parsePromise;
        if (!jsonData || jsonData.length === 0) {
             throw new Error("CSV файл пуст или не удалось его прочитать.");
        }
        const headers = meta.fields || Object.keys(jsonData[0] || {});
        await processFile(jsonData, headers, args);
    } catch (error) {
        throw new Error(`Failed to parse CSV file: ${(error as Error).message}`);
    }
}