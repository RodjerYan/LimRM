import * as XLSX from 'xlsx';
import { RawDataRow } from '../types';

export const parseFile = (file: File): Promise<RawDataRow[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                if (!data) {
                    throw new Error("Не удалось прочитать файл.");
                }

                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                // Преобразуем лист в JSON, header: 1 создаст массив массивов
                const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                if (json.length < 2) {
                    throw new Error("Файл пуст или содержит только заголовок.");
                }

                // Используем первую строку как заголовки
                const headers: string[] = json[0].map(h => String(h).trim());
                const rows = json.slice(1);

                const result: RawDataRow[] = rows.map(row => {
                    const rowData: RawDataRow = {};
                    headers.forEach((header, index) => {
                        rowData[header] = row[index] || "";
                    });
                    return rowData;
                }).filter(row => Object.values(row).some(val => val !== "")); // Отфильтровываем пустые строки

                resolve(result);

            } catch (error: any) {
                reject(new Error(`Ошибка парсинга файла: ${error.message}`));
            }
        };

        reader.onerror = (error) => {
            reject(new Error("Ошибка чтения файла."));
        };

        // readAsBinaryString is recommended by the xlsx library docs for broader browser support.
        reader.readAsBinaryString(file);
    });
};
