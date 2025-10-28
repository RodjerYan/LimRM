import { regionCenters } from '../utils/regionCenters';
import { ParsedAddress } from '../types';

// A simplified map for direct region name lookups
const regionSynonyms: Record<string, string> = {
    "крым": "Республика Крым",
    "московская": "Московская область",
    "ленинградская": "Ленинградская область",
    "краснодарский": "Краснодарский край",
    "свердловская": "Свердловская область",
    "калининградская": "Калининградская область",
};

/**
 * A simplified function to parse a Russian address and determine the region.
 * This version prioritizes direct matches of cities and known region names.
 * @param address The raw address string.
 * @returns A structured ParsedAddress object.
 */
export function parseRussianAddress(address: string | undefined | null): ParsedAddress {
    const result: ParsedAddress = {
        country: "Россия",
        region: null,
        city: null,
        street: null,
        house: null,
        postalCode: null,
        lat: null,
        lon: null,
        confidence: 0,
        source: 'unknown',
        ambiguousCandidates: []
    };

    if (!address || typeof address !== 'string' || address.toLowerCase() === 'неизвестно') {
        return result;
    }

    const normalizedAddress = address.toLowerCase().replace(/ё/g, 'е').replace(/[.,]/g, ' ');
    const tokens = normalizedAddress.split(/\s+/).filter(Boolean);

    // 1. Check for city names first (higher specificity)
    for (const token of tokens) {
        if (regionCenters[token]) {
            result.city = token.charAt(0).toUpperCase() + token.slice(1);
            result.region = regionCenters[token];
            result.confidence = 0.9;
            result.source = 'city_lookup';
            break; // Found a city, stop searching
        }
    }

    // 2. If no city match, check for explicit region names
    if (!result.region) {
        // Handle multi-word region names like "краснодарский край"
        const fullAddress = tokens.join(' ');
        for (const key in regionSynonyms) {
             if (fullAddress.includes(key)) {
                result.region = regionSynonyms[key];
                result.confidence = 0.8;
                result.source = 'explicit_region';
                break;
            }
        }
    }
    
    // If a region was found, capitalize city if it was also found
    if (result.region && result.city) {
        result.city = result.city.charAt(0).toUpperCase() + result.city.slice(1);
    }

    return result;
}
