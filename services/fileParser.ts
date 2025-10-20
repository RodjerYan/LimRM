import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { RawDataRow } from '../types';

// Helper to normalize header strings for comparison
const normalizeHeader = (header: string): string => {
    return String(header || '').toLowerCase().trim().replace(/\s+/g, ' ');
};

// Define all possible aliases for our required headers
const HEADER_ALIASES: Record<keyof Omit<RawDataRow, 'fullAddress'>, string[]> = {
    rm: ['рм', 'региональный менеджер', 'rm', 'regional manager'],
    brand: ['бренд', 'brand', 'торговая марка'],
    city: ['город', 'city', 'адрес тт limkorm', 'адрес поставки', 'адрес'],
    fact: ['вес, кг', 'факт (кг/ед)', 'факт', 'fact', 'факт (кг)'],
};

// This function finds the actual header name in the file (e.g., "Региональный менеджер")
// that corresponds to our internal key (e.g., "rm").
const findHeaderKey = (fileHeaders: string[], aliases: string[]): string | null => {
    for (const header of fileHeaders) {
        const normalized = normalizeHeader(header);
        if (aliases.includes(normalized)) {
            return header; // Return the original, non-normalized header name from the file
        }
    }
    return null;
};

export const parseFile = (file: File): Promise<RawDataRow[]> => {
    return new Promise((resolve, reject) => {
        
        const processJsonData = (json: any[]) => {
            if (!json || json.length === 0) {
                 return reject(new Error("Файл пуст или имеет неверный формат."));
            }

            const fileHeaders = Object.keys(json[0]);
            
            // Create a map from our internal keys (rm, city) to the actual keys found in the file
            const headerMap = {
                rm: findHeaderKey(fileHeaders, HEADER_ALIASES.rm),
                brand: findHeaderKey(fileHeaders, HEADER_ALIASES.brand),
                city: findHeaderKey(fileHeaders, HEADER_ALIASES.city),
                fact: findHeaderKey(fileHeaders, HEADER_ALIASES.fact),
            };

            const parsedData = json.map((row: any): RawDataRow | null => {
                const factValue = headerMap.fact ? String(row[headerMap.fact] || '0').replace(',', '.') : '0';
                const fact = parseFloat(factValue);
                const city = headerMap.city ? String(row[headerMap.city] || '').trim() : '';
                const rm = headerMap.rm ? String(row[headerMap.rm] || '').trim() : '';
                
                if (!city || !rm || isNaN(fact)) {
                    return null;
                }

                return {
                    rm,
                    brand: headerMap.brand ? String(row[headerMap.brand] || 'Не указан').trim() : 'Не указан',
                    fullAddress: city,
                    city,
                    fact,
                };
            }).filter((row): row is RawDataRow => row !== null && row.fact >= 0);

            if (parsedData.length === 0) {
                // This error now means that the columns might exist, but all rows had empty or invalid values in them.
                return reject(new Error("В файле не найдено корректных строк с данными. Убедитесь, что колонки 'Город', 'РМ' и 'Факт' заполнены."));
            }
            
            resolve(parsedData);
        };

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Ошибка чтения файла."));

        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    try {
                        processJsonData(results.data);
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error: any) => reject(new Error(`Ошибка парсинга CSV: ${error.message}`))
            });
        } else { // Assume .xlsx, .xls
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    if (!data) return reject(new Error("Не удалось прочитать файл."));
                    
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    if (!sheetName) return reject(new Error("В файле .xlsx не найдено листов."));
                    
                    const worksheet = workbook.Sheets[sheetName];
                    const json: any[] = XLSX.utils.sheet_to_json(worksheet);
                    
                    processJsonData(json);
                } catch (error) {
                    reject(new Error("Не удалось разобрать файл .xlsx. Убедитесь, что он имеет корректный формат."));
                }
            };
            reader.readAsArrayBuffer(file);
        }
    });
};
