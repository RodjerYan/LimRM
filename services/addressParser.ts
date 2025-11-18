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
 * Finds a city name within a normalized address string.
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
 * Now includes a fallback mechanism to parse the city from a distributor string if not found in the main address.
 * @param address The raw address string.
 * @param distributor An optional distributor string, e.g., "Компания (Город)".
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseAddress(address: string, distributor?: string): ParsedAddress {
    const defaultResult = { region: 'Регион не определен', city: 'Город не определен' };
    
    if (!address?.trim() && !distributor?.trim()) {
        return defaultResult;
    }

    const lowerAddress = (address || '').toLowerCase().replace(/ё/g, 'е');
    let normalized = lowerAddress.replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }
    
    let city = getCityFromAddress(normalized);
    let region = findRegionByKeyword(normalized);

    // Fallback logic: if city is not found in address, check distributor string
    if (city === 'Город не определен' && distributor) {
        const distributorLower = distributor.toLowerCase();
        const match = distributorLower.match(/\(([^)]+)\)/); // Extract content from parentheses
        if (match && match[1]) {
            const cityFromDistributor = match[1].trim();
            const foundCityInfo = REGION_BY_CITY_WITH_INDEXES[cityFromDistributor];
            if (foundCityInfo) {
                city = capitalize(cityFromDistributor);
                region = foundCityInfo.region; // Directly get region from our map
            } else {
                 // Try to find the city from the distributor in the main city list as a fallback
                const foundCityKey = CITIES_SORTED_BY_LENGTH.find(c => cityFromDistributor.includes(c));
                if (foundCityKey && REGION_BY_CITY_WITH_INDEXES[foundCityKey]) {
                    city = capitalize(foundCityKey);
                    region = REGION_BY_CITY_WITH_INDEXES[foundCityKey].region;
                }
            }
        }
    }

    // If region is still not determined but city is, look up region by city
    if (city !== 'Город не определен' && (!region || region === 'Регион не определен')) {
        const cityInfo = REGION_BY_CITY_WITH_INDEXES[city.toLowerCase()];
        if (cityInfo) {
            region = cityInfo.region;
        }
    }
    
    return {
        region: standardizeRegion(region),
        city: city
    };
}