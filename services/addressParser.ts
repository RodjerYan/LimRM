import { 
    standardizeRegion, 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP
} from '../utils/addressMappings';
import { EnrichedParsedAddress } from '../types';
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
 * Parses a Russian address string to extract the region and city using a hierarchical approach.
 * If the address is ambiguous, it uses the distributor string as a fallback to determine the region
 * and enriches the original address.
 * @param address The raw address string.
 * @param distributor An optional distributor string which may contain a city hint in parentheses.
 * @returns An EnrichedParsedAddress object with the determined region, city, and a potentially modified finalAddress.
 */
export function parseRussianAddress(address: string, distributor?: string): EnrichedParsedAddress {
    const originalAddress = address || '';
    if (!originalAddress.trim() && !distributor?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определен', finalAddress: '' };
    }

    const lowerAddress = originalAddress.toLowerCase().replace(/ё/g, 'е');
    let normalized = lowerAddress.replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }
    
    // --- HIERARCHICAL LOGIC ---

    // 1. Try to find region from the address string itself. This is the most reliable source.
    let region = findRegionByKeyword(normalized);
    const city = getCityFromAddress(normalized);

    // If a region is found directly, the address is explicit enough. Use the original address.
    if (region) {
        return {
            region: standardizeRegion(region),
            city: city,
            finalAddress: originalAddress,
        };
    }
    
    // 2. If NO region was found, check the distributor string for a city hint.
    if (distributor) {
        const distributorCity = extractCityFromDistributor(distributor);
        if (distributorCity) {
            const regionFromDistributor = REGION_KEYWORD_MAP[distributorCity];
            if (regionFromDistributor) {
                const capitalizedCity = capitalize(distributorCity);
                // Construct the new, enriched address as requested
                const finalAddress = `г. ${capitalizedCity}, ${originalAddress.trim()}`;
                
                return {
                    region: standardizeRegion(regionFromDistributor),
                    // Use the city from distributor as the primary city if the address didn't have one
                    city: city !== 'Город не определен' ? city : capitalizedCity,
                    finalAddress: finalAddress,
                };
            }
        }
    }

    // 3. Last fallback: If distributor didn't help, try to derive region from a city found in the address.
    // This handles cases where a city name itself isn't a direct region keyword but is in our city map.
    if (city !== 'Город не определен') {
        const cityData = REGION_BY_CITY_WITH_INDEXES[city.toLowerCase()];
        if (cityData) {
            region = cityData.region;
        }
    }

    // In this fallback case, the address is not enriched, we just return what we found.
    return {
        region: standardizeRegion(region),
        city: city,
        finalAddress: originalAddress 
    };
}