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
 * @returns The capitalized city name or null if not found.
 */
function getCityFromAddress(normalizedAddress: string): string | null {
    if (!normalizedAddress) return null;

    // We check longer city names first to avoid partial matches (e.g., "Нижний Новгород" before "Новгород").
    for (const city of CITIES_SORTED_BY_LENGTH) {
        // Use regex with word boundaries to ensure we're matching the whole city name.
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`, 'i');
        if (regex.test(normalizedAddress)) {
            return capitalize(city);
        }
    }
    
    return null;
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
 * Returns the city name from the distributor's parentheses (in lowercase).
 */
function extractCityFromDistributor(distributor: string): string | null {
  if (!distributor) return null;
  const match = distributor.match(/\(([^)]+)\)/);
  if (!match || !match[1]) return null;
  return match[1].trim().toLowerCase();
}

/**
 * Checks if the address string contains a common settlement prefix (like 'г.', 'с.', 'пос.').
 * This is crucial to decide whether to enrich an address with a city from the distributor.
 * @param address The address string (preferably lowercased).
 * @returns True if a settlement prefix is found, false otherwise.
 */
function hasSettlementInAddress(address: string): boolean {
    // Regex for common settlement prefixes, case-insensitive.
    // Includes: с, село, г, город, пгт, пос, деревня, дер, хутор, х, станица, ст-ца, аул, рп (рабочий посёлок), р-к (рынок), мкр, ж/м
    const settlementRegex = /\b(с|село|г|город|пгт|пос|деревня|дер|хутор|х|станица|ст-ца|аул|рп|р-к|мкр|ж\/м)\b\.?/i;
    return settlementRegex.test(address);
}


/**
 * Parses a Russian address string to extract the region and city using a hierarchical approach.
 * It correctly prioritizes clues from the address itself over the distributor and handles RF vs. CIS logic.
 * @param address The raw address string.
 * @param distributor An optional distributor string which may contain a city hint in parentheses.
 * @returns An EnrichedParsedAddress object with the determined region, city, and a correctly constructed finalAddress.
 */
export function parseRussianAddress(address: string, distributor?: string): EnrichedParsedAddress {
    const originalAddress = (address || '').trim();
    if (!originalAddress && !distributor) {
        return { region: 'Регион не определен', city: 'Город не определен', finalAddress: '' };
    }

    // --- 1. Normalization & Initial Parsing ---
    const lowerAddress = originalAddress.toLowerCase().replace(/ё/g, 'е');
    let normalized = lowerAddress.replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    const addressCity = getCityFromAddress(normalized);
    const distributorCityRaw = distributor ? extractCityFromDistributor(distributor) : null;

    // --- 2. Determine the Region with a clear priority ---
    let finalRegion: string | null = null;
    
    // Priority 1: A city found *inside* the address is the most reliable clue for region.
    if (addressCity) {
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === addressCity.toLowerCase());
        if (cityKey) {
            finalRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
    }

    // Priority 2: If no region found yet, use the distributor's city (common for CIS).
    if (!finalRegion && distributorCityRaw) {
         const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === distributorCityRaw);
         if (cityKey) {
            finalRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
         }
    }

    // Priority 3: Fallback to keyword search (most reliable for RF/BY where region names are explicit).
    if (!finalRegion) {
        finalRegion = findRegionByKeyword(normalized);
    }

    // --- 3. Construct the Final Address string logically ---
    const finalRegionStr = standardizeRegion(finalRegion);
    let finalAddress = originalAddress;

    // Check if the original address already contains *any* form of settlement prefix or a known city.
    const addressHasOwnLocation = addressCity !== null || hasSettlementInAddress(lowerAddress);

    if (addressHasOwnLocation) {
        // The address is self-sufficient. Just ensure the region is prepended if not already there.
        if (finalRegionStr !== 'Регион не определен' && !lowerAddress.includes(finalRegionStr.toLowerCase().substring(0, 5))) {
             finalAddress = `${finalRegionStr}, ${originalAddress}`;
        }
    } else {
        // The address is generic (e.g., "ул. Ленина"). Enrich it with a city.
        const cityForPrefix = distributorCityRaw ? capitalize(distributorCityRaw) : null;
        if (cityForPrefix) {
            if (originalAddress) {
                finalAddress = `${finalRegionStr}, г. ${cityForPrefix}, ${originalAddress}`;
            } else {
                 finalAddress = `${finalRegionStr}, г. ${cityForPrefix}`;
            }
        } else {
            // No city to enrich with, just prepend region if found.
            if (finalRegionStr !== 'Регион не определен') {
                finalAddress = `${finalRegionStr}, ${originalAddress}`;
            }
        }
    }

    // --- 4. Final Cleanup ---
    const cityForDisplay = addressCity || (distributorCityRaw ? capitalize(distributorCityRaw) : 'Город не определен');
    
    // This regex removes a duplicated city name if it appears twice.
    // e.g., "Бишкек, Бишкек, Патриса Лумумбы" -> "Бишкек, Патриса Лумумбы"
    if (cityForDisplay !== 'Город не определен') {
         const escapedCity = cityForDisplay.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
         const duplicateRegex = new RegExp(`(${escapedCity}),\\s*\\1`, 'gi');
         finalAddress = finalAddress.replace(duplicateRegex, '$1');
    }
    
    finalAddress = finalAddress.replace(/ ,/g, ',').replace(/^,/, '').trim();
    
    return {
        region: finalRegionStr,
        city: cityForDisplay,
        finalAddress
    };
}