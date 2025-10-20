import { AggregatedDataRow, FilterState } from "../types";

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

// --- Экспорт в CSV ---
export const exportToCSV = (data: AggregatedDataRow[], fileName: string = 'analysis_export.csv') => {
    const headers = [
        "РМ", "Город", "Бренд", "Факт (кг/ед)", "Потенциал (кг/ед)", 
        "Потенциал Роста (кг/ед)", "Темп Роста (%)", "Кол-во Потенц. ТТ",
        "Примеры клиентов"
    ];
    
    const rows = data.map(row => [
        `"${row.rm}"`,
        `"${row.city}"`,
        `"${row.brand}"`,
        row.fact,
        row.potential,
        row.growthPotential,
        row.growthRate.toFixed(2),
        row.potentialTTs,
        `"${row.potentialClients.slice(0, 3).map(c => c.name).join('; ')}"`
    ].join(','));

    // Adding BOM for proper Excel compatibility with Cyrillic characters
    const BOM = '\uFEFF';
    const csvContent = "data:text/csv;charset=utf-8," 
        + BOM + [headers.join(','), ...rows].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
