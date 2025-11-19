import { 
    standardizeRegion, 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP
} from '../utils/addressMappings';
import { EnrichedParsedAddress } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

// Memoize the sorted list of cities to avoid re-computing it on every call.
const CITIES_SORTED_BY_LENGTH = Object.keys(REGION_BY_CITY_WITH_INDEXES).sort((a, b) => b.length - a.length);

// Helper set of Russian Federation and Belarus regions for prioritization.
const RF_AND_BY_REGIONS = new Set<string>(
    Object.values(REGION_KEYWORD_MAP)
        .filter(region => 
            !['Кыргызская Республика', 'Республика Казахстан', 'Республика Таджикистан', 'Республика Узбекистан', 'Армения', 'Азербайджан', 'Грузия', 'Республика Молдова', 'Туркменистан', 'Республика Абхазия'].includes(region)
        )
);


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
 * It correctly prioritizes clues for Russia/Belarus vs. other CIS countries.
 * @param address The raw address string.
 * @param distributor An optional distributor string which may contain a city hint in parentheses.
 * @returns An EnrichedParsedAddress object with the determined region, city, and a correctly constructed finalAddress.
 */
export function parseRussianAddress(address: string, distributor?: string): EnrichedParsedAddress {
    const originalAddress = (address || '').trim();
    if (!originalAddress && !distributor) {
        return { region: 'Регион не определен', city: 'Город не определен', finalAddress: '' };
    }

    // --- 1. Normalization & Initial Data Extraction ---
    const lowerAddress = originalAddress.toLowerCase().replace(/ё/g, 'е');
    let normalized = lowerAddress.replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    const regionFromKeyword = findRegionByKeyword(normalized);
    const cityFromAddress = getCityFromAddress(normalized);
    const cityFromDistributorRaw = distributor ? extractCityFromDistributor(distributor) : null;

    let finalRegion: string | null = null;
    let primaryCity: string | null = null;
    let useDistributorForEnrichment = false;

    // --- 2. Main Decision Logic ---
    if (regionFromKeyword && RF_AND_BY_REGIONS.has(regionFromKeyword)) {
        // Path 1: Detected an explicit RF or BY region. This has the highest priority.
        // We IGNORE the distributor for region/city detection to prevent conflicts.
        finalRegion = regionFromKeyword;
        primaryCity = cityFromAddress;
    } else {
        // Path 2: This is likely a CIS country (not BY) or an ambiguous address.
        // Here, we use the hierarchical city logic and allow distributor fallback.
        useDistributorForEnrichment = true;

        if (cityFromAddress) {
            primaryCity = cityFromAddress;
            const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === cityFromAddress.toLowerCase());
            if (cityKey) finalRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        } else if (cityFromDistributorRaw) {
            primaryCity = capitalize(cityFromDistributorRaw);
            const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === cityFromDistributorRaw);
            if (cityKey) finalRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }

        // If region is still not found, the keyword match is our last resort (e.g., for "абхазия").
        if (!finalRegion) {
            finalRegion = regionFromKeyword;
        }
    }
    
    const finalRegionStr = standardizeRegion(finalRegion);

    // --- 3. Construct the Final Address string logically ---
    let finalAddress = originalAddress;
    const addressHasOwnLocation = cityFromAddress !== null || hasSettlementInAddress(lowerAddress);

    if (addressHasOwnLocation) {
        // Address is self-sufficient. Prepend region if it's not already obviously there.
        if (finalRegionStr !== 'Регион не определен' && !lowerAddress.includes(finalRegionStr.toLowerCase().substring(0, 5))) {
            finalAddress = `${finalRegionStr}, ${originalAddress}`;
        }
    } else {
        // Address is generic (e.g., "ул. Ленина"). Enrich it with a city.
        const cityForEnrichment = primaryCity;
        if (useDistributorForEnrichment && cityForEnrichment) {
            if (originalAddress) {
                finalAddress = `${finalRegionStr}, г. ${cityForEnrichment}, ${originalAddress}`;
            } else {
                finalAddress = `${finalRegionStr}, г. ${cityForEnrichment}`;
            }
        } else if (finalRegionStr !== 'Регион не определен') {
            finalAddress = `${finalRegionStr}, ${originalAddress}`;
        }
    }

    // --- 4. Final Cleanup ---
    // This regex removes a duplicated city name if it appears twice, e.g., "Бишкек, Бишкек, ..."
    if (primaryCity) {
         const escapedCity = primaryCity.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
         const duplicateRegex = new RegExp(`(${escapedCity}),\\s*\\1`, 'gi');
         finalAddress = finalAddress.replace(duplicateRegex, '$1');
    }
    
    finalAddress = finalAddress.replace(/ ,/g, ',').replace(/^, /, '').trim();
    
    return {
        region: finalRegionStr,
        city: primaryCity || 'Город не определен',
        finalAddress
    };
}
