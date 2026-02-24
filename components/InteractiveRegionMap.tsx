
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { getMarketData } from '../utils/marketData';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon } from './icons';
import type { FeatureCollection } from 'geojson';
import { MANUAL_BOUNDARIES } from '../data/manual_boundaries';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

import { PETS_DISTRIBUTION } from '../data/petsDistribution';
import { CIS_PETS_DISTRIBUTION } from '../data/cisPetsDistribution';

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
    onEditPotentialClient?: (client: MapPoint) => void; // New callback for blue points
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

const getPetDataForRegion = (regionName: string) => {
    // 1. Check Russia
    const ruData = PETS_DISTRIBUTION.find(r => r.region === regionName);
    if (ruData) return { ...ruData, isCis: false, comment: '' };

    // 2. Check CIS
    const cisData = CIS_PETS_DISTRIBUTION.find(c => c.country === regionName);
    if (cisData) return { region: cisData.country, catsPercent: cisData.catsPercent, dogsPercent: cisData.dogsPercent, isCis: true, comment: cisData.comment };

    return null;
};

const MapLegend: React.FC<{ mode: OverlayMode }> = React.memo(({ mode }) => {
    if (mode === 'sales') {
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[220px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500">Статус Клиентов</h4>
                <div className="flex items-center mb-1.5">
                    <span className="w-3 h-3 mr-2 bg-blue-500 rounded-full shadow-sm"></span>
                    <span className="text-xs">Потенциальные клиенты</span>
                </div>
                <div className="flex items-center mb-1.5">
                    <span className="w-3 h-3 mr-2 bg-emerald-500 rounded-full shadow-sm"></span>
                    <span className="text-xs">Продажи &lt; 6 мес</span>
                </div>
                <div className="flex items-center mb-1.5">
                    <span className="w-3 h-3 mr-2 bg-amber-500 rounded-full shadow-sm"></span>
                    <span className="text-xs">Продажи 6-12 мес</span>
                </div>
                <div className="flex items-center">
                    <span className="w-3 h-3 mr-2 bg-red-500 rounded-full shadow-sm"></span>
                    <span className="text-xs">Потерянные (&gt; 12 мес)</span>
                </div>
            </div>
        );
    }
    if (mode === 'pets') {
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[220px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500">Питомцы (Домохозяйства)</h4>
                <div className="flex items-center mb-1.5">
                    <span className="w-3 h-3 mr-2 bg-violet-500 opacity-80 rounded-sm"></span>
                    <span className="text-xs">Кошки &gt; 55%</span>
                </div>
                <div className="flex items-center mb-1.5">
                    <span className="w-3 h-3 mr-2 bg-orange-500 opacity-80 rounded-sm"></span>
                    <span className="text-xs">Собаки &gt; 55%</span>
                </div>
                <div className="flex items-center mb-3">
                    <span className="w-3 h-3 mr-2 bg-slate-500 opacity-50 rounded-sm"></span>
                    <span className="text-xs">Смешанный тип (~50/50)</span>
                </div>
                <div className="text-[10px] text-gray-400 leading-tight border-t border-gray-100 pt-2">
                    Данные основаны на агрегированной аналитической модели и отчетах компаний Purina и Nestlé.
                </div>
            </div>
        );
    }
    if (mode === 'competitors') {
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500">Конкуренты</h4>
                <div className="flex items-center mb-1">
                    <span className="w-3 h-3 mr-2 bg-red-500 opacity-60"></span>
                    <span className="text-xs">Высокая плотность</span>
                </div>
                <div className="flex items-center mb-1">
                    <span className="w-3 h-3 mr-2 bg-orange-500 opacity-50"></span>
                    <span className="text-xs">Средняя</span>
                </div>
                <div className="flex items-center">
                    <span className="w-3 h-3 mr-2 bg-blue-500 opacity-30"></span>
                    <span className="text-xs">Низкая</span>
                </div>
            </div>
        );
    }
    if (mode === 'age') {
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500">Возраст владельцев</h4>
                <div className="flex items-center mb-1">
                    <span className="w-3 h-3 mr-2 bg-emerald-500 opacity-60"></span>
                    <span className="text-xs">&lt; 35 лет</span>
                </div>
                <div className="flex items-center mb-1">
                    <span className="w-3 h-3 mr-2 bg-amber-500 opacity-50"></span>
                    <span className="text-xs">35 - 45 лет</span>
                </div>
                <div className="flex items-center">
                    <span className="w-3 h-3 mr-2 bg-violet-500 opacity-50"></span>
                    <span className="text-xs">&gt; 45 лет</span>
                </div>
            </div>
        );
    }
    if (mode === 'abc') {
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    ABC Анализ (Вклад)
                </h4>
                <div className="space-y-1.5">
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.6)]"></span>
                        <span className="text-xs font-bold text-gray-800">A (80% Выручки)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.6)]"></span>
                        <span className="text-xs font-medium text-gray-600">B (15% Выручки)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-gray-400"></span>
                        <span className="text-xs text-gray-500">C (5% Выручки)</span>
                    </div>
                </div>
            </div>
        );
    }
    // ... (other modes kept same) ...
    return (
        <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
            <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500">Статус ТТ</h4>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-emerald-500 shadow-sm"></span>
                <span className="text-xs font-medium">Активна (&lt;6 мес)</span>
            </div>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-amber-500 shadow-sm"></span>
                <span className="text-xs font-medium">Риск (6-12 мес)</span>
            </div>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-red-500 shadow-sm"></span>
                <span className="text-xs font-medium">Потеряна (&gt;12 мес)</span>
            </div>
            <div className="flex items-center mb-1.5 mt-2 pt-2 border-t border-gray-200">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-blue-500 shadow-sm"></span>
                <span className="text-xs font-medium">Потенциал (ОКБ)</span>
            </div>
        </div>
    );
});

