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
 * Extracts a city name from a distributor string (e.g., "Company (Bishkek)").
 * @param distributor The distributor string.
 * @returns The found city name in lowercase, or null.
 */
function extractCityFromDistributor(distributor: string): string | null {
  if (!distributor) return null;

  const match = distributor.match(/\(([^)]+)\)/);
  if (!match || !match[1]) return null;
  
  const cityInParens = match[1].trim().toLowerCase();

  // Check if this city is a known keyword that maps to a region
  if (REGION_KEYWORD_MAP[cityInParens]) {
    return cityInParens;
  }
  
  return null;
}


/**
 * Parses a Russian address string to extract the region and city using a lightweight, fast, and local-only approach.
 * @param address The raw address string.
 * @param distributor An optional distributor string which may contain a city hint in parentheses.
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseRussianAddress(address: string, distributor?: string): ParsedAddress {
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

    // --- Step 2: Determine Region and City from address ---
    let region = findRegionByKeyword(normalized);
    const city = getCityFromAddress(normalized);

    // --- Step 3: Fallback to distributor string if region is not found in address ---
    if (!region && distributor) {
        const distributorCity = extractCityFromDistributor(distributor);
        if (distributorCity) {
            // Found a valid city in the distributor string, use it to get the region
            region = REGION_KEYWORD_MAP[distributorCity];
        }
    }

    // --- Step 4: Fallback to find region from city if not found by keyword or distributor ---
    if (!region && city !== 'Город не определен') {
        const cityData = REGION_BY_CITY_WITH_INDEXES[city.toLowerCase()];
        if (cityData) {
            region = cityData.region;
        }
    }

    return {
        region: standardizeRegion(region),
        city: city 
    };
}