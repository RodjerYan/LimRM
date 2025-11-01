// services/addressParser.ts
import { CITY_NORMALIZATION, REGION_BY_CITY } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

/**
 * Parses a Russian address string to extract the region and city using a refactored, multi-stage process.
 * This implementation is based on a specific user request to handle typos, aliases, and explicit region keywords.
 * @param address The raw address string.
 * @returns A Promise resolving to a ParsedAddress object with the determined region and city.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
  if (!address?.trim()) {
    return { region: 'Регион не определен', city: 'Город не определён' };
  }

  // Initial normalization
  const normalized = address
    .toLowerCase()
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let city: string | null = null;
  let region: string | null = null;

  // Level 1: Apply normalizations for common typos and abbreviations from the map.
  // This logic handles aliases that might define a city OR a region directly.
  for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION)) {
    if (normalized.includes(alias)) {
      if (alias.includes('обл') || alias.includes('ло')) {
        // Alias directly implies a region (e.g., "кал-я обл")
        region = canonical.includes('калининград') ? 'Калининградская область' :
                 canonical.includes('ленинград') ? 'Ленинградская область' :
                 canonical.includes('санкт') ? 'Санкт-Петербург' : null;
      } else {
        // Alias implies a city (e.g., "калининрад" -> "калининград")
        city = canonical;
      }
    }
  }

  // Level 2: If a city wasn't found via alias, use regex to find common patterns.
  if (!city) {
    const patterns = [
      /г[\s.,]?\s*([а-яё-]+)/i,      // "г. Город"
      /пос\.?\s*([а-яё-]+(?:-[а-яё]+)?)/i, // "пос. Поселок"
      /^ул\.?\s*([а-яё-]+)/i,      // "ул. Калининград" (at start of string)
    ];
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match?.[1]) {
        city = match[1];
        break; // Stop after first match
      }
    }
  }

  // Level 3: A specific fallback for "калининград" if no city has been identified yet.
  if (!city && normalized.includes('калининград')) {
    city = 'калининград';
  }

  // Level 4: Determine region from the found city, if the region wasn't set by an alias.
  if (!region && city && REGION_BY_CITY[city]) {
    region = REGION_BY_CITY[city];
  }

  // Level 5: Final fallback for key Kaliningrad cities to ensure they are correctly mapped.
  if (!region && city && ['калининград', 'гвардейск', 'светлый', 'зеленоградск'].includes(city)) {
    region = 'Калининградская область';
  }

  // Format city name for a clean output (e.g., "калининград" -> "Калининград").
  const finalCityName = city
    ? city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Город не определён';

  // Adhere to the non-nullable ParsedAddress type for the final return.
  return {
    region: region || 'Регион не определен',
    city: finalCityName,
  };
}
