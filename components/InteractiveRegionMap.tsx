
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
// FIX: Added import for ReactDOM to resolve UMD global error.
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../../types';
import { getMarketData } from '../utils/marketData';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon, CheckIcon } from './icons';
import type { FeatureCollection } from 'geojson';
import { MANUAL_BOUNDARIES } from '../data/manual_boundaries';

type Theme = 'dark' | 'light';
type OverlayMode = 'sales' | 'pets' | 'competitors' | 'age' | 'abc';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    potentialClients: OkbDataRow[];
    activeClients: MapPoint[];
    flyToClientKey: string | null;
    theme?: Theme;
    onToggleTheme?: () => void;
    onEditClient: (client: MapPoint) => void;
}

interface SearchableLocation {
    name: string;
    type: 'region';
}

const findValueInRow = (row: OkbDataRow, keywords: string[]): string => {
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().includes(keyword));
        if (foundKey && row[foundKey]) {
            return String(row[foundKey]);
        }
    }
    return '';
};

// Robust coordinate parser helper
const parseCoord = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val === 0 ? null : val;
    const str = String(val).trim().replace(',', '.');
    if (str === '' || str === '0' || str === '0.0') return null;
    const num = parseFloat(str);
    return isNaN(num) || num === 0 ? null : num;
};

// Robust key finder for coordinates with deep lookup
const getCoordinate = (item: any, keys: string[]) => {
    if (!item) return null;
    
    const isValid = (val: any) => {
        if (val === undefined || val === null || val === '') return false;
        if (typeof val === 'number') return val !== 0;
        if (typeof val === 'string') return val !== '0' && val !== '0.0';
        return true;
    };

    for (const key of keys) {
        if (isValid(item[key])) return item[key];
        const lowerKey = key.toLowerCase();
        const foundKey = Object.keys(item).find(k => k.toLowerCase() === lowerKey);
        if (foundKey && isValid(item[foundKey])) return item[foundKey];
    }

    const original = item.originalRow || item.rowData;
    if (original && typeof original === 'object') {
        for (const key of keys) {
            const lowerKey = key.toLowerCase();
            const foundKey = Object.keys(original).find(k => k.toLowerCase() === lowerKey);
            if (foundKey && isValid(original[foundKey])) return original[foundKey];
        }
    }
    return null;
};

