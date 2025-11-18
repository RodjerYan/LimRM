// services/addressParser.ts
import { 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP,
    REGION_TO_COUNTRY_MAP,
    CIS_KEYWORDS
} from '../utils/addressMappings';
import { ParsedAddress } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

// Memoized sorted list of all cities for efficient lookup.
const CITIES_SORTED_BY_LENGTH = Object.keys(REGION_BY_CITY_WITH_INDEXES).sort((a, b) => b.length - a.length);

const capitalize = (str: string): string => {
    if (!str) return '';
    return str.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

// --- START: NEW CIS-specific Parser ---
const CIS_PATTERNS = {
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

// This interface is used internally to pass unprocessed parts of the string
interface TempParsedAddress extends ParsedAddress {
    _unprocessed?: string;
}

function parseCISAddress(address: string): TempParsedAddress {
    const result: TempParsedAddress = {
        country: 'Страна не определена', region: 'Регион не определен', city: 'Город не определен',
        street: '', house: '', details: [],
    };

    let processingAddress = address.toLowerCase().replace(/ё/g, 'е').replace(/[,;.]/g, ' ');

    let extracted;
    [processingAddress, extracted] = extractPart(processingAddress, CIS_PATTERNS.MARKET);
    if (extracted) result.details.push(capitalize(extracted));
    [processingAddress, extracted] = extractPart(processingAddress, CIS_PATTERNS.MICRODISTRICT, 'мкр ');
    if (extracted) result.details.push(capitalize(extracted));
    [processingAddress, extracted] = extractPart(processingAddress, CIS_PATTERNS.CONTAINER, 'конт. ');
    if (extracted) result.details.push(extracted);
    [processingAddress, extracted] = extractPart(processingAddress, CIS_PATTERNS.ROW, 'ряд ');
    if (extracted) result.details.push(extracted);
    [processingAddress, extracted] = extractPart(processingAddress, CIS_PATTERNS.LANDMARK);
    if (extracted) result.details.push(capitalize(extracted));
    [processingAddress, extracted] = extractPart(processingAddress, CIS_PATTERNS.HOUSE);
    if (extracted) result.house = extracted.replace(/\s/g, '');

    const intersectionMatch = processingAddress.match(CIS_PATTERNS.INTERSECTION);
    if (intersectionMatch) {
        result.street = `пер. ${capitalize(intersectionMatch[1])} / ${capitalize(intersectionMatch[2])}`;
        processingAddress = processingAddress.replace(intersectionMatch[0], ' ');
    } else {
        [processingAddress, extracted] = extractPart(processingAddress, CIS_PATTERNS.STREET);
        if (extracted) result.street = capitalize(extracted);
    }
    
    result._unprocessed = processingAddress.replace(/\s+/g, ' ').trim();
    return result;
}
// --- END: NEW CIS-specific Parser ---

// --- START: Simplified Russian Parser (Restored Logic) ---
function parseRussianAddress(address: string): TempParsedAddress {
    // This function emulates a simpler, more direct approach for Russian addresses.
    // It primarily focuses on finding the location and leaves the rest as unprocessed.
    return {
        country: 'Страна не определена', region: 'Регион не определен', city: 'Город не определен',
        street: '', house: '', details: [],
        _unprocessed: address.toLowerCase().replace(/ё/g, 'е').replace(/[,;.]/g, ' ')
    };
}
// --- END: Simplified Russian Parser ---

/**
 * Determines the final location details (city, region, country) for a partially parsed address.
 * This is a shared function used by both CIS and Russian parsers.
 */
function finalizeLocation(parsed: TempParsedAddress): ParsedAddress {
    let processingAddress = parsed._unprocessed || '';
    
    // Apply normalizations for common typos and abbreviations
    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (processingAddress.includes(alias)) {
            processingAddress = processingAddress.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    // Try to find region by keyword first
    const sortedRegionKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedRegionKeys) {
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(^|\\s|\\W)${escapedKey}($|\\s|\\W)`, 'i');
        if (regex.test(processingAddress)) {
            parsed.region = REGION_KEYWORD_MAP[key];
            processingAddress = processingAddress.replace(regex, ' ').trim();
            break;
        }
    }

    // Then, try to find the city from the remaining string
    for (const city of CITIES_SORTED_BY_LENGTH) {
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`, 'i');
        if (regex.test(processingAddress)) {
            parsed.city = capitalize(city);
            if (parsed.region === 'Регион не определен') {
                parsed.region = REGION_BY_CITY_WITH_INDEXES[city]?.region || 'Регион не определен';
            }
            processingAddress = processingAddress.replace(regex, ' ').trim();
            break;
        }
    }
    
    // Determine country from the region, defaulting to Russia if not found
    if (parsed.region !== 'Регион не определен') {
        parsed.country = REGION_TO_COUNTRY_MAP[parsed.region] || 'Россия';
    }

    // If street is still empty, use what's left of the string
    processingAddress = processingAddress.replace(/\s+/g, ' ').trim();
    if (!parsed.street && processingAddress.length > 2 && !/^\d+[а-я]?$/.test(processingAddress)) {
        parsed.street = capitalize(processingAddress);
    }
    
    delete (parsed as any)._unprocessed;
    return parsed;
}

/**
 * Main dispatcher function. Parses a raw address string, determines if it's from the CIS,
 * and applies the appropriate parsing logic. Also handles fallback to a distributor's address.
 * @param mainAddress The primary address string of the trade point.
 * @param distributorAddress Optional address string of the distributor.
 * @returns A fully parsed address object.
 */
export function parseAddress(mainAddress: string, distributorAddress?: string): ParsedAddress {
    if (!mainAddress || !mainAddress.trim()) {
        return {
            country: 'Страна не определена', region: 'Регион не определен', city: 'Город не определен',
            street: '', house: '', details: [],
        };
    }

    const lowerMainAddress = mainAddress.toLowerCase();
    const isCIS = CIS_KEYWORDS.some(keyword => lowerMainAddress.includes(keyword));

    let parsed: TempParsedAddress = isCIS ? parseCISAddress(mainAddress) : parseRussianAddress(mainAddress);
    let finalParsed = finalizeLocation(parsed);

    // --- Distributor Fallback Logic ---
    if (finalParsed.city === 'Город не определен' && distributorAddress) {
        const lowerDistributorAddress = distributorAddress.toLowerCase();
        const isDistributorCIS = CIS_KEYWORDS.some(keyword => lowerDistributorAddress.includes(keyword));
        
        const distributorParsed: TempParsedAddress = isDistributorCIS ? parseCISAddress(distributorAddress) : parseRussianAddress(distributorAddress);
        const finalDistributorParsed = finalizeLocation(distributorParsed);
        
        if (finalDistributorParsed.city !== 'Город не определен') {
            finalParsed.city = finalDistributorParsed.city;
            if (finalParsed.region === 'Регион не определен') {
                finalParsed.region = finalDistributorParsed.region;
                finalParsed.country = finalDistributorParsed.country;
            }
        }
    }

    return finalParsed;
}
