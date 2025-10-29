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

// A list of all region names to help with removal from the address string.
const sortedCityKeys = Object.keys(regionCenters).sort((a, b) => b.length - a.length);

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
    let workAddress = address.toLowerCase().replace(/ё/g, 'е');
    let region = "Регион не определён";
    let cityForRegion: string | null = null;
    let source: ParsedAddress['source'] = 'unknown';

    if (workAddress.includes('москва')) {
        region = 'г. Москва'; cityForRegion = 'Москва'; source = 'city_lookup';
    } else if (workAddress.includes('санкт-петербург')) {
        region = 'г. Санкт-Петербург'; cityForRegion = 'Санкт-Петербург'; source = 'city_lookup';
    } else if (workAddress.includes('севастополь')) {
        region = 'г. Севастополь'; cityForRegion = 'Севастополь'; source = 'city_lookup';
    } else {
        for (const cityKey of sortedCityKeys) {
            if (workAddress.includes(cityKey)) {
                region = regionCenters[cityKey];
                cityForRegion = capitalize(cityKey);
                source = 'city_lookup';
                break;
            }
        }
    }
    
    defaultResult.region = region;
    defaultResult.city = cityForRegion;
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
