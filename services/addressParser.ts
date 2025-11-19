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
 * Returns the city name from the distributor's parentheses (in lowercase),
 * even if it is not in REGION_KEYWORD_MAP - we will look for the city in REGION_BY_CITY_WITH_INDEXES.
 */
function extractCityFromDistributor(distributor: string): string | null {
  if (!distributor) return null;
  const match = distributor.match(/\(([^)]+)\)/);
  if (!match || !match[1]) return null;
  return match[1].trim().toLowerCase();
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

    // 1. Determine Primary City: Priority is the address, fallback to distributor.
    const foundCityFromAddress = getCityFromAddress(normalized);
    const addressCityExists = foundCityFromAddress !== 'Город не определен';
    const distributorCityRaw = distributor ? extractCityFromDistributor(distributor) : null;
    const distributorCityCapitalized = distributorCityRaw ? capitalize(distributorCityRaw) : null;
    const primaryCity = addressCityExists ? foundCityFromAddress : (distributorCityCapitalized || null);

    // 2. Determine Region: Priority is the Primary City, fallback to keywords.
    let finalRegion: string | null = null;
    if (primaryCity) {
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === primaryCity.toLowerCase());
        if (cityKey) {
            finalRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
    }
    // Only use keyword search if city-based lookup fails. This prevents "Ленинградская область" errors.
    if (!finalRegion) {
        finalRegion = findRegionByKeyword(normalized);
    }
    
    // 3. Construct Final Address: Clean the original address and assemble correctly.
    let finalAddress = originalAddress.trim();
    let addressRemainder = originalAddress.trim();

    // If a city was found in the address, clean the remainder by removing city prefixes to avoid duplication.
    if (addressCityExists) {
        // This regex removes variations of the city name (e.g., "г. Токмок, ", "Токмок ") from the start.
        const cityRegex = new RegExp(`^(г\\.\\s*)?${foundCityFromAddress.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}[, ]*`, 'i');
        addressRemainder = addressRemainder.replace(cityRegex, '').trim();
    }
    
    const regionPart = finalRegion ? standardizeRegion(finalRegion) : null;
    const cityPart = primaryCity ? `г. ${primaryCity}` : null;
    
    // Assemble the final address string from the clean parts.
    const parts = [];
    if (regionPart) {
        parts.push(regionPart);
    }
    if (cityPart) {
        parts.push(cityPart);
    }
    if (addressRemainder) {
        parts.push(addressRemainder);
    }

    // Join with commas, but filter out any null/empty parts first.
    finalAddress = parts.filter(Boolean).join(', ');

    // Final cleanup for presentation
    finalAddress = finalAddress.replace(/ ,/g, ',').replace(/, ,/g, ',');

    return {
        region: finalRegion ? standardizeRegion(finalRegion) : 'Регион не определен',
        city: primaryCity || 'Город не определен',
        finalAddress
    };
}