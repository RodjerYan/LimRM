import { 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP,
    REGION_TO_COUNTRY_MAP
} from '../utils/addressMappings';
import { ParsedAddress } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

// Memoize the sorted list of cities to avoid re-computing it on every call.
const CITIES_SORTED_BY_LENGTH = Object.keys(REGION_BY_CITY_WITH_INDEXES).sort((a, b) => b.length - a.length);

const capitalize = (str: string): string => {
    if (!str) return '';
    return str.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

// Regex patterns to identify and extract parts of an address
const PATTERNS = {
    MARKET: /(р-к|рынок)\s*([\w\s"-]+)/i,
    MICRODISTRICT: /(мкр|микрорайон|ж\/м|жм)\.?\s*([\w\d\s-]+)/i,
    HOUSE: /(д|дом)\.?\s*(\d+[а-я]?(\/\d+[а-я]?)?)/i,
    CONTAINER: /(к|конт|контейнер)\.?\s*(\d+-\d+|\d+)/i,
    ROW: /(ряд)\.?\s*(\d+)/i,
    LANDMARK: /(яма|холодильник|светофор|больница|центр)/i,
    INTERSECTION: /([\w\s.-]+?)\s*\/+\s*([\w\s.-]+)/,
    STREET: /(ул|улица|проспект|пр|пр-т|переулок|пер|шоссе|ш|бульвар|б-р|площадь|пл|набережная|наб)\.?\s*([\w\s.-]+)/i,
};

function extractPart(address: string, pattern: RegExp, prefix: string = ''): [string, string | null] {
    const match = address.match(pattern);
    if (match) {
        const fullMatch = match[0];
        const extractedValue = prefix + (match[2] || match[1] || '').trim();
        const remainingAddress = address.replace(fullMatch, ' ').trim();
        return [remainingAddress, extractedValue];
    }
    return [address, null];
}


/**
 * Parses a CIS address string to extract country, region, city, and other details.
 * @param address The raw address string.
 * @returns A ParsedAddress object.
 */
export function parseRussianAddress(address: string): ParsedAddress {
    const result: ParsedAddress = {
        country: 'Страна не определена',
        region: 'Регион не определен',
        city: 'Город не определен',
        street: '',
        house: '',
        details: [],
    };

    if (!address || !address.trim()) {
        return result;
    }

    let processingAddress = address.toLowerCase().replace(/ё/g, 'е').replace(/[,;.]/g, ' ');

    // Apply normalizations for common typos and abbreviations
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (processingAddress.includes(alias)) {
            processingAddress = processingAddress.replace(new RegExp(alias, 'g'), canonical);
        }
    }
    
    // --- Extraction Phase ---
    let extracted;

    // Details: Markets, landmarks, etc.
    [processingAddress, extracted] = extractPart(processingAddress, PATTERNS.MARKET);
    if (extracted) result.details.push(capitalize(extracted));
    [processingAddress, extracted] = extractPart(processingAddress, PATTERNS.MICRODISTRICT, 'мкр ');
    if (extracted) result.details.push(capitalize(extracted));
    [processingAddress, extracted] = extractPart(processingAddress, PATTERNS.CONTAINER, 'конт. ');
    if (extracted) result.details.push(extracted);
    [processingAddress, extracted] = extractPart(processingAddress, PATTERNS.ROW, 'ряд ');
    if (extracted) result.details.push(extracted);
    [processingAddress, extracted] = extractPart(processingAddress, PATTERNS.LANDMARK);
    if (extracted) result.details.push(capitalize(extracted));

    // House
    [processingAddress, extracted] = extractPart(processingAddress, PATTERNS.HOUSE);
    if (extracted) result.house = extracted.replace(/\s/g, '');

    // Intersection
    const intersectionMatch = processingAddress.match(PATTERNS.INTERSECTION);
    if (intersectionMatch) {
        result.street = `пер. ${capitalize(intersectionMatch[1])} / ${capitalize(intersectionMatch[2])}`;
        processingAddress = processingAddress.replace(intersectionMatch[0], ' ');
    } else {
        // Regular Street
        [processingAddress, extracted] = extractPart(processingAddress, PATTERNS.STREET);
        if (extracted) result.street = capitalize(extracted);
    }
    
    processingAddress = processingAddress.replace(/\s+/g, ' ').trim();

    // --- Geolocation Phase ---
    // Try to find region by keyword first
    const sortedKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(^|\\s|\\W)${escapedKey}($|\\s|\\W)`, 'i');
        if (regex.test(processingAddress)) {
            result.region = REGION_KEYWORD_MAP[key];
            processingAddress = processingAddress.replace(regex, ' ').trim();
            break;
        }
    }

    // Try to find city from the remaining string
    for (const city of CITIES_SORTED_BY_LENGTH) {
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`);
        if (regex.test(processingAddress)) {
            result.city = capitalize(city);
            // If region is still unknown, derive it from the city
            if (result.region === 'Регион не определен') {
                result.region = REGION_BY_CITY_WITH_INDEXES[city]?.region || 'Регион не определен';
            }
            break;
        }
    }
    
    // Determine country from the region
    if (result.region !== 'Регион не определен') {
        result.country = REGION_TO_COUNTRY_MAP[result.region] || 'Страна не определена';
    }

    // If street is still empty, use what's left
    if (!result.street && processingAddress.length > 2) {
        // Avoid using single numbers or short leftovers as street names
        if (!/^\d+[а-я]?$/.test(processingAddress)) {
            result.street = capitalize(processingAddress);
        }
    }

    return result;
}
