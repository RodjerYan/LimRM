// services/addressParser.ts
import { getRegionByPostal, getRegionByCity, getRegionByExplicit, normalizeRegion } from '../utils/addressMappings';
import { callGeminiForRegion } from './geminiService';
import { ParsedAddress } from '../types';

/**
 * Parses a Russian address with a strict priority order.
 * 1. Explicit keyword search (highest priority, blocks other methods).
 * 2. By postal index (only if no explicit region found).
 * 3. By city (only if explicit and postal fail).
 * 4. Gemini fallback (last resort).
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
  let region = '';
  let city = '';
  let postal = '';
  let source: ParsedAddress['source'] = 'unknown';

  // === 1. EXPLICIT: Keyword search (ALWAYS FIRST, BLOCKS OTHERS) ===
  const explicitRegion = getRegionByExplicit(address);
  if (explicitRegion) {
    region = explicitRegion;
    source = 'explicit';
  }

  // === 2. INDEX: ONLY IF EXPLICIT NOT FOUND ===
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

  // === 3. CITY: ONLY IF EXPLICIT AND INDEX NOT FOUND ===
  if (!region) {
    const cityMatch = address.match(/(?:г\.?\s*|,\s*)([А-Яа-яЁё\s-]+?)\s*(?:г\.?|город|рп|с|д)(?:,|$|\s)/i);
    if (cityMatch) {
      city = cityMatch[1].trim();
      const fromCity = getRegionByCity(city);
      if (fromCity) {
        region = normalizeRegion(fromCity);
        source = 'city_lookup';
      }
    }
  }

  // === 4. GEMINI: LAST RESORT ===
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
    confidence: source === 'explicit' ? 1.0 : (source === 'postal' ? 0.9 : 0.5),
    ambiguousCandidates: []
  };
}
