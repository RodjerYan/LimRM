import { regionCenters } from '../utils/regionCenters';
import { ParsedAddress } from '../types';

// Pre-sort city keys by length descending. This is crucial to match longer, more specific names first.
// For example, it prevents "новгород" from matching in an address that contains "нижний новгород".
const sortedCityKeys = Object.keys(regionCenters).sort((a, b) => b.length - a.length);

/**
 * An intelligent function to parse an address string and determine its Russian Federation region (subject).
 * It is designed to be robust against common typos, abbreviations, and formatting inconsistencies.
 *
 * @param address The raw address string to be parsed.
 * @returns A ParsedAddress object. The `region` field will contain the determined Russian region
 *          (e.g., "Московская область", "г. Москва") or "Регион не определён" if it cannot be determined.
 */
export function parseRussianAddress(address: string | undefined | null): ParsedAddress {
    const defaultResult: ParsedAddress = {
        country: "Россия",
        region: "Регион не определён",
        city: null, street: null, house: null, postalCode: null,
        lat: null, lon: null, confidence: 0,
        source: 'unknown', ambiguousCandidates: []
    };

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
        return defaultResult;
    }
    
    // Normalize the address string for more reliable matching.
    const normalizedAddress = address.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[.,"]/g, ' ') // Replace common punctuation with spaces to treat them as separators.
        .replace(/\b(обл|обл\.|область)\b/g, 'область')
        .replace(/\b(респ|респ\.|республика)\b/g, 'республика')
        .replace(/\b(край)\b/g, 'край')
        .replace(/\b(ао)\b/g, 'автономный округ')
        .replace(/\s+/g, ' ').trim();

    // --- Identification Logic ---
    
    // 1. Federal Cities: These have the highest priority and specific formatting rules.
    if (normalizedAddress.includes('москва')) {
        return { ...defaultResult, region: 'г. Москва', city: 'Москва', confidence: 0.95, source: 'city_lookup' };
    }
    if (normalizedAddress.includes('санкт-петербург')) {
        return { ...defaultResult, region: 'г. Санкт-Петербург', city: 'Санкт-Петербург', confidence: 0.95, source: 'city_lookup' };
    }
    if (normalizedAddress.includes('севастополь')) {
        return { ...defaultResult, region: 'г. Севастополь', city: 'Севастополь', confidence: 0.95, source: 'city_lookup' };
    }

    // 2. City-to-Region Mapping: The most reliable method is to identify a regional center.
    for (const cityKey of sortedCityKeys) {
        // Use word boundaries to ensure we're matching the whole city name.
        const regex = new RegExp(`\\b${cityKey}\\b`);
        if (regex.test(normalizedAddress)) {
            const regionName = regionCenters[cityKey];
            const cityName = cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
            // The regionCenters map for federal cities gives "Москва" not "г. Москва".
            // Since we already handled federal cities above, we can safely ignore those matches here.
            if (regionName !== 'Москва' && regionName !== 'Санкт-Петербург' && regionName !== 'Севастополь') {
                 return { ...defaultResult, region: regionName, city: cityName, confidence: 0.9, source: 'city_lookup' };
            }
        }
    }

    // 3. Fallback: Search for explicit region keywords (e.g., "татарстан", "краснодарский").
    // This is less precise than city matching but useful if the city is not in our list.
    const allRussianRegions = [...new Set(Object.values(regionCenters))];
    for (const regionName of allRussianRegions) {
        // Create a searchable keyword from the region name.
        const searchKey = regionName.toLowerCase()
            .replace(/г\.|город федерального значения/g, '')
            .replace(/республика|край|область|автономный округ|ао/g, '')
            .replace(/—|/g, ' ')
            .replace(/\(.*\)/, '') // remove text in parentheses (e.g., for Sakha)
            .trim().split(' ')[0];

        if (searchKey && normalizedAddress.includes(searchKey)) {
            // Avoid re-matching federal cities with the wrong format.
            if (regionName !== 'Москва' && regionName !== 'Санкт-Петербург' && regionName !== 'Севастополь') {
                 return { ...defaultResult, region: regionName, confidence: 0.7, source: 'explicit_region' };
            }
        }
    }

    // 4. If no reliable match is found, return the default "not defined" result.
    return defaultResult;
}