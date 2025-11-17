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
 * It prioritizes specific settlement names (like "с. Ленинское") from the address,
 * while using the "Дистрибьютер" column as a high-priority context for determining the region.
 * If the address lacks a city, the city from the distributor is used.
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
        // Find the most likely city within the distributor string.
        for (const city of CITIES_SORTED_BY_LENGTH) {
            if (distributorValue.includes(city)) {
                distributorCity = city;
                distributorRegion = REGION_BY_CITY_WITH_INDEXES[city].region;
                break; // Found longest match, which is our best bet for context.
            }
        }
    }

    // --- Step 2: Handle Empty Address String ---
    if (!address?.trim()) {
        return {
            city: distributorCity ? capitalize(distributorCity) : 'Город не определен',
            region: distributorRegion || 'Регион не определен',
        };
    }

    // --- Step 3: Normalize and Clean Address ---
    const lowerAddress = address.toLowerCase().replace(/ё/g, 'е');
    let normalized = lowerAddress.replace(/\b(г|город|city)\.?\s*/g, ' ').replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();
    
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    // --- Step 4: Decision Logic to Determine Final City and Region ---
    let finalCity: string | null = null;
    let finalRegion: string | null = distributorRegion; // Start with distributor's region as default context.

    // A. Prioritize specific settlement types (с., дер., пгт.) from the address string.
    const settlementMatch = normalized.match(/\b(с|село|дер|деревня|пгт|пос|поселок|ст-ца|станица|х|хутор|рп)\.?\s+([а-яё-]+)\b/);
    if (settlementMatch && settlementMatch[2]) {
        finalCity = capitalize(settlementMatch[2]);
        // The region is already set from the distributor context, which is what we want.
    } else {
        // B. If no specific settlement, try to find a general city name in the address.
        const cityFromAddress = getCityFromAddress(normalized);
        if (cityFromAddress !== 'Город не определен') {
            finalCity = cityFromAddress;
        } else if (distributorCity) {
            // C. If address is ambiguous, fallback to the city from the distributor.
            finalCity = capitalize(distributorCity);
        }
    }

    // --- Step 5: Final Region Resolution ---
    if (!finalRegion) {
        // If we determined a city but still lack a region (e.g., distributor was empty),
        // look up the region from the city map.
        if (finalCity) {
            const cityInfo = REGION_BY_CITY_WITH_INDEXES[finalCity.toLowerCase()];
            if (cityInfo) {
                finalRegion = cityInfo.region;
            }
        }
        // As a last resort, scan the address for region keywords if we still don't have a region.
        if (!finalRegion) {
             finalRegion = findRegionByKeyword(normalized);
        }
    }

    return {
        city: finalCity || 'Город не определен',
        region: standardizeRegion(finalRegion),
    };
}
