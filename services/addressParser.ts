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
 * Parses a Russian address string to extract the region and city using a lightweight, fast, and local-only approach.
 * This function has been significantly improved to handle CIS countries and avoid false positives from street names.
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
    let region: string | null = null;
    let city: string = 'Город не определен';

    // Step 1: Attempt to find a city first. This is often the most reliable identifier.
    for (const cityName of CITIES_SORTED_BY_LENGTH) {
        const escapedCity = cityName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`);
        if (regex.test(normalized)) {
            city = capitalize(cityName);
            // If a city is found, its associated region is the strongest candidate.
            region = REGION_BY_CITY_WITH_INDEXES[cityName].region;
            break; // Stop after finding the first (longest) city.
        }
    }

    // Step 2: If we didn't find a city match, or to confirm/override, check for explicit region keywords.
    // This can correct cases where a city name is ambiguous (e.g. "Киров").
    const keywordRegion = findRegionByKeyword(normalized);
    if (keywordRegion) {
        region = keywordRegion;
    }

    // If city is still not determined but we have a region, we can leave it as is.
    // The main goal is to get the region right.

    return {
        region: standardizeRegion(region),
        city: city 
    };
}