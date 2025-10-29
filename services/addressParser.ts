// services/addressParser.ts
import { getRegionByPostal, getRegionByCity, getRegionByExplicit, normalizeRegion } from '../utils/addressMappings';
import { callGeminiForRegion } from './geminiService';
import { ParsedAddress } from '../types';

/**
 * Parses a Russian address string to determine the region with a strict priority order.
 * This is the core function for address analysis.
 *
 * @param address The raw address string.
 * @returns A promise that resolves to a ParsedAddress object.
 *
 * Priority Logic:
 * 1.  **Explicit Keyword Match:** Looks for keywords like "смоленская", "брянская" first. This is the highest priority. If a match is found, parsing stops immediately.
 * 2.  **Postal Code Match:** If no explicit keyword is found, it attempts to determine the region from the 5-6 digit postal code.
 * 3.  **City Name Match:** If the above methods fail, it looks for a known city name in the address.
 * 4.  **AI Fallback (Gemini):** As a last resort for very complex or ambiguous cases. This is disabled by default in the worker for performance.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
  let region = '';
  let city = '';
  let postal = '';
  let source: ParsedAddress['source'] = 'unknown';

  // === 1. EXPLICIT KEYWORD SEARCH (HIGHEST PRIORITY) ===
  // This is the most reliable method. If we find an explicit mention, we trust it over any other data.
  const explicitRegion = getRegionByExplicit(address);
  if (explicitRegion) {
    region = explicitRegion;
    source = 'explicit';
  }

  // === 2. POSTAL CODE (ONLY IF EXPLICIT NOT FOUND) ===
  if (!region) {
    const postalMatch = address.match(/(\d{5,6})/);
    if (postalMatch) {
      postal = postalMatch[1];
      const fromPostal = getRegionByPostal(postal);
      if (fromPostal) {
        region = normalizeRegion(fromPostal);
        source = 'postal';
      }
    }
  }

  // === 3. CITY NAME (ONLY IF PREVIOUS METHODS FAILED) ===
  if (!region) {
    // Improved regex to find city names that might not have a "г." prefix
    const cityMatch = address.match(/(?:,\s*|^)(г\.?\s*)?([А-Яа-яЁё\s-]+?)(?:\s*(?:г\.?|рп|с|д))?(?=,|$)/i);
    if (cityMatch && cityMatch[2]) {
      city = cityMatch[2].trim();
      const fromCity = getRegionByCity(city);
      if (fromCity) {
        region = normalizeRegion(fromCity);
        source = 'city_lookup';
      }
    }
  }

  // === 4. GEMINI FALLBACK (LAST RESORT - OFTEN DISABLED IN WORKER) ===
  // This check is preserved here, but the call is commented out in the worker for performance.
  if (!region) {
      const geminiResult = await callGeminiForRegion(address);
      if (geminiResult) {
          region = normalizeRegion(geminiResult);
          source = 'fuzzy';
      }
  }

  const status = region ? 'определён' : 'не определён';
  const finalRegion = region || 'Регион не определён';

  return {
    region: finalRegion,
    city: city || null,
    postalCode: postal || null,
    status,
    source,
    country: 'Россия',
    street: null,
    house: null,
    lat: null,
    lon: null,
    confidence: source === 'explicit' ? 0.95 : source === 'postal' ? 0.9 : source === 'city_lookup' ? 0.8 : 0.5,
    ambiguousCandidates: []
  };
}
