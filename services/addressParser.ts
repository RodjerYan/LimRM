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
 * Finds a region by matching explicit keywords (e.g., "орловская обл", "брянская") in the address.
 * Uses a robust regex to match whole phrases, preventing partial matches inside other words.
 * @param normalizedAddress The pre-processed, lowercased address string.
 * @returns The standardized region name or null if no match is found.
 */
function findRegionByKeyword(normalizedAddress: string): string | null {
    // Sort keys by length descending to match longer phrases first (e.g., "московская область" before "москва")
    const sortedKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        // This regex ensures we match the key as a whole word/phrase.
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(^|\\s|\\W)${escapedKey}($|\\s|\\W)`, 'i');

        if (regex.test(normalizedAddress)) {
            return REGION_KEYWORD_MAP[key];
        }
    }
    return null;
}

/**
 * Helper function to find a city and its corresponding region from a normalized address string.
 * @param normalizedAddress The address string to search within.
 * @returns An object with city and region, or nulls if not found.
 */
function findCityAndRegion(normalizedAddress: string): { city: string | null; region: string | null } {
    for (const cityName of CITIES_SORTED_BY_LENGTH) {
        const regex = new RegExp(`\\b${cityName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
        if (regex.test(normalizedAddress)) {
            return {
                city: capitalize(cityName),
                region: REGION_BY_CITY_WITH_INDEXES[cityName].region
            };
        }
    }
    return { city: null, region: null };
}


/**
 * Parses a Russian address string to extract the region and city using a lightweight, fast, and local-only approach.
 * This function has been significantly improved to handle CIS countries and avoid false positives from street names.
 * The logic now strictly prioritizes city detection over region keyword detection.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseRussianAddress(address: string): ParsedAddress {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определен' };
    }

    // Initial cleaning and normalization
    let normalized = address.toLowerCase().replace(/ё/g, 'е').replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
    }

    // --- Determination Logic ---

    // Step 1: HIGH PRIORITY - City search. This is the most reliable method.
    // If a city is found, we trust its region completely and stop processing.
    const cityResult = findCityAndRegion(normalized);
    if (cityResult.region) {
        return {
            region: standardizeRegion(cityResult.region),
            city: cityResult.city || 'Город не определен'
        };
    }

    // Step 2: Fallback to keyword search ONLY if NO city was found above.
    // This prevents a street name (e.g., "ул. Ленинградская") from overriding a region determined by a city (e.g., "Бишкек").
    const keywordResult = findRegionByKeyword(normalized);

    return {
        region: standardizeRegion(keywordResult), // Will become 'Регион не определен' if null
        city: 'Город не определен' // We know no city was found at this point
    };
}


/**
 * Attempts to determine a region and city by finding a known city name within a fallback string (e.g., a distributor's name).
 * @param fallbackString The string to search within, e.g., "ООО Ромашка (г. Воронеж)".
 * @returns An object with `region` and `city` if a match is found, otherwise null.
 */
export function getRegionFromFallback(fallbackString: string): { region: string; city: string } | null {
    if (!fallbackString) return null;
    
    const normalized = fallbackString.toLowerCase();

    // Iterate through sorted cities to find the longest possible match
    for (const cityName of CITIES_SORTED_BY_LENGTH) {
        const regex = new RegExp(`\\b${cityName}\\b`);
        if (regex.test(normalized)) {
            const cityData = REGION_BY_CITY_WITH_INDEXES[cityName];
            return {
                region: cityData.region,
                city: capitalize(cityName),
            };
        }
    }
    
    return null;
}