import { 
    standardizeRegion, 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP
} from '../utils/addressMappings';
import { EnrichedParsedAddress } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

// --- OPTIMIZATION: PRE-PROCESSING CITIES ---
// Split cities into single-word and multi-word lists for optimized searching.
// This prevents iterating through thousands of cities for every single row.

const ALL_CITIES = Object.keys(REGION_BY_CITY_WITH_INDEXES);

// 1. Set for O(1) lookup of single-word cities (e.g., "Москва", "Тверь")
const SINGLE_WORD_CITIES_SET = new Set<string>();

// 2. Array for multi-word cities (e.g., "Нижний Новгород", "Санкт-Петербург") sorted by length
const MULTI_WORD_CITIES: string[] = [];

ALL_CITIES.forEach(city => {
    if (city.includes(' ') || city.includes('-')) {
        MULTI_WORD_CITIES.push(city);
    } else {
        SINGLE_WORD_CITIES_SET.add(city.toLowerCase());
    }
});

// Sort multi-word cities by length (descending) to match longest first
MULTI_WORD_CITIES.sort((a, b) => b.length - a.length);


// NEW: A more robust override system using substring checks for specific problematic addresses.
const KYRGYZSTAN_FORCE_OVERRIDES: { test: (addr: string) => boolean, city: string }[] = [
    {
        test: (addr) => addr.includes('р-к ош-й яма'),
        city: 'Бишкек' // Osh market is famously in Bishkek, despite the name.
    },
    {
        test: (addr) => addr.includes('орловка, ул. кудряшева'),
        city: 'Орловка'
    },
    {
        test: (addr) => addr.includes('беловодское, ул. 50 лет'),
        city: 'Беловодское'
    },
    // Added to prevent misclassification to Leningrad Region
    {
        test: (addr) => addr.includes('г.кант') || addr.includes('кант,') || addr.includes('кант '),
        city: 'Кант'
    },
    {
        test: (addr) => addr.includes('маевка'),
        city: 'Маевка'
    },
    {
        test: (addr) => addr.includes('беловодск'),
        city: 'Беловодское'
    }
];


// NEW: Special rule definitions for Kyrgyzstan addresses
const specialAddressesForBishkekRule = new Set([
  'г.кант, ул.панфилова -ванахунова 45',
  'ул.крылова 35',
  'беловодск',
  'ул.молодая гвардия 153',
  'маевка с., молодой гвардии 2',
  'с. панфиловское, ул. центральная, 301',
  'с. беловодское, светофор',
  'г.кант ул.тастелло',
  'р-к ош-й яма, холодильник 98',
  'с. беловодское, ул. 50 лет беловодск',
  'ул.л.толстого192/крылова',
  'беловодск больница',
  'с. ивановка, ул. григория ильина, 160',
].map(addr => addr.toLowerCase().replace(/ё/g, 'е')));

const bishkekDefaultStreets = new Set([
    'ул.крылова 35',
    'ул.молодая гвардия 153',
    'ул.л.толстого192/крылова',
].map(addr => addr.toLowerCase().replace(/ё/g, 'е')));


/**
 * Capitalizes the first letter of each word in a string.
 * @param str The input string.
 * @returns The capitalized string.
 */
const capitalize = (str: string | null): string => {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

/**
 * Finds a city name within a normalized address string.
 * HIGHLY OPTIMIZED version.
 * @param normalizedAddress A pre-processed, lowercased address string.
 * @returns The capitalized city name or 'Город не определен'.
 */
function getCityFromAddress(normalizedAddress: string): string {
    if (!normalizedAddress) return 'Город не определен';

    // 1. Check Multi-word cities first (Priority due to length)
    // Optimization: Use .includes() first before Regex. It's much faster.
    for (const city of MULTI_WORD_CITIES) {
        const lowerCity = city.toLowerCase();
        if (normalizedAddress.includes(lowerCity)) {
            // Only if string exists, check boundaries to avoid partial word matches
            // e.g. avoid matching "Nov" inside "Novgorod" if "Nov" was a city
            const escapedCity = lowerCity.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`(^|[^а-яёa-z0-9])${escapedCity}([^а-яёa-z0-9]|$)`, 'i');
            if (regex.test(normalizedAddress)) {
                return capitalize(city);
            }
        }
    }

    // 2. Check Single-word cities using Tokenization + Set Lookup (O(1) per word)
    // Split by common delimiters: spaces, commas, dots, etc.
    const tokens = normalizedAddress.split(/[\s,.;()]+/);
    
    for (const token of tokens) {
        if (token.length > 2 && SINGLE_WORD_CITIES_SET.has(token)) {
            return capitalize(token);
        }
    }
    
    return 'Город не определен';
}


