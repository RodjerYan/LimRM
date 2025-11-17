import { 
    standardizeRegion, 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP
} from '../utils/addressMappings';
import { ParsedAddress } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

// Memoize the sorted list of cities to avoid re-computing it on every call.
const CITIES_SORTED_BY_LENGTH = Object.keys(REGION_BY_CITY_WITH_INDEXES).sort((a, b) => b.length - a.length);

/**
 * Capitalizes the first letter of each word in a string.
 * @param str The input string.
 * @returns The capitalized string.
 */
const capitalize = (str: string | null): string => {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

/**
 * A robust helper function to find a value within a data row by checking for keywords.
 * @param row The data row object.
 * @param keywords An array of keywords to search for in column headers.
 * @returns The found value string or an empty string.
 */
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

/**
 * Finds the most likely city name in a potentially messy address string.
 * If multiple known cities are present, it uses a heuristic that the city mentioned
 * last is the most specific and correct one.
 * @param normalizedAddress A pre-processed, lowercased address string.
 * @returns The capitalized city name or a default string if not found.
 */
function getCityFromAddress(normalizedAddress: string): string {
    if (!normalizedAddress) return 'Город не определен';

    let lastMatch: { city: string, index: number } | null = null;

    // CITIES_SORTED_BY_LENGTH is crucial. It ensures we check "Нижний Новгород" before "Новгород",
    // preventing a partial match from incorrectly taking precedence.
    for (const city of CITIES_SORTED_BY_LENGTH) {
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`, 'g');
        
        let match;
        while ((match = regex.exec(normalizedAddress)) !== null) {
            // If we find a match, we check if it's located later in the string
            // than our currently stored `lastMatch`. This helps resolve ambiguity.
            if (!lastMatch || match.index > lastMatch.index) {
                lastMatch = { city, index: match.index };
            }
        }
    }

    if (lastMatch) {
        return capitalize(lastMatch.city);
    }
    
    return 'Город не определен';
}


/**
 * Finds a region by matching explicit keywords (e.g., "орловская обл", "брянская") in the address.
 * It now finds all matches and returns the one that appears latest in the string, making it more robust against garbage data at the beginning of the address.
 * @param normalizedAddress The pre-processed, lowercased address string.
 * @returns The standardized region name or null if no match is found.
 */
function findRegionByKeyword(normalizedAddress: string): string | null {
    // Sort keys by length descending to match longer phrases first (e.g., "московская область" before "москва")
    const sortedKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    let lastMatch: { region: string, index: number } | null = null;

    for (const key of sortedKeys) {
        // This regex ensures we match the key as a whole word/phrase.
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // 'i' for case-insensitive, 'g' to find all occurrences
        const regex = new RegExp(`(^|\\s|\\W)${escapedKey}($|\\s|\\W)`, 'gi');

        let match;
        while ((match = regex.exec(normalizedAddress)) !== null) {
            // If we find a match, check if its index is greater than the last one found.
            if (!lastMatch || match.index > lastMatch.index) {
                lastMatch = { region: REGION_KEYWORD_MAP[key], index: match.index };
            }
        }
    }
    return lastMatch ? lastMatch.region : null;
}

/**
 * Parses a Russian address string to extract the region and city.
 * It now includes a fallback mechanism: if the city cannot be determined from the address,
 * it attempts to extract it from a "Дистрибьютер" column in the row data.
 * @param row The full data row object.
 * @param address The raw address string from the row.
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseRussianAddress(row: { [key: string]: any }, address: string): ParsedAddress {
    // If the address string is empty, try the distributor fallback immediately.
    if (!address?.trim()) {
        const distributorValue = findValueInRow(row, ['дистрибьютер', 'дистрибьютор']);
        if (distributorValue) {
            const match = distributorValue.match(/\(([^)]+)\)/);
            if (match && match[1]) {
                const cityFromDistributor = match[1].trim().toLowerCase();
                const knownCityEntry = REGION_BY_CITY_WITH_INDEXES[cityFromDistributor];
                if (knownCityEntry) {
                    return { region: knownCityEntry.region, city: capitalize(cityFromDistributor) };
                }
            }
        }
        return { region: 'Регион не определен', city: 'Город не определен' };
    }

    // Initial cleaning: convert to lowercase, handle 'ё'.
    const lowerAddress = address.toLowerCase().replace(/ё/g, 'е');
    
    // Step 1: Remove city prefixes like 'г.', 'город', etc. BEFORE other normalization.
    let normalized = lowerAddress
        .replace(/\b(г|город|city)\.?\s+/g, ' ')
        .replace(/[,;.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Step 2: Normalization using aliases for common typos
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    // Step 3: Determine Region and City from the cleaned address string
    let region = findRegionByKeyword(normalized);
    let city = getCityFromAddress(normalized);

    // --- NEW FALLBACK LOGIC ---
    // If city or region is still not found, check the distributor column.
    if (city === 'Город не определен' || !region) {
        const distributorValue = findValueInRow(row, ['дистрибьютер', 'дистрибьютор']);
        if (distributorValue) {
            const match = distributorValue.match(/\(([^)]+)\)/);
            if (match && match[1]) {
                const cityFromDistributor = match[1].trim().toLowerCase();
                const knownCityEntry = REGION_BY_CITY_WITH_INDEXES[cityFromDistributor];
                
                if (knownCityEntry) {
                    if (city === 'Город не определен') {
                        city = capitalize(cityFromDistributor);
                    }
                    if (!region) {
                        region = knownCityEntry.region;
                    }
                }
            }
        }
    }

    // If region is *still* not defined, but we have a city, try one last time to look up the region from the city.
    if (!region && city !== 'Город не определен') {
        const knownCityEntry = REGION_BY_CITY_WITH_INDEXES[city.toLowerCase()];
        if (knownCityEntry) {
            region = knownCityEntry.region;
        }
    }

    return {
        region: standardizeRegion(region),
        city: city 
    };
}