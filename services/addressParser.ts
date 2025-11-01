// services/addressParser.ts
import { 
    standardizeRegion, 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP,
    REGION_BY_CITY_MAP,
    INDEX_MAP 
} from '../utils/addressMappings';
import { ParsedAddress } from '../types';
import { callGeminiForRegion } from './geminiService';

/**
 * Capitalizes the first letter of each word in a string.
 * @param str The input string.
 * @returns The capitalized string.
 */
const capitalize = (str: string | null): string => {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

/**
 * Parses a Russian address string to extract the region and city using a multi-layered approach.
 * It handles typos, abbreviations, and various address formats to provide the most accurate result.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }

    const lowerAddress = address.toLowerCase().replace(/ё/g, 'e');
    let normalized = lowerAddress.replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim();

    let region: string | null = null;
    let city: string | null = null;

    // --- Step 1: Normalization using aliases ---
    // This handles common typos and formatting variations.
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    // --- Step 2: Priority 1 - Explicit Region Keyword Mapping ---
    // Look for keywords like "калининградская область", "лен.обл", etc.
    // FIX: Sort keys by length descending to match longer phrases first (e.g., "ленинградская область" before "ло").
    // FIX: Use word boundaries in regex to prevent matching substrings inside other words (e.g., "ло" in "Орловская").
    const sortedRegionKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedRegionKeys) {
        const regex = new RegExp(`\\b${key.replace('.', '\\.')}\\b`, 'i');
        if (regex.test(normalized)) {
            region = REGION_KEYWORD_MAP[key];
            break;
        }
    }

    // --- Step 3: Find City and Determine Region from it ---
    // This block runs if no explicit region was found in step 2.
    if (!region) {
        // Step 3a: Use regex to find city names (e.g., "г. Город", "пос. Поселок")
        const patterns = [
            /г[\s\.,]?\s*([а-яё\- ]+?)(?=\s+ул|\s+улица|\s+ш|\s+шоссе|\s+пр|\s+проспект|$|,|\s+дом|\s+д)/, // г. Город, smarter termination
            /пос\.?\s*([а-яё\- ]+?)(?=\s|$|,)/,       // пос. Поселок
            /пгт\.?\s*([а-яё\- ]+?)(?=\s|$|,)/,      // пгт. Поселок
            /дер\.?\s*([а-яё\- ]+?)(?=\s|$|,)/,        // дер. Деревня
            /ст-ца\.?\s*([а-яё\- ]+?)(?=\s|$|,)/,    // ст-ца. Станица
        ];
        for (const pattern of patterns) {
            const match = normalized.match(pattern);
            if (match && match[1]) {
                const potentialCity = match[1].trim();
                // Check if this city is in our map
                if (REGION_BY_CITY_MAP[potentialCity]) {
                    city = potentialCity;
                    break;
                }
            }
        }
        
        // Step 3b: If no city found via regex, do a general search in the string
        if (!city) {
            const sortedCityKeys = Object.keys(REGION_BY_CITY_MAP).sort((a, b) => b.length - a.length);
            for (const cityKey of sortedCityKeys) {
                 const cityRegex = new RegExp(`\\b${cityKey.replace(/[-\s]/g, '[-\\s]?')}\\b`);
                 if(cityRegex.test(normalized)) {
                     city = cityKey;
                     break;
                 }
            }
        }

        // Step 3c: Determine region from the found city
        if (city) {
            region = REGION_BY_CITY_MAP[city] || null;
        }
    }
    
    // --- Step 4: Find city if we only have the region so far ---
    if (region && !city) {
        const sortedCityKeys = Object.keys(REGION_BY_CITY_MAP).sort((a, b) => b.length - a.length);
        for (const cityKey of sortedCityKeys) {
            if (normalized.includes(cityKey) && REGION_BY_CITY_MAP[cityKey] === region) {
                city = cityKey;
                break;
            }
        }
    }

    // --- Step 5: Fallbacks for unresolved cases ---
    // Check if there are any explicit location clues in the address string.
    const hasLocationClues = /область|\bобл\b|\bкрай\b|республика|\bресп\b|округ|\bао\b|\bг\b|город|поселок|\bпос\b|\bпгт\b|\bдер\b|деревня/i.test(normalized);

    // Fallback 5a: Postal Index.
    // ONLY use this if no region has been found AND there are no other location clues in the address.
    // This is to avoid misinterpreting an index when a city is mentioned but not in our maps.
    if (!region && !hasLocationClues) {
        const indexMatch = address.match(/\b(\d{5,6})\b/);
        if (indexMatch) {
            const postalIndex = indexMatch[1];
            if (INDEX_MAP[postalIndex]) region = INDEX_MAP[postalIndex];
            else {
                const prefix3 = postalIndex.substring(0, 3);
                if (INDEX_MAP[prefix3]) region = INDEX_MAP[prefix3];
            }
        }
    }
    
    // --- Step 6: Finalization & Gemini Last Resort ---
    if (region) {
        const finalCity = city ? capitalize(city) : 'Город не определён';
        return { region: standardizeRegion(region), city: finalCity };
    } else {
        // Final attempt with Gemini if all local methods fail
        const geminiRegion = await callGeminiForRegion(address);
        if (geminiRegion && geminiRegion.trim() !== '' && geminiRegion.trim().toLowerCase() !== 'республика беларусь') {
             const finalCity = city ? capitalize(city) : 'Город не определён';
             return { region: geminiRegion, city: finalCity };
        }
    }

    // Default if nothing worked
    return { region: 'Регион не определен', city: capitalize(city) || 'Город не определён' };
}