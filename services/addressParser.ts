import { 
    standardizeRegion, 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP
} from '../utils/addressMappings';
import { ParsedAddress } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

// --- START OF REFACTORED LOGIC ---

// 1. Create a single, comprehensive map for region lookups.
// This map combines explicit region keywords with city-to-region mappings.
// Keywords from REGION_KEYWORD_MAP are given precedence by spreading them last.
const cityToRegionMap = Object.fromEntries(
    Object.entries(REGION_BY_CITY_WITH_INDEXES).map(([city, data]) => [city, data.region])
);
const COMBINED_REGION_MAP: Record<string, string> = { ...cityToRegionMap, ...REGION_KEYWORD_MAP };

// 2. Sort the keys of the combined map by length, descending.
// This is crucial to ensure longer, more specific keys are matched first 
// (e.g., "московская область" before "москва").
const COMBINED_KEYS_SORTED = Object.keys(COMBINED_REGION_MAP).sort((a, b) => b.length - a.length);

/**
 * Finds a region by matching keywords or city names from the combined map in the address.
 * Uses a robust regex to match whole phrases, preventing partial matches inside other words.
 * @param normalizedAddress The pre-processed, lowercased address string.
 * @returns The standardized region name or null if no match is found.
 */
function findRegion(normalizedAddress: string): string | null {
    for (const key of COMBINED_KEYS_SORTED) {
        // This regex ensures we match the key as a whole word/phrase.
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(^|\\s|\\W)${escapedKey}($|\\s|\\W)`, 'i');

        if (regex.test(normalizedAddress)) {
            return COMBINED_REGION_MAP[key];
        }
    }
    return null;
}

// --- END OF REFACTORED LOGIC ---


// Memoize the sorted list of cities to avoid re-computing it on every call for getCityFromAddress.
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
 * Finds a city name within a normalized address string. This is still needed to populate the 'city' field of the result.
 * @param normalizedAddress A pre-processed, lowercased address string.
 * @returns The capitalized city name or a default string if not found.
 */
function getCityFromAddress(normalizedAddress: string): string {
    if (!normalizedAddress) return 'Город не определен';

    // We check longer city names first to avoid partial matches (e.g., "Нижний Новгород" before "Новгород").
    for (const city of CITIES_SORTED_BY_LENGTH) {
        // Use regex with word boundaries to ensure we're matching the whole city name.
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`);
        if (regex.test(normalizedAddress)) {
            return capitalize(city);
        }
    }
    
    return 'Город не определен';
}

/**
 * Parses a Russian address string to extract the region and city using a lightweight, fast, and local-only approach.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseRussianAddress(address: string): ParsedAddress {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определен' };
    }

    // Initial cleaning: convert to lowercase, handle 'ё', remove commas/semicolons, and collapse whitespace.
    const lowerAddress = address.toLowerCase().replace(/ё/g, 'е');
    let normalized = lowerAddress.replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();

    // --- Step 1: Normalization using aliases for common typos ---
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    // --- Step 2: Determine Region and City using the new simplified logic ---
    const region = findRegion(normalized); // Single, robust call to find the region.
    const city = getCityFromAddress(normalized); // Still used to identify the city itself.

    return {
        region: standardizeRegion(region),
        city: city 
    };
}