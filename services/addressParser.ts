import { regionCenters } from '../utils/regionCenters';
import { ParsedAddress } from '../types';

// A dictionary to expand abbreviations for better readability.
const EXPANSIONS: Record<string, string> = {
    'пр-кт': 'проспект',
    'пр': 'проспект',
    'просп': 'проспект',
    'б-р': 'бульвар',
    'бульвар': 'бульвар',
    'ш': 'шоссе',
    'шоссе': 'шоссе',
    'пер': 'пер.',
    'переулок': 'пер.',
    'ул': 'ул.',
    'улица': 'ул.',
    'г': 'г.',
    'город': 'г.',
    'пгт': 'пгт',
    'поселок городского типа': 'пгт',
    'с': 'с.',
    'село': 'с.',
    'дер': 'д.',
    'деревня': 'д.',
    'дом': 'д.',
    'д': 'д.', // Ambiguous: can be деревня or дом.
    'стр': 'стр.',
    'строение': 'стр.',
    'к': 'к.',
    'корп': 'к.',
    'корпус': 'к.',
};

// --- Pre-computation for performance ---

// 1. Create a map of normalized city names to their regions to fix the 'ё' issue.
const normalizedCityCenters: Record<string, string> = {};
for (const city in regionCenters) {
    const normalizedCity = city.replace(/ё/g, 'е');
    normalizedCityCenters[normalizedCity] = regionCenters[city];
}
const sortedNormalizedCityKeys = Object.keys(normalizedCityCenters).sort((a, b) => b.length - a.length);

// 2. Create matchers for explicit region mentions (e.g., "Орловская обл")
const allRegionNames = [...new Set(Object.values(regionCenters))];
const regionMatchers = allRegionNames.map(regionName => {
    // Creates a base keyword, e.g., "Орловская область" -> "орловская"
    const baseKeyword = regionName
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s*\(.*\)\s*/g, '') // remove content in parenthesis like (Якутия)
        .replace(/—.*/, '') // remove content after em-dash
        .replace(' область', '')
        .replace(' край', '')
        .replace(' республика', '')
        .replace(' автономный округ', '')
        .replace(' автономная', '')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Generates variations: "орловская", "орловской", "орловская обл"
    const variations = new Set([
        baseKeyword,
        `${baseKeyword} обл`,
        `${baseKeyword} область`,
        `${baseKeyword} край`,
        `респ ${baseKeyword}`,
        `республика ${baseKeyword}`,
    ]);
    
    // Handle grammatical cases like "в брянской области" -> брянской
    if (baseKeyword.endsWith('ая')) {
        variations.add(baseKeyword.slice(0, -2) + 'ой'); // брянская -> брянской
    }
    if (baseKeyword.endsWith('кий')) {
        variations.add(baseKeyword.slice(0, -3) + 'кого'); // пермский -> пермского
    }

    // Create a robust regex that matches any variation as a whole word
    const regex = new RegExp(`\\b(${Array.from(variations).join('|')})\\b`, 'i');
    
    return {
        officialName: regionName,
        regex,
    };
});

// --- End of Pre-computation ---


function capitalize(s: string): string {
    if (!s) return '';
    return s.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
}

/**
 * An intelligent function that performs two tasks:
 * 1.  Determines the Russian Federation region (subject) for data grouping.
 * 2.  Cleans and formats the local part of the address for clear display.
 *
 * @param address The raw address string.
 * @returns A ParsedAddress object containing the identified region and a beautifully formatted local address string.
 */