/**
 * Finds a region by matching explicit keywords (e.g., "орловская обл", "брянская") in the address.
 * Uses a robust regex to match whole phrases, preventing partial matches inside other words.
 * @param normalizedAddress The pre-processed, lowercased address string.
 * @returns The standardized region name or null if no match is found.
 */
function findRegionByKeyword(normalizedAddress: string): string | null {
    // Sort keys by length descending to match longer phrases first (e.g., "московская область" before "москва")
    const sortedKeys = Object.keys(REGION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        // Optimization: Check includes first
        if (!normalizedAddress.includes(key)) continue;

        // This regex ensures we match the key as a whole word/phrase.
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(^|[^а-яёa-z0-9])${escapedKey}([^а-яёa-z0-9]|$)`, 'i');

        if (regex.test(normalizedAddress)) {
            return REGION_KEYWORD_MAP[key];
        }
    }
    return null;
}

/**
 * Returns the city name from the distributor's parentheses (in lowercase),
 * even if it is not in REGION_KEYWORD_MAP - we will look for the city in REGION_BY_CITY_WITH_INDEXES.
 */
function extractCityFromDistributor(distributor: string): string | null {
  if (!distributor) return null;
  const match = distributor.match(/\(([^)]+)\)/);
  if (!match || !match[1]) return null;
  return match[1].trim().toLowerCase();
}


/**
 * Parses a Russian address string to extract the region and city using a hierarchical approach.
 * If the address is ambiguous, it uses the distributor string as a fallback to determine the region
 * and enriches the original address.
 * @param address The raw address string.
 * @param distributor An optional distributor string which may contain a city hint in parentheses.
 * @returns An EnrichedParsedAddress object with the determined region, city, and a potentially modified finalAddress.
 */
export function parseRussianAddress(address: string, distributor?: string): EnrichedParsedAddress {
    const originalAddress = address || '';
    const lowerAddress = originalAddress.toLowerCase().replace(/ё/g, 'е');
    const lowerDistributor = (distributor || '').toLowerCase();

    // Priority 1: Hard override for problematic addresses that are incorrectly identified.
    for (const override of KYRGYZSTAN_FORCE_OVERRIDES) {
        if (override.test(lowerAddress)) {
            const region = 'Кыргызская Республика';
            const city = override.city;
            let finalAddress = originalAddress.trim();

            // Ensure the final address is prefixed with the region for clarity and geocoding.
            if (!finalAddress.toLowerCase().includes('кыргызская')) {
                finalAddress = `${region}, ${finalAddress}`;
            }
    
            // Clean up potential duplicates in the final address string.
            const parts = finalAddress.split(',').map(p => p.trim()).filter(Boolean);
            const uniqueParts: string[] = [];
            const seen = new Set<string>();
            for (const part of parts) {
                const lowerPart = part.toLowerCase();
                if (!seen.has(lowerPart)) {
                    uniqueParts.push(part);
                    seen.add(lowerPart);
                }
            }
            finalAddress = uniqueParts.join(', ');

            return {
                region: region,
                city: city,
                finalAddress: finalAddress,
            };
        }
    }

    const lowerAddressForCheck = lowerAddress.trim();

    // Priority 2: Special override rule for specific Kyrgyzstan addresses when distributor is 'Bishkek'
    if (lowerDistributor.includes('бишкек') && specialAddressesForBishkekRule.has(lowerAddressForCheck)) {
        const region = 'Кыргызская Республика';
        let city: string;
        let finalAddress = originalAddress.trim();

        if (bishkekDefaultStreets.has(lowerAddressForCheck)) {
            city = 'Бишкек';
            if (!finalAddress.toLowerCase().includes('бишкек')) {
                finalAddress = `г. Бишкек, ${finalAddress}`;
            }
        } else {
            // Re-run minimal normalization to find city
            let normalizedForCityParse = originalAddress.toLowerCase().replace(/ё/g, 'е').replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();
            for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
                normalizedForCityParse = normalizedForCityParse.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
            }
            normalizedForCityParse = normalizedForCityParse.replace(/\s+/g, ' ').trim();
            city = getCityFromAddress(normalizedForCityParse);
        }
        
        // Always prefix with region, if not already present. Check for a substring to be safe.
        if (!finalAddress.toLowerCase().includes('кыргызская')) {
            finalAddress = `${region}, ${finalAddress}`;
        }

        const parts = finalAddress.split(',').map(p => p.trim()).filter(Boolean);
        const uniqueParts = [];
        const seen = new Set<string>();
        for (const part of parts) {
            const lowerPart = part.toLowerCase();
            if (!seen.has(lowerPart)) {
                uniqueParts.push(part);
                seen.add(lowerPart);
            }
        }
        finalAddress = uniqueParts.join(', ');

        return {
            region: region,
            city: city,
            finalAddress: finalAddress,
        };
    }

    if (!originalAddress.trim() && !distributor?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определен', finalAddress: '' };
    }

    let normalized = lowerAddress.replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
    }
    // After replacements, clean up multiple spaces that might have been introduced.
    normalized = normalized.replace(/\s+/g, ' ').trim();


    // 1. Determine City
    const cityFromAddress = getCityFromAddress(normalized); // Returns capitalized city or 'Город не определен'
    const isCityInAddress = cityFromAddress !== 'Город не определен';
    
    const distributorCityRaw = distributor ? extractCityFromDistributor(distributor) : null;
    const distributorCityCapitalized = distributorCityRaw ? capitalize(distributorCityRaw) : null;

    // City from address has priority. Otherwise, use distributor city.
    const finalCity = isCityInAddress ? cityFromAddress : (distributorCityCapitalized || 'Город не определен');

    // 2. Determine Region
    let region: string | null = null;
    
    // Priority 1: Find explicit region keyword in address string (e.g., "брянская обл")
    const regionFromKeywordInAddress = findRegionByKeyword(normalized);
    region = regionFromKeywordInAddress;

    // Priority 2: If no explicit region keyword, use the distributor city as the next strongest hint for the REGION.
    if (!region && distributorCityRaw) {
       const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === distributorCityRaw);
        if (cityKey) {
            region = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
    }

    // Priority 3: If region is still unknown, derive it from the final determined city (which could be from address or a fallback to distributor).
    if (!region && finalCity !== 'Город не определен') {
        const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES).find(k => k.toLowerCase() === finalCity.toLowerCase());
        if (cityKey) {
            region = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
        }
    }

    const finalRegion = region ? standardizeRegion(region) : 'Регион не определен';

    // 3. Construct Final Address (for display and geocoding)
    let finalAddress = originalAddress.trim();
    
    // Ключевое правило: обогащать адрес, только если он неполный.
    // Адрес считается неполным, если в нем НЕ найден ни город/поселок/село, НИ название региона.
    // При этом, в поле "Дистрибьютор" должен быть город для обогащения.
    const isAddressIncomplete = !isCityInAddress && !regionFromKeywordInAddress;
    const canEnrichFromDistributor = isAddressIncomplete && !!distributorCityCapitalized && finalRegion !== 'Регион не определен';


    // Если адрес неполный (например, "ул. Койбагарова 15" или "рынок Чинай"),
    // но мы можем получить город/регион от дистрибьютора, мы добавляем их в начало адреса,
    // чтобы сделать его полным и пригодным для геокодинга.
    if (canEnrichFromDistributor) {
        finalAddress = `${finalRegion}, ${finalCity}, ${originalAddress.trim()}`;
    } else {
        // Стандартное поведение: добавить регион, только если он был определен (не из самого адреса)
        // и еще не присутствует в строке.
        if (finalRegion !== 'Регион не определен' && !regionFromKeywordInAddress) {
            finalAddress = `${finalRegion}, ${finalAddress}`;
        }
    }
    
    // Clean up potential duplicates if region/city was added but parts were already there.
    const parts = finalAddress.split(',').map(p => p.trim()).filter(Boolean);
    const uniqueParts = [];
    const seen = new Set<string>();
    for(const part of parts) {
        const lowerPart = part.toLowerCase();
        if(!seen.has(lowerPart)) {
            uniqueParts.push(part);
            seen.add(lowerPart);
        }
    }
    finalAddress = uniqueParts.join(', ');

    return {
        region: finalRegion,
        city: finalCity,
        finalAddress: finalAddress
    };
}