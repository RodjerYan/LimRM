import { regionCenters } from '../utils/regionCenters';
import { levenshteinDistance, normalizeAddressForSearch } from '../utils/dataUtils';

interface ParsedAddress {
    country: string;
    region: string | null;
    city: string | null;
    street: string | null;
    house: string | null;
    lat: number | null;
    lon: number | null;
}

// --- Internal Data & Mappings ---

const cityCoordinates: Record<string, { lat: number, lon: number }> = {
    "орёл": { lat: 52.9655, lon: 36.0785 },
    "омск": { lat: 54.9833, lon: 73.3667 },
    "уфа": { lat: 54.7333, lon: 55.9667 },
    "москва": { lat: 55.751244, lon: 37.618423 },
};

const canonicalRegionNames = [...new Set(Object.values(regionCenters))];

const regionSynonyms: Record<string, string> = {
    'обл': 'область',
    'респ': 'республика',
    'ао': 'автономный округ',
};

const streetSynonyms = ['улица', 'ул', 'проспект', 'пр-кт', 'переулок', 'пер', 'шоссе', 'ш', 'площадь', 'пл', 'бульвар', 'б-р'];
const houseSynonyms = ['дом', 'д'];

// Pre-normalized maps for performance
const normalizedCityToRegion = new Map<string, string>();
for (const city in regionCenters) {
    normalizedCityToRegion.set(normalizeAddressForSearch(city), regionCenters[city]);
}

const normalizedRegions = new Map<string, string>();
for (const region of canonicalRegionNames) {
    const key = normalizeAddressForSearch(region).replace(/область|край|республика|город федерального значения|автономный округ/g, '').trim();
    normalizedRegions.set(key, region);
}

/**
 * Capitalizes the first letter of each word in a string.
 */
function capitalize(str: string): string {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * The main address parsing logic.
 * @param address The raw address string.
 * @returns A structured ParsedAddress object.
 */
export function parseRussianAddress(address: string): ParsedAddress {
    const result: ParsedAddress = {
        country: "Россия",
        region: null,
        city: null,
        street: null,
        house: null,
        lat: null,
        lon: null
    };

    if (!address || typeof address !== 'string') {
        return result;
    }

    // 1. Preprocessing and Normalization
    let cleanAddress = address.toLowerCase();
    for (const key in regionSynonyms) {
        cleanAddress = cleanAddress.replace(new RegExp(`\\b${key}\\.?\\b`, 'g'), regionSynonyms[key]);
    }
    const parts = cleanAddress.split(',').map(p => p.trim()).filter(Boolean);

    // 2. Hierarchical Extraction
    
    // --- Region ---
    for (const part of parts) {
        const normalizedPart = normalizeAddressForSearch(part).replace(/область|край|республика|город федерального значения|автономный округ/g, '').trim();
        for (const [normRegion, canonicalRegion] of normalizedRegions.entries()) {
            if (normRegion.includes(normalizedPart) || normalizedPart.includes(normRegion)) {
                result.region = canonicalRegion;
                break;
            }
        }
        if (result.region) break;
    }

    // --- City (and Region if not found yet) ---
    for (const part of parts) {
        const normalizedPart = normalizeAddressForSearch(part.replace(/\b(г|город)\.?\b/g, ''));
        if (normalizedCityToRegion.has(normalizedPart)) {
            const canonicalCity = Object.keys(regionCenters).find(c => normalizeAddressForSearch(c) === normalizedPart) || normalizedPart;
            result.city = capitalize(canonicalCity);
            if (!result.region) {
                result.region = normalizedCityToRegion.get(normalizedPart)!;
            }
            break;
        }
    }
    
    // Fuzzy match for city if still not found
    if (!result.city) {
         for (const part of parts) {
             const normalizedPart = normalizeAddressForSearch(part.replace(/\b(г|город)\.?\b/g, ''));
             let bestMatch: { city: string, distance: number } | null = null;
             for (const city of Object.keys(regionCenters)) {
                 const distance = levenshteinDistance(normalizedPart, city);
                 const threshold = city.length <= 5 ? 1 : 2;
                 if (distance <= threshold && (!bestMatch || distance < bestMatch.distance)) {
                     bestMatch = { city, distance };
                 }
             }
             if (bestMatch) {
                 result.city = capitalize(bestMatch.city);
                 if (!result.region) {
                    result.region = regionCenters[bestMatch.city];
                 }
                 break;
             }
         }
    }
    

    // --- Street and House ---
    for (const part of parts) {
        if (streetSynonyms.some(syn => part.includes(syn))) {
            let streetPart = part;
            for (const syn of streetSynonyms) {
                streetPart = streetPart.replace(new RegExp(`\\b${syn}\\.?\\b`, 'g'), '').trim();
            }
            // Check for house number within the street part
            const houseMatch = streetPart.match(/(.*?)\s*(\d+[а-я]?(\/\d+)?)$/);
            if (houseMatch) {
                result.street = capitalize(houseMatch[1].trim());
                result.house = houseMatch[2];
            } else {
                result.street = capitalize(streetPart);
            }
        } else if (houseSynonyms.some(syn => part.includes(syn)) && !result.house) {
             result.house = part.replace(/\b(дом|д)\.?\b/g, '').trim();
        }
    }
    
    // Last numeric part as house number if not found yet
    if (!result.house) {
        const lastPart = parts[parts.length - 1];
        if (/^\d+[а-я]?(\/\d+)?$/.test(lastPart)) {
            result.house = lastPart;
        }
    }
    
    // 3. Finalization and Geocoding
    if (result.region) {
        result.region = capitalize(result.region);
    }

    if (result.city) {
        const normCity = normalizeAddressForSearch(result.city);
        if (cityCoordinates[normCity]) {
            result.lat = cityCoordinates[normCity].lat;
            result.lon = cityCoordinates[normCity].lon;
        }
    }

    return result;
}
