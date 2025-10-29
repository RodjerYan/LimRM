import { getRegionByPostal, getRegionByCityInText, getRegionByExplicit, normalizeRegion } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

/**
 * Parses a Russian address string to determine the region with a strict priority order.
 * This is a SYNCHRONOUS function optimized for high-performance batch processing.
 *
 * @param address The raw address string.
 * @returns A ParsedAddress object.
 *
 * Priority Logic:
 * 1.  **Explicit Keyword Match:** Highest priority.
 * 2.  **Postal Code Match:** Secondary priority.
 * 3.  **City Name Match:** Tertiary priority.
 */
export function parseRussianAddress(address: string): ParsedAddress {
  let region = '';
  let city = '';
  let postal = '';
  let source: ParsedAddress['source'] = 'unknown';

  // === 1. EXPLICIT KEYWORD SEARCH (HIGHEST PRIORITY) ===
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
    const cityResult = getRegionByCityInText(address);
    if (cityResult) {
        region = cityResult.region;
        city = cityResult.city;
        source = 'city_lookup';
    }
  }
  
  // === 4. GEMINI FALLBACK IS INTENTIONALLY DISABLED FOR PERFORMANCE ===
  // The async version can be used for single-address parsing if needed elsewhere.

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