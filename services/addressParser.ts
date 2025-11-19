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
 * @param address The address string (preferably lowercased).
 * @returns True if a settlement prefix is found, false otherwise.
 */
function hasSettlementPrefix(address: string): boolean {
    const settlementRegex = /(^|[\s,])(с|село|г|город|пгт|пос|деревня|дер|хутор|х|станица|ст-ца|аул|рп|р-к)\b\.?/i;
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

        if (!lowerAddress.includes(finalRegionStr.toLowerCase().substring(0, 5))) {
             finalAddress = `${finalRegionStr}, ${finalAddress}`;
        }
        
        return {
            region: finalRegionStr,
            city: city,
            finalAddress: finalAddress.replace(/ ,/g, ',').replace(/, ,/g, ',')
        };
    }

    // --- Path B: CIS & Unknown Region Logic ---
    const cityFromAddress = getCityFromAddress(normalized);
    const addressCityExists = cityFromAddress !== 'Город не определен';
    const addressHasSettlement = hasSettlementPrefix(lowerAddress);

    const distributorCityRaw = distributor ? extractCityFromDistributor(distributor) : null;
    
    let primaryCity = addressCityExists ? cityFromAddress : null;
    let finalRegion: string | null = null;
    
    // --- Region & City Determination for CIS ---
    let regionFromDistributor: string | null = null;
    if (distributorCityRaw) {
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === distributorCityRaw);
        if (cityKey) {
            regionFromDistributor = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
    }

    // For CIS addresses, the distributor is the most reliable source for the REGION.
    if (regionFromDistributor && CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(regionFromDistributor)) {
        finalRegion = regionFromDistributor;
    } else {
        // Fallback to city from address, then to general keywords.
        if (addressCityExists && primaryCity) {
            const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === primaryCity!.toLowerCase());
            if (cityKey) finalRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
        if (!finalRegion) finalRegion = regionFromKeyword;
    }

    // If no city/settlement in address, use the distributor's city as the primary one.
    if (!addressCityExists && !addressHasSettlement && distributorCityRaw) {
        primaryCity = capitalize(distributorCityRaw);
    }
    
    // --- Final Address Formatting ---
    const finalRegionStr = standardizeRegion(finalRegion);
    let finalAddress = originalAddress.trim();
    
    const isCISContext = finalRegion && CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(finalRegion);
    const shouldEnrichWithCity = isCISContext && !addressCityExists && !addressHasSettlement && distributorCityRaw;

    if (shouldEnrichWithCity) {
        // Rule: No settlement in address, enrich it with the city from the distributor.
        finalAddress = `${finalRegionStr}, г. ${primaryCity}, ${finalAddress}`;
    } else {
        // Rule: Settlement/city exists in address, just prepend the correctly determined region.
        if (finalRegionStr !== 'Регион не определен' && !lowerAddress.includes(finalRegionStr.toLowerCase().substring(0, 5))) {
            finalAddress = `${finalRegionStr}, ${finalAddress}`;
        }
    }

    finalAddress = finalAddress.replace(/ ,/g, ',').replace(/, ,/g, ',').replace(/^,/, '').trim();
    
    return {
        region: finalRegionStr,
        city: primaryCity || (addressHasSettlement ? 'н/д' : 'Город не определен'),
        finalAddress
    };
}
