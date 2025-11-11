import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

// Type for our simple bounding box
export type BoundingBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

const regionBoundingBoxes: Record<string, BoundingBox> = {};

// Function to calculate bounding box for a single polygon
function getPolygonBBox(coordinates: number[][][]): BoundingBox {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    coordinates[0].forEach(coord => {
        const [lon, lat] = coord;
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
    });
    return [minLon, minLat, maxLon, maxLat];
}

// Function to merge two bounding boxes
function mergeBBoxes(box1: BoundingBox, box2: BoundingBox): BoundingBox {
    return [
        Math.min(box1[0], box2[0]),
        Math.min(box1[1], box2[1]),
        Math.max(box1[2], box2[2]),
        Math.max(box1[3], box2[3])
    ];
}

// Pre-calculate bounding boxes for all regions from the GeoJSON
russiaRegionsGeoJSON.features.forEach(feature => {
    const regionName = feature.properties?.name;
    const geometry = feature.geometry;

    if (regionName && geometry) {
        let bbox: BoundingBox | null = null;
        if (geometry.type === 'Polygon') {
            bbox = getPolygonBBox(geometry.coordinates);
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(polygonCoords => {
                const polyBBox = getPolygonBBox(polygonCoords);
                bbox = bbox ? mergeBBoxes(bbox, polyBBox) : polyBBox;
            });
        }

        if (bbox) {
            // Add a small buffer to the bounding box to account for edge cases. 1 degree is large but safe.
            const buffer = 1.0; 
            regionBoundingBoxes[regionName] = [
                bbox[0] - buffer,
                bbox[1] - buffer,
                bbox[2] + buffer,
                bbox[3] + buffer
            ];
        }
    }
});

/**
 * Checks if a coordinate pair is within a given bounding box.
 * @param lat Latitude of the point.
 * @param lon Longitude of the point.
 * @param bbox The bounding box [minLon, minLat, maxLon, maxLat].
 * @returns True if the point is inside the box, false otherwise.
 */
function isCoordinateInBoundingBox(lat: number, lon: number, bbox: BoundingBox | undefined): boolean {
    if (!bbox) {
        return true; // If no bbox is defined for the region, we can't check, so we allow it.
    }
    const [minLon, minLat, maxLon, maxLat] = bbox;
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

export { regionBoundingBoxes, isCoordinateInBoundingBox };