// React component for the popup button to ensure stable event handling
const PopupButton: React.FC<{ 
    client: MapPoint; 
    onEdit: (client: MapPoint) => void;
    isPotential?: boolean; 
}> = ({ client, onEdit, isPotential }) => {
    return (
        <button
            onClick={() => onEdit(client)}
            className="group mt-3 w-full bg-black hover:bg-gray-800 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
        >
            <svg className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
            {isPotential ? 'Внести изменение' : 'Редактировать адрес'}
        </button>
    );
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, flyToClientKey, theme = 'light', onEditClient, onEditPotentialClient }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const potentialClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const layerControl = useRef<L.Control.Layers | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const activeClientMarkersRef = useRef<Map<string, L.Layer>>(new Map());
    const legendContainerRef = useRef<HTMLDivElement | null>(null);
    
    // Manual marker tracking for hit-testing
    const potentialMarkersRef = useRef<L.CircleMarker[]>([]);
    const activeMarkersCanvasRef = useRef<L.CircleMarker[]>([]);

    const activeClientsDataRef = useRef<MapPoint[]>(activeClients);
    // Store potential clients too for popup lookup
    const potentialClientsDataRef = useRef<OkbDataRow[]>(potentialClients);
    const onEditClientRef = useRef(onEditClient);
    const onEditPotentialClientRef = useRef(onEditPotentialClient);

    const highlightedLayer = useRef<L.Layer | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);
    
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [isLoadingGeo, setIsLoadingGeo] = useState(true);
    const [isFromCache, setIsFromCache] = useState(false);
    
    const [localTheme, setLocalTheme] = useState<Theme>(theme ?? 'light');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    // ... (getLastSaleDateForGroup same) ...
    const getLastSaleDateForGroup = useCallback((clients: MapPoint[]): Date | null => {
        let maxDate: Date | null = null;
        clients.forEach(client => {
            const checkDate = (dateStr: string) => {
                if (dateStr === 'unknown') return;
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    if (!maxDate || d > maxDate) maxDate = d;
                }
            };
            if (client.dailyFact) Object.keys(client.dailyFact).forEach(checkDate);
            if (client.monthlyFact) Object.keys(client.monthlyFact).forEach(checkDate);
        });
        return maxDate;
    }, []);

    // ... (findHit same) ...
    const findHit = useCallback((map: L.Map, latlng: L.LatLng, markers: L.CircleMarker[], extraPx: number): L.CircleMarker | null => {
        const clickPt = map.latLngToContainerPoint(latlng);
        let best: { m: L.CircleMarker; d: number } | null = null;
        for (const m of markers) {
            const pt = map.latLngToContainerPoint(m.getLatLng());
            const r = (m.options.radius as number) ?? 4;
            const d = clickPt.distanceTo(pt);
            if (d <= (r + extraPx)) {
                if (!best || d < best.d) best = { m, d };
            }
        }
        return best?.m ?? null;
    }, []);

    const tryOpenMarkerPopupAt = useCallback((latlng: L.LatLng) => {
        const map = mapInstance.current;
        if (!map) return false;
        // Priority to Green markers
        if (map.hasLayer(activeClientMarkersLayer.current!)) {
             const hitActive = findHit(map, latlng, activeMarkersCanvasRef.current, 10);
             if (hitActive) { hitActive.openPopup(); return true; }
        }
        // Check Blue markers
        if (map.hasLayer(potentialClientMarkersLayer.current!)) {
            const hitPotential = findHit(map, latlng, potentialMarkersRef.current, 10);
            if (hitPotential) { hitPotential.openPopup(); return true; }
        }
        return false;
    }, [findHit]);

    // ... (fetchGeoData, etc. same) ...
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
                // Push manual boundaries first (if any)
                if (MANUAL_BOUNDARIES && MANUAL_BOUNDARIES.length > 0) {
                     finalFeatures.push(...MANUAL_BOUNDARIES);
                }
                
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

    useEffect(() => { 
        onEditClientRef.current = onEditClient; 
        onEditPotentialClientRef.current = onEditPotentialClient;
    }, [onEditClient, onEditPotentialClient]);

    // ... (searchableLocations same) ...
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
        // Style for LIGHT theme by default
        const baseBorder = { 
            weight: isSelected ? 2 : 1, 
            opacity: 1, 
            color: isSelected ? '#4f46e5' : '#9ca3af', // indigo-600 or gray-400
            fillColor: 'transparent', 
            fillOpacity: 0, 
            className: isSelected ? 'selected-region-layer region-polygon' : 'region-polygon', 
            pane: 'regionsPane' 
        };

        if (localTheme === 'dark') {
             // Dark mode overrides
             baseBorder.color = isSelected ? '#818cf8' : '#6b7280';
        }

        if (overlayMode === 'sales' || overlayMode === 'abc') { return { ...baseBorder, fillColor: isSelected ? '#4f46e5' : '#f3f4f6', fillOpacity: isSelected ? 0.3 : 0.1, interactive: true }; }
        if (overlayMode === 'pets') {
            const petData = getPetDataForRegion(regionName);
            let fillColor = '#64748b'; // Neutral (Slate)
            let fillOpacity = 0.3;
            
            if (petData) {
                if (petData.catsPercent > 55) {
                    fillColor = '#8b5cf6'; // Cats (Violet)
                    fillOpacity = 0.5 + ((petData.catsPercent - 55) / 100);
                } else if (petData.dogsPercent > 55) {
                    fillColor = '#f97316'; // Dogs (Orange)
                    fillOpacity = 0.5 + ((petData.dogsPercent - 55) / 100);
                }
            }
            
            return { ...baseBorder, color: isSelected ? '#000' : '#6b7280', fillColor: fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
        } 
        if (overlayMode === 'competitors') {
            const comp = marketData.competitorDensityIndex; let fillColor = '#3b82f6'; let fillOpacity = 0.3;
            if (comp > 80) { fillColor = '#ef4444'; fillOpacity = 0.6; } else if (comp > 50) { fillColor = '#f97316'; fillOpacity = 0.5; }
            return { ...baseBorder, color: isSelected ? '#000' : '#6b7280', fillColor: fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
        }
        if (overlayMode === 'age') {
            const age = marketData.avgOwnerAge; let fillColor = '#9ca3af'; let fillOpacity = 0.3;
            if (age < 35) { fillColor = '#10b981'; fillOpacity = 0.6; } else if (age < 45) { fillColor = '#f59e0b'; fillOpacity = 0.5; } else { fillColor = '#8b5cf6'; fillOpacity = 0.5; }
            return { ...baseBorder, color: isSelected ? '#000' : '#6b7280', fillColor: fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
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
    
    // ... (map init same) ...
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, { center: [55, 60], zoom: 3, minZoom: 2, scrollWheelZoom: true, preferCanvas: true, worldCopyJump: true, zoomControl: false, attributionControl: false });
            mapInstance.current = map;
            
            map.createPane('regionsPane');
            map.getPane('regionsPane')!.style.zIndex = '300';
            
            map.createPane('markersPane');
            map.getPane('markersPane')!.style.zIndex = '450'; 
            
            map.createPane('activeMarkersPane');
            map.getPane('activeMarkersPane')!.style.zIndex = '500';
            map.getPane('activeMarkersPane')!.style.pointerEvents = 'none';

            L.control.zoom({ position: 'topleft' }).addTo(map);
            layerControl.current = L.control.layers({}, {}, { position: 'bottomleft' }).addTo(map);

            potentialClientMarkersLayer.current = L.layerGroup().addTo(map);
            activeClientMarkersLayer.current = L.layerGroup().addTo(map);
            layerControl.current.addOverlay(potentialClientMarkersLayer.current, '<span class="text-blue-500 font-bold">●</span> Потенциал (ОКБ)');
            layerControl.current.addOverlay(activeClientMarkersLayer.current, '<span class="text-emerald-500 font-bold">●</span> Активные ТТ');

            const legend = new (L.Control.extend({
                onAdd: function() { const div = L.DomUtil.create('div', 'info legend'); legendContainerRef.current = div; return div; },
                onRemove: function() { legendContainerRef.current = null; }
            }))({ position: 'bottomright' });
            
            legend.addTo(map);
            
            map.on('click', (e: any) => {
                if (tryOpenMarkerPopupAt(e.latlng)) return;
                resetHighlight();
            });

            map.on('mousemove', (e: any) => {
                if (!mapContainer.current) return;
                if (map.hasLayer(activeClientMarkersLayer.current!)) {
                    const hit = findHit(map, e.latlng, activeMarkersCanvasRef.current, 6);
                    mapContainer.current.style.cursor = hit ? 'pointer' : '';
                } else {
                    mapContainer.current.style.cursor = '';
                }
            });

            // UPDATED: Handle popup opening for BOTH types of points
            map.on('popupopen', (e) => {
                const popup = e.popup as any;
                
                const renderButton = () => {
                    const popupNode = popup.getElement();
                    if (!popupNode) return;
                    
                    // Check if it's an active client edit
                    const activePlaceholder = popupNode.querySelector('[data-popup-edit]');
                    if (activePlaceholder) {
                        const rawKey = activePlaceholder.getAttribute('data-key');
                        if (!rawKey) return;
                        const key = decodeURIComponent(rawKey);
                        const client = activeClientsDataRef.current.find(c => String(c.key) === String(key));
                        if (!client) return;
                        if (popup.__reactRoot) { popup.__reactRoot.unmount(); }
                        popup.__reactRoot = ReactDOM.createRoot(activePlaceholder);
                        popup.__reactRoot.render(<PopupButton client={client} onEdit={(c) => { setIsFullscreen(false); onEditClientRef.current(c); }} />);
                        return;
                    }
                    
                    // Check if it's a potential client edit
                    const potentialPlaceholder = popupNode.querySelector('[data-popup-potential-edit]');
                    if (potentialPlaceholder) {
                        const rawLat = potentialPlaceholder.getAttribute('data-lat');
                        const rawLon = potentialPlaceholder.getAttribute('data-lon');
                        if (!rawLat || !rawLon) return;
                        
                        // Find matching potential client by lat/lon (as they don't have stable keys in old structure)
                        // Or reconstruct it from the dataset
                        const pLat = parseFloat(rawLat);
                        const pLon = parseFloat(rawLon);
                        
                        // Find exact match in potentialClients array to get full data
                        const row = potentialClientsDataRef.current.find(p => p.lat === pLat && p.lon === pLon);
                        
                        if (row) {
                            // Convert OkbDataRow to MapPoint structure for editing
                            const name = row['наименование'] || row['клиент'] || row['name'] || 'ТТ';
                            const addr = findAddressInRow(row) || '';
                            const rm = findValueInRow(row, ['рм', 'менеджер']) || '';
                            const city = findValueInRow(row, ['город']) || '';
                            const region = findValueInRow(row, ['регион', 'область']) || '';
                            const comment = row.comment || '';
                            
                            const mapPoint: MapPoint = {
                                key: String(row.key || ''), // Use the unique key we injected in useAppLogic
                                lat: pLat,
                                lon: pLon,
                                status: 'potential',
                                name,
                                address: addr,
                                city,
                                region,
                                rm,
                                brand: '',
                                packaging: '',
                                type: 'ОКБ',
                                originalRow: row,
                                comment
                            };

                            if (popup.__reactRoot) { popup.__reactRoot.unmount(); }
                            popup.__reactRoot = ReactDOM.createRoot(potentialPlaceholder);
                            popup.__reactRoot.render(
                                <PopupButton 
                                    client={mapPoint} 
                                    isPotential={true}
                                    onEdit={(c) => { 
                                        setIsFullscreen(false); 
                                        if (onEditPotentialClientRef.current) {
                                            onEditPotentialClientRef.current(c); 
                                        }
                                    }} 
                                />
                            );
                        }
                    }
                };
                renderButton();
                popup.once('contentupdate', renderButton);
                requestAnimationFrame(renderButton);
            });

            map.on('popupclose', (e) => {
                const popup = e.popup as any;
                if (popup.__reactRoot) { popup.__reactRoot.unmount(); popup.__reactRoot = null; }
            });
        }
        return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; tileLayerRef.current = null; } };
    }, []); 

    // ... (rest of effects same) ...
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
    
    // ... (createGroupPopupContent same) ...
    const createGroupPopupContent = (clients: MapPoint[]) => {
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
            <!-- Header -->
            <div style="background: white; padding: 12px; border-bottom: 1px solid #e5e7eb; border-radius: 8px 8px 0 0;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 700;">
                        ${firstClient.city || 'Город не определен'}
                    </div>
                    <span style="background: #ecfdf5; color: #059669; font-size: 9px; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0; font-weight: 700; text-transform: uppercase;">
                        Активен
                    </span>
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
            
            <!-- Body -->
            <div class="custom-scrollbar" style="max-height: 180px; overflow-y: auto; padding: 8px 12px; background: white;">
                ${listHtml}
            </div>
            
            <!-- Footer -->
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
    };
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;
        
        const potentialRenderer = L.canvas({ pane: 'markersPane' });
        const activeRenderer = L.canvas({ pane: 'activeMarkersPane' }); 

        (potentialClientMarkersLayer.current as any)?.clearLayers?.();
        (activeClientMarkersLayer.current as any)?.clearLayers?.();
        activeClientMarkersRef.current.clear();
        potentialMarkersRef.current = [];
        activeMarkersCanvasRef.current = [];
        potentialClientsDataRef.current = potentialClients; // Update Ref for popups

        const pointsForBounds: L.LatLngExpression[] = [];

        if (overlayMode !== 'abc') {
            potentialClients.forEach(tt => {
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

                    // Updated Popup Content with placeholder for Edit Button
                    const popupContent = `
                        <b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>
                        ${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br>
                        <small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>
                        <div data-popup-potential-edit data-lat="${lat}" data-lon="${lon}"></div>
                    `;
                    
                    const marker = L.circleMarker([lat, lon], {
                        fillColor: '#3b82f6', 
                        color: '#1d4ed8', 
                        weight: 1, 
                        opacity: 0.8, 
                        fillOpacity: 0.6, 
                        radius: 4, 
                        pane: 'markersPane', 
                        renderer: potentialRenderer 
                    }).bindPopup(popupContent, { closeButton: true, autoPan: true });
                    
                    potentialClientMarkersLayer.current?.addLayer(marker);
                    potentialMarkersRef.current.push(marker);
                }
            });
        }

        const groupedClientsMap = new Map<string, MapPoint[]>();
        
        activeClients.forEach(client => {
            const normAddr = normalizeAddress(client.address);
            let groupKey = normAddr;
            if (!groupKey) {
                const lat = client.lat;
                const lon = client.lon;
                if (lat && lon) {
                    groupKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
                } else {
                    return; 
                }
            }
            if (!groupedClientsMap.has(groupKey)) {
                groupedClientsMap.set(groupKey, []);
            }
            groupedClientsMap.get(groupKey)!.push(client);
        });

        activeClientsDataRef.current = activeClients;

        groupedClientsMap.forEach((groupClients) => {
            // ... (keep active client sorting and marker creation same) ...
            const sortedGroup = [...groupClients].sort((a, b) => {
                const timeA = a.lastUpdated || 0;
                const timeB = b.lastUpdated || 0;
                if (timeA !== timeB) return timeB - timeA;
                return 0;
            });

            const representative = sortedGroup[0];
            
            if (representative.coordStatus === 'pending' || representative.isGeocoding) {
                return;
            }
            
            let lat = representative.lat;
            let lon = representative.lon;

            if (lat === undefined || lon === undefined) {
                 lat = parseCoord(getCoordinate(representative, ['lat', 'latitude']));
                 lon = parseCoord(getCoordinate(representative, ['lon', 'lng']));
            }

            if (lat && lon && (Math.abs(lat) > 1 || Math.abs(lon) > 1)) {
                if (lon < -170) lon += 360;
                
                pointsForBounds.push([lat, lon]);

                const popupContent = createGroupPopupContent(groupClients);
                const popupRep = groupClients[0];
                
                let markerColor = '#10b981';
                let markerBorder = '#047857';
                let markerRadius = 5;

                if (groupClients.length > 1) {
                    markerRadius = 7; 
                    markerBorder = '#064e3b';
                }

                if (overlayMode === 'abc') {
                    let bestCategory = 'C';
                    for (const curr of groupClients) {
                        if (curr.abcCategory === 'A') { bestCategory = 'A'; break; }
                        if (curr.abcCategory === 'B') bestCategory = 'B';
                    }

                    switch (bestCategory) {
                        case 'A': markerColor = '#10b981'; markerBorder = '#047857'; markerRadius = groupClients.length > 1 ? 9 : 7; break; // Green
                        case 'B': markerColor = '#f59e0b'; markerBorder = '#b45309'; markerRadius = groupClients.length > 1 ? 7 : 5; break; // Amber
                        default: markerColor = '#9ca3af'; markerBorder = '#4b5563'; markerRadius = groupClients.length > 1 ? 5 : 3; break;
                    }
                } else {
                    const lastSaleDate = getLastSaleDateForGroup(groupClients);
                    if (lastSaleDate) {
                        const now = new Date();
                        const diffTime = Math.abs(now.getTime() - lastSaleDate.getTime());
                        const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44); 

                        if (diffMonths > 12) {
                            markerColor = '#ef4444'; 
                            markerBorder = '#b91c1c';
                        } else if (diffMonths > 6) {
                            markerColor = '#f59e0b'; 
                            markerBorder = '#b45309';
                        } else {
                            markerColor = '#10b981'; 
                            markerBorder = '#047857';
                        }
                    } else {
                        markerColor = '#10b981'; 
                        markerBorder = '#047857';
                    }
                }

                const marker = L.circleMarker([lat, lon], {
                    fillColor: markerColor, 
                    color: markerBorder, 
                    weight: groupClients.length > 1 ? 2 : 1, 
                    opacity: 1, 
                    fillOpacity: 0.8, 
                    radius: markerRadius, 
                    pane: 'activeMarkersPane',
                    renderer: activeRenderer
                }).bindPopup(popupContent, { minWidth: 280, maxWidth: 320, className: 'rm-popup-solid' });
                
                activeClientMarkersLayer.current?.addLayer(marker);
                activeClientMarkersRef.current.set(popupRep.key, marker);
                activeMarkersCanvasRef.current.push(marker);
            }
        });

        if (overlayMode === 'abc') {
            map.removeLayer(potentialClientMarkersLayer.current!);
        } else {
            if (!map.hasLayer(potentialClientMarkersLayer.current!)) {
                map.addLayer(potentialClientMarkersLayer.current!);
            }
        }
        
        if (pointsForBounds.length > 0 && !flyToClientKey) { map.fitBounds(L.latLngBounds(pointsForBounds).pad(0.1)); }
    }, [potentialClients, activeClients, overlayMode, getLastSaleDateForGroup]);

    // ... (rest same) ...
    useEffect(() => {
        if (geoJsonData && mapInstance.current && geoJsonLayer.current === null) {
            geoJsonLayer.current = L.geoJSON(geoJsonData as any, {
                pane: 'regionsPane', 
                style: getStyleForRegion,
                onEachFeature: (feature, layer) => {
                    layer.on({
                        click: (e: any) => {
                            if (tryOpenMarkerPopupAt(e.latlng)) {
                                return;
                            }
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
                
            }).addTo(mapInstance.current);
        } else if (geoJsonLayer.current) {
            geoJsonLayer.current.setStyle(getStyleForRegion);
            
            // Update popups based on overlay mode
            geoJsonLayer.current.eachLayer((layer: any) => {
                const feature = layer.feature;
                if (feature && feature.properties && feature.properties.name) {
                    const name = feature.properties.name;
                    
                    if (overlayMode === 'pets') {
                        const petData = getPetDataForRegion(name);
                        if (petData) {
                            const content = `
                                <div style="min-width: 200px; padding: 4px;">
                                    <h3 style="font-weight: 800; font-size: 14px; margin-bottom: 8px; color: #111827;">${name}</h3>
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                                        <span style="font-size: 12px; color: #4b5563;">🐱 Кошки</span>
                                        <span style="font-weight: 700; color: #8b5cf6;">${petData.catsPercent}%</span>
                                    </div>
                                    <div style="width: 100%; height: 4px; background: #f3f4f6; border-radius: 2px; margin-bottom: 8px; overflow: hidden;">
                                        <div style="width: ${petData.catsPercent}%; height: 100%; background: #8b5cf6;"></div>
                                    </div>
                                    
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                                        <span style="font-size: 12px; color: #4b5563;">🐶 Собаки</span>
                                        <span style="font-weight: 700; color: #f97316;">${petData.dogsPercent}%</span>
                                    </div>
                                    <div style="width: 100%; height: 4px; background: #f3f4f6; border-radius: 2px; margin-bottom: 12px; overflow: hidden;">
                                        <div style="width: ${petData.dogsPercent}%; height: 100%; background: #f97316;"></div>
                                    </div>
                                    
                                    ${petData.isCis && petData.comment ? `
                                        <div style="background: #f9fafb; padding: 8px; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 8px;">
                                            <div style="font-size: 10px; font-weight: 700; color: #6b7280; margin-bottom: 2px; text-transform: uppercase;">Причины</div>
                                            <div style="font-size: 11px; color: #374151; line-height: 1.4;">${petData.comment}</div>
                                        </div>
                                    ` : ''}
                                    
                                    <div style="font-size: 9px; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; pt-2; margin-top: 8px;">
                                        Источник: аналитическая модель + отчеты Purina и Nestlé
                                    </div>
                                </div>
                            `;
                            layer.bindPopup(content, { closeButton: false, className: 'region-popup' });
                        } else {
                            layer.unbindPopup();
                        }
                    } else {
                        layer.unbindPopup();
                    }
                }
            });
        }
    }, [geoJsonData, selectedRegions, localTheme, overlayMode, tryOpenMarkerPopupAt]);

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
        <div
            className={[
                "relative w-full overflow-hidden transition-all duration-500",
                "rounded-3xl border border-slate-200 bg-white",
                "shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
                isFullscreen ? "fixed inset-0 z-[100] h-screen" : "h-[600px] group",
            ].join(" ")}
        >
            <div ref={mapContainer} className="relative z-0 h-full w-full bg-white" />

            <div className="absolute top-4 left-14 z-[400] w-80">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Поиск региона…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={[
                            "w-full rounded-2xl border border-slate-200 bg-white/90 backdrop-blur",
                            "px-4 py-3 pl-11 text-sm font-bold text-slate-900 shadow-[0_18px_50px_rgba(15,23,42,0.10)]",
                            "focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition",
                        ].join(" ")}
                    />
                    <div className="absolute left-4 top-3.5 text-slate-400">
                        <SearchIcon small />
                    </div>

                    {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-[0_18px_60px_rgba(15,23,42,0.14)] overflow-hidden max-h-64 overflow-y-auto custom-scrollbar">
                            {searchResults.map((res, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => handleLocationSelect(res)}
                                    className="px-4 py-3 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 border-b border-slate-200 last:border-0 transition-colors flex items-center justify-between"
                                >
                                    <span className="font-bold">{res.name}</span>
                                    <span className="text-[10px] uppercase text-slate-600 font-black bg-slate-900/5 px-2 py-1 rounded-xl border border-slate-200">
                                        Регион
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
                <button
                    onClick={() => setLocalTheme((t) => (t === "dark" ? "light" : "dark"))}
                    className="p-2.5 bg-white/90 backdrop-blur rounded-2xl border border-slate-200 text-slate-700 hover:bg-white transition-all shadow-[0_18px_50px_rgba(15,23,42,0.10)] active:scale-95"
                    title="Сменить тему"
                >
                    {localTheme === "dark" ? <SunIcon small /> : <MoonIcon small />}
                </button>

                <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2.5 bg-white/90 backdrop-blur rounded-2xl border border-slate-200 text-slate-700 hover:bg-white transition-all shadow-[0_18px_50px_rgba(15,23,42,0.10)] active:scale-95"
                    title={isFullscreen ? "Свернуть" : "На весь экран"}
                >
                    {isFullscreen ? <MinimizeIcon small /> : <MaximizeIcon small />}
                </button>
            </div>

            <div className="absolute bottom-8 left-24 z-[400]">
                <div className="bg-white/90 backdrop-blur p-1.5 rounded-2xl border border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.14)] flex gap-1">
                    {(['sales', 'pets', 'competitors', 'age', 'abc'] as OverlayMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setOverlayMode(mode)}
                            className={[
                                "px-3.5 py-2 rounded-xl text-xs font-black transition-all",
                                overlayMode === mode
                                    ? "bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-[0_12px_30px_rgba(99,102,241,0.18)]"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-900/5",
                            ].join(" ")}
                        >
                            {mode === 'sales'
                                ? 'Продажи'
                                : mode === 'pets'
                                ? 'Питомцы'
                                : mode === 'competitors'
                                ? 'Конкуренты'
                                : mode === 'age'
                                ? 'Возраст'
                                : 'ABC'}
                        </button>
                    ))}
                </div>
            </div>

            {isLoadingGeo && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/70 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                        <LoaderIcon className="w-8 h-8 text-indigo-600" />
                        <span className="text-slate-900 font-black text-sm">Загрузка геометрии…</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(InteractiveRegionMap);
