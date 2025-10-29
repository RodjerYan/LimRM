import { regionCenters } from '../utils/regionCenters';
import { ParsedAddress } from '../types';

// Pre-build a search index for regions for efficiency. This structure is created once when the module loads.
const regionSearchIndex = new Map<string, { keywords: RegExp[], officialName: string }>();

(() => {
    // Get a unique list of all official region names from the data source.
    const allRegions = [...new Set(Object.values(regionCenters))];
    for (const regionName of allRegions) {
        // Normalize the region name for searching (lowercase, 'ё' to 'е').
        const lowerName = regionName.toLowerCase().replace(/ё/g, 'е');

        // Extract the most significant word(s) from the region name to use as a keyword.
        // E.g., from "Республика Татарстан", extract "татарстан". From "Орловская область", extract "орловская".
        const coreName = lowerName
            .replace(/\s*\(.*\)\s*/g, '') // Remove parenthetical parts like "(Якутия)"
            .replace(/—/g, ' ')           // Replace em-dashes with spaces
            .replace('республика', '')
            .replace('край', '')
            .replace('область', '')
            .replace('автономный округ', '')
            .replace('автономная', '')
            .replace('— кузбасс', '')      // Handle specific complex names
            .replace('— алания', '')
            .replace('— югра', '')
            .trim()
            .split(' ')[0]; // Use the first significant word.

        const keywords = new Set<string>();
        // Add the full normalized name as a keyword, allowing for multiple spaces.
        keywords.add(lowerName.replace(/ /g, '\\s+'));
        // Add the extracted core name as a keyword if it's valid.
        if (coreName) {
            keywords.add(coreName);
        }
        
        // Store the compiled regular expressions for fast searching.
        // The `\b` ensures that we match whole words only (e.g., "орел" won't match inside "теоретик").
        regionSearchIndex.set(regionName, {
            keywords: Array.from(keywords).map(kw => new RegExp(`\\b${kw}\\b`, 'u')),
            officialName: regionName
        });
    }
})();

/**
 * A robust function to parse a Russian address and determine the region.
 * It uses a prioritized search: first for explicit region names, then for federal cities,
 * and finally for regional centers, preventing common misidentifications.
 * @param address The raw address string.
 * @returns A structured ParsedAddress object containing the identified region.
 */
export function parseRussianAddress(address: string | undefined | null): ParsedAddress {
    const result: ParsedAddress = {
        country: "Россия",
        region: "Регион не определён",
        city: null, street: null, house: null, postalCode: null, lat: null, lon: null,
        confidence: 0, source: 'unknown', ambiguousCandidates: []
    };

    if (!address || typeof address !== 'string' || address.trim() === '') {
        return result;
    }
    
    // Normalize input address for robust matching.
    const normalizedAddress = address.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[.,"]/g, ' ')
        .replace(/\s+/g, ' ').trim();

    if (normalizedAddress.length === 0) {
        return result;
    }

    // --- Priority 1: Search for explicit region names ---
    // This is the most reliable method and runs first to avoid ambiguity.
    for (const regionInfo of regionSearchIndex.values()) {
        for (const keywordRegex of regionInfo.keywords) {
            if (keywordRegex.test(normalizedAddress)) {
                result.region = regionInfo.officialName;
                result.confidence = 0.9;
                result.source = 'explicit_region';
                return result; // Found a confident match, return immediately.
            }
        }
    }

    // --- Priority 2: Search for Russian cities from the main directory ---
    // This runs only if no explicit region name was found.
    // Sort keys by length descending to match multi-word names first (e.g., "нижний новгород" before "новгород").
    const sortedCityKeys = Object.keys(regionCenters).sort((a, b) => b.length - a.length);

    for (const cityKey of sortedCityKeys) {
        // Normalize the city key from our dictionary to match the normalized address.
        const normalizedCityKey = cityKey.replace(/ё/g, 'е');
        const cityRegex = new RegExp(`\\b${normalizedCityKey}\\b`, 'u');
        
        if (cityRegex.test(normalizedAddress)) {
            const regionName = regionCenters[cityKey];
            result.region = regionName;
            
            // Special formatting for federal cities, which are their own region.
            if (["Москва", "Санкт-Петербург", "Севастополь"].includes(regionName)) {
                result.region = `г. ${regionName}`;
            }

            result.city = regionName.startsWith('г. ') ? regionName.substring(3) : cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
            result.confidence = 0.8;
            result.source = 'city_lookup';
            return result; // Found a match by city, return.
        }
    }

    // If no region can be determined after all checks, the default "Регион не определён" is returned.
    return result;
}
