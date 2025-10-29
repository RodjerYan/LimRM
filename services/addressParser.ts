import { regionCenters } from '../utils/regionCenters';
import { ParsedAddress } from '../types';

// Pre-sort city keys by length descending to match longer names first (e.g., "нижний новгород" before "новгород").
const sortedCityKeys = Object.keys(regionCenters).sort((a, b) => b.length - a.length);
const allRussianRegions = [...new Set(Object.values(regionCenters))];

// Maps for recognizing and formatting address parts.
const replacements: { [key: string]: string } = {
    'ул': 'улица', 'у': 'улица',
    'пр': 'проспект', 'пр-т': 'проспект', 'просп': 'проспект', 'пр-кт': 'проспект',
    'б-р': 'бульвар', 'бул': 'бульвар',
    'ш': 'шоссе',
    'пер': 'переулок',
    'пл': 'площадь',
    'наб': 'набережная',
    'пр-д': 'проезд',
    'г': 'город',
    'д': 'деревня', 'дер': 'деревня',
    'с': 'село',
    'п': 'поселок', 'пос': 'поселок',
    'пгт': 'пгт',
    'р-н': 'район',
    'обл': 'область',
    'д.': 'д.', 'дом': 'д.',
    'стр': 'стр.', 'строение': 'стр.',
    'к': 'к.', 'корп': 'к.', 'корпус': 'к.',
    'лит': 'лит.', 'литера': 'лит.',
};

const fullWordReplacements: { [key: string]: string } = {
    'улица': 'улица',
    'проспект': 'проспект',
    'бульвар': 'бульвар',
    'шоссе': 'шоссе',
    'переулок': 'переулок',
    'площадь': 'площадь',
    'набережная': 'набережная',
    'проезд': 'проезд',
    'город': 'г.',
    'деревня': 'д.',
    'село': 'с.',
    'поселок': 'п.',
    'пгт': 'пгт.',
    'район': 'р-н',
};


const titleCase = (str: string) =>
    str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase())
       .replace(/-\w/g, c => '-' + c.charAt(1).toUpperCase()) // for dashed words
       .replace('Ё', 'ё'); // Keep 'ё' lowercase within words if not the first letter.


function extractPart(str: string, keywords: string[]): { found: string | null; remainder: string } {
    // Regex to find keywords and capture the following text until the next keyword or number block.
    // It captures the keyword itself and the text after it.
    const keywordRegex = new RegExp(`(?:^|\\s)(${keywords.join('|')})[.\\s]*([\\w\\s\\-]+?)(?=\\s(?:${Object.keys(replacements).join('|')})[.\\s]|\\s\\d|$)`, 'i');
    
    const match = str.match(keywordRegex);
    if (match) {
        const partType = match[1].toLowerCase();
        const partValue = match[2].trim();
        const fullPart = `${fullWordReplacements[replacements[partType]] || partType} ${titleCase(partValue)}`;
        const remainder = str.replace(match[0], ' ').trim();
        return { found: fullPart, remainder };
    }
    return { found: null, remainder: str };
}

/**
 * An intelligent function to parse a Russian address string, extracting its components and providing a normalized, formatted version.
 *
 * @param address The raw address string.
 * @returns A ParsedAddress object containing structured data and a clean `formattedAddress`.
 */
