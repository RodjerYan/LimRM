
// --- GEO HELPERS (Point in Polygon) ---
export const pointInRing = (pt: [number, number], ring: number[][]) => {
    // pt: [lon, lat]
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
            (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

export const pointInPolygonCoords = (pt: [number, number], polygon: number[][][]) => {
    // polygon: [outerRing, hole1, hole2, ...]
    if (!polygon?.length) return false;
    if (!pointInRing(pt, polygon[0])) return false;
    for (let h = 1; h < polygon.length; h++) {
        if (pointInRing(pt, polygon[h])) return false; // hole
    }
    return true;
};

export const pointInFeature = (lat: number, lon: number, feature: any) => {
    if (!feature?.geometry) return false;
    const pt: [number, number] = [lon, lat];
    const g = feature.geometry;

    if (g.type === 'Polygon') return pointInPolygonCoords(pt, g.coordinates);
    if (g.type === 'MultiPolygon') {
        return (g.coordinates || []).some((poly: any) => pointInPolygonCoords(pt, poly));
    }
    return false;
};