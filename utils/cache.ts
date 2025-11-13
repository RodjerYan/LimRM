import { GeoCache } from '../types';

const GEO_CACHE_KEY = 'geoAddressCache';

/**
 * Loads the geocoding cache from localStorage.
 * @returns The parsed GeoCache object or an empty object if not found or invalid.
 */
export const loadGeoCache = (): GeoCache => {
    try {
        const cachedData = localStorage.getItem(GEO_CACHE_KEY);
        if (cachedData) {
            return JSON.parse(cachedData);
        }
    } catch (error) {
        console.error("Failed to load or parse geo cache:", error);
        // If parsing fails, clear it to prevent further errors
        clearGeoCache();
    }
    return {};
};

/**
 * Saves the geocoding cache to localStorage.
 * @param cache The GeoCache object to save.
 */
export const saveGeoCache = (cache: GeoCache): void => {
    try {
        localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error("Failed to save geo cache:", error);
    }
};

/**
 * Clears the geocoding cache from localStorage.
 */
export const clearGeoCache = (): void => {
    localStorage.removeItem(GEO_CACHE_KEY);
};
