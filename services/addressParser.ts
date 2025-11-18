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

// --- START: SELF-CONTAINED RF PARSER (ORIGINAL LOGIC RECONSTRUCTED) ---
function _parseRF(address: string): ParsedAddress {
    const result: ParsedAddress = {
        country: 'Россия',
        region: 'Регион не определен',
        city: 'Город не определен',
        street: '',
        house: '',
        details: []
    };
    
    let processingAddress = address.toLowerCase().replace(/ё/g, 'е');

    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (processingAddress.includes(alias)) {
            processingAddress = processingAddress.replace(new RegExp(alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), ` ${canonical} `);
        }
    }
    // Add padding to ensure word boundary matching
    processingAddress = ` ${processingAddress.replace(/[,;.]/g, ' ')} `;

    const sortedRegionKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedRegionKeys) {
        // Use word boundaries that are safe for strings with padding
        const regex = new RegExp(`\\s${key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|$)`, 'i');
        if (regex.test(processingAddress)) {
            result.region = REGION_KEYWORD_MAP[key];
            processingAddress = processingAddress.replace(regex, ' ').trim();
            break;
        }
    }

    for (const city of CITIES_SORTED_BY_LENGTH) {
        const regex = new RegExp(`\\s${city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|$)`, 'i');
        if (regex.test(processingAddress)) {
            result.city = capitalize(city);
            if (result.region === 'Регион не определен') {
                result.region = REGION_BY_CITY_WITH_INDEXES[city]?.region || 'Регион не определен';
            }
            processingAddress = processingAddress.replace(regex, ' ').trim();
            break;
        }
    }
    
    if (result.region !== 'Регион не определен') {
        result.country = REGION_TO_COUNTRY_MAP[result.region] || 'Россия';
    }

    result.street = capitalize(processingAddress.replace(/\s+/g, ' ').trim());

    return result;
}

// --- START: SELF-CONTAINED CIS PARSER ---
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

function _parseCIS(address: string): ParsedAddress {
    const result: ParsedAddress = {
        country: 'Страна не определена',
        region: 'Регион не определен',
        city: 'Город не определен',
        street: '',
        house: '',
        details: []
    };

    let processingAddress = address.toLowerCase().replace(/ё/g, 'е');
    
    // First, find location
    for (const city of CITIES_SORTED_BY_LENGTH) {
        const regex = new RegExp(`\\b${city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (regex.test(processingAddress)) {
            result.city = capitalize(city);
            result.region = REGION_BY_CITY_WITH_INDEXES[city]?.region || 'Регион не определен';
            if (result.region !== 'Регион не определен') {
                 result.country = REGION_TO_COUNTRY_MAP[result.region] || 'Страна не определена';
            }
            processingAddress = processingAddress.replace(regex, ' ');
            break;
        }
    }
    
    // Cleanup before parsing details
    processingAddress = processingAddress.replace(/[,;.]/g, ' ');

    // Second, parse details from the rest of the string
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
    
    const remainder = processingAddress.replace(/\s+/g, ' ').trim();
    if (remainder && !result.street) {
        result.street = capitalize(remainder);
    } else if (remainder) {
        result.details.push(capitalize(remainder));
    }

    return result;
}

// --- DISPATCHER ---
export function parseAddress(mainAddress: string, distributorAddress?: string): ParsedAddress {
    if (!mainAddress || !mainAddress.trim()) {
        return { country: 'Страна не определена', region: 'Регион не определен', city: 'Город не определен', street: '', house: '', details: [] };
    }

    const lowerMainAddress = mainAddress.toLowerCase();
    const isCIS = CIS_KEYWORDS.some(keyword => lowerMainAddress.includes(keyword));

    let finalParsed = isCIS ? _parseCIS(mainAddress) : _parseRF(mainAddress);
    
    // --- Distributor Fallback Logic ---
    if (finalParsed.city === 'Город не определен' && distributorAddress) {
        const lowerDistributorAddress = distributorAddress.toLowerCase();
        // Check distributor address geography independently
        const isDistributorCIS = CIS_KEYWORDS.some(keyword => lowerDistributorAddress.includes(keyword));
        
        const distributorParsed = isDistributorCIS ? _parseCIS(distributorAddress) : _parseRF(distributorAddress);
        
        if (distributorParsed.city !== 'Город не определен') {
            finalParsed.city = distributorParsed.city;
            finalParsed.region = distributorParsed.region;
            finalParsed.country = distributorParsed.country;
        }
    }

    // Final check for country if region is known but country isn't
    if (finalParsed.country === 'Страна не определена' && finalParsed.region !== 'Регион не определен') {
        finalParsed.country = REGION_TO_COUNTRY_MAP[finalParsed.region] || 'Россия';
    }


    return finalParsed;
}
