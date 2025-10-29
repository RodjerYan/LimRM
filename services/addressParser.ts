// services/addressParser.ts
import { getRegionByPostal, getRegionByCity, getRegionByExplicit, normalizeRegion } from '../utils/addressMappings';
import { callGeminiForRegion } from './geminiService';
import { ParsedAddress } from '../types';

export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
  let region = '';
  let city = '';
  let postal = '';
  let source: ParsedAddress['source'] = 'unknown';

  // === 1. EXPLICIT: Поиск ключевых слов (ВСЕГДА ПЕРВЫЙ, БЛОКИРУЕТ ОСТАЛЬНОЕ) ===
  const explicitRegion = getRegionByExplicit(address);
  if (explicitRegion) {
    region = explicitRegion;
    source = 'explicit';
  }

  // === 2. ИНДЕКС: ТОЛЬКО ЕСЛИ EXPLICIT НЕ НАЙДЕН ===
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

  // === 3. ГОРОД: ТОЛЬКО ЕСЛИ EXPLICIT И ИНДЕКС НЕ НАЙДЕНЫ ===
  if (!region) {
    const cityMatch = address.match(/,\s*([А-Яа-яЁё\s-]+)\s*(?:г\.?|г|рп|с|д)?\s*,/i);
    if (cityMatch) {
      city = cityMatch[1].trim();
      const fromCity = getRegionByCity(city);
      if (fromCity) {
        region = normalizeRegion(fromCity);
        source = 'city_lookup';
      }
    }
  }

  // === 4. GEMINI: ПОСЛЕДНИЙ ШАНС ===
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