const fixChukotkaGeoJSON = (feature: any) => {
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

const MapLegend: React.FC<{ mode: OverlayMode }> = ({ mode }) => {
    if (mode === 'abc') {
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">
                    ABC Анализ (Вклад)
                </h4>
                <div className="space-y-1.5">
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.6)]"></span>
                        <span className="text-xs font-bold text-amber-400">A (80% Выручки)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.6)]"></span>
                        <span className="text-xs font-medium text-emerald-400">B (15% Выручки)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-gray-500"></span>
                        <span className="text-xs text-gray-400">C (5% Выручки)</span>
                    </div>
                </div>
            </div>
        );
    }
    if (mode === 'pets') {
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">
                    Плотность питомцев
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#10b981', opacity: 0.7}}></span>
                        <span className="text-xs">Высокая (&gt;80)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f59e0b', opacity: 0.5}}></span>
                        <span className="text-xs">Средняя (50-80)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#6b7280', opacity: 0.3}}></span>
                        <span className="text-xs">Низкая (&lt;50)</span>
                    </div>
                </div>
            </div>
        );
    }
    if (mode === 'competitors') {
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">
                    Конкуренция
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#ef4444', opacity: 0.7}}></span>
                        <span className="text-xs">Агрессивная (&gt;80)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f97316', opacity: 0.5}}></span>
                        <span className="text-xs">Умеренная (50-80)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#3b82f6', opacity: 0.3}}></span>
                        <span className="text-xs">Слабая (&lt;50)</span>
                    </div>
                </div>
            </div>
        );
    }
    if (mode === 'age') {
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">
                    Возраст владельцев
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#10b981', opacity: 0.7}}></span>
                        <span className="text-xs">Молодые (&lt;35)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f59e0b', opacity: 0.5}}></span>
                        <span className="text-xs">Средний (35-45)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#8b5cf6', opacity: 0.5}}></span>
                        <span className="text-xs">Старший (&gt;45)</span>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
            <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted">Легенда</h4>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-4 h-2 mr-2 border border-gray-500 bg-transparent"></span>
                <span className="text-xs font-medium">Граница региона</span>
            </div>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.6)]"></span>
                <span className="text-xs font-medium">Активные ТТ</span>
            </div>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.6)]"></span>
                <span className="text-xs font-medium">Потенциал (ОКБ)</span>
            </div>
        </div>
    );
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, flyToClientKey, theme = 'dark', onEditClient }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const potentialClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const layerControl = useRef<L.Control.Layers | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const activeClientMarkersRef = useRef<Map<string, L.Layer>>(new Map());
    const legendContainerRef = useRef<HTMLDivElement | null>(null);
    
    const activeClientsDataRef = useRef<MapPoint[]>(activeClients);
    const onEditClientRef = useRef(onEditClient);

    const highlightedLayer = useRef<L.Layer | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);
    
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [isLoadingGeo, setIsLoadingGeo] = useState(true);
    
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    useEffect(() => {
        const fetchGeoData = async () => {
             setIsLoadingGeo(true);
            try {
                let features = MANUAL_BOUNDARIES.map((feature: any) => {
                    if (feature.properties.name === "Чукотский автономный округ") {
                        return fixChukotkaGeoJSON(feature);
                    }
                    return feature;
                });
                setGeoJsonData({ type: 'FeatureCollection', features } as FeatureCollection);
            } catch (error) {
                console.error("Error processing GeoJSON data:", error);
            } finally {
                setIsLoadingGeo(false);
            }
        };
        fetchGeoData();
    }, []);

    useEffect(() => { activeClientsDataRef.current = activeClients; }, [activeClients]);
    useEffect(() => { onEditClientRef.current = onEditClient; }, [onEditClient]);

    const searchableLocations = useMemo<SearchableLocation[]>(() => {
        if (!geoJsonData || !geoJsonData.features) return [];
        return geoJsonData.features.map((f: any) => ({
            name: f.properties?.name || 'Unknown',
            type: 'region'
        })).sort((a,b) => a.name.localeCompare(b.name));
    }, [geoJsonData]);

    useEffect(() => {
        if (searchTerm.trim().length > 1) {
            const lower = searchTerm.toLowerCase();
            setSearchResults(searchableLocations.filter(loc => loc.name.toLowerCase().includes(lower)));
        } else { setSearchResults([]); }
    }, [searchTerm, searchableLocations]);

    // FIX: Replaced stubbed-out function with a full implementation that returns the correct L.PathOptions type.
    const getStyleForRegion = useCallback((feature: any): L.PathOptions => {
        const regionName = feature.properties.name;
        const isSelected = selectedRegions.includes(regionName);

        const baseStyle: L.PathOptions = {
            weight: isSelected ? 2.5 : 1,
            color: isSelected ? (localTheme === 'dark' ? '#f59e0b' : '#d97706') : (localTheme === 'dark' ? '#4f46e5' : '#6366f1'),
            opacity: isSelected ? 1.0 : 0.6,
            fillOpacity: 0.1,
            fillColor: isSelected ? '#f59e0b' : '#4f46e5',
        };

        if (overlayMode !== 'sales' && overlayMode !== 'abc') {
            const marketData = getMarketData(regionName);
            let overlayColor = '#6b7280'; // default gray
            let fillOpacity = 0.3;

            switch (overlayMode) {
                case 'pets':
                    if (marketData.petDensityIndex > 80) { overlayColor = '#10b981'; fillOpacity = 0.7; }
                    else if (marketData.petDensityIndex > 50) { overlayColor = '#f59e0b'; fillOpacity = 0.5; }
                    break;
                case 'competitors':
                    if (marketData.competitorDensityIndex > 80) { overlayColor = '#ef4444'; fillOpacity = 0.7; }
                    else if (marketData.competitorDensityIndex > 50) { overlayColor = '#f97316'; fillOpacity = 0.5; }
                    else { overlayColor = '#3b82f6'; }
                    break;
                case 'age':
                    if (marketData.avgOwnerAge < 35) { overlayColor = '#10b981'; fillOpacity = 0.7; }
                    else if (marketData.avgOwnerAge < 45) { overlayColor = '#f59e0b'; fillOpacity = 0.5; }
                    else { overlayColor = '#8b5cf6'; fillOpacity = 0.5; }
                    break;
            }

            baseStyle.fillColor = overlayColor;
            baseStyle.fillOpacity = isSelected ? fillOpacity + 0.2 : fillOpacity;
            baseStyle.color = isSelected ? '#ffffff' : overlayColor;
            baseStyle.weight = isSelected ? 2 : 0.5;
            baseStyle.opacity = isSelected ? 1 : 0.8;
        }

        return baseStyle;
    }, [selectedRegions, localTheme, overlayMode]);
    
    // FIX: Implemented stubbed-out functions for map highlighting and selection logic.
    const resetHighlight = useCallback((e?: L.LeafletEvent) => {
        if (highlightedLayer.current && geoJsonLayer.current) {
            // Type assertion to access resetStyle
            (geoJsonLayer.current as any).resetStyle(highlightedLayer.current);
            highlightedLayer.current = null;
        }
    }, []); 

    const highlightRegion = useCallback((layer: L.Layer) => {
        if (highlightedLayer.current) {
            resetHighlight();
        }
        const targetLayer = layer as L.Path;
        if (targetLayer && targetLayer.setStyle) {
            targetLayer.setStyle({
                weight: 3,
                color: '#ffffff',
                dashArray: '',
                fillOpacity: 0.4
            });
            if (!L.Browser.ie) {
                targetLayer.bringToFront();
            }
            highlightedLayer.current = targetLayer;
        }
    }, [resetHighlight]);

    const handleLocationSelect = useCallback((location: SearchableLocation) => {
        setSearchTerm('');
        setSearchResults([]);
        if (geoJsonLayer.current && mapInstance.current) {
            let targetLayer: any = null;
            geoJsonLayer.current.eachLayer((layer: any) => {
                if (layer.feature.properties.name === location.name) {
                    targetLayer = layer;
                }
            });
            if (targetLayer) {
                mapInstance.current.fitBounds(targetLayer.getBounds());
                highlightRegion(targetLayer);
            }
        }
    }, [highlightRegion]);

    useEffect(() => {
        const map = mapInstance.current;
        if (map) { const timer = setTimeout(() => map.invalidateSize(true), 200); return () => clearTimeout(timer); }
    }, [data, isFullscreen]);
    
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, { center: [55, 60], zoom: 3, minZoom: 2, scrollWheelZoom: true, preferCanvas: true, worldCopyJump: true, zoomControl: false, attributionControl: false });
            mapInstance.current = map;
            
            map.createPane('regionsPane');
            map.getPane('regionsPane')!.style.zIndex = '400';
            map.createPane('markersPane');
            map.getPane('markersPane')!.style.zIndex = '600'; 

            L.control.zoom({ position: 'topleft' }).addTo(map);
            layerControl.current = L.control.layers({}, {}, { position: 'bottomleft' }).addTo(map);

            const legend = new (L.Control.extend({
                onAdd: function() { const div = L.DomUtil.create('div', 'info legend'); legendContainerRef.current = div; return div; },
                onRemove: function() { legendContainerRef.current = null; }
            }))({ position: 'bottomright' });
            
            legend.addTo(map);
            map.on('click', resetHighlight);

            // --- NATIVE LEAFLET EVENT HANDLING FOR POPUP BUTTONS ---
            // FIX: Changed event type from L.LeafletMouseEvent to generic Event for DOM event handling and corrected target access.
            const onPopupClick = (e: Event) => {
                const target = e.target as HTMLElement;
                const button = target.closest('.leaflet-popup-edit-button');
                if (!button) return;

                const key = button.getAttribute('data-key');
                if (key) {
                    const client = activeClientsDataRef.current.find(c => c.key === key);
                    if (client) {
                        map.closePopup();
                        setIsFullscreen(false);
                        onEditClientRef.current(client);
                    }
                }
            };
            
            map.on('popupopen', (e) => {
                const popupNode = e.popup.getElement();
                if (popupNode) {
                    // FIX: Corrected event handling for Leaflet DOM events.
                    L.DomEvent.on(popupNode, 'click', onPopupClick as L.LeafletEventHandlerFn);
                }
            });

            map.on('popupclose', (e) => {
                const popupNode = e.popup.getElement();
                if (popupNode) {
                    // FIX: Corrected event handling for Leaflet DOM events.
                    L.DomEvent.off(popupNode, 'click', onPopupClick as L.LeafletEventHandlerFn);
                }
            });
        }
        return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; tileLayerRef.current = null; } };
    }, []); 

    useEffect(() => {
        if (legendContainerRef.current) {
             const rootEl = document.createElement('div');
             legendContainerRef.current.appendChild(rootEl);
             // FIX: Corrected createRoot call by using the imported ReactDOM.
             const root = ReactDOM.createRoot(rootEl);
             root.render(<MapLegend mode={overlayMode} />);
             return () => { root.unmount(); if(legendContainerRef.current) legendContainerRef.current.innerHTML = ''; };
        }
    }, [overlayMode]);

    useEffect(() => {
        const map = mapInstance.current;
        if (mapContainer.current && map) {
            const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
            const lightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            const targetUrl = localTheme === 'dark' ? darkUrl : lightUrl;
            if (tileLayerRef.current) { tileLayerRef.current.setUrl(targetUrl); } else { tileLayerRef.current = L.tileLayer(targetUrl, { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map); tileLayerRef.current.bringToBack(); }
            if (mapContainer.current) { mapContainer.current.classList.remove('theme-dark', 'theme-light'); mapContainer.current.classList.add(`theme-${localTheme}`); }
            setTimeout(() => map.invalidateSize(), 100);
        }
    }, [localTheme]);
    
    const createPopupContent = (name: string, address: string, type: string, contacts: string | undefined, key: string, abcCategory?: string) => {
        let badge = '';
        if (abcCategory === 'A') badge = '<span class="px-2 py-0.5 rounded bg-amber-500 text-black font-bold text-xs ml-2">A</span>';
        else if (abcCategory === 'B') badge = '<span class="px-2 py-0.5 rounded bg-emerald-500 text-white font-bold text-xs ml-2">B</span>';
        else if (abcCategory === 'C') badge = '<span class="px-2 py-0.5 rounded bg-gray-500 text-white font-bold text-xs ml-2">C</span>';

        const buttonHtml = `
            <button
                data-key="${key}"
                class="leaflet-popup-edit-button mt-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1.5 px-3 rounded text-xs transition-colors flex items-center justify-center gap-2"
            >
                <svg class="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                <span class="pointer-events-none">Редактировать данные</span>
            </button>
        `;

        return `
            <div class="popup-inner-content">
                <div class="flex items-center mb-1"><b>${name}</b>${badge}</div>
                ${address}<br><small>${type || 'н/д'}</small>
                ${contacts ? `<hr style="margin: 5px 0;"/><small>Контакты: ${contacts}</small>` : ''}
                ${buttonHtml}
            </div>
        `;
    };
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;
        
        const markersRenderer = L.canvas({ pane: 'markersPane' });

        if (potentialClientMarkersLayer.current) { map.removeLayer(potentialClientMarkersLayer.current); layerControl.current.removeLayer(potentialClientMarkersLayer.current); }
        potentialClientMarkersLayer.current = L.layerGroup();
        if (activeClientMarkersLayer.current) { map.removeLayer(activeClientMarkersLayer.current); layerControl.current.removeLayer(activeClientMarkersLayer.current); }
        activeClientMarkersLayer.current = L.layerGroup(); activeClientMarkersRef.current.clear();
    
        const pointsForBounds: L.LatLngExpression[] = [];

        if (overlayMode !== 'abc') {
            potentialClients.forEach(tt => {
                const rawLat = getCoordinate(tt, ['lat', 'latitude', 'широта', 'y', 'geo_lat']);
                const rawLon = getCoordinate(tt, ['lon', 'lng', 'longitude', 'долгота', 'x', 'geo_lon']);
                const lat = parseCoord(rawLat);
                let lon = parseCoord(rawLon);
                if (lat !== null && lon !== null) {
                    if (lon < -170) lon += 360;
                    const popupContent = `<b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br><small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>`;
                    const marker = L.circleMarker([lat, lon], {
                        fillColor: '#3b82f6', color: '#1d4ed8', weight: 1, opacity: 0.8, fillOpacity: 0.6, radius: 4, pane: 'markersPane', renderer: markersRenderer
                    }).bindPopup(popupContent);
                    potentialClientMarkersLayer.current?.addLayer(marker);
                }
            });
        }

        const sortedActiveClients = [...activeClients];
        if (overlayMode === 'abc') {
             const priority: Record<string, number> = { 'A': 3, 'B': 2, 'C': 1 };
             sortedActiveClients.sort((a, b) => {
                 const pA = priority[a.abcCategory || 'C'] || 1;
                 const pB = priority[b.abcCategory || 'C'] || 1;
                 return pA - pB;
             });
        }

        sortedActiveClients.forEach(tt => {
            const rawLat = getCoordinate(tt, ['lat', 'latitude']);
            const rawLon = getCoordinate(tt, ['lon', 'lng', 'longitude']);
            const lat = parseCoord(rawLat);
            let lon = parseCoord(rawLon);
            if (lat !== null && lon !== null) {
                if (lon < -170) lon += 360;
                pointsForBounds.push([lat, lon]);
                const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts, tt.key, tt.abcCategory);
                let markerColor = '#10b981'; let markerBorder = '#047857'; let markerRadius = 5;
                if (overlayMode === 'abc') {
                    switch (tt.abcCategory) {
                        case 'A': markerColor = '#f59e0b'; markerBorder = '#b45309'; markerRadius = 7; break;
                        case 'B': markerColor = '#10b981'; markerBorder = '#047857'; markerRadius = 5; break;
                        default: markerColor = '#9ca3af'; markerBorder = '#4b5563'; markerRadius = 3; break;
                    }
                }
                const marker = L.circleMarker([lat, lon], {
                    fillColor: markerColor, color: markerBorder, weight: 1, opacity: 1, fillOpacity: 0.8, radius: markerRadius, pane: 'markersPane', renderer: markersRenderer
                }).bindPopup(popupContent, { maxWidth: 300 });
                activeClientMarkersLayer.current?.addLayer(marker);
                activeClientMarkersRef.current.set(tt.key, marker);
            }
        });

        if (overlayMode !== 'abc') potentialClientMarkersLayer.current.addTo(map);
        activeClientMarkersLayer.current.addTo(map);
        
        if (overlayMode !== 'abc') layerControl.current.addOverlay(potentialClientMarkersLayer.current, '<span class="text-blue-400 font-bold">●</span> Потенциал (ОКБ)');
        layerControl.current.addOverlay(activeClientMarkersLayer.current, '<span class="text-emerald-400 font-bold">●</span> Активные ТТ');

        if (pointsForBounds.length > 0 && !flyToClientKey) { map.fitBounds(L.latLngBounds(pointsForBounds).pad(0.1)); }
    }, [potentialClients, activeClients, overlayMode]);

    useEffect(() => {
        if (geoJsonData && mapInstance.current && geoJsonLayer.current === null) {
            // FIX: Corrected style property to conform to Leaflet's GeoJSON options.
            geoJsonLayer.current = L.geoJSON(geoJsonData as any, { 
                style: getStyleForRegion, 
                onEachFeature: (feature, layer) => { 
                    layer.on({ 
                        click: (e) => { 
                            L.DomEvent.stopPropagation(e); 
                            mapInstance.current?.fitBounds((e.target as L.Path).getBounds()); 
                            highlightRegion(layer); 
                        } 
                    }); 
                    if (feature.properties && feature.properties.name) { 
                        const name = feature.properties.name; 
                        layer.bindTooltip(name, { permanent: false, direction: 'center', className: 'region-tooltip' }); 
                    } 
                }, 
                pane: 'regionsPane' 
            }).addTo(mapInstance.current);
        } else if (geoJsonLayer.current) {
            // FIX: Corrected setStyle call to conform to Leaflet's API.
            geoJsonLayer.current.setStyle(getStyleForRegion);
        }
    }, [geoJsonData, selectedRegions, localTheme, overlayMode, getStyleForRegion, highlightRegion]);

    useEffect(() => {
        if (flyToClientKey && mapInstance.current && activeClientMarkersRef.current.has(flyToClientKey)) {
            const marker = activeClientMarkersRef.current.get(flyToClientKey) as L.CircleMarker;
            if (marker) {
                mapInstance.current.flyTo(marker.getLatLng(), 16, { animate: true, duration: 1 });
                setTimeout(() => marker.openPopup(), 1000);
            }
        }
    }, [flyToClientKey]);

    return (
        <div className={`relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl transition-all duration-500 ${isFullscreen ? 'fixed inset-0 z-[100] h-screen' : 'h-[600px] group'}`}>
            <div ref={mapContainer} className="h-full w-full bg-[#111827]" />
            
            <div className="absolute top-4 left-14 z-[400] w-72">
                <div className="relative group/search">
                    <input type="text" placeholder="Поиск региона..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-900/90 backdrop-blur-md text-white px-4 py-2.5 rounded-xl border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 outline-none shadow-lg transition-all pl-10 text-sm" />
                    <div className="absolute left-3 top-2.5 text-gray-400"><SearchIcon small /></div>
                    {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 w-full mt-2 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                            {searchResults.map((res, idx) => (
                                <div key={idx} onClick={() => handleLocationSelect(res)} className="px-4 py-2.5 hover:bg-indigo-600/30 cursor-pointer text-sm text-gray-200 border-b border-white/5 last:border-0 transition-colors flex items-center justify-between">
                                    <span>{res.name}</span><span className="text-[10px] uppercase text-gray-500 font-bold bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">Регион</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
                <button onClick={() => setLocalTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-2.5 bg-gray-900/90 backdrop-blur-md rounded-xl border border-white/10 text-white hover:bg-gray-800 transition-all shadow-lg active:scale-95" title="Сменить тему">
                    {localTheme === 'dark' ? <SunIcon small /> : <MoonIcon small />}
                </button>
                <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2.5 bg-gray-900/90 backdrop-blur-md rounded-xl border border-white/10 text-white hover:bg-gray-800 transition-all shadow-lg active:scale-95" title={isFullscreen ? "Свернуть" : "На весь экран"}>
                    {isFullscreen ? <MinimizeIcon small /> : <MaximizeIcon small />}
                </button>
            </div>

            <div className="absolute bottom-8 left-24 z-[400] flex gap-2">
                <div className="bg-gray-900/90 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-xl flex">
                    {(['sales', 'pets', 'competitors', 'age', 'abc'] as OverlayMode[]).map(mode => (
                        <button key={mode} onClick={() => setOverlayMode(mode)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${overlayMode === mode ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                            {mode === 'sales' ? 'Продажи' : mode === 'pets' ? 'Питомцы' : mode === 'competitors' ? 'Конкуренты' : mode === 'age' ? 'Возраст' : 'ABC'}
                        </button>
                    ))}
                </div>
            </div>

            {isLoadingGeo && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                        <LoaderIcon className="w-8 h-8 text-indigo-500" />
                        <span className="text-white font-bold text-sm">Загрузка геометрии...</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InteractiveRegionMap;
