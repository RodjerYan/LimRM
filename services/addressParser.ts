import { 
    standardizeRegion, 
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
 * Parses a Russian address string to extract the region and city.
 * This function has been rewritten to ONLY use a city-based lookup.
 * All ambiguous keyword-based search logic has been completely removed to prevent
 * incorrect region assignments based on street names (e.g., "ул. Ленинградская").
 * @param address The raw address string.
 * @returns A ParsedAddress object. If no city is found, returns a "not determined" state.
 */
export function parseRussianAddress(address: string): ParsedAddress {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определен' };
    }

    // Step 1: Normalize the input string.
    let normalized = address.toLowerCase().replace(/ё/g, 'е').replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Apply specific aliases for common typos.
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
    }
    
    // Step 2: STRICT City-First Search. This is the only method used for region detection.
    for (const cityName of CITIES_SORTED_BY_LENGTH) {
        // Use a word boundary regex to avoid partial matches (e.g., 'кант' in 'кантовский').
        const regex = new RegExp(`\\b${cityName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
        
        if (regex.test(normalized)) {
            // City found! Immediately return its region and stop all further processing.
            return {
                region: REGION_BY_CITY_WITH_INDEXES[cityName].region,
                city: capitalize(cityName)
            };
        }
    }
    
    // Step 3: If no city was found after checking the entire list, give up.
    // The calling function (worker) is now responsible for any fallback logic.
    return { region: 'Регион не определен', city: 'Город не определен' };
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