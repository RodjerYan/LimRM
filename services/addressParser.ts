// services/addressParser.ts
import { getRegionByPostal, getRegionByCity, normalizeRegion } from '../utils/addressMappings';
import { callGeminiForRegion } from './geminiService';
import { ParsedAddress } from '../types';

/**
 * Parses a Russian address with a strict priority order.
 * 1. Explicit "<Name> obl|oblast|krai|republic|r-n" (even without a dot or "obl" – it looks for the name + indicator word).
 * 2. By index (6 digits -> first 2).
 * 3. By city (with or without "g." prefix).
 * 4. Gemini fallback.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
  let region = '';
  let city = '';
  let postal = '';
  let source: ParsedAddress['source'] = 'unknown';

  // ---------- 1. Explicit (flexible) ----------
  const explicitPatterns = [
    /([А-Яа-яЁё\s-]+?)\s+(обл\.?|область|край|республика|р-н|ао|округ)\b/i,
    /\b(обл|область)\s+([А-Яа-яЁё\s-]+)\b/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = address.match(pattern);
    if (match) {
      const name = match[1] || match[2];
      if (name) {
        region = normalizeRegion(name + ' область');
        source = 'explicit';
        break;
      }
    }
  }


  // ---------- 2. Index (5-6 digits) ----------
  const postalMatch = address.match(/(\d{5,6})/);
  if (postalMatch) {
    postal = postalMatch[1];
    if (!region) {
      const fromPostal = getRegionByPostal(postal);
      if (fromPostal) {
          region = normalizeRegion(fromPostal);
          source = 'postal';
      }
    }
  }

  // ---------- 3. City (with/without prefix) ----------
  if (!region) {
    const cityPattern = /(?:,\s*|^)(?:г\.?\s*)?([А-Яа-яЁё\s-]+?)\s*(?:г\.?|город|рп|с|д)(?:,|$|\s)/i;
    const cityMatch = address.match(cityPattern);
    if (cityMatch) {
      city = cityMatch[1].trim();
      const fromCity = getRegionByCity(city);
      if (fromCity) {
        region = normalizeRegion(fromCity);
        source = 'city_lookup';
      }
    }
  }

  // ---------- 4. Gemini fallback ----------
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
    confidence: 0,
    ambiguousCandidates: []
  };
}
