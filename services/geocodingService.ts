const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search?format=json&q=';
const REQUEST_DELAY = 1100; // ms, slightly more than 1s to be safe

interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
}

interface GeocodingSuccess {
    address: string;
    coords: { lat: number, lon: number };
}

interface GeocodingResult {
    successes: GeocodingSuccess[];
    failures: string[];
}

export const processGeocodingQueue = async (
    addressesToGeocode: string[],
    onProgress: (message: string) => void,
): Promise<GeocodingResult> => {
    if (addressesToGeocode.length === 0) {
        return { successes: [], failures: [] };
    }

    onProgress(`Начинаем геокодирование ${addressesToGeocode.length} новых адресов...`);

    const successes: GeocodingSuccess[] = [];
    const failures: string[] = [];
    let processedCount = 0;

    for (const address of addressesToGeocode) {
        processedCount++;
        onProgress(`Геокодирование ${processedCount} из ${addressesToGeocode.length}: "${address}"`);

        try {
            const response = await fetch(`${NOMINATIM_ENDPOINT}${encodeURIComponent(address)}`);
            if (!response.ok) {
                console.warn(`Nominatim API returned status ${response.status} for address: ${address}`);
                failures.push(address);
                continue;
            }

            const results: NominatimResult[] = await response.json();
            
            if (results.length > 0) {
                const { lat, lon } = results[0];
                const coords = {
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                };

                if (!isNaN(coords.lat) && !isNaN(coords.lon)) {
                    successes.push({ address, coords });
                } else {
                    failures.push(address);
                }
            } else {
                failures.push(address);
            }
        } catch (error) {
            console.error(`Error geocoding address "${address}":`, error);
            failures.push(address);
        }

        if (processedCount < addressesToGeocode.length) {
            await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        }
    }

    onProgress('Геокодирование завершено.');
    return { successes, failures };
};