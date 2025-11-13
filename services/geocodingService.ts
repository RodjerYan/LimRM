import { GeoCache } from '../types';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search?format=json&q=';
// Nominatim's policy is max 1 request per second. We'll use a slightly longer delay to be safe.
const REQUEST_DELAY = 1100; // ms

interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
}

/**
 * A throttled queue processor for making geocoding requests to Nominatim API.
 * This ensures compliance with the API's rate limits (1 request/sec).
 * 
 * @param addressesToGeocode An array of unique addresses to find coordinates for.
 * @param onProgress A callback to report progress (e.g., "Geocoding 1 of 10...").
 * @param onResult A callback that is fired for each successfully geocoded address.
 * @returns A promise that resolves when all addresses have been processed.
 */
export const processGeocodingQueue = async (
    addressesToGeocode: string[],
    onProgress: (message: string) => void,
    onResult: (address: string, coords: { lat: number, lon: number }) => void
): Promise<void> => {
    if (addressesToGeocode.length === 0) {
        return;
    }

    onProgress(`Начинаем геокодирование ${addressesToGeocode.length} новых адресов...`);

    let processedCount = 0;
    for (const address of addressesToGeocode) {
        processedCount++;
        onProgress(`Геокодирование ${processedCount} из ${addressesToGeocode.length}: "${address}"`);

        try {
            const response = await fetch(`${NOMINATIM_ENDPOINT}${encodeURIComponent(address)}`);
            if (!response.ok) {
                console.warn(`Nominatim API returned status ${response.status} for address: ${address}`);
                continue; // Skip to the next address
            }

            const results: NominatimResult[] = await response.json();
            
            // Use the first result, as it's typically the most relevant
            if (results.length > 0) {
                const { lat, lon } = results[0];
                const coords = {
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                };

                if (!isNaN(coords.lat) && !isNaN(coords.lon)) {
                    onResult(address, coords);
                }
            }
        } catch (error) {
            console.error(`Error geocoding address "${address}":`, error);
        }

        // Wait before the next request to respect the rate limit
        if (processedCount < addressesToGeocode.length) {
            await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        }
    }

    onProgress('Геокодирование завершено.');
};
