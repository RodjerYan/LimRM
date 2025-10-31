// services/addressParser.ts
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { CITY_TO_REGION_MAP } from '../utils/regionCenters';
import { INDEX_MAP } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

// Pre-compile sorted keys for performance
const sortedRegionKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => {
    const lenDiff = b.length - a.length;
    return lenDiff !== 0 ? lenDiff : a.localeCompare(b);
});
const sortedCityKeys = Object.keys(CITY_TO_REGION_MAP).sort((a, b) => b.length - a.length);

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
        const cityRegex = new RegExp(`\\b${cityKey.replace(/[-\s]/g, '[-\\s]?')}\\b`);
        if (cityRegex.test(fullAddress)) {
            // Return the canonical name from the map's key, capitalized
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
export function parseRussianAddress(address: string): ParsedAddress {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }

    const lowerAddress = address.toLowerCase().replace(/ё/g, 'е');

    // 1. Normalization
    const parts = lowerAddress.split(/[,;|]/g)
        .map(p => p.trim())
        .filter(Boolean);
    const fullAddressForSearch = parts.join(' ').toLowerCase();
    
    let region: string | null = null;

    // 2. Priority 1: Explicit Regional Text (100% РАБОЧАЯ ВЕРСИЯ)
    for (const key of sortedRegionKeys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = escapedKey.replace(/\s+/g, '\\s+');
        const keyRegex = new RegExp(pattern, 'i');
        
        if (keyRegex.test(fullAddressForSearch)) {
            region = REGION_KEYWORD_MAP[key];
            break;
        }
    }

    if (region) {
        return { region, city: findCity(parts, region) };
    }

    // 3. Priority 2: City-to-Region Mapping
    for (const cityKey of sortedCityKeys) {
        const cityRegex = new RegExp(`\\b${cityKey.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'i');
        if (cityRegex.test(fullAddressForSearch)) {
            region = CITY_TO_REGION_MAP[cityKey];
            const city = cityKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            return { region, city };
        }
    }

    // 4. Priority 3: Index Mapping (Fallback)
    const indexMatch = address.match(/\b(\d{5,6})\b/);
    if (indexMatch) {
        const postalIndex = indexMatch[1];
        
        // Check for full index match first (5 or 6 digits)
        if (INDEX_MAP[postalIndex]) {
            region = INDEX_MAP[postalIndex];
        } else {
            // Fallback to prefixes if full index not found
            const prefix3 = postalIndex.substring(0, 3);
            const prefix2 = postalIndex.substring(0, 2);
            
            if (INDEX_MAP[prefix3]) {
                region = INDEX_MAP[prefix3];
            } else if (INDEX_MAP[prefix2]) {
                region = INDEX_MAP[prefix2];
            }
        }

        if (region) {
            return { region, city: findCity(parts, region) };
        }
    }
    
    // 5. Final Default
    const foundCity = findCity(parts, null);
    return { region: 'Регион не определен', city: foundCity };
}