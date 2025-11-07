// FIX: Replaced placeholder text with a valid GeoJSON FeatureCollection.
// This provides the necessary geographical data for the InteractiveRegionMap component to render region boundaries.
// Note: This is a simplified subset of Russian regions for demonstration purposes. A full production version would require a more complete GeoJSON file.
export const russiaRegionsGeoJSON = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Московская область"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [35.2, 56.0], [35.2, 54.8], [36.8, 54.8], [40.2, 54.8],
                        [40.2, 56.9], [38.0, 56.9], [35.2, 56.0]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Ленинградская область"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [28.2, 61.0], [28.2, 58.5], [34.0, 58.5], [34.0, 61.0], [28.2, 61.0]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Краснодарский край"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [36.6, 46.8], [36.6, 43.6], [41.9, 43.6], [41.9, 46.8], [36.6, 46.8]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Ростовская область"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [38.2, 49.0], [38.2, 46.2], [44.2, 46.2], [44.2, 49.0], [38.2, 49.0]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Белгородская область"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [35.0, 51.4], [35.0, 50.0], [39.0, 50.0], [39.0, 51.4], [35.0, 51.4]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Брянская область"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                     [
                        [31.2, 54.0], [31.2, 52.0], [35.3, 52.0], [35.3, 54.0], [31.2, 54.0]
                     ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Орловская область"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                       [34.8, 53.6], [34.8, 52.0], [38.0, 52.0], [38.0, 53.6], [34.8, 53.6]
                    ]
                ]
            }
        }
    ]
};
