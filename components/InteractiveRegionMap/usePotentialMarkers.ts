
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapRefs, OverlayMode, OkbDataRow } from './types';
import { pointInFeature } from './geo/pointInFeature';
import { parseCoord, getCoordinate } from './utils/coords';
import { findValueInRow } from './utils/findValueInRow';

const BATCH_SIZE = 800;

export const usePotentialMarkers = (
    refs: MapRefs,
    potentialClients: OkbDataRow[],
    overlayMode: OverlayMode,
    focusedRegionName: string | null
) => {
    const renderJobIdRef = useRef(0);

    useEffect(() => {
        const map = refs.mapInstance.current;
        if (!map || !refs.layerControl.current) return;
        
        const standardRenderer = L.canvas({ pane: 'markersPane' });

        if (!refs.potentialLayer.current) {
            refs.potentialLayer.current = L.layerGroup().addTo(map);
            if (overlayMode !== 'abc') refs.layerControl.current.addOverlay(refs.potentialLayer.current, '<span class="text-blue-500 font-bold">●</span> Потенциал (ОКБ)');
        } else {
            refs.potentialLayer.current.clearLayers();
        }

        const fastRegionMatch = (client: any) => {
            if (!focusedRegionName) return true;
            const r = (client.region || client.oblast || client.regionName || '').toString().toLowerCase();
            return r.includes(focusedRegionName.toLowerCase());
        };

        const shouldShowPoint = (lat: number, lon: number, raw?: any) => {
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
            if (raw && !fastRegionMatch(raw)) return false;
            const feature = refs.focusedFeature.current;
            if (!feature || !focusedRegionName) return true;
            return pointInFeature(lat, lon, feature);
        };

        renderJobIdRef.current += 1;
        const jobId = renderJobIdRef.current;

        if (overlayMode !== 'abc') {
             let i = 0;
             const renderBatch = () => {
                 if (renderJobIdRef.current !== jobId) return;
                 const end = Math.min(i + BATCH_SIZE, potentialClients.length);
                 for (; i < end; i++) {
                     const tt = potentialClients[i];
                     let lat = tt.lat;
                     let lon = tt.lon;

                     if (!lat || !lon || lat === 0 || lon === 0) {
                         const rawLat = getCoordinate(tt, ['lat', 'latitude', 'широта', 'y', 'geo_lat']);
                         const rawLon = getCoordinate(tt, ['lon', 'lng', 'longitude', 'долгота', 'x', 'geo_lon']);
                         lat = parseCoord(rawLat) || 0;
                         lon = parseCoord(rawLon) || 0;
                     }

                     if (lat !== 0 && lon !== 0) {
                         if (lon < -170) lon += 360;
                         if (shouldShowPoint(lat, lon, tt)) {
                             const popupContent = `<b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br><small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>`;
                             
                             // FIX: Enable bubblingMouseEvents so hover works on regions underneath
                             const marker = L.circleMarker([lat, lon], {
                                 fillColor: '#3b82f6', color: '#1d4ed8', weight: 1, opacity: 0.8, fillOpacity: 0.6, radius: 4, 
                                 pane: 'markersPane', 
                                 renderer: standardRenderer,
                                 bubblingMouseEvents: true 
                             }).bindPopup(popupContent);
                             
                             // Stop propagation ONLY for clicks to prevent map click handler from triggering
                             marker.on('click', L.DomEvent.stopPropagation);
                             marker.on('mousedown', L.DomEvent.stopPropagation);
                             marker.on('touchstart', L.DomEvent.stopPropagation);
                             
                             refs.potentialLayer.current?.addLayer(marker);
                         }
                     }
                 }
                 if (i < potentialClients.length) {
                     requestAnimationFrame(renderBatch);
                 }
             };
             requestAnimationFrame(renderBatch);
        }
    }, [potentialClients, overlayMode, focusedRegionName]);
};