// services/geoService.ts

/**
 * A delay utility to ensure we respect API rate limits.
 * @param ms The number of milliseconds to wait.
 */
export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Gets geographic coordinates for a given address string using the public Nominatim API (OpenStreetMap).
 * IMPORTANT: This service has a strict usage policy of max 1 request per second.
 * @param address The address string to geocode.
 * @returns A promise that resolves to an object with lat and lon, or null if not found.
 */
export async function getCoordinatesFromAddress(address: string): Promise<{ lat: number; lon: number } | null> {
    const params = new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1'
    });

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                // Nominatim requires a custom User-Agent.
                'User-Agent': 'LimKorm-Geo-Analysis-App/1.0 (for internal business analysis)',
            },
        });

        if (!response.ok) {
            console.error(`Geocoding (OSM) API error for address "${address}": ${response.statusText}`);
            return null;
        }

        const data = await response.json();

        if (data && Array.isArray(data) && data.length > 0) {
            const result = data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);

            if (!isNaN(lat) && !isNaN(lon)) {
                return { lat, lon };
            }
        }
        
        console.warn(`No coordinates found for address: "${address}"`);
        return null;

    } catch (error) {
        console.error(`Error geocoding (OSM) address "${address}":`, error);
        return null;
    }
}
