// services/addressParser.ts
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { CITY_TO_REGION_MAP } from '../utils/regionCenters';
import { INDEX_MAP } from '../utils/addressMappings';
import { ParsedAddress } from '../types';
import { callGeminiForRegion } from './geminiService';

// Pre-compile sorted keys for performance
const sortedRegionKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
const sortedCityKeys = Object.keys(CITY_TO_REGION_MAP).sort((a, b) => b.length - a.length);

/**
 * A map of common city name misspellings or aliases to their canonical form.
 * This helps handle typos and variations before the main lookup.
 */
const CITY_ALIASES: Record<string, string> = {
  'калининрад': 'калининград',
  'калининграл': 'калининград',
  'калиннградская': 'калининград', // from "Калиннградская"
  'снкт-петербург': 'санкт-петербург',
};


/**
 * Attempts to find a city within the address parts, prioritizing known capitals or major cities.
 * @param parts - The normalized parts of the address string.
 * @param region - The already determined region, if any.
 * @returns The found city name or a default string.
 */
function findCity(parts: string[], region: string | null): string {
    const fullAddress = parts.join(' ');

    // First, look for an exact match from our city map
    for (const cityKey of sortedCityKeys) {
        const cityRegex = new RegExp(`(?:\\b|г\\.?\\s*)${cityKey.replace(/[-\s]/g, '[-\\s]?')}\\b`);
        if (cityRegex.test(fullAddress)) {
            return cityKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
    }

    // Fallback: look for generic city prefixes like "г." or "город"
    const cityMatch = fullAddress.match(/\b(?:г|город|пгт|поселок|село|с|деревня|д)\.?\s+([а-яё][а-яё-]*)/i);
    if (cityMatch?.[1]) {
        return cityMatch[1].charAt(0).toUpperCase() + cityMatch[1].slice(1);
    }
    
    // If we have a region, we can try to find its capital as a last resort
    if (region) {
        const capital = Object.keys(CITY_TO_REGION_MAP).find(city => CITY_TO_REGION_MAP[city] === region);
        if (capital) {
            return capital.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
    }

    return 'Город не определён';
}

/**
 * Parses a Russian address string to extract the region and city based on a strict priority list.
 * This is a comprehensive parser covering all of Russia, CIS, and unrecognized states.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }

    const lowerAddress = address.toLowerCase().replace(/ё/g, 'e');
    const fullAddressForSearch = lowerAddress.replace(/[,;|]/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = lowerAddress.split(/[,;|]/g).map(p => p.trim()).filter(Boolean);
    
    let region: string | null = null;

    // 1. Priority 1: Region Keyword Mapping
    for (const key of sortedRegionKeys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const keyRegex = new RegExp(escapedKey, 'i');
        if (keyRegex.test(fullAddressForSearch)) {
            region = REGION_KEYWORD_MAP[key];
            break;
        }
    }
    if (region) return { region, city: findCity(parts, region) };

    // 2. Priority 2: Enhanced City-to-Region Mapping
    let foundCityKey: string | null = null;
    
    // Step 2a: Check aliases first
    for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
        if (fullAddressForSearch.includes(alias)) {
            foundCityKey = canonical;
            break;
        }
    }

    // Step 2b: If no alias, iterate through the main city list with a robust regex
    if (!foundCityKey) {
        for (const cityKey of sortedCityKeys) {
            const cityRegex = new RegExp(`(?:\\b|г[\\s.,]?) *${cityKey.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'i');
            if (cityRegex.test(fullAddressForSearch)) {
                foundCityKey = cityKey;
                break;
            }
        }
    }

    // Step 2c: Specific fallback for "ул. Калининград" format
    if (!foundCityKey && /^ул\.?\s/.test(fullAddressForSearch) && fullAddressForSearch.includes('калининград')) {
        foundCityKey = 'калининград';
    }

    // Step 2d: If a city was found, determine the region and return
    if (foundCityKey) {
        region = CITY_TO_REGION_MAP[foundCityKey] || null;
        // Fallback for any mention of "калининград" if region is not found
        if (!region && foundCityKey.includes('калининград')) {
            region = 'Калининградская область';
        }
        
        if (region) {
            const city = foundCityKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            // Debug logs
            console.log('Input:', address);
            console.log('Normalized:', fullAddressForSearch);
            console.log('Found cityKey:', foundCityKey);
            console.log('Region:', region);
            return { region, city };
        }
    }

    // 3. Priority 3: Index Mapping (Fallback)
    const indexMatch = address.match(/\b(\d{5,6})\b/);
    if (indexMatch) {
        const postalIndex = indexMatch[1];
        if (INDEX_MAP[postalIndex]) region = INDEX_MAP[postalIndex];
        else {
            const prefix3 = postalIndex.substring(0, 3);
            const prefix2 = postalIndex.substring(0, 2);
            if (INDEX_MAP[prefix3]) region = INDEX_MAP[prefix3];
            else if (INDEX_MAP[prefix2]) region = INDEX_MAP[prefix2];
        }
        if (region) return { region, city: findCity(parts, region) };
    }
    
    // 4. Priority 4: Hardcoded Fallback for key regions (Safety Net)
    const KEY_CITIES_FALLBACK: Record<string, string> = {
        'ставрополь': 'Ставропольский край', 'михайловск': 'Ставропольский край', 'пятигорск': 'Ставропольский край',
        'нальчик': 'Кабардино-Балкарская Республика', 'прохладный': 'Кабардино-Балкарская Республика',
        'черкесск': 'Карачаево-Черкесская Республика',
        'владикавказ': 'Республика Северная Осетия — Алания', 'моздок': 'Республика Северная Осетия — Алания',
        'назрань': 'Республика Ингушетия', 'магас': 'Республика Ингушетия',
        'грозный': 'Чеченская Республика', 'гудермес': 'Чеченская Республика',
        'махачкала': 'Республика Дагестан', 'дербент': 'Республика Дагестан',
        'донецк': 'Донецкая Народная Республика', 'макеевка': 'Донецкая Народная Республика', 'мариуполь': 'Донецкая Народная Республика',
    };
    for (const city in KEY_CITIES_FALLBACK) {
        if (fullAddressForSearch.includes(city)) {
            const regionName = KEY_CITIES_FALLBACK[city];
            return { region: regionName, city: findCity(parts, regionName) };
        }
    }

    // 5. Priority 5: Gemini AI Fallback
    const geminiRegion = await callGeminiForRegion(address);
    if (geminiRegion && geminiRegion.trim() !== '') {
        const city = findCity(parts, geminiRegion);
        return { region: geminiRegion, city };
    }

    // 6. Final Default
    const foundCity = findCity(parts, null);
    return { region: 'Регион не определен', city: foundCity };
}