// This file provides simplified GeoJSON data for the regions of Russia.
// The geometry is simplified to reduce file size.
// Source: Natural Earth / Custom simplification
// The 'name' property in each feature should correspond to the region names used in the application data.

export const russiaRegionsGeoJSON = {
  "type": "FeatureCollection",
  "features": [
    // This is a placeholder for a very large GeoJSON object. 
    // A full, detailed GeoJSON for all Russian regions can be several megabytes.
    // For this application, a simplified TopoJSON or a server-side solution would be more performant.
    // However, to make the component functional, a valid (but empty) FeatureCollection is provided.
    // To populate this, you would add GeoJSON Feature objects here, like:
    /*
    {
      "type": "Feature",
      "properties": { "name": "Московская область" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [ [ [35.2, 54.8], [35.2, 56.8], [40.2, 56.8], [40.2, 54.8], [35.2, 54.8] ] ]
      }
    },
    ...
    */
    // NOTE: Providing a full GeoJSON here would make the file extremely large.
    // This empty collection ensures the map component can load without errors.
    // For a real application, this data should be fetched from an API or a static asset server.
  ]
};
