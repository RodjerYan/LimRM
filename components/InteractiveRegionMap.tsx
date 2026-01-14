
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { getMarketData } from '../utils/marketData';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon, CheckIcon } from './icons';
import type { FeatureCollection } from 'geojson';

type Theme = 'dark' | 'light';
type OverlayMode = 'sales' | 'pets' | 'competitors' | 'age';

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

// --- Helper Functions and Placeholders ---
const fixChukotkaGeoJSON = (data: FeatureCollection): FeatureCollection => data; // Placeholder as actual fix not needed for no-op data
const MANUAL_BOUNDARIES = {}; // Placeholder
const MapLegend = () => <div />; // Placeholder

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, flyToClientKey, theme = 'dark', onEditClient }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    // Fix: Use any for MarkerClusterGroup to bypass type missing error
    const potentialClientMarkersLayer = useRef<any | null>(null);
    const activeClientMarkersLayer = useRef<any | null>(null);
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
    const [isLoadingGeo, setIsLoadingGeo] = useState(false); // Default to false since we have no data
    const [isFromCache, setIsFromCache] = useState(false);
    
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    // --- Missing Functions Implementation ---
    const searchableLocations = useMemo<SearchableLocation[]>(() => {
        // Create unique list of regions from data
        const regions = Array.from(new Set(data.map(d => d.region))).filter(r => r !== 'Регион не определен').sort();
        return regions.map(r => ({ name: r, type: 'region' }));
    }, [data]);

    useEffect(() => {
        if (!searchTerm) {
            setSearchResults([]);
            return;
        }
        const results = searchableLocations.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()));
        setSearchResults(results);
    }, [searchTerm, searchableLocations]);

    const getStyleForRegion = (feature: any) => {
        // Placeholder style function
        return {
            fillColor: '#3b82f6',
            weight: 2,
            opacity: 1,
            color: 'white',
            dashArray: '3',
            fillOpacity: 0.2
        };
    };

    const resetHighlight = (e: any) => {
        if (geoJsonLayer.current) {
            geoJsonLayer.current.resetStyle(e.target);
        }
    };

    const highlightRegion = (e: any) => {
        const layer = e.target;
        layer.setStyle({
            weight: 5,
            color: '#666',
            dashArray: '',
            fillOpacity: 0.7
        });
        layer.bringToFront();
    };

    const handleLocationSelect = (loc: SearchableLocation) => {
        setSearchTerm(loc.name);
        setSearchResults([]);
        // Logic to fly to region would go here if we had bounds
        // For now, we just update the search term
        console.log("Selected region:", loc.name);
    };

    useEffect(() => { activeClientsDataRef.current = activeClients; }, [activeClients]);
    useEffect(() => { onEditClientRef.current = onEditClient; }, [onEditClient]);

    // Map Initialization
    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;

        const map = L.map(mapContainer.current, {
            center: [55.75, 37.61],
            zoom: 4,
            zoomControl: false,
            attributionControl: false
        });
        mapInstance.current = map;

        L.control.zoom({ position: 'topright' }).addTo(map);

        tileLayerRef.current = L.tileLayer(
            localTheme === 'dark' 
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', 
            { maxZoom: 18 }
        ).addTo(map);

        layerControl.current = L.control.layers(undefined, undefined, { position: 'topright' }).addTo(map);

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, []); // Run once

    // Theme Update
    useEffect(() => {
        if (tileLayerRef.current) {
            tileLayerRef.current.setUrl(
                localTheme === 'dark' 
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
            );
        }
    }, [localTheme]);
    
    const createPopupContent = (name: string, address: string, type: string, contacts: string | undefined, key: string) => `
        <div class="popup-inner-content">
            <b>${name}</b><br>${address}<br><small>${type || 'н/д'}</small>
            ${contacts ? `<hr style="margin: 5px 0;"/><small>Контакты: ${contacts}</small>` : ''}
            <button class="edit-location-btn mt-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1.5 px-3 rounded text-xs transition-colors flex items-center justify-center gap-2" data-key="${key}">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                Редактировать данные
            </button>
        </div>
    `;
    
    // --- OPTIMIZED MARKER RENDERING WITH CLUSTERS ---
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;

        // Cleanup old layers
        if (potentialClientMarkersLayer.current) { 
            map.removeLayer(potentialClientMarkersLayer.current); 
            layerControl.current.removeLayer(potentialClientMarkersLayer.current); 
        }
        if (activeClientMarkersLayer.current) { 
            map.removeLayer(activeClientMarkersLayer.current); 
            layerControl.current.removeLayer(activeClientMarkersLayer.current); 
        }
        activeClientMarkersRef.current.clear();

        // 1. Initialize Cluster Groups
        // We use L.markerClusterGroup from the plugin. 
        // chunkedLoading: true prevents UI freeze during initial addLayers.
        potentialClientMarkersLayer.current = (L as any).markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 80,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            iconCreateFunction: function (cluster: any) {
                const count = cluster.getChildCount();
                return L.divIcon({
                    html: `<div style="background-color: rgba(59, 130, 246, 0.8); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 2px solid white;">${count}</div>`,
                    className: 'marker-cluster-potential',
                    iconSize: L.point(30, 30)
                });
            }
        });

        activeClientMarkersLayer.current = (L as any).markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 60, // Tighter clusters for active clients
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            iconCreateFunction: function (cluster: any) {
                const count = cluster.getChildCount();
                return L.divIcon({
                    html: `<div style="background-color: rgba(34, 197, 94, 0.9); width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 2px solid white; box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);">${count}</div>`,
                    className: 'marker-cluster-active',
                    iconSize: L.point(35, 35)
                });
            }
        });
    
        // 2. Prepare markers (Batching isn't strictly needed for the cluster plugin as it handles it, but creating arrays first is cleaner)
        const potentialMarkers: L.Layer[] = [];
        potentialClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const popupContent = `<b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br><small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>`;
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    fillColor: '#3b82f6', color: '#2563eb', radius: 5, weight: 1, opacity: 1, fillOpacity: 0.8,
                    pane: 'markersPane'
                }).bindPopup(popupContent);
                potentialMarkers.push(marker);
            }
        });
        potentialClientMarkersLayer.current.addLayers(potentialMarkers);
    
        const activeMarkers: L.Layer[] = [];
        activeClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts, tt.key);
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    fillColor: '#22c55e', color: '#16a34a', radius: 6, weight: 2, opacity: 1, fillOpacity: 0.9,
                    pane: 'markersPane'
                }).bindPopup(popupContent);
                activeMarkers.push(marker);
                activeClientMarkersRef.current.set(tt.key, marker);
            }
        });
        activeClientMarkersLayer.current.addLayers(activeMarkers);
    
        // 3. Add to map based on mode
        if (overlayMode === 'sales') { 
            map.addLayer(potentialClientMarkersLayer.current); 
            map.addLayer(activeClientMarkersLayer.current); 
        }
        
        // 4. Update Controls
        layerControl.current.addOverlay(potentialClientMarkersLayer.current, "Потенциал (ОКБ)");
        layerControl.current.addOverlay(activeClientMarkersLayer.current, "Активные ТТ");

    }, [potentialClients, activeClients, data, overlayMode]);
    
    // GeoJSON Layer Placeholder Logic
    useEffect(() => {
        if (!geoJsonData || !mapInstance.current) return;
        // Logic to add geojson layer would go here if data was available
    }, [geoJsonData, overlayMode, localTheme]);

    return (
        <div id="interactive-map-container" className={`bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-indigo-500/10 transition-all duration-500 ease-in-out ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none p-0 bg-gray-900' : 'p-6 relative'}`}>
            {/* Same JSX as before */}
            <style>{`.leaflet-control-attribution { display: none !important; } .region-polygon { pointer-events: auto !important; }`}</style>
            <div className={`flex flex-col md:flex-row justify-between items-center mb-4 gap-4 ${isFullscreen ? 'absolute top-4 left-4 z-[1001] w-[calc(100%-5rem)] pointer-events-none' : ''}`}>
               {/* Header and Controls from original file... */}
               <div className="flex items-center gap-3 pointer-events-auto">
                    <h2 className={`text-xl font-bold text-text-main whitespace-nowrap drop-shadow-md ${isFullscreen ? 'bg-card-bg/80 px-4 py-2 rounded-lg backdrop-blur-md border border-gray-700' : ''}`}>Карта рыночного потенциала</h2>
                    {isLoadingGeo ? (
                        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-600/80 rounded-lg text-white text-xs animate-pulse shadow-lg backdrop-blur-md"><LoaderIcon /> Загрузка геометрии...</div>
                    ) : isFromCache ? (
                        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-600/20 border border-emerald-500/50 rounded-lg text-emerald-400 text-xs shadow-lg backdrop-blur-md"><CheckIcon /> Из кэша</div>
                    ) : null}
                </div>
                <div className={`flex flex-wrap bg-gray-800/80 p-1 rounded-lg border border-gray-600 pointer-events-auto backdrop-blur-md ${isFullscreen ? 'shadow-xl' : ''}`}>
                    <button onClick={() => setOverlayMode('sales')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'sales' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Продажи</button>
                    <button onClick={() => setOverlayMode('pets')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'pets' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Питомец-Индекс</button>
                    <button onClick={() => setOverlayMode('competitors')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'competitors' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Конкуренты</button>
                    <button onClick={() => setOverlayMode('age')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'age' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Возраст</button>
                </div>
                <div className={`relative w-full md:w-auto md:min-w-[300px] ${isFullscreen ? 'pointer-events-auto' : ''}`}>
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Поиск региона..." className="w-full p-2 pl-10 bg-card-bg/80 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-text-main placeholder-gray-500 transition backdrop-blur-sm" />
                    {searchResults.length > 0 && (
                        <ul className="absolute z-50 w-full mt-1 bg-card-bg/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                            {searchResults.map((loc) => (<li key={loc.name} onClick={() => handleLocationSelect(loc)} className="px-4 py-2 text-text-main cursor-pointer hover:bg-indigo-500/20 flex justify-between items-center"><span>{loc.name}</span></li>))}
                        </ul>
                    )}
                </div>
            </div>
            <div className={`relative w-full ${isFullscreen ? 'h-full' : 'h-[65vh]'} rounded-lg overflow-hidden border border-gray-700`}>
                <div ref={mapContainer} className="h-full w-full bg-gray-800 z-0" />
                <div className="absolute top-4 right-4 z-[2000] flex flex-col gap-3 pointer-events-auto">
                    <button onClick={() => setLocalTheme(prev => prev === 'dark' ? 'light' : 'dark')} className="bg-card-bg/90 hover:bg-gray-700 text-text-main p-2.5 rounded-lg shadow-lg border border-gray-600 transition-all backdrop-blur-md flex items-center justify-center">{localTheme === 'dark' ? <SunIcon /> : <MoonIcon />}</button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="bg-card-bg/90 hover:bg-gray-700 text-text-main p-2.5 rounded-lg shadow-lg border border-gray-600 transition-all backdrop-blur-md flex items-center justify-center">{isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}</button>
                </div>
            </div>
        </div>
    );
};

export default InteractiveRegionMap;
