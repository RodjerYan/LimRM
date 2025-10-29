// services/addressParser.ts
import { getRegionByPostal, getRegionByCity, normalizeRegion } from '../utils/addressMappings';
// FIX: Removed incorrect import. The 'callGeminiForRegion' function is defined locally in this file.
import { ParsedAddress } from '../types';

/**
 * Parses a Russian address string with a strict priority order to determine the region.
 * Priority: 1. Explicit Region > 2. Postal Code > 3. City Name > 4. Gemini Fallback.
 * Once a region is found, subsequent checks are skipped.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
  let region = '';
  let city = '';
  let postal = '';
  let source: ParsedAddress['source'] = 'unknown';

  // === 1. Explicit Region (Highest Priority) ===
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
        break; // Stop searching if an explicit region is found
      }
    }
  }

  // === 2. Postal Index (Only if explicit region was NOT found) ===
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

  // === 3. City Name (Only if region is still not found) ===
  if (!region) {
    const cityMatch = address.match(/(?:,\s*|^)(?:г\.?\s*)?([А-Яа-яЁё\s-]+?)\s*(?:г\.?|город|рп|с|д)(?:,|$|\s)/i);
    if (cityMatch) {
      city = cityMatch[1].trim();
      const fromCity = getRegionByCity(city);
      if (fromCity) {
        region = normalizeRegion(fromCity);
        source = 'city_lookup';
      }
    }
  }

  // === 4. Gemini Fallback (Last resort) ===
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
    confidence: 0, // Confidence logic can be expanded based on source
    ambiguousCandidates: []
  };
}

// Simplified Gemini fallback for this parser
async function callGeminiForRegion(address: string): Promise<string> {
  const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/gemini-proxy';
  try {
    const prompt = `Из адреса "${address}" извлеки только субъект РФ (например, "Смоленская область"). Если не уверен, верни пустую строку.`;
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) return '';
    const text = await response.text();
    return text.trim();
  } catch {
    return '';
  }
}
