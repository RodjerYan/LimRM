
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

// Robust coordinate parser helper
const parseCoord = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val === 0 ? null : val; // Assume 0,0 is invalid for this dataset
    const str = String(val).trim().replace(',', '.');
    if (str === '') return null;
    const num = parseFloat(str);
    return isNaN(num) || num === 0 ? null : num;
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

const MANUAL_BOUNDARIES: any[] = [
    {
        "type": "Feature",
        "properties": { "name": "Республика Крым" }, 
        "geometry": { "type": "MultiPolygon", "coordinates": [ [ [[ 32.25, 45.54 ], [ 32.28, 45.59 ], [ 32.355, 45.645 ], [ 32.47, 45.68 ], [ 32.51, 45.705 ], [ 32.58, 45.73 ], [ 32.605, 45.755 ], [ 32.7, 45.8 ], [ 32.76, 45.845 ], [ 33.53, 46.03 ], [ 33.565, 46.065 ], [ 33.55, 46.1 ], [ 33.555, 46.115 ], [ 33.61, 46.155 ], [ 33.595, 46.22 ], [ 33.6, 46.24 ], [ 33.655, 46.25 ], [ 33.74, 46.205 ], [ 33.795, 46.225 ], [ 33.86, 46.22 ], [ 33.925, 46.175 ], [ 34.05, 46.13 ], [ 34.08, 46.14 ], [ 34.13, 46.125 ], [ 34.185, 46.085 ], [ 34.24, 46.075 ], [ 34.345, 46.08 ], [ 34.415, 46.025 ], [ 34.455, 45.975 ], [ 34.49, 45.96 ], [ 34.505, 45.965 ], [ 34.555, 46.015 ], [ 34.61, 46.015 ], [ 34.655, 46 ], [ 34.765, 45.925 ], [ 34.81, 45.92 ], [ 34.82, 45.91 ], [ 34.82, 45.825 ], [ 34.885, 45.81 ], [ 34.955, 45.78 ], [ 35.24, 45.81 ], [ 35.28, 45.79 ], [ 35.325, 45.75 ], [ 35.355, 45.695 ], [ 35.425, 45.655 ], [ 35.455, 45.62 ], [ 35.475, 45.575 ], [ 35.535, 45.55 ], [ 35.565, 45.525 ], [ 35.6, 45.58 ], [ 35.65, 45.62 ], [ 35.78, 45.665 ], [ 35.89, 45.665 ], [ 35.975, 45.64 ], [ 36.01, 45.64 ], [ 36.07, 45.645 ], [ 36.135, 45.67 ], [ 36.34, 45.69 ], [ 36.68, 45.645 ], [ 36.69, 45.63 ], [ 36.7, 45.455 ], [ 36.68, 45.345 ], [ 36.62, 45.3 ], [ 36.615, 45.245 ], [ 36.55, 45.19 ], [ 36.585, 45.055 ], [ 36.63, 44.95 ], [ 36.63, 44.935 ], [ 36.585, 44.89 ], [ 36.515, 44.855 ], [ 36.44, 44.835 ], [ 36.365, 44.83 ], [ 36.26, 44.8 ], [ 36.175, 44.8 ], [ 36.105, 44.815 ], [ 36.015, 44.785 ], [ 35.84, 44.77 ], [ 35.775, 44.775 ], [ 35.715, 44.79 ], [ 35.635, 44.825 ], [ 35.61, 44.795 ], [ 35.545, 44.755 ], [ 35.465, 44.73 ], [ 35.415, 44.725 ], [ 35.385, 44.685 ], [ 35.345, 44.65 ], [ 35.205, 44.585 ], [ 35.125, 44.565 ], [ 35.02, 44.565 ], [ 34.915, 44.59 ], [ 34.855, 44.58 ], [ 34.81, 44.585 ], [ 34.74, 44.565 ], [ 34.68, 44.53 ], [ 34.64, 44.49 ], [ 34.635, 44.47 ], [ 34.605, 44.425 ], [ 34.57, 44.39 ], [ 34.41, 44.3 ], [ 34.365, 44.285 ], [ 34.3, 44.235 ], [ 34.225, 44.205 ], [ 34.165, 44.195 ], [ 34.095, 44.195 ], [ 33.995, 44.165 ], [ 33.91, 44.165 ], [ 33.855, 44.175 ], [ 33.82, 44.165 ], [ 33.735, 44.165 ], [ 33.69, 44.17 ], [ 33.675, 44.185 ], [ 33.675, 44.195 ], [ 33.745, 44.4 ], [ 33.785, 44.425 ], [ 33.82, 44.425 ], [ 33.845, 44.44 ], [ 33.89, 44.445 ], [ 33.83, 44.505 ], [ 33.81, 44.555 ], [ 33.785, 44.56 ], [ 33.765, 44.58 ], [ 33.765, 44.59 ], [ 33.73, 44.58 ], [ 33.7, 44.605 ], [ 33.695, 44.64 ], [ 33.735, 44.675 ], [ 33.73, 44.69 ], [ 33.695, 44.685 ], [ 33.66, 44.695 ], [ 33.62, 44.69 ], [ 33.6, 44.695 ], [ 33.59, 44.725 ], [ 33.595, 44.76 ], [ 33.65, 44.78 ], [ 33.615, 44.79 ], [ 33.575, 44.79 ], [ 33.555, 44.81 ], [ 33.555, 44.82 ], [ 33.29, 44.92 ], [ 33.21, 44.925 ], [ 33.15, 44.94 ], [ 33, 44.995 ], [ 32.93, 45.045 ], [ 32.88, 45.07 ], [ 32.825, 45.125 ], [ 32.715, 45.095 ], [ 32.63, 45.09 ], [ 32.485, 45.125 ], [ 32.45, 45.125 ], [ 32.335, 45.16 ], [ 32.285, 45.19 ], [ 32.235, 45.235 ], [ 32.21, 45.28 ], [ 32.185, 45.365 ], [ 32.18, 45.415 ], [ 32.19, 45.46 ], [ 32.215, 45.505 ], [ 32.25, 45.54 ]] ] ] }
    },
    // ... (other boundaries omitted for brevity, assuming they are handled by main geojson or provided separately)
];

