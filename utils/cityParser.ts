import { REGION_BY_CITY_WITH_INDEXES } from './regionMap';

// Memoize the sorted list of cities to avoid re-computing it on every call.
const CITIES_SORTED_BY_LENGTH = Object.keys(REGION_BY_CITY_WITH_INDEXES).sort((a, b) => b.length - a.length);

const capitalize = (str: string): string => {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export function getCityFromAddress(address: string): string {
    if (!address) return 'Город не определен';
    
    const lowerAddress = address; // Input is already lowercased and normalized

    // Priority 1: Find a known city from our comprehensive map.
    // We check longer city names first to avoid partial matches (e.g., "Нижний Новгород" before "Новгород").
    for (const city of CITIES_SORTED_BY_LENGTH) {
        // Use regex with word boundaries to ensure we're matching the whole city name.
        // This prevents "новгород" from matching inside "новогородская".
        const escapedCity = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedCity}\\b`);
        if (regex.test(lowerAddress)) {
            return capitalize(city);
        }
    }
    
    // Priority 2: Fallback to finding common prefixes like "г.", "г ", "город "
    const cityMatch = lowerAddress.match(/(?:г\.|г\s|город\s|пгт\s|поселок\s|пос\s)([а-яё-]+)/i);
    if (cityMatch && cityMatch[1]) {
         // Avoid matching short, ambiguous strings
        if (cityMatch[1].length > 2) {
            return capitalize(cityMatch[1]);
        }
    }
    
    // Final fallback
    return 'Город не определен';
}