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

const streetMarkers = ['улица', 'ул', 'проспект', 'пр-кт', 'пр', 'переулок', 'пер', 'шоссе', 'ш', 'площадь', 'пл', 'бульвар', 'б-р', 'аллея', 'набережная', 'наб', 'проезд', 'линия'];
const houseMarkers = ['дом', 'д', 'строение', 'стр', 'корпус', 'к'];

/**
 * Capitalizes the first letter of each word in a string.
 */
function capitalize(str: string): string {
    if (!str) return str;
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * The main "expert" address parsing function.
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

    if (!address || typeof address !== 'string') {
        return result;
    }

    let normalizedAddress = address.toLowerCase().replace(/ё/g, 'е');
    
    // 1. Extract Postal Code
    const postalCodeMatch = normalizedAddress.match(/(^|\s|,)(\d{6})($|\s|,)/);
    if (postalCodeMatch) {
        result.postalCode = postalCodeMatch[2];
        normalizedAddress = normalizedAddress.replace(postalCodeMatch[2], '');
    }

    // 2. Normalize and Tokenize
    const cleanAddress = normalizedAddress
        .replace(/обл\.?/g, 'область')
        .replace(/респ\.?/g, 'республика')
        .replace(/кр\.?/g, 'край')
        .replace(/г\.?\s/g, ' город ') // Add spaces to ensure separation
        .replace(/ул\.?/g, ' улица ')
        .replace(/д\.?/g, ' дом ')
        .replace(/[.,;:]/g, ' '); // Replace punctuation with space
        
    let tokens = cleanAddress.split(/\s+/).filter(p => p && p.trim() !== '');

    // 3. Hierarchical Extraction
    const originalTokens = [...tokens];

    // Rule 1: Explicit Region has absolute priority
    const fullNormalizedAddress = tokens.join(' ');
    for (const regionKey of regionKeys) {
        if (fullNormalizedAddress.includes(regionKey)) {
            result.region = normalizedRegions.get(regionKey)!;
            result.confidence = 1.0;
            result.source = 'explicit_region';
            // Remove region words from tokens for cleaner subsequent parsing
            const regionWords = regionKey.split(' ');
            tokens = tokens.filter(t => !regionWords.includes(t));
            break;
        }
    }
    
    // Rule 2: Explicit City Marker has high priority
    let cityFoundByMarker = false;
    let cityIndex = tokens.indexOf('город');
    if (cityIndex !== -1 && tokens[cityIndex + 1]) {
        const cityName = tokens[cityIndex + 1];
        if (normalizedCityToRegion.has(cityName)) {
            result.city = canonicalCityNames.get(cityName)!;
            // Set region based on city, ONLY if region wasn't found explicitly
            if (!result.region) {
                result.region = normalizedCityToRegion.get(cityName)!;
            }
            result.confidence = 1.0;
            result.source = 'explicit_city';
            cityFoundByMarker = true;
            tokens.splice(cityIndex, 2); // Remove marker and city name
        }
    }

    // Rule 3: City -> Region mapping if no explicit markers used yet
    if (!result.city) {
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (normalizedCityToRegion.has(token)) {
                result.city = canonicalCityNames.get(token)!;
                if (!result.region) {
                     result.region = normalizedCityToRegion.get(token)!;
                }
                result.confidence = 0.9;
                result.source = 'city_lookup';
                tokens.splice(i, 1);
                break;
            }
        }
    }

    // Rule 4: Fuzzy matching (last resort, and only if no city marker was present)
    if (!result.city && !cityFoundByMarker) {
        const candidates: { city: string, distance: number }[] = [];
        const potentialCityTokens = tokens.filter(t => t.length > 2 && isNaN(parseInt(t)));

        for (const token of potentialCityTokens) {
            for (const [normCity] of normalizedCityToRegion.entries()) {
                const distance = levenshteinDistance(token, normCity);
                const threshold = normCity.length <= 5 ? 1 : normCity.length <= 10 ? 2 : 3;
                if (distance <= threshold) {
                    candidates.push({ city: normCity, distance });
                }
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => a.distance - b.distance);
            const bestDistance = candidates[0].distance;
            const topCandidates = candidates.filter(c => c.distance === bestDistance);
            
            if (topCandidates.length === 1) {
                const foundCity = topCandidates[0].city;
                result.city = canonicalCityNames.get(foundCity)!;
                if (!result.region) {
                    result.region = normalizedCityToRegion.get(foundCity)!;
                }
                result.confidence = 0.7;
                result.source = 'fuzzy';
            } else {
                 result.ambiguousCandidates = [...new Set(topCandidates.map(c => normalizedCityToRegion.get(c.city)!))];
            }
        }
    }
    
    // 4. Extract Street & House from remaining tokens
    let streetParts: string[] = [];
    let streetMarkerIndex = -1;
    for(let i = 0; i < originalTokens.length; i++){
        if(streetMarkers.includes(originalTokens[i])){
            streetMarkerIndex = i;
            // Greedily consume next tokens until a house marker or number is found
            for(let j = i + 1; j < originalTokens.length; j++){
                if(houseMarkers.includes(originalTokens[j]) || /^\d/.test(originalTokens[j])){
                    break;
                }
                streetParts.push(originalTokens[j]);
            }
            break;
        }
    }
    if (streetParts.length > 0) {
        result.street = streetParts.join(' ');
    }


    for (let i = 0; i < originalTokens.length; i++) {
        if (houseMarkers.includes(originalTokens[i]) && originalTokens[i+1] && /^\d/.test(originalTokens[i+1])) {
             result.house = originalTokens[i+1];
             break;
        }
    }
     // Last numeric part as house number
    if (!result.house) {
        const lastToken = originalTokens[originalTokens.length - 1];
        if (/^\d+([а-я](\/\d+)?)?$/.test(lastToken)) {
            result.house = lastToken;
        }
    }

    // 5. Finalize
    result.region = result.region ? capitalize(result.region) : null;
    if(result.city) result.city = capitalize(result.city);
    if(result.street) result.street = capitalize(result.street);
    
    if(!result.region && result.city) {
        result.region = 'Регион не определен';
    }


    return result;
}