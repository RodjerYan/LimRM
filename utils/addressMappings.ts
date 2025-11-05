// utils/addressMappings.ts

const capitalize = (str: string): string => {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const REGION_SYNONYMS: Record<string, string> = {
    'спб': 'Санкт-Петербург',
    'ленинградская обл': 'Ленинградская область',
    'московская обл': 'Московская область',
    'краснодарский кр': 'Краснодарский край',
};

/**
 * Standardizes a region name to a consistent format.
 * @param input The detected region string.
 * @returns A standardized region name or the default "Регион не определен".
 */
export const standardizeRegion = (input: string | null | undefined): string => {
    if (!input) return 'Регион не определен';
    const lowerInput = input.toLowerCase().trim();
    const standardized = REGION_SYNONYMS[lowerInput] || input.trim();
    return capitalize(standardized);
};
