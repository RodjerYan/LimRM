
import { useEffect, useCallback } from 'react';
import L from 'leaflet';
import { MapRefs, OverlayMode, MapPoint } from './types';
import { pointInFeature } from './geo/pointInFeature';

const MAX_INTERACTIVE_ACTIVE = 4000;

export const useActiveInteractiveMarkers = (
    refs: MapRefs,
    rebuildTick: number,
    overlayMode: OverlayMode,
    focusedRegionName: string | null,
    flyToClientKey: string | null,
) => {

    const createGroupPopupContent = useCallback((clients: MapPoint[]) => {
        const totalFact = clients.reduce((sum, c) => sum + (c.fact || 0), 0);
        const firstClient = clients[0];
        const sortedClients = [...clients].sort((a, b) => (b.fact || 0) - (a.fact || 0));

        const getBrandColor = (brand: string) => {
            const b = brand.toLowerCase();
            if (b.includes('sirius')) return 'bg-indigo-500';
            if (b.includes('ajo')) return 'bg-purple-500';
            if (b.includes('limkorm')) return 'bg-emerald-500';
            return 'bg-gray-500';
        };

        const listHtml = sortedClients.map(c => {
            const pct = totalFact > 0 ? ((c.fact || 0) / totalFact) * 100 : 0;
            const brandColor = getBrandColor(c.brand || '');
            return `
            <div class="flex items-start justify-between py-2 border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors px-1 rounded-md">
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-8 h-8 rounded-lg ${brandColor} bg-opacity-20 text-gray-700 flex items-center justify-center font-bold text-xs border border-gray-200 flex-shrink-0">
                        ${(c.brand || '?').charAt(0).toUpperCase()}
                    </div>
                    <div class="min-w-0">
                        <div class="font-bold text-gray-900 text-xs truncate" title="${c.brand} ${c.packaging || ''}">${c.brand} <span class="font-normal text-gray-500">${c.packaging || ''}</span></div>
                        <div class="text-[10px] text-gray-500 truncate">${c.type || 'Канал не указан'}</div>
                    </div>
                </div>
                <div class="text-right pl-2 flex-shrink-0">
                    <div class="font-mono font-bold text-emerald-600 text-xs whitespace-nowrap">${new Intl.NumberFormat('ru-RU').format(c.fact || 0)}</div>
                    <div class="w-12 h-1 bg-gray-200 rounded-full mt-1 ml-auto overflow-hidden">
                        <div class="h-full ${brandColor} transition-all" style="width: ${pct}%"></div>
                    </div>
                </div>
            </div>
        `}).join('');

        return `
        <div class="popup-inner-content" style="min-width: 280px; padding: 0;">
            <div style="background: white; padding: 12px; border-bottom: 1px solid #e5e7eb; border-radius: 8px 8px 0 0;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 700;">
                        ${firstClient.city || 'Город не определен'}
                    </div>
                    <span style="background: #ecfdf5; color: #059669; font-size: 9px; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0; font-weight: 700; text-transform: uppercase;">Активен</span>
                </div>
                <div style="font-weight: 700; color: #111827; font-size: 13px; line-height: 1.4; word-break: break-word;">
                    ${firstClient.address}
                </div>
                <div style="margin-top: 6px; display: flex; gap: 8px;">
                     <div style="font-size: 10px; color: #4b5563; background: #f3f4f6; padding: 2px 6px; rounded: 4px;">
                        Клиентов: <strong style="color: #111827;">${clients.length}</strong>
                    </div>
                </div>
            </div>
            <div class="custom-scrollbar" style="max-height: 180px; overflow-y: auto; padding: 8px 12px; background: white;">
                ${listHtml}
            </div>
            <div style="background: #f9fafb; padding: 10px 12px; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Всего продажи</span>
                    <span style="font-size: 16px; color: #059669; font-weight: 800; font-family: monospace;">
                        ${new Intl.NumberFormat('ru-RU').format(totalFact)} <span style="font-size: 12px; font-weight: 600;">кг</span>
                    </span>
                </div>
                <div data-popup-edit data-key="${encodeURIComponent(String(firstClient.key))}"></div>
            </div>
        </div>
        `;
    }, []);

    useEffect(() => {
        const map = refs.mapInstance.current;
        if (!map) return;
        
        let renderer = (L as any).activeRenderer;
        if (!renderer) {
             renderer = L.canvas({ pane: 'activeMarkersPane' });
             (L as any).activeRenderer = renderer;
        }

        if (!refs.activeInteractiveLayer.current) {
             refs.activeInteractiveLayer.current = L.layerGroup().addTo(map);
             if (refs.layerControl.current) refs.layerControl.current.addOverlay(refs.activeInteractiveLayer.current, '<span class="text-emerald-500 font-bold">●</span> Активные ТТ');
        } else {
             refs.activeInteractiveLayer.current.clearLayers();
        }
        
        refs.activeMarkersByKey.current.clear();
        
        const bounds = map.getBounds();
        const reps = refs.activeReps.current;
        const feature = refs.focusedFeature.current;
        
        let count = 0;
        
        for (let i = 0; i < reps.length; i++) {
            if (count >= MAX_INTERACTIVE_ACTIVE) break;

            const { lat, lon, groupKey, rep } = reps[i];
            
            if (!bounds.contains([lat, lon])) continue;

            if (focusedRegionName) {
                const fastMatch = (rep.region || '').toString().toLowerCase().includes(focusedRegionName.toLowerCase());
                if (!fastMatch) continue;
                if (feature && !pointInFeature(lat, lon, feature)) continue;
             }

            count++;

            const groupClients = refs.activeGroups.current.get(groupKey) || [rep];
            const popupContent = createGroupPopupContent(groupClients);
            
            // Invisible marker for interaction
            const marker = L.circleMarker([lat, lon], {
                opacity: 0,
                fillOpacity: 0,
                radius: groupClients.length > 1 ? 10 : 8, // Hit area size
                pane: 'activeMarkersPane',
                renderer: renderer
            }).bindPopup(popupContent, { minWidth: 280, maxWidth: 320 });
            
            marker.on('click', L.DomEvent.stopPropagation);
            marker.on('mousedown', L.DomEvent.stopPropagation);
            marker.on('touchstart', L.DomEvent.stopPropagation);
            
            refs.activeInteractiveLayer.current.addLayer(marker);
            refs.activeMarkersByKey.current.set(String(rep.key), marker);
        }

    }, [rebuildTick, overlayMode, focusedRegionName, createGroupPopupContent]);

    useEffect(() => {
        if (flyToClientKey && refs.mapInstance.current && refs.activeMarkersByKey.current.has(flyToClientKey)) {
            const marker = refs.activeMarkersByKey.current.get(flyToClientKey) as L.CircleMarker;
            if (marker) {
                refs.mapInstance.current.flyTo(marker.getLatLng(), 16, { animate: true, duration: 1 });
                setTimeout(() => marker.openPopup(), 1000);
            }
        }
    }, [flyToClientKey]);
};