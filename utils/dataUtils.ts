
import { AggregatedDataRow, FilterState, FilterOptions, SummaryMetrics, OkbDataRow } from "../types";
import * as xlsx from 'xlsx';
import { regionCenters } from './regionCenters';

/**
 * Normalizes a string for comparison by converting to lowercase and removing common business entity suffixes.
 */
export const normalizeString = (str: string): string => {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/"/g, '')
        .replace(/«/g, '')
        .replace(/»/g, '')
        .replace(/[\s-.,()]+/g, ' ')
        .replace(/\b(ооо|ип|зао|пао|ао|гк|фгбу|гбу|мбу)\b/g, '')
        .trim();
};

/**
 * Finds the best matching client from the OKB data based on name and city.
 */
export const findBestOkbMatch = (clientName: string, city: string, okbData: (OkbDataRow & { normalizedName: string })[]): OkbDataRow | null => {
    const normalizedClient = normalizeString(clientName);
    
    // Simple direct match first
    const directMatch = okbData.find(okb => okb.normalizedName.includes(normalizedClient));
    if (directMatch) return directMatch;

    // A more complex search could be implemented here (e.g., using string similarity libraries)
    // For now, we'll keep it simple.
    return null;
};

/**
 * Extracts a standardized region name from OKB data.
 */
export const extractRegionFromOkb = (okbEntry: OkbDataRow): string => {
    const address = okbEntry['Юридический адрес']?.toLowerCase() || '';
    const regionFromOkb = okbEntry['Регион']?.toLowerCase() || '';

    // Prioritize the dedicated "Регион" column if it exists and is valid.
    if (regionFromOkb) {
        return okbEntry['Регион'];
    }

    // Otherwise, try to infer from the address string.
    for (const [city, region] of Object.entries(regionCenters)) {
        if (address.includes(city)) {
            // Capitalize the first letter of each word in the region name
            return region.replace(/\b\w/g, l => l.toUpperCase());
        }
    }

    return 'Регион не определен';
};


/**
 * Derives filter options (unique RMs, brands, cities) from the aggregated data.
 */
export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
    const rms = new Set<string>();
    const brands = new Set<string>();
    const cities = new Set<string>();

    data.forEach(row => {
        rms.add(row.rm);
        brands.add(row.brand);
        cities.add(row.city);
    });

    return {
        rms: Array.from(rms).sort(),
        brands: Array.from(brands).sort(),
        cities: Array.from(cities).sort(),
    };
};

/**
 * Filters the data based on the current filter state.
 */
export const applyFilters = (data: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
    return data.filter(row => {
        const rmMatch = filters.rm ? row.rm === filters.rm : true;
        const brandMatch = filters.brand.length > 0 ? filters.brand.includes(row.brand) : true;
        const cityMatch = filters.city.length > 0 ? filters.city.includes(row.city) : true;
        return rmMatch && brandMatch && cityMatch;
    });
};

/**
 * Calculates summary metrics from the filtered data.
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics => {
    const summary = data.reduce((acc, row) => {
        acc.totalFact += row.fact;
        acc.totalPotential += row.potential;
        acc.totalGrowth += row.growthPotential;
        acc.clientSet.add(row.clientName);
        
        if (!acc.rmPerformance[row.rm]) {
            acc.rmPerformance[row.rm] = 0;
        }
        acc.rmPerformance[row.rm] += row.growthPotential;

        return acc;
    }, {
        totalFact: 0,
        totalPotential: 0,
        totalGrowth: 0,
        clientSet: new Set<string>(),
        rmPerformance: {} as Record<string, number>,
    });

    const totalGrowth = summary.totalGrowth;
    const totalPotential = summary.totalPotential;
    const averageGrowthPercentage = totalPotential > 0 ? (totalGrowth / totalPotential) * 100 : 0;
    
    const topPerformingRM = Object.entries(summary.rmPerformance)
        .sort(([, a], [, b]) => b - a)[0] || ['-', 0];

    return {
        totalFact: summary.totalFact,
        totalPotential: summary.totalPotential,
        totalGrowth: summary.totalGrowth,
        totalClients: summary.clientSet.size,
        averageGrowthPercentage,
        topPerformingRM: { name: topPerformingRM[0], value: topPerformingRM[1] },
    };
};


/**
 * Exports data to an Excel file.
 */
export const exportToExcel = (data: AggregatedDataRow[], filename: string = 'analysis_export.xlsx') => {
    // Create a new worksheet
    const ws = xlsx.utils.json_to_sheet(data, {
        header: [
            "rm", "clientName", "brand", "city", "region",
            "fact", "potential", "growthPotential", "growthPercentage"
        ]
    });
    
    // Set headers manually for better naming
    xlsx.utils.sheet_add_aoa(ws, [[
        "РМ", "Клиент", "Бренд", "Город", "Регион",
        "Факт, кг/ед", "Потенциал, кг/ед", "Потенциал Роста, кг/ед", "Рост, %"
    ]], { origin: "A1" });

    // Create a new workbook and append the worksheet
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Анализ");

    // Trigger the file download
    xlsx.writeFile(wb, filename);
};