export function parseRussianAddress(address: string | undefined | null): ParsedAddress & { formattedAddress: string } {
    const defaultResult: ParsedAddress & { formattedAddress: string } = {
        country: "Россия",
        region: "Регион не определён",
        city: null, street: null, house: null, postalCode: null,
        lat: null, lon: null, confidence: 0,
        source: 'unknown', ambiguousCandidates: [],
        formattedAddress: address || "Адрес не определён",
    };

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
        defaultResult.formattedAddress = "Адрес не определён";
        return defaultResult;
    }

    // --- 1. Region Detection ---
    const workAddress = address.toLowerCase().replace(/ё/g, 'е');
    let region = "Регион не определён";
    let cityForRegion: string | null = null;
    let source: ParsedAddress['source'] = 'unknown';

    // PRIORITY 1: Match explicit region names first (e.g., "Брянская обл").
    for (const matcher of regionMatchers) {
        if (matcher.regex.test(workAddress)) {
            region = matcher.officialName;
            source = 'explicit_region';
            break;
        }
    }

    // PRIORITY 2: If no explicit region found, try matching by city.
    if (region === "Регион не определён") {
        if (/\bмосква\b/.test(workAddress)) {
            region = 'г. Москва'; cityForRegion = 'Москва'; source = 'city_lookup';
        } else if (/\bсанкт-петербург\b/.test(workAddress)) {
            region = 'г. Санкт-Петербург'; cityForRegion = 'Санкт-Петербург'; source = 'city_lookup';
        } else if (/\bсевастополь\b/.test(workAddress)) {
            region = 'г. Севастополь'; cityForRegion = 'Севастополь'; source = 'city_lookup';
        } else {
            // Check against the list of regional centers.
            for (const cityKey of sortedNormalizedCityKeys) {
                // Use regex with word boundaries to avoid partial matches (e.g., "первомайск" in "первомайская").
                const cityRegex = new RegExp(`\\b${cityKey}\\b`);
                if (cityRegex.test(workAddress)) {
                    region = normalizedCityCenters[cityKey];
                    cityForRegion = capitalize(cityKey.replace(/е/g, 'ё')); // Restore ё for display
                    source = 'city_lookup';
                    break;
                }
            }
        }
    }
    
    defaultResult.region = region;
    defaultResult.city = cityForRegion || defaultResult.city;
    defaultResult.source = source;

    // --- 2. Address Formatting ---
    let formattedAddress = address;

    // Remove postal code
    formattedAddress = formattedAddress.replace(/\b\d{6}\b,?/g, '').trim();

    // Remove region part for local address display
    if (region !== 'Регион не определён' && !region.startsWith('г. ')) {
         const regionKeywords = region.toLowerCase().replace(/[^a-zа-яё\s-]/g, '').split(/[\s-]+/);
         for (const keyword of regionKeywords) {
             if (keyword.length > 3) {
                formattedAddress = formattedAddress.replace(new RegExp(`\\b${keyword}(ая|ий|)?\\s*(обл|край|респ)?(\\.|,)?\\b`, 'ig'), '').trim();
             }
         }
    }

    // Standardize spacing, punctuation, and attach letters to house numbers
    formattedAddress = formattedAddress
        .replace(/(\d)\s*([а-яa-z])\b/gi, '$1$2')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s+/g, ' ')
        .replace(/, ,/g, ',')
        .replace(/^[\s,]+|[\s,]+$/g, '')
        .trim();
        
    // Expand abbreviations and fix capitalization
    let parts = formattedAddress.split(' ');
    let finalParts: string[] = [];

    for (let i = 0; i < parts.length; i++) {
        let part = parts[i];
        let lowerPart = part.toLowerCase().replace(/[.,]/g, '');

        if (EXPANSIONS[lowerPart]) {
            // Check if it's a city designator like "г." which should prefix the city name
            if (lowerPart === 'г' || lowerPart === 'город') {
                if (i + 1 < parts.length) { // "г. Калининград" case
                    finalParts.push('г. ' + capitalize(parts[i + 1].replace(',', '')));
                    i++;
                    continue;
                } else if (i > 0) { // "Калининград г." case
                    let prevPart = finalParts.pop();
                    if (prevPart) {
                        finalParts.push('г. ' + capitalize(prevPart.replace(',', '')));
                        continue;
                    }
                }
            }
            finalParts.push(EXPANSIONS[lowerPart]);
        } else {
            finalParts.push(capitalize(part));
        }
    }
    
    formattedAddress = finalParts.join(' ');

    // Final cleanup of punctuation and spacing
    formattedAddress = formattedAddress
        .replace(/\s*,\s*/g, ', ')
        .replace(/ ,/g, ',')
        .replace(/\s+/g, ' ')
        .replace(/г\. (\w+)/g, (match, p1) => 'г. ' + capitalize(p1)) // Ensure city is capitalized after "г. "
        .trim();

    if (formattedAddress.length > 0) {
        defaultResult.formattedAddress = formattedAddress;
    } else {
        // Fallback if formatting removes everything (e.g., address was only a region)
        defaultResult.formattedAddress = address.replace(/\b\d{6}\b,?/g, '').trim();
    }

    return defaultResult;
}
