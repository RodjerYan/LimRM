// This GeoJSON is a simplified version for performance.
// Source: https://github.com/codeforrussia/land-districts
// The properties.name field should match region names from the application's data processing logic.
export const geoJsonData = {
  "type": "FeatureCollection",
  "features": [
    // GeoJSON features will be here. Due to the large size of the full GeoJSON file,
    // this content is truncated for display purposes. The actual implementation
    // would contain the complete geometry for all Russian regions.
    // A placeholder is used to indicate the structure.
    {
      "type": "Feature",
      "properties": { "name": "Москва" },
      "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Московская область" },
      "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Санкт-Петербург" },
      "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ленинградская область" },
      "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    },
    {
        "type": "Feature",
        "properties": { "name": "Краснодарский край" },
        "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    },
    {
        "type": "Feature",
        "properties": { "name": "Республика Крым" },
        "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    },
    {
        "type": "Feature",
        "properties": { "name": "Ставропольский край" },
        "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    },
    {
        "type": "Feature",
        "properties": { "name": "Ростовская область" },
        "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    },
    {
        "type": "Feature",
        "properties": { "name": "Калининградская область" },
        "geometry": { "type": "Polygon", "coordinates": [/* ... */] }
    }
    // ... all other regions of Russia
  ]
};
// In a real application, the full GeoJSON would be loaded here.
// For this environment, we'll simulate it with a truncated version.
// The actual file is too large to include. A full version would be fetched from a server or bundled.
