import * as XLSX from 'xlsx';
import { OkbDataRow } from '../types';

/**
 * Exports an array of OKB data to an XLSX file.
 * @param data The array of OKB data rows to export.
 * @param fileName The base name for the downloaded file (without extension).
 */
export const exportToExcel = (data: OkbDataRow[], fileName: string): void => {
    // Define headers and their corresponding keys in the data object
    const headers = [
        { header: 'Наименование', key: 'Наименование' },
        { header: 'Юридический адрес', key: 'Юридический адрес' },
        { header: 'Регион', key: 'Регион' },
        { header: 'Город', key: 'Город' },
        { header: 'Вид деятельности', key: 'Вид деятельности' },
        { header: 'ИНН', key: 'ИНН' },
        { header: 'Контакты', key: 'Контакты' },
        { header: 'Широта', key: 'lat' },
        { header: 'Долгота', key: 'lon' },
    ];

    // Map the data to a flat structure suitable for the worksheet
    const worksheetData = data.map(row => {
        const newRow: { [key: string]: any } = {};
        headers.forEach(h => {
            // Check for the key directly in the row object
            newRow[h.header] = row[h.key] ?? (row[h.header] ?? ''); // Fallback to header name if key is different
        });
        return newRow;
    });

    // Create worksheet from the processed data
    const worksheet = XLSX.utils.json_to_sheet(worksheetData, {
        header: headers.map(h => h.header) // Ensure correct header order
    });

    // Create a new workbook
    const workbook = XLSX.utils.book_new();

    // Append the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ТорговыеТочки');

    // Write the workbook and trigger a download
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
