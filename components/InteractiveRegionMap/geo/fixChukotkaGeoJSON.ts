
export const fixChukotkaGeoJSON = (feature: any) => {
    const transformCoord = (coord: number[]) => {
        let [lon, lat] = coord;
        if (lon < 0) lon += 360;
        return [lon, lat];
    };
    const transformRing = (ring: number[][]) => ring.map(transformCoord);
    const transformPolygon = (coords: number[][][]) => coords.map(transformRing);
    if (feature.geometry.type === 'Polygon') {
        feature.geometry.coordinates = transformPolygon(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates = feature.geometry.coordinates.map(transformPolygon);
    }
    return feature;
};