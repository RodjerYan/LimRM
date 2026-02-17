
import { useState, useMemo, useEffect } from 'react';
import { FeatureCollection } from 'geojson';
import { SearchableLocation } from './types';

export const useSearchLocations = (geoJsonData: FeatureCollection | null) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);

    const searchableLocations = useMemo<SearchableLocation[]>(() => {
        if (!geoJsonData) return [];
        const locations: SearchableLocation[] = []; const addedNames = new Set<string>();
        geoJsonData.features.forEach((feature: any) => { const name = feature.properties?.name; if (name && !addedNames.has(name)) { locations.push({ name, type: 'region' }); addedNames.add(name); } });
        return locations.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }, [geoJsonData]);

    useEffect(() => {
        if (searchTerm.trim().length > 1) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            const results = searchableLocations.filter(loc => loc.name.toLowerCase().includes(lowerSearchTerm)).slice(0, 7);
            setSearchResults(results);
        } else { setSearchResults([]); }
    }, [searchTerm, searchableLocations]);

    return { searchTerm, setSearchTerm, searchResults, setSearchResults };
};