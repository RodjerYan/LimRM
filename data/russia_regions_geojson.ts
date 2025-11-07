// FIX: The original content of this file was invalid TypeScript, causing build errors.
// This file has been updated to export an empty GeoJSON FeatureCollection.
// This resolves the "has no exported member 'russiaRegionsGeoJSON'" error in InteractiveRegionMap.tsx
// and allows the component to function without region polygon data, preventing a crash.
import type { FeatureCollection } from 'geojson';

export const russiaRegionsGeoJSON: FeatureCollection = {
    type: "FeatureCollection",
    features: []
};
