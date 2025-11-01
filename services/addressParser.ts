// services/addressParser.ts
import { 
    CITY_NORMALIZATION_MAP,
    REGION_BY_CITY_MAP,
    REGION_KEYWORD_MAP,
    INDEX_MAP,
} from '../utils/addressMappings';
import { ParsedAddress } from '../types';
import { callGeminiForRegion } from './geminiService';

// Pre-compile sorted keys for performance
const sortedRegionKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);

/**
 * Finds a city name within a normalized address string using a multi-level fallback approach.
 * @param normalizedAddress - The pre-processed, lowercased address string.
 * @returns The canonical city name (lowercase) or null if not found.
 */
function findCity(normalizedAddress: string): string | null {
  // Level 1: Check for known city names using a robust regex to avoid matching parts of other words.
  // We sort keys to match longer names first (e.g., "нижний новгород" before "новгород").
  const sortedCityKeys = Object.keys(REGION_BY_CITY_MAP).sort((a, b) => b.length - a.length);
  for (const city of sortedCityKeys) {
    const cityRegex = new RegExp(`\\b${city.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'i');
    if (cityRegex.test(normalizedAddress)) {
      return city;
    }
  }

  // Level 2: Use RegExp to find patterns like "г. Город", "пос. Город", "ул. Город".
  const patterns = [
    /г[\s.,]?\s*([а-яё-]+(?:-[а-яё-]+)?)\b/i,
    /\b(?:пос|пгт|село|с|деревня|д)\.?\s*([а-яё-]+(?:-[а-яё-]+)?)\b/i,
    /^ул\.?\s*([а-яё-]+(?:-[а-яё-]+)?)/i, // For cases like "ул. Калининград"
  ];
  for (const pattern of patterns) {
    const match = normalizedAddress.match(pattern);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  // Level 3: Final fallback for "калининград" if all else fails.
  if (normalizedAddress.includes('калининград')) {
    return 'калининград';
  }

  return null;
}

/**
 * Detects the region from an address string based on explicit keywords or the found city.
 * @param normalizedAddress - The pre-processed, lowercased address string.
 * @param city - The canonical city name found by `findCity`.
 * @returns The standardized region name or null.
 */
function detectRegion(normalizedAddress: string, city: string | null): string | null {
  // Priority 1: Check for explicit region keywords first (e.g., "ленинградская область", "кбр").
  for (const key of sortedRegionKeys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const keyRegex = new RegExp(escapedKey, 'i');
    if (keyRegex.test(normalizedAddress)) {
      return REGION_KEYWORD_MAP[key];
    }
  }

  // Priority 2: Determine region from the city using the centralized map.
  if (city && REGION_BY_CITY_MAP[city]) {
    return REGION_BY_CITY_MAP[city];
  }

  // Priority 3: Fallback for key cities, ensuring they map to the correct region.
  if (city && ['калининград', 'гвардейск', 'светлый', 'зеленоградск'].includes(city)) {
    return 'Калининградская область';
  }

  return null;
}


/**
 * Parses a Russian address string to extract the region and city using a refactored, multi-stage process.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }

    let lowerAddress = address.toLowerCase().replace(/ё/g, 'e');
    
    // Step 1: Apply normalizations for common typos and abbreviations.
    for (const [key, value] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (lowerAddress.includes(key)) {
            lowerAddress = lowerAddress.replace(new RegExp(key, 'g'), value);
        }
    }
    
    const normalizedAddress = lowerAddress.replace(/[,;|]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Step 2: Find city and detect region using the new modular functions.
    const foundCityKey = findCity(normalizedAddress);
    let region = detectRegion(normalizedAddress, foundCityKey);

    const formatCityName = (cityKey: string | null): string => {
        if (!cityKey) return 'Город не определён';
        return cityKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };
    
    const finalCityName = formatCityName(foundCityKey);

    // Step 3: If region is found, return the result.
    if (region) {
        return { region, city: finalCityName };
    }

    // --- Fallbacks (if primary logic fails) ---

    // Step 4: Index Mapping Fallback.
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
        if (region) return { region, city: finalCityName };
    }

    // Step 5: Gemini AI Fallback.
    const geminiRegion = await callGeminiForRegion(address);
    if (geminiRegion && geminiRegion.trim() !== '') {
        return { region: geminiRegion, city: finalCityName };
    }

    // Step 6: Final Default.
    return { region: 'Регион не определен', city: finalCityName };
}
