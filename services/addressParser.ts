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
    const settlementRegex = /(^|[\s,])(с|село|г|город|пгт|пос|деревня|дер|хутор|х|станица|ст-ца|аул|рп|р-к|мкр|ж\/м)\b\.?/i;
    return settlementRegex.test(address);
}


/**
 * Parses a Russian address string to extract the region and city using a hierarchical approach.
 * It separates logic for Russian/Belarusian addresses from other CIS countries, using the distributor
 * string as a key piece of context for the latter.
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

    const CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC = new Set([
        'Кыргызская Республика', 'Республика Казахстан', 'Армения', 'Азербайджан',
        'Республика Молдова', 'Республика Узбекистан', 'Республика Таджикистан',
        'Туркменистан', 'Грузия'
    ]);

    // --- Path A: High-priority check for explicit Russian/Belarusian region keywords ---
    const regionFromKeyword = findRegionByKeyword(normalized);
    if (regionFromKeyword && !CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(regionFromKeyword)) {
        // This is Russia or Belarus. The keyword is reliable. Ignore the distributor.
        const city = getCityFromAddress(normalized);
        const finalRegionStr = standardizeRegion(regionFromKeyword);
        let finalAddress = originalAddress.trim();

        // Prepend region only if it's not already obviously there
        if (!lowerAddress.includes(finalRegionStr.toLowerCase().substring(0, 5))) {
             finalAddress = `${finalRegionStr}, ${finalAddress}`;
        }
        
        return {
            region: finalRegionStr,
            city: city || 'Город не определен',
            finalAddress: finalAddress.replace(/ ,/g, ',').replace(/, ,/g, ',')
        };
    }

    // --- Path B: CIS & Ambiguous Region Logic ---
    const addressCity = getCityFromAddress(normalized);
    const distributorCityRaw = distributor ? extractCityFromDistributor(distributor) : null;

    // --- Region Determination with Priority ---
    let finalRegion: string | null = null;
    
    // For CIS, the distributor's city is the most reliable source for the REGION.
    if (distributorCityRaw) {
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === distributorCityRaw);
        if (cityKey) {
            const potentialRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
            // Only accept this region if it's a CIS country we're targeting
            if (CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(potentialRegion)) {
                finalRegion = potentialRegion;
            }
        }
    }
    
    // If the distributor didn't give a valid CIS region, try to find one from the address city.
    if (!finalRegion && addressCity) {
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === addressCity.toLowerCase());
        if (cityKey) finalRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
    }

    // Last resort: use the keyword search result if it's a CIS country
    if (!finalRegion && regionFromKeyword && CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(regionFromKeyword)) {
        finalRegion = regionFromKeyword;
    }
    
    // --- Final Address Formatting ---
    const finalRegionStr = standardizeRegion(finalRegion);
    let finalAddress = originalAddress.trim();

    // Check if a settlement (с., г., р-к, etc.) or a known city is already present in the address.
    const addressHasSettlementOrCity = hasSettlementInAddress(lowerAddress) || (addressCity != null);

    const isCISContext = finalRegion && CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(finalRegion);
    
    // Rule: Add city from distributor only if we are in a CIS context, there's a city from the distributor, AND the address itself lacks any settlement info.
    const shouldEnrichWithCity = isCISContext && distributorCityRaw && !addressHasSettlementOrCity;

    if (shouldEnrichWithCity) {
        finalAddress = `${finalRegionStr}, г. ${capitalize(distributorCityRaw)}, ${finalAddress}`;
    } else {
        // Rule: A settlement/city already exists in the address. Just ensure the correctly determined region is prepended.
        if (finalRegionStr !== 'Регион не определен' && !lowerAddress.includes(finalRegionStr.toLowerCase().substring(0, 5))) {
            finalAddress = `${finalRegionStr}, ${finalAddress}`;
        }
    }
    
    // Cleanup for presentation
    finalAddress = finalAddress.replace(/ ,/g, ',').replace(/, ,/g, ',').replace(/^,/, '').trim();
    
    return {
        region: finalRegionStr,
        city: addressCity || (distributorCityRaw ? capitalize(distributorCityRaw) : 'Город не определен'),
        finalAddress
    };
}