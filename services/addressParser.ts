// services/addressParser.ts
import { CITY_TO_REGION_MAP } from '../utils/regionCenters';
import { standardizeRegion } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

const capitalize = (str: string | null): string => {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

/**
 * A simple, older version of the address parser.
 * @param address The raw address string.
 * @returns A ParsedAddress object with the determined region and city.
 */
export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
    if (!address?.trim()) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }

    const lowerAddress = address.toLowerCase().replace(/ё/g, 'e');

    // Simple city-based lookup from the dedicated map file
    for (const city in CITY_TO_REGION_MAP) {
        if (lowerAddress.includes(city)) {
            const region = CITY_TO_REGION_MAP[city];
            return {
                region: standardizeRegion(region),
                city: capitalize(city),
            };
        }
    }
    
    // Very basic fallback if no city is found in the map
    const addressParts = address.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    const potentialCity = addressParts.length > 1 ? addressParts[1] : addressParts[0];

    return {
        region: 'Регион не определен',
        city: capitalize(potentialCity),
    };
}
