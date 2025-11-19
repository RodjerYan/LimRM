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
        normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
    }
    
    // Determine city from address regardless of flow, for later use.
    const cityFromAddress = getCityFromAddress(normalized);

    // --- HIERARCHICAL LOGIC ---

    // 1. Primary Method: Find region from explicit keywords in the address.
    // REGION_KEYWORD_MAP should contain explicit regions ('... обл') and major cities ('москва', 'бишкек').
    const regionFromKeyword = findRegionByKeyword(normalized);
    if (regionFromKeyword) {
        return {
            region: standardizeRegion(regionFromKeyword),
            city: cityFromAddress,
            finalAddress: originalAddress,
        };
    }
    
    // 2. Fallback Method: If address is ambiguous, use the distributor string hint.
    if (distributor) {
        const distLower = distributor.toLowerCase();
        const match = distLower.match(/\(([^)]+)\)/);
        if (match && match[1]) {
            const cityFromDist = match[1].trim();
            // Use the master city list for lookup
            const cityData = REGION_BY_CITY_WITH_INDEXES[cityFromDist];

            if (cityData) {
                const regionFromDist = cityData.region;
                const capitalizedCity = capitalize(cityFromDist);
                // Construct the new, enriched address
                const finalAddress = `г. ${capitalizedCity}, ${originalAddress.trim()}`.trim().replace(/^г\.\s*,\s*/, 'г. ');
                
                return {
                    region: standardizeRegion(regionFromDist),
                    city: cityFromAddress !== 'Город не определен' ? cityFromAddress : capitalizedCity,
                    finalAddress: finalAddress,
                };
            }
        }
    }

    // 3. Last Resort: If distributor didn't help, try to derive region from any city found in the address.
    if (cityFromAddress !== 'Город не определен') {
        const cityData = REGION_BY_CITY_WITH_INDEXES[cityFromAddress.toLowerCase()];
        if (cityData && cityData.region) {
            return {
                region: standardizeRegion(cityData.region),
                city: cityFromAddress,
                finalAddress: originalAddress,
            };
        }
    }

    // 4. If nothing worked, return defaults.
    return {
        region: standardizeRegion(null),
        city: cityFromAddress,
        finalAddress: originalAddress 
    };
}