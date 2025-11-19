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
 * Parses a Russian address string to extract the region and city using a lightweight, fast, and local-only approach.
 * This function has been completely refactored to be more robust and strictly prioritize city detection over any other method.
 * The ambiguous region keyword search has been REMOVED entirely.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseRussianAddress(address: string): ParsedAddress {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определен' };
    }

    const lowerAddress = address.toLowerCase();

    // HARDCODED FIX for "Орёл" to be "iron-clad" as requested.
    if (/\bор[её]л\b/.test(lowerAddress)) {
        return {
            region: 'Орловская область',
            city: 'Орёл'
        };
    }

    // Initial cleaning and normalization
    let normalized = lowerAddress.replace(/ё/g, 'е').replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
    }

    // --- STEP 1: STRICT CITY-FIRST SEARCH (ONLY METHOD) ---
    // This is the most reliable method. We iterate through a pre-sorted list of all known cities.
    for (const cityName of CITIES_SORTED_BY_LENGTH) {
        // FIX: Create a regex that is insensitive to 'е' vs 'ё' to correctly match cities like 'Орёл'/'Орел'.
        const cityRegexStr = cityName
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
            .replace(/[её]/g, '[её]');
        const regex = new RegExp(`\\b${cityRegexStr}\\b`);

        if (regex.test(normalized)) {
            // MATCH FOUND! Immediately return the region associated with this city.
            // No further checks are needed. This prevents street names from causing conflicts.
            return {
                region: REGION_BY_CITY_WITH_INDEXES[cityName].region,
                city: capitalize(cityName)
            };
        }
    }

    // --- STEP 2 (REMOVED): FALLBACK TO REGION KEYWORD SEARCH ---
    // This entire block has been removed to prevent incorrect matches from street names.
    // The logic now relies on the city search above or the distributor fallback in the worker.

    // --- STEP 3: NO MATCH FOUND ---
    // If no city is found, we return 'undefined' and let the worker handle the fallback (distributor check).
    return { region: 'Регион не определен', city: 'Город не определен' };
}


/**
 * Attempts to determine a region and city by finding a known city name within a fallback string (e.g., a distributor's name).
 * @param fallbackString The string to search within, e.g., "ООО Ромашка (г. Воронеж)".
 * @returns An object with `region` and `city` if a match is found, otherwise null.
 */
export function getRegionFromFallback(fallbackString: string): { region: string; city: string } | null {
    if (!fallbackString) return null;
    
    const lowerFallback = fallbackString.toLowerCase();
    // HARDCODED FIX for "Орёл" to be "iron-clad" as requested.
    if (/\bор[её]л\b/.test(lowerFallback)) {
        return {
            region: 'Орловская область',
            city: 'Орёл',
        };
    }

    // More robust normalization: remove punctuation to avoid issues with word boundaries.
    const normalized = lowerFallback.replace(/[()]/g, ' ').replace(/ё/g, 'е');

    // Iterate through sorted cities to find the longest possible match
    for (const cityName of CITIES_SORTED_BY_LENGTH) {
        // FIX: Create a regex that is insensitive to 'е' vs 'ё' and also escapes special characters.
        const cityRegexStr = cityName
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
            .replace(/[её]/g, '[её]');
        const regex = new RegExp(`\\b${cityRegexStr}\\b`);

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