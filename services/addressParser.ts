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
 * A robust helper function to find a value within a data row by checking for keywords.
 * @param row The data row object.
 * @param keywords An array of keywords to search for in column headers.
 * @returns The found value string or an empty string.
 */
const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword));
        if (foundKey && row[foundKey]) {
            return String(row[foundKey]);
        }
    }
    return '';
};

/**
 * Finds the most likely city name in a potentially messy address string.
 * If multiple known cities are present, it uses a heuristic that the city mentioned
 * last is the most specific and correct one.
 * @param normalizedAddress A pre-processed, lowercased address string.
 * @returns The capitalized city name or a default string if not found.
 */
function getCityFromAddress(normalizedAddress: string): string {
    if (!normalizedAddress) return 'Город не определен';

    let lastMatch: { city: string, index: number } | null = null;

    // CITIES_SORTED_BY_LENGTH is crucial. It ensures we check "Нижний Новгород" before "Новгород",
    // preventing a partial match from incorrectly taking precedence.
    for (const city of CITIES_SORTED_BY_LENGTH) {
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`, 'g');
        
        let match;
        while ((match = regex.exec(normalizedAddress)) !== null) {
            // If we find a match, we check if it's located later in the string
            // than our currently stored `lastMatch`. This helps resolve ambiguity.
            if (!lastMatch || match.index > lastMatch.index) {
                lastMatch = { city, index: match.index };
            }
        }
    }

    if (lastMatch) {
        return capitalize(lastMatch.city);
    }
    
    return 'Город не определен';
}


/**
 * Finds a region by matching explicit keywords (e.g., "орловская обл", "брянская") in the address.
 * It now finds all matches and returns the one that appears latest in the string, making it more robust against garbage data at the beginning of the address.
 * @param normalizedAddress The pre-processed, lowercased address string.
 * @returns The standardized region name or null if no match is found.
 */
function findRegionByKeyword(normalizedAddress: string): string | null {
    // Sort keys by length descending to match longer phrases first (e.g., "московская область" before "москва")
    const sortedKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    let lastMatch: { region: string, index: number } | null = null;

    for (const key of sortedKeys) {
        // This regex ensures we match the key as a whole word/phrase.
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // 'i' for case-insensitive, 'g' to find all occurrences
        const regex = new RegExp(`(^|\\s|\\W)${escapedKey}($|\\s|\\W)`, 'gi');

        let match;
        while ((match = regex.exec(normalizedAddress)) !== null) {
            // If we find a match, check if its index is greater than the last one found.
            if (!lastMatch || match.index > lastMatch.index) {
                lastMatch = { region: REGION_KEYWORD_MAP[key], index: match.index };
            }
        }
    }
    return lastMatch ? lastMatch.region : null;
}

/**
 * Parses a Russian address string to extract the region and city.
 * It uses a clear cascade of logic: checks for specific settlements, then known cities in the address,
 * and finally falls back to using the city from the "Дистрибьютер" column if the address is ambiguous.
 * @param row The full data row object.
 * @param address The raw address string from the row.
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseRussianAddress(row: { [key: string]: any }, address: string): ParsedAddress {
    // --- Step 1: Analyze Distributor for Context ---
    const distributorValue = findValueInRow(row, ['дистрибьютер', 'дистрибьютор']).toLowerCase();
    let distributorCity: string | null = null;
    let distributorRegion: string | null = null;

    if (distributorValue) {
        for (const city of CITIES_SORTED_BY_LENGTH) {
            if (distributorValue.includes(city)) {
                distributorCity = city;
                distributorRegion = REGION_BY_CITY_WITH_INDEXES[city].region;
                break;
            }
        }
    }

    // --- Step 2: Handle Empty/Null Address & Pre-cleaning ---
    if (!address?.trim()) {
        return {
            city: distributorCity ? capitalize(distributorCity) : 'Город не определен',
            region: distributorRegion || 'Регион не определен',
        };
    }

    let cleanedAddress = address;
    const GARBAGE_PREFIXES_MAP: Record<string, string> = {
        'нижний новгород': 'Нижегородская область',
        'москва': 'Москва',
        'санкт-петербург': 'Санкт-Петербург'
    };
    const lowerAddress = cleanedAddress.toLowerCase().trim();
    for (const prefix of Object.keys(GARBAGE_PREFIXES_MAP)) {
        if (lowerAddress.startsWith(prefix + ',') || lowerAddress.startsWith(prefix + ' ')) {
            const garbageRegion = GARBAGE_PREFIXES_MAP[prefix];
            const restOfString = lowerAddress.substring(prefix.length);

            const containsOtherRegion = Object.keys(REGION_KEYWORD_MAP).some(key => {
                const regionInRest = REGION_KEYWORD_MAP[key];
                return restOfString.includes(key) && regionInRest !== garbageRegion;
            });

            if (containsOtherRegion) {
                const match = cleanedAddress.match(new RegExp(`^${prefix}[, ]\\s*`, 'i'));
                if (match) {
                    cleanedAddress = cleanedAddress.substring(match[0].length).trim();
                    break;
                }
            }
        }
    }

    // --- Step 3: Normalize Address ---
    const lowerCleanedAddress = cleanedAddress.toLowerCase().replace(/ё/g, 'е');
    let normalized = lowerCleanedAddress.replace(/\b(г|город|city)\.?\s*/g, ' ').replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
    }
    
    // --- Step 4: Logic Cascade ---

    // A. Prioritize specific settlement types (с., дер., пгт.) from the address string.
    const settlementMatch = normalized.match(/\b(с|село|дер|деревня|пгт|пос|поселок|ст-ца|станица|х|хутор|рп)\.?\s+([а-яё-]+)\b/);
    if (settlementMatch && settlementMatch[2]) {
        const settlementName = capitalize(settlementMatch[2]);
        const region = distributorRegion || findRegionByKeyword(normalized);
        return {
            city: settlementName,
            region: standardizeRegion(region),
        };
    }
    
    // B. Check for a known city directly in the address string.
    const cityFromAddress = getCityFromAddress(normalized);
    if (cityFromAddress !== 'Город не определен') {
        const region = REGION_BY_CITY_WITH_INDEXES[cityFromAddress.toLowerCase()].region;
        return {
            city: cityFromAddress,
            region: standardizeRegion(region),
        };
    }

    // C. If the address is ambiguous (no specific settlement or known city), GUARANTEED fallback to distributor context.
    if (distributorCity) {
        return {
            city: capitalize(distributorCity),
            region: standardizeRegion(distributorRegion),
        };
    }

    // D. Last resort: if no distributor context, try to find a region by keyword in the address.
    const regionFromKeyword = findRegionByKeyword(normalized);
    return {
        city: 'Город не определен',
        region: standardizeRegion(regionFromKeyword),
    };
}