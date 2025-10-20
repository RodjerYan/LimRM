import { AggregatedDataRow, FilterState } from "../types";
import * as XLSX from 'xlsx';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

pdfMake.vfs = pdfFonts.pdfMake.vfs;

// --- Форматирование чисел ---
export const formatLargeNumber = (num: number, digits = 0): string => {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: digits,
    }).format(num);
};

export const formatPercentage = (num: number): string => {
    if (num === null || num === undefined) return '0%';
    return `${num.toFixed(1)}%`;
};

// --- Фильтрация данных ---
export const applyFilters = (data: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
    return data.filter(row => {
        const rmMatch = !filters.rm || row.rm === filters.rm;
        const brandMatch = filters.brand.length === 0 || filters.brand.includes(row.brand);
        const cityMatch = filters.city.length === 0 || filters.city.includes(row.city);
        return rmMatch && brandMatch && cityMatch;
    });
};

// --- Сортировка данных ---
export type SortDirection = 'asc' | 'desc';
export type SortKey = keyof AggregatedDataRow;

export const sortData = (data: AggregatedDataRow[], sortKey: SortKey, sortDirection: SortDirection): AggregatedDataRow[] => {
    return [...data].sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];

        if (typeof valA === 'number' && typeof valB === 'number') {
            return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        
        return 0;
    });
};

// --- Утилиты для экспорта ---

const getExportData = (data: AggregatedDataRow[]) => {
    const headers = [ "РМ", "Город", "Бренд", "Факт (кг/ед)", "Потенциал (кг/ед)", "Рост (кг/ед)", "Рост (%)", "Потенц. ТТ" ];
    const body = data.map(row => [
        row.rm,
        row.city,
        row.brand,
        row.fact,
        row.potential,
        row.growthPotential,
        isFinite(row.growthRate) ? row.growthRate.toFixed(1) : '∞',
        row.potentialTTs
    ]);
    return { headers, body };
};

export const exportToCSV = (data: AggregatedDataRow[], fileName: string = 'analysis_export.csv') => {
    const { headers, body } = getExportData(data);
    const csvContent = [
        headers.join(','),
        ...body.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportToXLSX = (data: AggregatedDataRow[], fileName: string = 'analysis_export.xlsx') => {
    const { headers, body } = getExportData(data);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Анализ");
    XLSX.writeFile(workbook, fileName);
};

export const exportToPDF = (data: AggregatedDataRow[], fileName: string = 'analysis_export.pdf') => {
    const { headers, body } = getExportData(data);

    const docDefinition: any = {
        content: [
            { text: 'Аналитический отчет Limkorm', style: 'header' },
            {
                style: 'tableExample',
                table: {
                    headerRows: 1,
                    widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
                    body: [
                        headers.map(h => ({ text: h, style: 'tableHeader' })),
                        ...body
                    ]
                },
                layout: 'lightHorizontalLines'
            }
        ],
        styles: {
            header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
            tableHeader: { bold: true, fontSize: 10, color: 'black' }
        },
        defaultStyle: {
            fontSize: 9
        }
    };
    pdfMake.createPdf(docDefinition).download(fileName);
};