export function parseRussianAddress(address: string | undefined | null): ParsedAddress {
    const defaultResult: ParsedAddress = {
        country: "Россия", region: "Регион не определён", city: null, street: null, house: null,
        postalCode: null, lat: null, lon: null, confidence: 0,
        source: 'unknown', ambiguousCandidates: [],
        formattedAddress: 'Адрес не определён',
    };

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
        return defaultResult;
    }
    
    let remainder = address.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ').trim();

    // 1. Extract and remove Postal Code
    const postalCodeMatch = remainder.match(/^\d{6}\s/);
    const postalCode = postalCodeMatch ? postalCodeMatch[0].trim() : null;
    if (postalCode) {
        remainder = remainder.substring(7);
    }
    
    // 2. Extract Region
    let region: string | null = null;
    let confidence = 0;
    let source: ParsedAddress['source'] = 'unknown';

    // Priority 1: Federal Cities
    if (remainder.includes('москва')) { region = 'г. Москва'; confidence = 0.95; source = 'city_lookup'; }
    else if (remainder.includes('санкт-петербург')) { region = 'г. Санкт-Петербург'; confidence = 0.95; source = 'city_lookup'; }
    else if (remainder.includes('севастополь')) { region = 'г. Севастополь'; confidence = 0.95; source = 'city_lookup'; }

    if (region) {
        const regionToken = region.replace('г. ', '').toLowerCase();
        remainder = remainder.replace(regionToken, ' ').trim();
    } else {
        // Priority 2: City-to-Region Mapping
        for (const cityKey of sortedCityKeys) {
            const regex = new RegExp(`\\b${cityKey}\\b`);
            if (regex.test(remainder)) {
                region = regionCenters[cityKey];
                confidence = 0.9;
                source = 'city_lookup';
                break;
            }
        }
    }
    
    // Remove identified region parts from the remainder to avoid re-parsing
    if (region) {
        const regionParts = region.toLowerCase().replace(/республика|край|область|автономный округ/g, '').replace(/[\(\)—]/g, '').split(' ');
        for (const part of regionParts) {
            if (part.length > 3) { // Avoid removing short words like 'ао'
                remainder = remainder.replace(new RegExp(`\\b${part}\\b`, 'g'), ' ').trim();
            }
        }
    }

    // Standardize abbreviations before parsing parts
    Object.keys(replacements).forEach(key => {
        remainder = remainder.replace(new RegExp(`\\b${key}(?:[.]|\\b)`, 'g'), ` ${replacements[key]} `);
    });
    remainder = remainder.replace(/\s+/g, ' ').trim();

    // 3. Extract Address Parts (City, Settlement, Street, House)
    const parts: { [key: string]: string | null } = { city: null, settlement: null, street: null, house: null };
    
    const cityKeywords = ['город'];
    const settlementKeywords = ['пгт', 'село', 'деревня', 'поселок'];
    const streetKeywords = ['улица', 'проспект', 'бульвар', 'шоссе', 'переулок', 'площадь', 'набережная', 'проезд'];
    const houseKeywords = ['д.', 'дом', 'стр.', 'строение', 'к.', 'корпус', 'корп', 'лит.', 'литера'];

    const cityExtraction = extractPart(remainder, cityKeywords);
    parts.city = cityExtraction.found;
    remainder = cityExtraction.remainder;

    const settlementExtraction = extractPart(remainder, settlementKeywords);
    parts.settlement = settlementExtraction.found;
    remainder = settlementExtraction.remainder;

    const streetExtraction = extractPart(remainder, streetKeywords);
    parts.street = streetExtraction.found;
    remainder = streetExtraction.remainder;
    
    const houseExtraction = extractPart(remainder, houseKeywords);
    parts.house = houseExtraction.found;
    remainder = houseExtraction.remainder;
    
    // Assume remaining part is house number if not found yet
    if (!parts.house && remainder.length > 0) {
        parts.house = `д. ${remainder.trim().toUpperCase()}`;
    }

    // 4. Reconstruct Formatted Address
    const addressComponents = [parts.city, parts.settlement, parts.street, parts.house].filter(Boolean);

    if (addressComponents.length === 0) {
        return defaultResult; // Cannot determine address
    }
    
    // Handle special capitalization for "Молодёжный" and similar words
    let formattedAddress = addressComponents.join(', ').replace(/,+/g, ', ').replace(/е/g, 'ё');


    return {
        country: "Россия",
        region: region || "Регион не определён",
        city: parts.city, street: parts.street, house: parts.house, postalCode,
        lat: null, lon: null, confidence, source,
        ambiguousCandidates: [],
        formattedAddress,
    };
}
