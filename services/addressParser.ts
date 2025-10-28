import { ParsedAddress } from '../types';

// --- Data & Mappings based on user rules ---

// Canonical region names
const REGION_KALININGRAD = 'Калининградская область';
const REGION_LENINGRAD = 'Ленинградская область';
const REGION_UNKNOWN = 'Неизвестная область';

// Keywords and their corresponding canonical names
const regionKeywords: { [key: string]: string } = {
    'калининградская обл': REGION_KALININGRAD,
    'калининградская': REGION_KALININGRAD,
    'калининградкая': REGION_KALININGRAD, // Typo
    'ленинградская обл': REGION_LENINGRAD,
    'лен обл': REGION_LENINGRAD,
    'лен.обл': REGION_LENINGRAD,
    'ло': REGION_LENINGRAD,
};

// Cities for inference (if no explicit region is found)
const cityToRegionMap: { [key: string]: string } = {
    // Kaliningrad Oblast
    'калининград': REGION_KALININGRAD,
    'гвардейск': REGION_KALININGRAD,
    'советск': REGION_KALININGRAD,
    'черняховск': REGION_KALININGRAD,
    'светлый': REGION_KALININGRAD,
    'зеленоградск': REGION_KALININGRAD,
    // Leningrad Oblast
    'гатчина': REGION_LENINGRAD,
    'кудрово': REGION_LENINGRAD,
    'мурино': REGION_LENINGRAD,
    'кингисепп': REGION_LENINGRAD,
    'всеволожск': REGION_LENINGRAD,
    'кировск': REGION_LENINGRAD,
    'сосновый бор': REGION_LENINGRAD,
    'приозерск': REGION_LENINGRAD,
    'воронцовский': REGION_LENINGRAD, // for "Воронцовский б-р" in Murino
};
const cityKeys = Object.keys(cityToRegionMap).sort((a, b) => b.length - a.length); // Longest match first

/**
 * Capitalizes the first letter of each word in a string.
 */
function capitalize(str: string): string {
    if (!str) return str;
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * The new "expert" address parsing function based on user's strict rules.
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
        result.region = REGION_UNKNOWN;
        return result;
    }

    let workAddress = address.toLowerCase().replace(/ё/g, 'е');

    // 1. Extract Postal Code
    const postalCodeMatch = workAddress.match(/\b(\d{6})\b/);
    if (postalCodeMatch) {
        result.postalCode = postalCodeMatch[1];
        workAddress = workAddress.replace(postalCodeMatch[1], '');
    }

    // 2. Normalize and clean for matching
    let cleanAddress = workAddress
        .replace(/[.,;:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 3. Determine Region (Hierarchical)

    // Rule 1: Special "СПБ" case. If present without explicit LO keywords, it's ambiguous.
    const hasSPB = /\bспб\b/.test(workAddress);
    const hasExplicitLO = /\b(ленинградская обл|лен обл|лен\.обл|ло)\b/.test(workAddress);
    
    if (hasSPB && !hasExplicitLO) {
        result.region = REGION_UNKNOWN;
        result.source = 'special_case';
    }

    // Rule 2: Explicit Region Keywords (highest priority, unless overridden by SPB rule)
    if (!result.region) {
        for (const keyword in regionKeywords) {
            // Use word boundaries for keywords like 'ло' to avoid matching 'холодильник'
            const regex = new RegExp(`\\b${keyword}\\b`);
            if (regex.test(workAddress)) {
                result.region = regionKeywords[keyword];
                result.source = 'explicit_keyword';
                result.confidence = 1.0;
                break;
            }
        }
    }
    
    // Rule 3: City-based Inference (secondary priority)
    if (!result.region) {
        for (const city of cityKeys) {
            if (cleanAddress.includes(city)) {
                result.region = cityToRegionMap[city];
                result.source = 'city_inference';
                result.confidence = 0.9;
                break;
            }
        }
    }

    // 4. Extract City Name
    // Try to find a city name from the inference map first
    for (const city of cityKeys) {
        if (cleanAddress.includes(city)) {
            result.city = capitalize(city);
            break;
        }
    }

    // If no city found from map, try to find it with "г." marker
    if (!result.city) {
        const cityMatch = cleanAddress.match(/\bг\s+([а-я-]+)\b/);
        if (cityMatch && cityMatch[1]) {
            result.city = capitalize(cityMatch[1]);
        }
    }

    // 5. Finalize Region
    if (!result.region) {
        result.region = REGION_UNKNOWN;
    }

    return result;
}
