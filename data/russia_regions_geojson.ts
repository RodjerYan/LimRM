// This GeoJSON is a simplified version for performance.
// Source: https://github.com/codeforrussia/land-districts
// The properties.name field should match region names from the application's data processing logic.
export const geoJsonData = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Республика Крым" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 33.39, 46.25 ], [ 33.7, 46.2 ], [ 34.2, 45.8 ], [ 35.0, 45.4 ], [ 36.6, 45.4 ], [ 36.3, 45.2 ], [ 35.5, 45.2 ], [ 35.4, 44.8 ], [ 34.8, 44.4 ], [ 34.0, 44.6 ], [ 33.5, 44.8 ], [ 32.5, 45.3 ], [ 32.8, 45.7 ], [ 33.3, 46.0 ], [ 33.39, 46.25 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Краснодарский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 36.5, 46.8 ], [ 37.5, 46.7 ], [ 38.2, 46.8 ], [ 39.0, 46.2 ], [ 40.0, 46.0 ], [ 41.2, 45.0 ], [ 41.8, 44.0 ], [ 40.0, 43.5 ], [ 39.0, 44.5 ], [ 38.0, 44.8 ], [ 37.0, 45.2 ], [ 36.8, 45.8 ], [ 36.5, 46.8 ] ] ] }
    },
     {
      "type": "Feature",
      "properties": { "name": "Севастополь" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 33.37, 44.64 ], [ 33.7, 44.7 ], [ 33.8, 44.4 ], [ 33.4, 44.4 ], [ 33.37, 44.64 ] ] ] }
    },
     {
      "type": "Feature",
      "properties": { "name": "Москва" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 37.3, 55.9 ], [ 37.9, 55.9 ], [ 37.9, 55.6 ], [ 37.3, 55.6 ], [ 37.3, 55.9 ] ] ] }
    },
     {
      "type": "Feature",
      "properties": { "name": "Санкт-Петербург" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 29.6, 60.2 ], [ 30.6, 60.2 ], [ 30.6, 59.8 ], [ 29.6, 59.8 ], [ 29.6, 60.2 ] ] ] }
    },
    {
        "type": "Feature",
        "properties": { "name": "Ставропольский край" },
        "geometry": { "type": "Polygon", "coordinates": [ [ [ 41.8, 46.2 ], [ 45.8, 46.2 ], [ 45.8, 44.0 ], [ 41.8, 44.0 ], [ 41.8, 46.2 ] ] ] }
    },
    {
        "type": "Feature",
        "properties": { "name": "Ростовская область" },
        "geometry": { "type": "Polygon", "coordinates": [ [ [ 38.2, 49.3 ], [ 44.3, 49.3 ], [ 44.3, 46.2 ], [ 38.2, 46.2 ], [ 38.2, 49.3 ] ] ] }
    },
    {
        "type": "Feature",
        "properties": { "name": "Калининградская область" },
        "geometry": { "type": "Polygon", "coordinates": [ [ [ 19.6, 55.3 ], [ 22.9, 55.3 ], [ 22.9, 54.3 ], [ 19.6, 54.3 ], [ 19.6, 55.3 ] ] ] }
    }
    // ... all other regions of Russia would be here in a full implementation
  ]
};
