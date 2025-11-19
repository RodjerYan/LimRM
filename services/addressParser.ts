import { 
    standardizeRegion, 
    REGION_KEYWORD_MAP, 
    CITY_NORMALIZATION_MAP
} from '../utils/addressMappings';
import { EnrichedParsedAddress } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

// Memoize the sorted list of cities to avoid re-computing it on every call.
const CITIES_SORTED_BY_LENGTH = Object.keys(REGION_BY_CITY_WITH_INDEXES).sort((a, b) => b.length - a.length);

// Helper set of Russian Federation and Belarus regions for prioritization.
const RF_AND_BY_REGIONS = new Set<string>(
    Object.values(REGION_KEYWORD_MAP)
        .filter(region => 
            !['Кыргызская Республика', 'Республика Казахстан', 'Республика Таджикистан', 'Республика Узбекистан', 'Армения', 'Азербайджан', 'Грузия', 'Республика Молдова', 'Туркменистан', 'Республика Абхазия'].includes(region)
        )
);


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
 * @param normalizedAddress A pre-processed, lowercased address string.
 * @returns The capitalized city name or null if not found.
 */
function getCityFromAddress(normalizedAddress: string): string | null {
    if (!normalizedAddress) return null;

    // We check longer city names first to avoid partial matches (e.g., "Нижний Новгород" before "Новгород").
    for (const city of CITIES_SORTED_BY_LENGTH) {
        // Use regex with word boundaries to ensure we're matching the whole city name.
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`, 'i');
        if (regex.test(normalizedAddress)) {
            return capitalize(city);
        }
    }
    
    return null;
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
        // This regex ensures we match the key as a whole word/phrase.
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(^|\\s|\\W)${escapedKey}($|\\s|\\W)`, 'i');

        if (regex.test(normalizedAddress)) {
            return REGION_KEYWORD_MAP[key];
        }
    }
    return null;
}

/**
 * Returns the city name from the distributor's parentheses (in lowercase).
 */
function extractCityFromDistributor(distributor: string): string | null {
  if (!distributor) return null;
  const match = distributor.match(/\(([^)]+)\)/);
  if (!match || !match[1]) return null;
  return match[1].trim().toLowerCase();
}

/**
 * Checks if the address string contains a common settlement prefix (like 'г.', 'с.', 'пос.').
 * This is crucial to decide whether to enrich an address with a city from the distributor.
 * @param address The address string (preferably lowercased).
 * @returns True if a settlement prefix is found, false otherwise.
 */
function hasSettlementInAddress(address: string): boolean {
    // Regex for common settlement prefixes, case-insensitive.
    // Includes: с, село, г, город, пгт, пос, деревня, дер, хутор, х, станица, ст-ца, аул, рп (рабочий посёлок), р-к (рынок), мкр, ж/м
    const settlementRegex = /\b(с|село|г|город|пгт|пос|деревня|дер|хутор|х|станица|ст-ца|аул|рп|р-к|мкр|ж\/м)\b\.?/i;
    return settlementRegex.test(address);
}

export function parseRussianAddress(address: string, distributor?: string): EnrichedParsedAddress {
    const originalAddress = (address || '').trim();
    if (!originalAddress && !distributor) {
        return { region: 'Регион не определен', city: 'Город не определен', finalAddress: '' };
    }

    // --- 1. Нормализация и извлечение исходных данных ---
    const lowerAddress = originalAddress.toLowerCase().replace(/ё/g, 'е');
    let normalized = lowerAddress.replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const [alias, canonical] of Object.entries(CITY_NORMALIZATION_MAP)) {
        if (normalized.includes(alias)) {
            normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
        }
    }

    const cityFromAddress = getCityFromAddress(normalized);
    const keywordRegionInAddress = findRegionByKeyword(normalized);
    const cityFromDistributorRaw = distributor ? extractCityFromDistributor(distributor) : null;

    // --- 2. Определяем авторитетный регион и город ---
    let authRegion: string | null = null;
    let authCity: string | null = cityFromAddress;

    const isRuByCase = keywordRegionInAddress && RF_AND_BY_REGIONS.has(keywordRegionInAddress);

    if (isRuByCase) {
        authRegion = keywordRegionInAddress;
    } else {
        if (cityFromDistributorRaw) {
            const cityKey = Object.keys(REGION_BY_CITY_WITH_INDEXES)
                .find(k => k.toLowerCase() === cityFromDistributorRaw);
            if (cityKey) {
                authRegion = REGION_BY_CITY_WITH_INDEXES[cityKey].region;
            }
        }
        if (!authRegion) authRegion = keywordRegionInAddress;

        if (!authCity && !hasSettlementInAddress(lowerAddress) && cityFromDistributorRaw) {
            // Проверяем, есть ли город из дистрибьютора в адресе
            const cityRegexCheck = new RegExp(`\\b${cityFromDistributorRaw}\\b`, 'i');
            if (!cityRegexCheck.test(originalAddress)) {
                authCity = capitalize(cityFromDistributorRaw);
            }
        }
    }

    const finalRegionStr = standardizeRegion(authRegion);
    let addressRemainder = originalAddress;

    // --- 3. Удаляем из адреса все вхождения города и региона ---
    const termsToRemove = new Set<string>();
    if (finalRegionStr && finalRegionStr !== 'Регион не определен') {
        const regionCore = finalRegionStr.replace(/область|край|республика/i, '').trim();
        if (regionCore.length > 2) termsToRemove.add(regionCore.toLowerCase());
    }
    if (cityFromAddress) termsToRemove.add(cityFromAddress.toLowerCase());
    if (authCity && authCity !== cityFromAddress) termsToRemove.add(authCity.toLowerCase());

    if (termsToRemove.size > 0) {
        const sortedTerms = [...termsToRemove].sort((a, b) => b.length - a.length);
        const regexParts = sortedTerms.map(term => {
            const escapedTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            return `(?:г\\.\\s*)?\\b${escapedTerm}[а-я]*\\b(?:\\s*(г|обл|область|край|респ))?\\.?`;
        });
        const cleaningRegex = new RegExp(regexParts.join('|'), 'gi');
        addressRemainder = addressRemainder.replace(cleaningRegex, '');
    }

    addressRemainder = addressRemainder
        .replace(/, ,/g, ',')
        .replace(/\s+/g, ' ')
        .replace(/^,/, '')
        .trim();

    // --- 4. Сборка финального адреса ---
    const finalParts: string[] = [];

    if (finalRegionStr && finalRegionStr !== 'Регион не определен') finalParts.push(finalRegionStr);
    if (authCity) finalParts.push(`г. ${authCity}`);
    if (addressRemainder) finalParts.push(addressRemainder);

    let finalAddress = finalParts.join(', ')
        .replace(/, ,/g, ',')
        .replace(/\s+,/g, ',')
        .replace(/,\s+/g, ', ')
        .trim();

    return {
        region: finalRegionStr,
        city: authCity || 'Город не определен',
        finalAddress
    };
}
