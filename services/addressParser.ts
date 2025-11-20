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

    // 1. Determine City
    const cityFromAddress = getCityFromAddress(normalized); // Returns capitalized city or 'Город не определен'
    const isCityInAddress = cityFromAddress !== 'Город не определен';
    
    const distributorCityRaw = distributor ? extractCityFromDistributor(distributor) : null;
    const distributorCityCapitalized = distributorCityRaw ? capitalize(distributorCityRaw) : null;

    // City from address has priority. Otherwise, use distributor city.
    const finalCity = isCityInAddress ? cityFromAddress : (distributorCityCapitalized || 'Город не определен');

    // 2. Determine Region
    let region: string | null = null;
    
    // Priority 1: Find explicit region keyword in address string (e.g., "брянская обл")
    const regionFromKeywordInAddress = findRegionByKeyword(normalized);
    region = regionFromKeywordInAddress;

    // Priority 2: If no explicit region keyword, use the distributor city as the next strongest hint for the REGION.
    if (!region && distributorCityRaw) {
       const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === distributorCityRaw);
        if (cityKey) {
            region = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
    }

    // Priority 3: If region is still unknown, derive it from the final determined city (which could be from address or a fallback to distributor).
    if (!region && finalCity !== 'Город не определен') {
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === finalCity.toLowerCase());
        if (cityKey) {
            region = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
    }

    const finalRegion = region ? standardizeRegion(region) : 'Регион не определен';

    // 3. Construct Final Address (for display and geocoding)
    let finalAddress = originalAddress.trim();
    
    // Prepend region only if it's determined and NOT already present in the original address.
    if (finalRegion !== 'Регион не определен' && !regionFromKeywordInAddress) {
        finalAddress = `${finalRegion}, ${finalAddress}`;
    }
    
    // Clean up potential duplicates if region was added but parts were already there (e.g. city name)
    const parts = finalAddress.split(',').map(p => p.trim()).filter(Boolean);
    const uniqueParts = [];
    const seen = new Set();
    for(const part of parts) {
        const lowerPart = part.toLowerCase();
        if(!seen.has(lowerPart)) {
            uniqueParts.push(part);
            seen.add(lowerPart);
        }
    }
    finalAddress = uniqueParts.join(', ');

    return {
        region: finalRegion,
        city: finalCity,
        finalAddress: finalAddress
    };
}