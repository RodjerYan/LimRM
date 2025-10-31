// services/addressParser.ts
import { normalizeRegion } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

/**
 * CITY_TO_REGION_MAPPING (Minimum Required Subset)
 * As specified by the user prompt. This mapping is used as Priority 2 for region detection.
 */
const CITY_TO_REGION_MAPPING: Record<string, string> = {
    "брянск": "Брянская область",
    "смоленск": "Смоленская область",
    "орёл": "Орловская область",
    "орел": "Орловская область",
    "ливны": "Орловская область",
    "курск": "Курская область",
    "белгород": "Белгородская область",
    "тула": "Тульская область",
    "калуга": "Калужская область",
    "воронеж": "Воронежская область",
    "краснодар": "Краснодарский край",
    "пермь": "Пермский край",
    "ростов-на-дону": "Ростовская область",
    "иркутск": "Иркутская область",
    "новосибирск": "Новосибирская область",
    "казань": "Республика Татарстан",
    "уфа": "Республика Башкортостан",
    "самара": "Самарская область",
    "екатеринбург": "Свердловская область",
    "нижний новгород": "Нижегородская область",
    "вологда": "Вологодская область",
    "москва": "Город Москва",
    "санкт-петербург": "Город Санкт-Петербург",
};

/**
 * A small subset of index prefixes for fallback region detection (Priority 3).
 */
const indexPrefixToRegion: Record<string, string> = {
    "30": "Орловская область",
    "21": "Смоленская область",
    "24": "Брянская область",
    "10": "Московская область", "11": "Московская область", "12": "Московская область",
    "13": "Московская область", "14": "Московская область",
};

const regionKeywords = ['область', 'обл', 'край', 'респ', 'республика', 'ао', 'автономная область', 'округ'];
const sortedCityKeys = Object.keys(CITY_TO_REGION_MAPPING).sort((a, b) => b.length - a.length);

/**
 * Helper function to determine the city from address parts.
 */
function findCity(parts: string[], region: string | null): string {
    const fullAddress = parts.join(' ');
    // Find by known city name first
    for (const cityKey of sortedCityKeys) {
        const cleanPart = fullAddress.replace(/\b(г|город|пгт|село|ул|улица)\.?\b/g, '').trim();
        if (new RegExp(`\\b${cityKey}\\b`).test(cleanPart)) {
            return cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
        }
    }
    // Fallback: try to extract from patterns like "г. Брянск"
    const cityMatch = fullAddress.match(/\b(?:г|город|пгт|поселок|село|с|деревня|д)\s+([а-яё][а-яё-]*)/i);
    if (cityMatch?.[1]) {
        return cityMatch[1].charAt(0).toUpperCase() + cityMatch[1].slice(1);
    }
    // If we know the region, we can guess the city center
    if (region) {
        const city = Object.keys(CITY_TO_REGION_MAPPING).find(key => CITY_TO_REGION_MAPPING[key] === region);
        if (city) {
             return city.charAt(0).toUpperCase() + city.slice(1);
        }
    }
    return 'Город не определён';
}

/**
 * Parses a Russian address string to extract the region and city based on a strict priority list.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export function parseRussianAddress(address: string): ParsedAddress {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }

    const original = address;
    const lower = address.toLowerCase().replace(/ё/g, 'е');

    // 1. Normalization: Split by comma, trim, ignore empty, search in first 5 parts.
    const parts = lower.split(',')
        .map(p => p.trim().replace(/\.$/, ''))
        .filter(Boolean)
        .slice(0, 5);
    
    let region: string | null = null;
    let city: string | null = null;

    // 2. Priority 1: Explicit Regional Keys
    for (const part of parts) {
        if (regionKeywords.some(key => part.includes(key))) {
            region = normalizeRegion(part);
            break; 
        }
    }
    
    if (region) {
        city = findCity(parts, region);
        return { region, city };
    }

    // 3. Priority 2: City-to-Region Mapping
    const fullCleanAddress = parts.join(' ');
    for (const cityKey of sortedCityKeys) {
        const cityRegex = new RegExp(`\\b${cityKey.replace(/\s/g, '\\s+')}\\b`, 'i');
        if (cityRegex.test(fullCleanAddress)) {
            // Special case for Moscow Region vs Moscow City
            if (cityKey === 'москва' && regionKeywords.some(key => fullCleanAddress.includes(key))) {
                continue; 
            }
            region = CITY_TO_REGION_MAPPING[cityKey];
            city = cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
            return { region, city };
        }
    }

    // 4. Priority 3: Index Mapping (Fallback)
    const indexMatch = original.match(/(?:^|\s|,)(\d{6})(?:$|\s|,)/);
    if (indexMatch) {
        const postalIndex = indexMatch[1];
        const regionFromIndex = indexPrefixToRegion[postalIndex.substring(0, 2)];
        if (regionFromIndex) {
            region = regionFromIndex;
            city = findCity(parts, region);
            return { region, city };
        }
    }
    
    // 5. Final Default
    city = findCity(parts, null);
    return { region: 'Регион не определен', city };
}
