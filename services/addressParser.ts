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

    const CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC = new Set([
        'Кыргызская Республика', 'Республика Казахстан', 'Армения', 'Азербайджан',
        'Республика Молдова', 'Республика Узбекистан', 'Республика Таджикистан',
        'Туркменистан', 'Грузия'
    ]);

    // --- Path A: Check for explicit Russian/Belarusian region first ---
    const regionFromKeyword = findRegionByKeyword(normalized);
    if (regionFromKeyword && !CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(regionFromKeyword)) {
        const city = getCityFromAddress(normalized);
        const finalRegionStr = standardizeRegion(regionFromKeyword);

        let finalAddress = originalAddress.trim();
        // Avoid prepending region if it's already mentioned to prevent duplication
        const regionKeyword = Object.keys(REGION_KEYWORD_MAP).find(k => REGION_KEYWORD_MAP[k] === regionFromKeyword)?.toLowerCase() || 'unlikely-string';
        if (!lowerAddress.includes(regionKeyword) && !lowerAddress.includes(finalRegionStr.toLowerCase())) {
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
    const hasCityInAddress = cityFromAddress !== 'Город не определен';
    const distributorCityRaw = distributor ? extractCityFromDistributor(distributor) : null;

    let primaryCity: string | null = hasCityInAddress ? cityFromAddress : null;
    let citySource: 'address' | 'distributor' | null = hasCityInAddress ? 'address' : null;
    
    let finalRegion = regionFromKeyword; // Could be a CIS region like 'казахстан' from keywords

    if (!primaryCity && distributorCityRaw) {
        // No city in address; try to use distributor only if it helps identify a CIS region
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === distributorCityRaw);
        if (cityKey) {
            const potentialRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
            if (CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(potentialRegion)) {
                primaryCity = capitalize(distributorCityRaw);
                citySource = 'distributor';
                if (!finalRegion) finalRegion = potentialRegion;
            }
        }
    }
    
    // If region is still not found, try to determine it from the city found in the address
    if (!finalRegion && citySource === 'address' && primaryCity) {
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === primaryCity.toLowerCase());
        if (cityKey) {
            finalRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
    }

    // Assemble the final address string based on the rules
    const finalRegionStr = standardizeRegion(finalRegion);
    let finalAddress: string;
    
    const isSpecialCIS = finalRegion && CIS_REGIONS_FOR_DISTRIBUTOR_LOGIC.has(finalRegion);

    if (isSpecialCIS && citySource === 'distributor' && primaryCity) {
        // Rule 2: No city in address, so enrich the address with the city from the distributor.
        const parts = [finalRegionStr, `г. ${primaryCity}`, originalAddress.trim()].filter(Boolean);
        finalAddress = parts.join(', ');
    } else {
        // Rule 1 / Default: City was in address, or it's not a special CIS case. Just prepend region if needed.
        const parts = [finalRegionStr, originalAddress.trim()].filter(Boolean);
        // Avoid prepending if a significant part of the region name is already present.
        if (finalRegionStr !== 'Регион не определен' && 
            (lowerAddress.includes(finalRegionStr.toLowerCase().substring(0, 5)) || (regionFromKeyword && lowerAddress.includes(regionFromKeyword.toLowerCase())))) {
            finalAddress = originalAddress.trim();
        } else if (finalRegionStr !== 'Регион не определен') {
            finalAddress = parts.join(', ');
        } else {
            finalAddress = originalAddress.trim();
        }
    }

    finalAddress = finalAddress.replace(/ ,/g, ',').replace(/, ,/g, ',');

    return {
        region: finalRegionStr,
        city: primaryCity || 'Город не определен',
        finalAddress
    };
}
