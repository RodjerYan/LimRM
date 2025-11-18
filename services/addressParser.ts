import { ParsedAddress } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';
import { CITY_NORMALIZATION_MAP } from '../utils/addressMappings';

// Memoize the sorted list of cities to avoid re-computing it on every call.
const CITIES_SORTED_BY_LENGTH = Object.keys(REGION_BY_CITY_WITH_INDEXES).sort((a, b) => b.length - a.length);

const capitalize = (str: string | null): string => {
    if (!str) return '';
    // Capitalize each word for proper display
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

/**
 * Parses a Russian address string to extract region and city based on a strict city-first search.
 * This function has been refactored to prioritize an exact city match above all else, removing
 * ambiguous keyword-based region detection to fix misclassification errors.
 * @param address The raw address string.
 * @returns A ParsedAddress object. If no known city is found, returns 'Не определен'.
 */
export function parseRussianAddress(address: string): ParsedAddress {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определен' };
    }

    let normalized = address.toLowerCase().replace(/ё/g, 'е');
    
    // Step 1: Remove common prefixes (г., пос., село, etc.) to simplify the string.
    // This uses word boundaries to be safe.
    normalized = normalized.replace(/\b(г|город|пос|поселок|пгт|село|с|дер|деревня|станица|ст-ца|хутор|х)\.?,?\s+/g, ' ');
    
    // Step 2: Remove punctuation and collapse multiple spaces.
    normalized = normalized.replace(/[,;()]/g, ' ').replace(/\s+/g, ' ').trim();

    // Step 3: Apply a map of known specific typos and aliases.
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        const regex = new RegExp(`\\b${alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g');
        normalized = normalized.replace(regex, canonical);
    }
    // Final cleanup after replacements
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // --- STEP 4: STRICT CITY-FIRST SEARCH ---
    // This is the most reliable method. We iterate through a pre-sorted list of all known cities.
    for (const cityName of CITIES_SORTED_BY_LENGTH) {
        // Use a regex with word boundaries to ensure we match a whole word.
        const regex = new RegExp(`\\b${cityName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
        if (regex.test(normalized)) {
            // MATCH FOUND! Immediately return the region associated with this city.
            return {
                region: REGION_BY_CITY_WITH_INDEXES[cityName].region,
                city: capitalize(cityName)
            };
        }
    }

    // --- STEP 5: NO MATCH FOUND ---
    // The calling function will handle the fallback to the distributor column.
    return { region: 'Регион не определен', city: 'Город не определен' };
}

/**
 * Attempts to determine a region and city by finding a known city name within a fallback string (e.g., a distributor's name).
 * @param fallbackString The string to search within, e.g., "ООО Ромашка (г. Воронеж)".
 * @returns An object with `region` and `city` if a match is found, otherwise null.
 */
export function getRegionFromFallback(fallbackString: string): { region: string; city: string } | null {
    if (!fallbackString) return null;
    
    // Normalize the fallback string for better matching.
    const normalized = fallbackString.toLowerCase().replace(/[()]/g, ' ');

    // Iterate through sorted cities to find the longest possible match
    for (const cityName of CITIES_SORTED_BY_LENGTH) {
        const regex = new RegExp(`\\b${cityName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
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