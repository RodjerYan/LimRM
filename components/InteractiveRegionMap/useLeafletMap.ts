
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import { MapRefs, Theme, MapPoint } from './types';
import { createActiveCanvasLayer } from './leaflet/ActiveCanvasLayer';
import { PopupButton } from './PopupButton';

export const useLeafletMap = (
    mapContainer: React.RefObject<HTMLDivElement>, 
    props: {
        theme: Theme,
        activeClientsDataRef: React.MutableRefObject<MapPoint[]>,
        onEditClientRef: React.MutableRefObject<(client: MapPoint) => void>,
        onMapClick?: () => void,
        onRebuildTick?: () => void
    }
) => {
    // Consolidated Refs
    const refs: MapRefs = {
        mapInstance: useRef<L.Map | null>(null),
        geoJsonLayer: useRef<L.GeoJSON | null>(null),
        layerControl: useRef<L.Control.Layers | null>(null),
        tileLayer: useRef<L.TileLayer | null>(null),
        potentialLayer: useRef<L.LayerGroup | null>(null),
        activeInteractiveLayer: useRef<L.LayerGroup | null>(null),
        activeCanvasLayer: useRef<any | null>(null),
        focusedFeature: useRef<any | null>(null),
        scheduleCanvasRedrawRef: useRef<() => void>(() => {}),
        activeGroups: useRef<Map<string, MapPoint[]>>(new Map()),
        activeReps: useRef<Array<{ key: string; groupKey: string; lat: number; lon: number; rep: MapPoint }>>([]),
        activeMarkersByKey: useRef<Map<string, L.Layer>>(new Map()),
        activeCanvasPoints: useRef<Array<{ lat: number; lon: number; color: string; r: number }>>([]),
        legendContainer: useRef<HTMLDivElement | null>(null)
    };

    const [isReady, setIsReady] = useState(false);

    // Initialization
    useEffect(() => {
        if (mapContainer.current && !refs.mapInstance.current) {
            const map = L.map(mapContainer.current, { 
                center: [55, 60], zoom: 3, minZoom: 2, 
                scrollWheelZoom: true, preferCanvas: true, 
                worldCopyJump: true, zoomControl: false, attributionControl: false 
            });
            refs.mapInstance.current = map;
            
            // Panes
            map.createPane('regionsPane');
            map.getPane('regionsPane')!.style.zIndex = '400';
            map.createPane('markersPane');
            map.getPane('markersPane')!.style.zIndex = '600'; 
            map.createPane('activeCanvasPane');
            map.getPane('activeCanvasPane')!.style.zIndex = '640'; // Below markers
            map.createPane('activeMarkersPane');
            map.getPane('activeMarkersPane')!.style.zIndex = '650';

            // Controls
            L.control.zoom({ position: 'topleft' }).addTo(map);
            refs.layerControl.current = L.control.layers({}, {}, { position: 'bottomleft' }).addTo(map);

            const legend = new (L.Control.extend({
                onAdd: function() { const div = L.DomUtil.create('div', 'info legend'); refs.legendContainer.current = div; return div; },
                onRemove: function() { refs.legendContainer.current = null; }
            }))({ position: 'bottomright' });
            legend.addTo(map);

            // Custom Canvas Layer
            if (!refs.activeCanvasLayer.current) {
                refs.activeCanvasLayer.current = createActiveCanvasLayer(map, 'activeCanvasPane', () => refs.scheduleCanvasRedrawRef.current());
                (refs.activeCanvasLayer.current as any).addTo(map);
            }

            // Events
            map.on('click', () => {
                if (props.onMapClick) props.onMapClick();
            });

            map.on('moveend zoomend', () => {
                if (props.onRebuildTick) props.onRebuildTick();
            });

            // React Popup Button mounting logic
            map.on('popupopen', (e) => {
                const popup = e.popup as any;
                const renderButton = () => {
                    const popupNode = popup.getElement();
                    if (!popupNode) return;
                    const placeholder = popupNode.querySelector('[data-popup-edit]');
                    if (!placeholder) return;
                    const rawKey = placeholder.getAttribute('data-key');
                    if (!rawKey) return;
                    const key = decodeURIComponent(rawKey);
                    
                    const client = props.activeClientsDataRef.current.find(c => String(c.key) === String(key));
                    if (!client) return;
                    
                    if (popup.__reactRoot) { popup.__reactRoot.unmount(); }
                    popup.__reactRoot = ReactDOM.createRoot(placeholder);
                    
                    // Use React.createElement to avoid JSX in .ts files
                    popup.__reactRoot.render(
                        React.createElement(PopupButton, { 
                            client: client, 
                            onEdit: (c: MapPoint) => { props.onEditClientRef.current(c); } 
                        })
                    );
                };
                renderButton();
                popup.once('contentupdate', renderButton);
                requestAnimationFrame(renderButton);
            });

            map.on('popupclose', (e) => {
                const popup = e.popup as any;
                if (popup.__reactRoot) { popup.__reactRoot.unmount(); popup.__reactRoot = null; }
            });

            setIsReady(true);
        }

        return () => {
             // Cleanup handled by parent mostly, but we can clean specifics here if needed
        };
    }, []);

    // Theme Effect
    useEffect(() => {
        const map = refs.mapInstance.current;
        if (mapContainer.current && map) {
            const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
            const lightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            const targetUrl = props.theme === 'dark' ? darkUrl : lightUrl;
            
            if (refs.tileLayer.current) { 
                refs.tileLayer.current.setUrl(targetUrl); 
            } else { 
                refs.tileLayer.current = L.tileLayer(targetUrl, { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map); 
                refs.tileLayer.current.bringToBack(); 
            }
            
            if (mapContainer.current) { 
                mapContainer.current.classList.remove('theme-dark', 'theme-light'); 
                mapContainer.current.classList.add(`theme-${props.theme}`); 
            }
            setTimeout(() => map.invalidateSize(), 100);
        }
    }, [props.theme, isReady]);

    // Cleanup Effect
    useEffect(() => {
        return () => {
            const map = refs.mapInstance.current;
            if (map) {
                if (refs.activeCanvasLayer.current) {
                    try { (refs.activeCanvasLayer.current as any).remove(); } catch(e) {}
                }
                // Cleanup layers
                if (refs.potentialLayer.current) refs.potentialLayer.current.clearLayers();
                if (refs.activeInteractiveLayer.current) refs.activeInteractiveLayer.current.clearLayers();
                
                const pane = map.getPane('activeCanvasPane');
                if (pane) pane.innerHTML = '';
                
                refs.geoJsonLayer.current = null;
                map.remove();
                refs.mapInstance.current = null;
            }
        };
    }, []);

    return { refs, isReady };
};