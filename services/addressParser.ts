import { regionCenters } from '../utils/regionCenters';
import { levenshteinDistance } from '../utils/dataUtils';

export interface ParsedAddress {
  country: "Россия";
  region: string | null;
  city: string | null;
  street: string | null;
  house: string | null;
  postalCode: string | null;
  lat: number | null;
  lon: number | null;
  confidence: number;
  source: 'explicit_region' | 'explicit_city' | 'city_lookup' | 'postal' | 'fuzzy' | 'unknown';
  ambiguousCandidates: string[];
}

// --- Internal Data & Mappings ---
const canonicalRegionNames = [...new Set(Object.values(regionCenters))];

// Pre-normalized maps for performance
const normalizedCityToRegion = new Map<string, string>();
const canonicalCityNames = new Map<string, string>();
for (const city in regionCenters) {
    const normalized = city.replace(/ё/g, 'е');
    normalizedCityToRegion.set(normalized, regionCenters[city]);
    canonicalCityNames.set(normalized, city);
}

const normalizedRegions = new Map<string, string>();
for (const region of canonicalRegionNames) {
    const key = region.replace(/ё/g, 'е').toLowerCase()
        .replace(/область|край|республика|город федерального значения|автономный округ|ао/g, '').trim()
        .replace(/\s+/g, ' ');
    normalizedRegions.set(key, region);
}
const regionKeys = [...normalizedRegions.keys()].sort((a, b) => b.length - a.length); // For longest match first

const streetMarkers = ['улица', 'ул', 'проспект', 'пр-кт', 'пр', 'переулок', 'пер', 'шоссе', 'ш', 'площадь', 'пл', 'бульвар', 'б-р', 'аллея', 'набережная', 'наб', 'проезд', 'линия', 'тракт', 'мкр', 'микрорайон'];
const houseMarkers = ['дом', 'д', 'строение', 'стр', 'корпус', 'к', 'сооружение'];
const cityMarkers = ['город', 'г', 'гп', 'поселок', 'пос', 'пгт', 'деревня', 'дер', 'село', 'ст-ца', 'станица'];


/**
 * Capitalizes the first letter of each word in a string.
 */
function capitalize(str: string): string {
    if (!str) return str;
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * The main "expert" address parsing function, rewritten for robustness.
 * @param address The raw address string.
 * @returns A structured ParsedAddress object.
 */
export function parseRussianAddress(address: string | undefined | null): ParsedAddress {
    const result: ParsedAddress = {
        country: "Россия", region: null, city: null, street: null, house: null,
        postalCode: null, lat: null, lon: null, confidence: 0,
        source: 'unknown', ambiguousCandidates: []
    };

    if (!address || typeof address !== 'string') {
        return result;
    }

    let workAddress = address.toLowerCase().replace(/ё/g, 'е');
    
    // 1. Extract Postal Code and use it for region hinting
    const postalMatch = workAddress.match(/(^|\s|,)(\d{6})($|\s|,)/);
    if (postalMatch) {
        result.postalCode = postalMatch[2];
        workAddress = workAddress.replace(result.postalCode, '');
        if (result.postalCode.startsWith('236')) {
            result.region = "Калининградская область";
            result.confidence = 0.8;
            result.source = 'postal';
        } else if (result.postalCode.startsWith('187') || result.postalCode.startsWith('188')) {
            result.region = "Ленинградская область";
            result.confidence = 0.8;
            result.source = 'postal';
        }
    }

    // 2. Normalize and Tokenize
    const cleanAddress = workAddress
        .replace(/[.,;:]/g, ' ') // Replace punctuation with space
        .replace(/\s+/g, ' ').trim();
        
    let tokens = cleanAddress.split(' ');
    
    // 3. Hierarchical Extraction
    let remainingAddress = ` ${cleanAddress} `; // Pad with spaces for easier regex

    // Rule 1: Explicit Region has absolute priority
    if (!result.region) {
        for (const regionKey of regionKeys) {
            if (remainingAddress.includes(` ${regionKey} `)) {
                result.region = normalizedRegions.get(regionKey)!;
                result.confidence = 1.0;
                result.source = 'explicit_region';
                remainingAddress = remainingAddress.replace(` ${regionKey} `, ' ');
                break;
            }
        }
    }
    
    // Rule 2: Find City and infer Region if not already found
    // Check for explicit city markers first for higher accuracy
    let cityFound = false;
    for (const marker of cityMarkers) {
        const cityRegex = new RegExp(`\\s${marker}\\.?\\s+([\\w\\-]+)`, 'i');
        const cityMatch = remainingAddress.match(cityRegex);
        if (cityMatch && normalizedCityToRegion.has(cityMatch[1])) {
            const cityName = cityMatch[1];
            result.city = canonicalCityNames.get(cityName)!;
            if (!result.region) {
                result.region = normalizedCityToRegion.get(cityName)!;
            }
            result.confidence = Math.max(result.confidence, 0.95);
            result.source = 'explicit_city';
            remainingAddress = remainingAddress.replace(cityMatch[0], ' ');
            cityFound = true;
            break;
        }
    }

    // If no explicit marker, search for city names directly
    if (!cityFound) {
        for (const city of canonicalCityNames.keys()) {
            if (remainingAddress.includes(` ${city} `)) {
                result.city = canonicalCityNames.get(city)!;
                 if (!result.region) {
                    result.region = normalizedCityToRegion.get(city)!;
                }
                result.confidence = Math.max(result.confidence, 0.9);
                result.source = 'city_lookup';
                remainingAddress = remainingAddress.replace(` ${city} `, ' ');
                break;
            }
        }
    }

    // 4. Extract Street & House from what's left
    let housePart: string | null = null;
    const houseRegex = new RegExp(`(?:${houseMarkers.join('|')})\\.?\\s+([\\d\\w/\\-]+(?:\\s*\\w\\d*)?)`, 'i');
    const houseMatch = remainingAddress.match(houseRegex);
    if (houseMatch) {
        housePart = houseMatch[1];
        remainingAddress = remainingAddress.replace(houseMatch[0], ' ');
    } else {
        const endNumberMatch = remainingAddress.match(/([\d]+[а-я]?\/?[\d\w]*)\s*$/);
        if (endNumberMatch) {
            housePart = endNumberMatch[1];
            remainingAddress = remainingAddress.replace(endNumberMatch[0], ' ');
        }
    }
    result.house = housePart;

    // The rest is the street
    result.street = remainingAddress
        .replace(new RegExp(`\\b(?:${streetMarkers.join('|')})\\.?\\b`, 'gi'), '')
        .trim();


    // 5. Finalize
    result.region = result.region ? capitalize(result.region) : null;
    result.city = result.city ? capitalize(result.city) : null;
    result.street = result.street ? capitalize(result.street) : null;
    
    if(!result.region && result.city) {
        result.region = 'Регион не определен';
    }

    return result;
}
