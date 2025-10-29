import { regionCenters } from '../utils/regionCenters';
import { ParsedAddress } from '../types';

// Data for parsing foreign addresses
const countryKeywords: Record<string, string> = {
    'беларусь': 'Республика Беларусь',
    'казахстан': 'Республика Казахстан',
    'рф': 'Россия',
    'россия': 'Россия',
};

const foreignRegionsData: Record<string, { name: string, country: string }> = {
    'могилевская область': { name: 'Могилевская область', country: 'Республика Беларусь' },
    'гродненская область': { name: 'Гродненская область', country: 'Республика Беларусь' },
    'алматинская область': { name: 'Алматинская область', country: 'Республика Казахстан' },
    'акмолинская область': { name: 'Акмолинская область', country: 'Республика Казахстан' },
    'карагандинская область': { name: 'Карагандинская область', country: 'Республика Казахстан' },
};

const foreignCitiesData: Record<string, string> = {
    'могилев': 'могилевская область',
    'гродно': 'гродненская область',
    'лида': 'гродненская область',
    'слоним': 'гродненская область',
    'белыничи': 'могилевская область',
    'алматы': 'алматинская область',
    'астана': 'акмолинская область',
    'нур-султан': 'акмолинская область',
    'темиртау': 'карагандинская область',
    'караганда': 'карагандинская область',
};


/**
 * A comprehensive function to parse a Russian or CIS address and determine the region.
 * It identifies the country, then the region, and formats the output string according to specific rules.
 * @param address The raw address string.
 * @returns A structured ParsedAddress object with the correctly formatted region string.
 */
export function parseRussianAddress(address: string | undefined | null): ParsedAddress {
    const result: ParsedAddress = {
        country: "Россия", region: null, city: null, street: null, house: null,
        postalCode: null, lat: null, lon: null, confidence: 0,
        source: 'unknown', ambiguousCandidates: []
    };

    if (!address || typeof address !== 'string') {
        result.region = "Регион не определён";
        return result;
    }
    
    // Normalize input for robust matching
    const normalizedAddress = address.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[.,"]/g, ' ')
        .replace(/\b(обл|обл\.|область)\b/g, 'область')
        .replace(/\b(респ|респ\.|республика)\b/g, 'республика')
        .replace(/\b(край)\b/g, 'край')
        .replace(/\s+/g, ' ').trim();

    if (normalizedAddress.length === 0) {
        result.region = "Регион не определён";
        return result;
    }

    // 1. Detect Country from keywords
    let detectedCountry: string | null = null;
    for (const keyword in countryKeywords) {
        if (normalizedAddress.includes(keyword)) {
            detectedCountry = countryKeywords[keyword];
            break;
        }
    }

    // 2. Handle Foreign Addresses (Belarus, Kazakhstan, etc.)
    if (detectedCountry && detectedCountry !== 'Россия') {
        result.country = detectedCountry;

        // Search for explicit region name
        for (const regionKey in foreignRegionsData) {
            if (normalizedAddress.includes(regionKey) && foreignRegionsData[regionKey].country === detectedCountry) {
                result.region = `${detectedCountry}, ${foreignRegionsData[regionKey].name}`;
                result.confidence = 0.9;
                result.source = 'explicit_region';
                return result;
            }
        }
        
        // If no region found, search for city to derive region
        for (const cityKey in foreignCitiesData) {
            if (normalizedAddress.includes(cityKey)) {
                const regionKey = foreignCitiesData[cityKey];
                if (foreignRegionsData[regionKey]?.country === detectedCountry) {
                     result.region = `${detectedCountry}, ${foreignRegionsData[regionKey].name}`;
                     result.city = cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
                     result.confidence = 0.8;
                     result.source = 'city_lookup';
                     return result;
                }
            }
        }
        
        // If only the country was found in the address string
        result.region = detectedCountry;
        result.confidence = 0.5;
        result.source = 'explicit_region';
        return result;
    }

    // 3. Handle Russian Addresses
    result.country = 'Россия';
    
    // Check for federal cities first (as they are special regions)
    if (normalizedAddress.includes('москва')) {
        result.region = 'г. Москва';
        result.city = 'Москва';
        result.confidence = 0.95;
        result.source = 'city_lookup';
        return result;
    }
    if (normalizedAddress.includes('санкт-петербург')) {
        result.region = 'г. Санкт-Петербург';
        result.city = 'Санкт-Петербург';
        result.confidence = 0.95;
        result.source = 'city_lookup';
        return result;
    }
     if (normalizedAddress.includes('севастополь')) {
        result.region = 'г. Севастополь';
        result.city = 'Севастополь';
        result.confidence = 0.95;
        result.source = 'city_lookup';
        return result;
    }

    // Check for Russian cities from the main directory (regionCenters.ts)
    // Sort keys by length descending to match multi-word names first (e.g., "нижний новгород" before "новгород")
    const sortedCityKeys = Object.keys(regionCenters).sort((a, b) => b.length - a.length);

    for (const cityKey of sortedCityKeys) {
        if (normalizedAddress.includes(cityKey)) {
            result.region = regionCenters[cityKey];
            result.city = cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
            result.confidence = 0.9;
            result.source = 'city_lookup';
            return result;
        }
    }
    
    // Fallback: Check for explicit Russian region names that might not have been matched by a city
    // e.g., if the address only contains "Краснодарский край"
    const allRussianRegions = [...new Set(Object.values(regionCenters))]; // Use Set for unique region names
    for (const regionName of allRussianRegions) {
        // Create a simplified, searchable version of the region name
        const searchableRegion = regionName.toLowerCase()
            .replace('республика', '')
            .replace('край', '')
            .replace('область', '')
            .trim().split(' ')[0]; // Use the first significant word

        if (searchableRegion && normalizedAddress.includes(searchableRegion)) {
            result.region = regionName;
            result.confidence = 0.7;
            result.source = 'explicit_region';
            return result;
        }
    }

    // 4. If no region can be determined, return the specific fallback string
    result.region = "Регион не определён";
    return result;
}
