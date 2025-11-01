import { 
    standardizeRegion, 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP,
    REGION_BY_CITY_MAP,
    INDEX_MAP 
} from '../utils/addressMappings';
import { ParsedAddress } from '../types';

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
 * Finds a region by matching explicit keywords (e.g., "орловская обл", "брянская") in the address.
 * Uses word boundaries to prevent matching substrings inside other words.
 * @param normalizedAddress The pre-processed, lowercased address string.
 * @returns The standardized region name or null if no match is found.
 */
function findRegionByKeyword(normalizedAddress: string): string | null {
    const sortedKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        const regex = new RegExp(`\\b${key.replace('.', '\\.')}\\b`, 'i');
        if (regex.test(normalizedAddress)) {
            return REGION_KEYWORD_MAP[key];
        }
    }
    return null;
}

/**
 * Finds a region by identifying a city name in the address and looking up its corresponding region.
 * @param normalizedAddress The pre-processed, lowercased address string.
 * @returns The standardized region name or null if no match is found.
 */
function findRegionByCity(normalizedAddress: string): { region: string | null, city: string | null } {
    const sortedKeys = Object.keys(REGION_BY_CITY_MAP).sort((a, b) => b.length - a.length);
     for (const key of sortedKeys) {
        const cityRegex = new RegExp(`\\b${key.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'i');
        if (cityRegex.test(normalizedAddress)) {
            return { region: REGION_BY_CITY_MAP[key], city: key };
        }
    }
    return { region: null, city: null };
}

/**
 * Finds a region using the postal index as a last resort, but only if no other geographic clues are present.
 * @param address The original address string.
 * @param normalizedAddress The pre-processed, lowercased address string.
 * @returns The standardized region name or null if no match is found.
 */
function findRegionByIndex(address: string, normalizedAddress: string): string | null {
    const hasLocationClues = /область|\bобл\b|\bкрай\b|республика|\bресп\b|округ|\bао\b|\bг\b|город|поселок|\bпос\b|\bпгт\b|\bдер\b|деревня/i.test(normalizedAddress);
    if (hasLocationClues) {
        return null; // Do not use index if other clues are present
    }

    const indexMatch = address.match(/\b(\d{5,6})\b/);
    if (indexMatch) {
        const postalIndex = indexMatch[1];
        if (INDEX_MAP[postalIndex]) return INDEX_MAP[postalIndex];
        const prefix3 = postalIndex.substring(0, 3);
        if (INDEX_MAP[prefix3]) return INDEX_MAP[prefix3];
    }
    return null;
}

/**
 * Parses a Russian address string to extract the region and city using a multi-layered, priority-based approach.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }

    const lowerAddress = address.toLowerCase().replace(/ё/g, 'e');
    let normalized = lowerAddress.replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim();

    // --- Step 1: Normalization using aliases for common typos ---
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    let region: string | null = null;
    let city: string | null = null;

    // --- PRIORITY 1: Find region by explicit keyword (e.g., "Орловская обл") ---
    region = findRegionByKeyword(normalized);

    // --- PRIORITY 2: If no region found, find it by city name (e.g., "Орёл") ---
    if (!region) {
        const result = findRegionByCity(normalized);
        if (result.region) {
            region = result.region;
            city = result.city;
        }
    }
    
    // --- PRIORITY 3: As a last resort, use postal index ONLY if no other clues exist ---
    if (!region) {
        region = findRegionByIndex(address, normalized);
    }
    
    // --- Finalization ---
    // If we found a region but haven't identified a city yet, try to find the city again.
    if (region && !city) {
        const result = findRegionByCity(normalized);
        if (result.city && REGION_BY_CITY_MAP[result.city] === region) {
            city = result.city;
        }
    }

    return {
        region: standardizeRegion(region),
        city: capitalize(city) || 'Город не определён'
    };
}