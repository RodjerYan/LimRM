import type { FeatureCollection } from 'geojson';

// This GeoJSON data provides the geographical boundaries for regions.
// The 'name' property in each feature is crucial for matching with application data.
export const russiaRegionsGeoJSON: FeatureCollection = {
    "type": "FeatureCollection",
    "features": [
        // GeoJSON features for all regions of Russia and CIS countries will be inserted here.
        // Due to the immense size of this data, a small, representative sample is shown.
        // The full implementation will contain the complete dataset.
        {
            "type": "Feature",
            "properties": { "name": "Республика Крым" },
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [
                    [[[33.389, 46.246], [33.567, 46.244], [33.729, 46.179], [33.743, 46.022], [33.682, 45.922], [33.771, 45.748], [33.844, 45.759], [34.01, 45.696], [34.331, 45.704], [34.509, 45.824], [34.697, 45.787], [34.903, 45.63], [34.928, 45.474], [35.031, 45.404], [35.405, 45.426], [35.631, 45.312], [35.918, 45.399], [36.212, 45.378], [36.425, 45.34], [36.626, 45.385], [36.671, 45.308], [36.427, 45.241], [36.002, 45.203], [35.617, 45.105], [35.381, 44.912], [35.056, 44.757], [34.789, 44.606], [34.428, 44.408], [34.1, 44.385], [33.805, 44.536], [33.535, 44.582], [33.535, 44.735], [33.824, 45.244], [33.535, 45.337], [33.407, 45.374], [33.072, 45.323], [32.569, 45.34], [32.484, 45.545], [32.846, 45.724], [33.245, 45.897], [33.389, 46.246]]],
                    [[[35.393, 45.719], [35.393, 45.719], [35.393, 45.719], [35.393, 45.719]]]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": { "name": "Белгородская область" },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[35.95, 51.38], [36.5, 51.4], [37.0, 51.3], [37.8, 51.35], [38.5, 51.1], [39.0, 50.7], [38.8, 50.1], [38.2, 49.9], [37.5, 50.3], [36.8, 50.3], [36.0, 50.6], [35.5, 50.9], [35.95, 51.38]]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": { "name": "Краснодарский край" },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[36.59, 46.87], [37.5, 46.8], [38.2, 46.9], [38.8, 46.7], [39.5, 46.5], [40.2, 46.2], [41.0, 45.8], [41.8, 45.0], [41.9, 44.2], [41.2, 43.7], [40.0, 43.5], [39.0, 44.0], [38.2, 44.8], [37.3, 45.1], [36.9, 45.4], [36.59, 46.87]]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": { "name": "Москва" },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[36.8, 55.5], [37.9, 55.5], [37.9, 56.0], [36.8, 56.0], [36.8, 55.5]]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": { "name": "Московская область" },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[35.2, 54.8], [40.2, 54.8], [40.2, 56.9], [35.2, 56.9], [35.2, 54.8]]
                ]
            }
        }
    ]
}
