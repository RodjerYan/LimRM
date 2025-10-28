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
        .replace(/область|край|республика|город федерального значения|автономный округ|ао/g, '').trim();
    normalizedRegions.set(key, region);
}

const streetMarkers = ['улица', 'ул', 'проспект', 'пр-кт', 'пр', 'переулок', 'пер', 'шоссе', 'ш', 'площадь', 'пл', 'бульвар', 'б-р', 'аллея', 'набережная', 'наб'];
const houseMarkers = ['дом', 'д'];

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
        ambiguousCandidates: []
    };

    if (!address || typeof address !== 'string') {
        return result;
    }

    let processedAddress = address.toLowerCase().replace(/ё/g, 'е');
    
    // 1. Extract Postal Code
    const postalCodeMatch = processedAddress.match(/(^|\s|,)(\d{6})($|\s|,)/);
    if (postalCodeMatch) {
        result.postalCode = postalCodeMatch[2];
        processedAddress = processedAddress.replace(postalCodeMatch[2], '');
    }

    // 2. Normalize and Tokenize
    processedAddress = processedAddress
        .replace(/обл\.?/g, 'область')
        .replace(/респ\.?/g, 'республика')
        .replace(/кр\.?/g, 'край')
        .replace(/г\.?\s/g, 'город '); // Add space to ensure separation
        
    let tokens = processedAddress.split(/,|\s+/).filter(p => p && p.trim() !== '');

    // 3. Hierarchical Extraction

    // Rule 1: Explicit Region has absolute priority
    const fullNormalizedAddress = tokens.join(' ');
    for (const [normRegion, canonicalRegion] of normalizedRegions.entries()) {
        if (fullNormalizedAddress.includes(normRegion)) {
            result.region = canonicalRegion;
            break;
        }
    }
    
    // Rule 2: Explicit City Marker has high priority
    let cityFound = false;
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === 'город' && tokens[i + 1]) {
            const cityName = tokens[i + 1];
            if (normalizedCityToRegion.has(cityName)) {
                result.city = canonicalCityNames.get(cityName)!;
                if (!result.region) { // Set region only if not explicitly found
                    result.region = normalizedCityToRegion.get(cityName)!;
                }
                cityFound = true;
                tokens.splice(i, 2); // Remove marker and city name
                break;
            }
        }
    }

    // Rule 3: City -> Region mapping if no explicit markers used yet
    if (!cityFound) {
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (normalizedCityToRegion.has(token)) {
                result.city = canonicalCityNames.get(token)!;
                if (!result.region) {
                     result.region = normalizedCityToRegion.get(token)!;
                }
                cityFound = true;
                tokens.splice(i, 1);
                break;
            }
        }
    }

    // Rule 4: Fuzzy matching (last resort, and only if no city marker was present)
    if (!cityFound && !address.toLowerCase().includes('г.')) {
        let bestMatch: { city: string, distance: number } | null = null;
        const candidates: { city: string, distance: number }[] = [];

        for (const token of tokens) {
            if (token.length < 3) continue; // Skip very short tokens
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
            } else {
                 result.ambiguousCandidates = [...new Set(topCandidates.map(c => normalizedCityToRegion.get(c.city)!))];
            }
        }
    }
    
    // 4. Extract Street & House from remaining tokens
    let streetParts = [];
    for (let i = 0; i < tokens.length; i++) {
        if (streetMarkers.includes(tokens[i])) {
            // Assume street name is the token(s) before or after the marker
            if (i > 0 && !streetMarkers.includes(tokens[i-1]) && isNaN(parseInt(tokens[i-1]))) {
                 streetParts.push(tokens[i-1]);
            }
             if (i < tokens.length - 1 && !houseMarkers.includes(tokens[i+1]) && isNaN(parseInt(tokens[i+1]))) {
                 streetParts.push(tokens[i+1]);
            }
        }
    }
    if(streetParts.length > 0) result.street = streetParts.join(' ');

    for (let i = 0; i < tokens.length; i++) {
         if (houseMarkers.includes(tokens[i]) && tokens[i+1]) {
             result.house = tokens[i+1];
             break;
         }
    }
     // Last numeric part as house number
    if (!result.house) {
        const lastToken = tokens[tokens.length - 1];
        if (/^\d+([а-я](\/\d+)?)?$/.test(lastToken)) {
            result.house = lastToken;
        }
    }

    // 5. Finalize
    result.region = result.region ? capitalize(result.region) : 'Регион не определен';
    if(result.city) result.city = capitalize(result.city);
    if(result.street) result.street = capitalize(result.street);

    return result;
}
