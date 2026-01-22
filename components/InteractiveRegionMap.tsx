
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
    if (typeof val === 'number') return val === 0 ? null : val;
    const str = String(val).trim().replace(',', '.');
    if (str === '') return null;
    const num = parseFloat(str);
    return isNaN(num) || num === 0 ? null : num;
};

// Robust key finder for coordinates with deep lookup
const getCoordinate = (item: any, keys: string[]) => {
    if (!item) return null;
    
    // 1. Check top-level properties (lat, lon, latitude, etc.)
    for (const key of keys) {
        if (item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
        
        // Case-insensitive check
        const lowerKey = key.toLowerCase();
        const foundKey = Object.keys(item).find(k => k.toLowerCase() === lowerKey);
        if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null && item[foundKey] !== '') return item[foundKey];
    }

    // 2. Check originalRow if available (Deep Lookup)
    // Most snapshot/processed data keeps the source data in 'originalRow' or 'rowData'
    const original = item.originalRow || item.rowData;
    if (original && typeof original === 'object') {
        for (const key of keys) {
            // Case-insensitive check inside originalRow
            const lowerKey = key.toLowerCase();
            const foundKey = Object.keys(original).find(k => k.toLowerCase() === lowerKey);
            if (foundKey) {
                const val = original[foundKey];
                if (val !== undefined && val !== null && val !== '') return val;
            }
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

const MANUAL_BOUNDARIES: any[] = [
    {
        "type": "Feature",
        "properties": { "name": "Республика Крым" }, 
        "geometry": { "type": "MultiPolygon", "coordinates": [ [ [[ 32.25, 45.54 ], [ 32.28, 45.59 ], [ 32.355, 45.645 ], [ 32.47, 45.68 ], [ 32.51, 45.705 ], [ 32.58, 45.73 ], [ 32.605, 45.755 ], [ 32.7, 45.8 ], [ 32.76, 45.845 ], [ 33.53, 46.03 ], [ 33.565, 46.065 ], [ 33.55, 46.1 ], [ 33.555, 46.115 ], [ 33.61, 46.155 ], [ 33.595, 46.22 ], [ 33.6, 46.24 ], [ 33.655, 46.25 ], [ 33.74, 46.205 ], [ 33.795, 46.225 ], [ 33.86, 46.22 ], [ 33.925, 46.175 ], [ 34.05, 46.13 ], [ 34.08, 46.14 ], [ 34.13, 46.125 ], [ 34.185, 46.085 ], [ 34.24, 46.075 ], [ 34.345, 46.08 ], [ 34.415, 46.025 ], [ 34.455, 45.975 ], [ 34.49, 45.96 ], [ 34.505, 45.965 ], [ 34.555, 46.015 ], [ 34.61, 46.015 ], [ 34.655, 46 ], [ 34.765, 45.925 ], [ 34.81, 45.92 ], [ 34.82, 45.91 ], [ 34.82, 45.825 ], [ 34.885, 45.81 ], [ 34.955, 45.78 ], [ 35.24, 45.81 ], [ 35.28, 45.79 ], [ 35.325, 45.75 ], [ 35.355, 45.695 ], [ 35.425, 45.655 ], [ 35.455, 45.62 ], [ 35.475, 45.575 ], [ 35.535, 45.55 ], [ 35.565, 45.525 ], [ 35.6, 45.58 ], [ 35.65, 45.62 ], [ 35.78, 45.665 ], [ 35.89, 45.665 ], [ 35.975, 45.64 ], [ 36.01, 45.64 ], [ 36.07, 45.645 ], [ 36.135, 45.67 ], [ 36.34, 45.69 ], [ 36.68, 45.645 ], [ 36.69, 45.63 ], [ 36.7, 45.455 ], [ 36.68, 45.345 ], [ 36.62, 45.3 ], [ 36.615, 45.245 ], [ 36.55, 45.19 ], [ 36.585, 45.055 ], [ 36.63, 44.95 ], [ 36.63, 44.935 ], [ 36.585, 44.89 ], [ 36.515, 44.855 ], [ 36.44, 44.835 ], [ 36.365, 44.83 ], [ 36.26, 44.8 ], [ 36.175, 44.8 ], [ 36.105, 44.815 ], [ 36.015, 44.785 ], [ 35.84, 44.77 ], [ 35.775, 44.775 ], [ 35.715, 44.79 ], [ 35.635, 44.825 ], [ 35.61, 44.795 ], [ 35.545, 44.755 ], [ 35.465, 44.73 ], [ 35.415, 44.725 ], [ 35.385, 44.685 ], [ 35.345, 44.65 ], [ 35.205, 44.585 ], [ 35.125, 44.565 ], [ 35.02, 44.565 ], [ 34.915, 44.59 ], [ 34.855, 44.58 ], [ 34.81, 44.585 ], [ 34.74, 44.565 ], [ 34.68, 44.53 ], [ 34.64, 44.49 ], [ 34.635, 44.47 ], [ 34.605, 44.425 ], [ 34.57, 44.39 ], [ 34.41, 44.3 ], [ 34.365, 44.285 ], [ 34.3, 44.235 ], [ 34.225, 44.205 ], [ 34.165, 44.195 ], [ 34.095, 44.195 ], [ 33.995, 44.165 ], [ 33.91, 44.165 ], [ 33.855, 44.175 ], [ 33.82, 44.165 ], [ 33.735, 44.165 ], [ 33.69, 44.17 ], [ 33.675, 44.185 ], [ 33.675, 44.195 ], [ 33.745, 44.4 ], [ 33.785, 44.425 ], [ 33.82, 44.425 ], [ 33.845, 44.44 ], [ 33.89, 44.445 ], [ 33.83, 44.505 ], [ 33.81, 44.555 ], [ 33.785, 44.56 ], [ 33.765, 44.58 ], [ 33.765, 44.59 ], [ 33.73, 44.58 ], [ 33.7, 44.605 ], [ 33.695, 44.64 ], [ 33.735, 44.675 ], [ 33.73, 44.69 ], [ 33.695, 44.685 ], [ 33.66, 44.695 ], [ 33.62, 44.69 ], [ 33.6, 44.695 ], [ 33.59, 44.725 ], [ 33.595, 44.76 ], [ 33.65, 44.78 ], [ 33.615, 44.79 ], [ 33.575, 44.79 ], [ 33.555, 44.81 ], [ 33.555, 44.82 ], [ 33.29, 44.92 ], [ 33.21, 44.925 ], [ 33.15, 44.94 ], [ 33, 44.995 ], [ 32.93, 45.045 ], [ 32.88, 45.07 ], [ 32.825, 45.125 ], [ 32.715, 45.095 ], [ 32.63, 45.09 ], [ 32.485, 45.125 ], [ 32.45, 45.125 ], [ 32.335, 45.16 ], [ 32.285, 45.19 ], [ 32.235, 45.235 ], [ 32.21, 45.28 ], [ 32.185, 45.365 ], [ 32.18, 45.415 ], [ 32.19, 45.46 ], [ 32.215, 45.505 ], [ 32.25, 45.54 ]] ] ] }
    },
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
        const markersRenderer = L.canvas({ pane: 'markersPane' });

        if (potentialClientMarkersLayer.current) { map.removeLayer(potentialClientMarkersLayer.current); layerControl.current.removeLayer(potentialClientMarkersLayer.current); }
        potentialClientMarkersLayer.current = L.layerGroup();
        if (activeClientMarkersLayer.current) { map.removeLayer(activeClientMarkersLayer.current); layerControl.current.removeLayer(activeClientMarkersLayer.current); }
        activeClientMarkersLayer.current = L.layerGroup(); activeClientMarkersRef.current.clear();
    
        const pointsForBounds: L.LatLngExpression[] = [];

        potentialClients.forEach(tt => {
            // Robust check for coordinates in various keys, using the enhanced getCoordinate helper
            const rawLat = getCoordinate(tt, ['lat', 'latitude', 'широта', 'y', 'geo_lat']);
            const rawLon = getCoordinate(tt, ['lon', 'lng', 'longitude', 'долгота', 'x', 'geo_lon']);

            const lat = parseCoord(rawLat);
            let lon = parseCoord(rawLon);

            if (lat !== null && lon !== null) {
                if (lon < 0) lon += 360;

                const popupContent = `<b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br><small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>`;
                const marker = L.circleMarker([lat, lon], {
                    fillColor: '#3b82f6', color: '#1d4ed8', weight: 1, opacity: 0.8, fillOpacity: 0.6, radius: 4, pane: 'markersPane', renderer: markersRenderer
                }).bindPopup(popupContent);
                potentialClientMarkersLayer.current?.addLayer(marker);
            }
        });

        activeClients.forEach(tt => {
            const rawLat = getCoordinate(tt, ['lat', 'latitude']);
            const rawLon = getCoordinate(tt, ['lon', 'lng', 'longitude']);
            
            const lat = parseCoord(rawLat);
            let lon = parseCoord(rawLon);

            if (lat !== null && lon !== null) {
                if (lon < 0) lon += 360;
                pointsForBounds.push([lat, lon]);

                const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts, tt.key);
                const marker = L.circleMarker([lat, lon], {
                    fillColor: '#10b981', color: '#047857', weight: 1, opacity: 1, fillOpacity: 0.8, radius: 5, pane: 'markersPane', renderer: markersRenderer
                }).bindPopup(popupContent);
                
                activeClientMarkersLayer.current?.addLayer(marker);
                activeClientMarkersRef.current.set(tt.key, marker);
            }
        });

        potentialClientMarkersLayer.current.addTo(map);
        activeClientMarkersLayer.current.addTo(map);
        layerControl.current.addOverlay(potentialClientMarkersLayer.current, '<span class="text-blue-400 font-bold">●</span> Потенциал (ОКБ)');
        layerControl.current.addOverlay(activeClientMarkersLayer.current, '<span class="text-emerald-400 font-bold">●</span> Активные ТТ');

        if (pointsForBounds.length > 0 && !flyToClientKey) { map.fitBounds(L.latLngBounds(pointsForBounds).pad(0.1)); }
    }, [potentialClients, activeClients]); // Re-run when data changes

    useEffect(() => {
        if (geoJsonData && mapInstance.current && geoJsonLayer.current === null) {
            geoJsonLayer.current = L.geoJSON(geoJsonData as any, {
                style: getStyleForRegion,
                onEachFeature: (feature, layer) => {
                    layer.on({
                        click: (e) => {
                            L.DomEvent.stopPropagation(e);
                            mapInstance.current?.fitBounds(e.target.getBounds());
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
            geoJsonLayer.current.setStyle(getStyleForRegion);
        }
    }, [geoJsonData, selectedRegions, localTheme, overlayMode]);

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

            <div className="absolute bottom-8 left-8 z-[400] flex gap-2">
                <div className="bg-gray-900/90 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-xl flex">
                    {(['sales', 'pets', 'competitors', 'age'] as OverlayMode[]).map(mode => (
                        <button key={mode} onClick={() => setOverlayMode(mode)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${overlayMode === mode ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                            {mode === 'sales' ? 'Продажи' : mode === 'pets' ? 'Питомцы' : mode === 'competitors' ? 'Конкуренты' : 'Возраст'}
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
