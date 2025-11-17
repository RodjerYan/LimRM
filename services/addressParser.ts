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
 * Helper function to find a known city name within any given string.
 * @param text The string to search within (e.g., distributor name).
 * @param citiesSortedByLength A pre-sorted list of known city names.
 * @returns A structured object with city and region, or null.
 */
function findCityInString(text: string, citiesSortedByLength: string[]): { city: string, region: string } | null {
    if (!text) return null;
    const lowerText = text.toLowerCase();

    for (const city of citiesSortedByLength) {
        // Use a regex to find the city as a whole word to avoid partial matches
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`); 

        if (regex.test(lowerText)) {
            const region = REGION_BY_CITY_WITH_INDEXES[city]?.region;
            if (region) {
                return { city: capitalize(city), region };
            }
        }
    }
    return null;
}


/**
 * Parses a Russian address string to extract the region and city.
 * It now prioritizes the "Дистрибьютер" column as the most reliable source for the city.
 * @param row The full data row object.
 * @param address The raw address string from the row.
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseRussianAddress(row: { [key: string]: any }, address: string): ParsedAddress {
    // --- STRATEGY 1: Check Distributor Column for an explicit city override ---
    const distributorValue = findValueInRow(row, ['дистрибьютер', 'дистрибьютор']);
    const cityFromDistributor = findCityInString(distributorValue, CITIES_SORTED_BY_LENGTH);
    
    if (cityFromDistributor) {
        // If a known city is found in the distributor column, trust it and return immediately.
        // This is the most reliable source for ambiguous addresses.
        return {
            region: standardizeRegion(cityFromDistributor.region),
            city: cityFromDistributor.city,
        };
    }

    // --- STRATEGY 2: If no distributor override, parse the address string ---
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определен' };
    }

    const lowerAddress = address.toLowerCase().replace(/ё/g, 'е');
    
    let normalized = lowerAddress
        .replace(/\b(г|город|city)\.?\s+/g, ' ')
        .replace(/[,;.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
    }
    
    let region = findRegionByKeyword(normalized);
    let city = getCityFromAddress(normalized);
    
    if (!region && city !== 'Город не определен') {
        const knownCityEntry = REGION_BY_CITY_WITH_INDEXES[city.toLowerCase()];
        if (knownCityEntry) {
            region = knownCityEntry.region;
        }
    }

    return {
        region: standardizeRegion(region),
        city: city,
    };
}