const MapLegend: React.FC<{ mode: OverlayMode }> = ({ mode }) => {
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
    const [isFromCache, setIsFromCache] = useState(false);
    
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    useEffect(() => {
        const fetchGeoData = async () => {
            const CACHE_NAME = 'limkorm-geo-v2';
            const RUSSIA_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson';
            const WORLD_URL = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson';

            try {
                setIsLoadingGeo(true);
                let russiaData: any = null, worldData: any = null;
                if ('caches' in window) {
                    try {
                        const cache = await caches.open(CACHE_NAME);
                        const [russiaRes, worldRes] = await Promise.all([cache.match(RUSSIA_URL), cache.match(WORLD_URL)]);
                        if (russiaRes && worldRes) {
                            russiaData = await russiaRes.json(); worldData = await worldRes.json();
                            setIsFromCache(true);
                        } else {
                            const [rNetwork, wNetwork] = await Promise.all([fetch(RUSSIA_URL), fetch(WORLD_URL)]);
                            if (rNetwork.ok && wNetwork.ok) {
                                cache.put(RUSSIA_URL, rNetwork.clone()); cache.put(WORLD_URL, wNetwork.clone());
                                russiaData = await rNetwork.json(); worldData = await wNetwork.json();
                            }
                        }
                    } catch (e) { console.warn('Cache API error:', e); }
                }
                if (!russiaData || !worldData) {
                    const [rRes, wRes] = await Promise.all([fetch(RUSSIA_URL), fetch(WORLD_URL)]);
                    russiaData = await rRes.json(); worldData = await wRes.json();
                }
                const finalFeatures = [];
                finalFeatures.push(...MANUAL_BOUNDARIES);
                const manualNames = new Set(MANUAL_BOUNDARIES.map(f => f.properties.name));
                if (russiaData && russiaData.features) {
                    const fixedRussia = russiaData.features.filter((f: any) => !manualNames.has(f.properties.name)).map((f: any) => f.properties?.name === 'Чукотский автономный округ' ? fixChukotkaGeoJSON(f) : f);
                    finalFeatures.push(...fixedRussia);
                }
                if (worldData && worldData.features) {
                    const cisCountriesMap: Record<string, string> = { 'Belarus': 'Республика Беларусь', 'Kazakhstan': 'Республика Казахстан', 'Kyrgyzstan': 'Кыргызская Республика', 'Uzbekistan': 'Республика Узбекистан', 'Tajikistan': 'Республика Таджикистан', 'Turkmenistan': 'Туркменистан', 'Armenia': 'Армения', 'Azerbaijan': 'Азербайджан', 'Georgia': 'Грузия', 'Moldova': 'Республика Молдова' };
                    const cisFeatures = worldData.features.filter((f: any) => cisCountriesMap[f.properties.name]).map((f: any) => { f.properties.name = cisCountriesMap[f.properties.name]; return f; });
                    finalFeatures.push(...cisFeatures);
                }
                setGeoJsonData({ type: 'FeatureCollection', features: finalFeatures });
            } catch (error) { console.error("Error fetching map geometry:", error); } finally { setIsLoadingGeo(false); }
        };
        fetchGeoData();
    }, []);

    useEffect(() => { activeClientsDataRef.current = activeClients; }, [activeClients]);
    useEffect(() => { onEditClientRef.current = onEditClient; }, [onEditClient]);

    const searchableLocations = useMemo<SearchableLocation[]>(() => {
        if (!geoJsonData) return [];
        const locations: SearchableLocation[] = []; const addedNames = new Set<string>();
        geoJsonData.features.forEach((feature: any) => { const name = feature.properties?.name; if (name && !addedNames.has(name)) { locations.push({ name, type: 'region' }); addedNames.add(name); } });
        return locations.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }, [geoJsonData]);

    useEffect(() => {
        if (searchTerm.trim().length > 1) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            const results = searchableLocations.filter(loc => loc.name.toLowerCase().includes(lowerSearchTerm)).slice(0, 7);
            setSearchResults(results);
        } else { setSearchResults([]); }
    }, [searchTerm, searchableLocations]);

    const getStyleForRegion = (feature: any) => {
        const regionName = feature.properties?.name;
        const marketData = getMarketData(regionName);
        const isSelected = selectedRegions.includes(regionName);
        const baseBorder = { weight: isSelected ? 2 : 1, opacity: 1, color: isSelected ? '#818cf8' : (localTheme === 'dark' ? '#6b7280' : '#9ca3af'), fillColor: 'transparent', fillOpacity: 0, className: isSelected ? 'selected-region-layer region-polygon' : 'region-polygon', pane: 'regionsPane' };
        if (overlayMode === 'sales') { return { ...baseBorder, fillColor: isSelected ? '#818cf8' : '#111827', fillOpacity: isSelected ? 0.3 : 0.2, interactive: true }; }
        if (overlayMode === 'pets') {
            const density = marketData.petDensityIndex; let fillColor = '#6b7280'; let fillOpacity = 0.3;
            if (density > 80) { fillColor = '#10b981'; fillOpacity = 0.6; } else if (density > 50) { fillColor = '#f59e0b'; fillOpacity = 0.5; }
            return { ...baseBorder, color: isSelected ? '#ffffff' : '#4b5563', fillColor: fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
        } 
        if (overlayMode === 'competitors') {
            const comp = marketData.competitorDensityIndex; let fillColor = '#3b82f6'; let fillOpacity = 0.3;
            if (comp > 80) { fillColor = '#ef4444'; fillOpacity = 0.6; } else if (comp > 50) { fillColor = '#f97316'; fillOpacity = 0.5; }
            return { ...baseBorder, color: isSelected ? '#ffffff' : '#4b5563', fillColor: fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
        }
        if (overlayMode === 'age') {
            const age = marketData.avgOwnerAge; let fillColor = '#6b7280'; let fillOpacity = 0.3;
            if (age < 35) { fillColor = '#10b981'; fillOpacity = 0.6; } else if (age < 45) { fillColor = '#f59e0b'; fillOpacity = 0.5; } else { fillColor = '#8b5cf6'; fillOpacity = 0.5; }
            return { ...baseBorder, color: isSelected ? '#ffffff' : '#4b5563', fillColor: fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
        }
        return baseBorder;
    };

    const resetHighlight = useCallback(() => {
        if (highlightedLayer.current && geoJsonLayer.current) {
            geoJsonLayer.current.resetStyle(highlightedLayer.current as L.Path);
        }
        highlightedLayer.current = null;
    }, []); 

    const highlightRegion = useCallback((layer: L.Layer) => {
        resetHighlight();
        if (layer instanceof L.Path) {
             layer.setStyle({ weight: 2, color: '#fbbf24', opacity: 1, fillOpacity: 0.2, dashArray: '' }).bringToFront();
             highlightedLayer.current = layer;
        }
    }, [resetHighlight]);

    const handleLocationSelect = useCallback((location: SearchableLocation) => {
        const map = mapInstance.current; if (!map) return;
        setSearchTerm(''); setSearchResults([]);
        let foundLayer: L.Layer | null = null;
        if (location.type === 'region') { geoJsonLayer.current?.eachLayer(layer => { if ((layer as any).feature?.properties?.name.toLowerCase() === location.name.toLowerCase()) { foundLayer = layer; } }); }
        if (foundLayer) { map.fitBounds((foundLayer as L.Polygon).getBounds()); highlightRegion(foundLayer); }
    }, [highlightRegion]);

    useEffect(() => {
        const map = mapInstance.current;
        if (map) { const timer = setTimeout(() => map.invalidateSize(true), 200); return () => clearTimeout(timer); }
    }, [data, isFullscreen]);
    
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, { center: [55, 60], zoom: 3, minZoom: 2, scrollWheelZoom: true, preferCanvas: true, worldCopyJump: true, zoomControl: false, attributionControl: false });
            mapInstance.current = map;
            
            // --- CRITICAL FIX: Z-INDEX PANES & RENDERERS ---
            // Explicitly create panes and assign z-indexes
            map.createPane('regionsPane');
            map.getPane('regionsPane')!.style.zIndex = '400';
            
            map.createPane('markersPane');
            map.getPane('markersPane')!.style.zIndex = '600'; // Markers ALWAYS on top

            L.control.zoom({ position: 'topleft' }).addTo(map);
            layerControl.current = L.control.layers({}, {}, { position: 'bottomleft' }).addTo(map);

            const legend = new (L.Control.extend({
                onAdd: function() { const div = L.DomUtil.create('div', 'info legend'); legendContainerRef.current = div; return div; },
                onRemove: function() { legendContainerRef.current = null; }
            }))({ position: 'bottomright' });
            
            legend.addTo(map);
            map.on('click', resetHighlight);

            map.on('popupopen', (e) => {
                const popupNode = e.popup.getElement();
                if (popupNode) {
                    const editBtn = popupNode.querySelector('.edit-location-btn');
                    if (editBtn) {
                        editBtn.addEventListener('click', (event) => {
                            event.stopPropagation();
                            const key = editBtn.getAttribute('data-key');
                            if (key) {
                                const client = activeClientsDataRef.current.find(c => c.key === key);
                                if (client) { setIsFullscreen(false); onEditClientRef.current(client); }
                            }
                        });
                    }
                }
            });
        }
        return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; tileLayerRef.current = null; } };
    }, []); 

    useEffect(() => {
        if (legendContainerRef.current) { const root = (ReactDOM as any).createRoot(legendContainerRef.current); root.render(<MapLegend mode={overlayMode} />); }
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
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;
        
        // Use a dedicated renderer for markersPane to ensure they are drawn on top.
        // Without this, L.circleMarker might use the default overlay renderer which is below markersPane if configured wrongly by Leaflet.
        const markersRenderer = L.canvas({ pane: 'markersPane' });

        if (potentialClientMarkersLayer.current) { map.removeLayer(potentialClientMarkersLayer.current); layerControl.current.removeLayer(potentialClientMarkersLayer.current); }
        potentialClientMarkersLayer.current = L.layerGroup();
        if (activeClientMarkersLayer.current) { map.removeLayer(activeClientMarkersLayer.current); layerControl.current.removeLayer(activeClientMarkersLayer.current); }
        activeClientMarkersLayer.current = L.layerGroup(); activeClientMarkersRef.current.clear();
    
        const pointsForBounds: L.LatLngExpression[] = [];

        potentialClients.forEach(tt => {
            const lat = parseCoord(tt.lat);
            const lon = parseCoord(tt.lon);

            if (lat !== null && lon !== null) {
                const popupContent = `<b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br><small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>`;
                const marker = L.circleMarker([lat, lon], {
                    fillColor: '#3b82f6', color: '#2563eb', radius: 3, weight: 1, opacity: 1, fillOpacity: 0.8,
                    pane: 'markersPane', // Ensure it goes to the high-z-index pane
                    renderer: markersRenderer
                }).bindPopup(popupContent);
                potentialClientMarkersLayer.current?.addLayer(marker);
            }
        });
    
        activeClients.forEach(tt => {
            const lat = parseCoord(tt.lat);
            const lon = parseCoord(tt.lon);

            if (lat !== null && lon !== null) {
                console.log('Рисую маркер:', lat, lon, tt.name);
                const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts, tt.key);
                const marker = L.circleMarker([lat, lon], {
                    fillColor: '#22c55e', color: '#16a34a', radius: 4, weight: 1, opacity: 1, fillOpacity: 0.9,
                    pane: 'markersPane', // Ensure it goes to the high-z-index pane
                    renderer: markersRenderer
                }).bindPopup(popupContent);
                activeClientMarkersLayer.current?.addLayer(marker);
                activeClientMarkersRef.current.set(tt.key, marker);
                pointsForBounds.push([lat, lon]);
            }
        });
        
        // Auto-center map if markers exist and we are not focusing on a specific client
        if (pointsForBounds.length > 0 && !flyToClientKey) {
             const bounds = L.latLngBounds(pointsForBounds);
             if (bounds.isValid()) {
                 map.fitBounds(bounds.pad(0.1));
             }
        }
    
        if (overlayMode === 'sales') { map.addLayer(potentialClientMarkersLayer.current); map.addLayer(activeClientMarkersLayer.current); }
        layerControl.current.addOverlay(potentialClientMarkersLayer.current, "Потенциал (ОКБ)");
        layerControl.current.addOverlay(activeClientMarkersLayer.current, "Активные ТТ");
    }, [potentialClients, activeClients, data, overlayMode]);
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !geoJsonData) return;
        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        geoJsonLayer.current = L.geoJSON(geoJsonData as any, {
            style: getStyleForRegion,
            pane: 'regionsPane', // Correctly setting the pane to ensure it is below markers
            onEachFeature: (feature, layer) => {
                const regionName = feature.properties.name;
                if (!regionName) return;
                const marketData = getMarketData(regionName);
                let tooltipText = regionName;
                if (overlayMode === 'pets') tooltipText += `<br/>Индекс: ${marketData.petDensityIndex.toFixed(0)}`;
                if (overlayMode === 'competitors') tooltipText += `<br/>Конкуренция: ${marketData.competitorDensityIndex.toFixed(0)}`;
                if (overlayMode === 'age') tooltipText += `<br/>Ср. возраст: ${marketData.avgOwnerAge.toFixed(0)}`;
                layer.bindTooltip(tooltipText, { sticky: true, className: 'leaflet-tooltip-custom' });
                layer.on({
                    click: (e) => {
                        // КРИТИЧНО: Не останавливаем событие, чтобы Leaflet мог проверить наличие метки под кликом.
                        // Но если метка в другом Pane выше, она сама перехватит клик.
                        map.fitBounds(e.target.getBounds());
                        highlightRegion(e.target);
                        if (feature.properties.name === 'Белгородская область' && (window as any).confetti) {
                            const clickPoint = map.latLngToContainerPoint(e.latlng);
                            const x = clickPoint.x / window.innerWidth;
                            const y = clickPoint.y / window.innerHeight;
                            (window as any).confetti({ particleCount: 150, spread: 100, origin: { y: y, x: x }, colors: ['#ffffff', '#0000ff', '#ff0000'], zIndex: 10000, disableForReducedMotion: true });
                        }
                    },
                    mouseover: (e) => {
                        const layer = e.target;
                        if (layer !== highlightedLayer.current && overlayMode === 'sales') {
                            layer.setStyle({ weight: 2, color: '#a5b4fc', opacity: 1, fillOpacity: 0.2 });
                        }
                    },
                    mouseout: (e) => {
                        const layer = e.target;
                        if (layer !== highlightedLayer.current) { geoJsonLayer.current?.resetStyle(layer); }
                    }
                });
            }
        }).addTo(map);
    }, [geoJsonData, selectedRegions, overlayMode, localTheme]);

    return (
        <div id="interactive-map-container" className={`bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-indigo-500/10 transition-all duration-500 ease-in-out ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none p-0 bg-gray-900' : 'p-6 relative'}`}>
            <style>{`.leaflet-control-attribution { display: none !important; } .region-polygon { pointer-events: auto !important; }`}</style>
            <div className={`flex flex-col md:flex-row justify-between items-center mb-4 gap-4 ${isFullscreen ? 'absolute top-4 left-4 z-[1001] w-[calc(100%-5rem)] pointer-events-none' : ''}`}>
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
