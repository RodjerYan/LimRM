// services/addressParser.ts
import { getRegionByPostal, getRegionByCity, normalizeRegion } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

const GEMINI_FALLBACK_PROMPT = `
Ты — эксперт по адресам РФ.  
Из строки адреса извлеки **только субъект РФ** (область, край, республика).  
Примеры:
- "обл Орловская" -> "Орловская область"
- "Брянская обл" -> "Брянская область"
- "32038, обл Орловская" -> "Орловская область"
Верни **одну строку**, без кавычек.  
Если не уверен — верни "Регион не определён".

Адрес: """{ADDRESS}"""
`;

const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/gemini-proxy';

async function callGeminiForRegion(address: string): Promise<string> {
  try {
    const prompt = GEMINI_FALLBACK_PROMPT.replace('{ADDRESS}', address);
    const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
    });

    if (!response.ok || !response.body) {
        console.error('Gemini fallback failed: Invalid response from proxy');
        return '';
    }
    const text = await response.text();
    const cleanText = text.trim();
    
    return cleanText && cleanText !== "Регион не определён" ? normalizeRegion(cleanText) : '';
  } catch (e) {
    console.error('Gemini error', e);
    return '';
  }
}

export async function parseRussianAddress(address: string): Promise<Omit<ParsedAddress, 'formattedAddress'>> {
  const result: Omit<ParsedAddress, 'formattedAddress'> = {
      country: "Россия", region: null, city: null, street: null, house: null,
      postalCode: null, lat: null, lon: null, confidence: 0,
      source: 'unknown', ambiguousCandidates: []
  };

  if (!address || typeof address !== 'string' || address.trim().length < 3) {
      return { ...result, region: "Регион не определён" };
  }

  let region = '';
  let city = '';
  let postal = '';
  let source: ParsedAddress['source'] = 'unknown';
  let confidence = 0;

  // ---------- 1. Explicit (гибкий: обл, область, обл., обл ) ----------
  const explicitPatterns = [
    /([А-Яа-яЁё\s-]+?)\s+(обл\.?|область|край|республика|р-н|ао|округ)\b/i, // "Брянская обл"
    /\b(обл|область)\s+([А-Яа-яЁё\s-]+)\b/i,  // "обл Орловская"
  ];

  for (const pattern of explicitPatterns) {
    const match = address.match(pattern);
    if (match) {
      // Find the group that captured the name (could be group 1 or 2)
      const name = match[1] || match[2];
      const type = match[2] || match[1];
      if (name && type) {
         // Construct a full region name to be normalized
         const fullRegionString = `${name.trim()} ${type.includes('обл') ? 'область' : type}`;
         region = normalizeRegion(fullRegionString);
         source = 'explicit_region';
         confidence = 0.99;
         break;
      }
    }
  }

  // ---------- 2. Индекс (5-6 цифр) ----------
  const postalMatch = address.match(/(\d{5,6})/);
  if (postalMatch) {
    postal = postalMatch[1];
    result.postalCode = postal;
    if (!region) {
      const fromPostal = getRegionByPostal(postal);
      if (fromPostal) {
          region = normalizeRegion(fromPostal);
          source = 'postal';
          confidence = 0.9;
      }
    }
  }

  // ---------- 3. Город (с/без "г", "г.") ----------
  if (!region) {
    // A more robust regex to find city names that are not part of a street name
    const cityPattern = /(?:,\s*|^)(?:г\.?\s*)?([А-Яа-яЁё\s-]+?)\s*(?:г\.?|город|рп|с|д)(?:,|$|\s)/i;
    const cityMatch = address.match(cityPattern);
    if (cityMatch) {
      city = cityMatch[1].trim();
      result.city = city;
      const fromCity = getRegionByCity(city);
      if (fromCity) {
          region = normalizeRegion(fromCity);
          source = 'city_lookup';
          confidence = 0.8;
      }
    }
  }

  // ---------- 4. Gemini fallback ----------
  if (!region) {
    region = await callGeminiForRegion(address);
     if (region) {
        source = 'fuzzy';
        confidence = 0.7;
     }
  }
  
  result.region = region || 'Регион не определён';
  result.source = source;
  result.confidence = confidence;

  return result;
}
