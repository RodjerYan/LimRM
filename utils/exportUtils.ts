import * as XLSX from 'xlsx';
import { OkbDataRow, AggregatedDataRow } from '../types';

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
            // FIX: Improved robustness by checking if the property exists before accessing.
            // This prevents errors if a row object has a different structure.
            const value = Object.prototype.hasOwnProperty.call(row, h.key) ? row[h.key] :
                          Object.prototype.hasOwnProperty.call(row, h.header) ? row[h.header] : '';
            newRow[h.header] = value ?? ''; // Ensure value is not null/undefined
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

/**
 * Exports an array of aggregated analysis data to an XLSX file.
 * @param data The array of AggregatedDataRow to export.
 * @param fileName The base name for the downloaded file.
 */
export const exportAggregatedToExcel = (data: AggregatedDataRow[], fileName: string): void => {
    const worksheetData = data.map(row => ({
        'Группа/Клиент': row.clientName,
        'РМ': row.rm,
        'Регион': row.region,
        'Бренд': row.brand,
        'Факт (кг/ед)': row.fact,
        'Потенциал (кг/ед)': row.potential,
        'Потенциал Роста (кг/ед)': row.growthPotential,
        'Рост (%)': row.growthPercentage.toFixed(2),
        'Кол-во клиентов в группе': row.clients.length,
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Анализ Потенциала');
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
