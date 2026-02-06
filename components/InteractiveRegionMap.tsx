
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { getMarketData } from '../utils/marketData';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon, CheckIcon } from './icons';
import type { FeatureCollection } from 'geojson';
import { MANUAL_BOUNDARIES } from '../data/manual_boundaries';
import { normalizeAddress } from '../utils/dataUtils';

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
    
    // Helper to check validity (non-zero number or non-empty string that isn't "0")
    const isValid = (val: any) => {
        if (val === undefined || val === null || val === '') return false;
        if (typeof val === 'number') return val !== 0;
        if (typeof val === 'string') return val !== '0' && val !== '0.0';
        return true;
    };

    // 1. Check top-level properties (lat, lon, latitude, etc.)
    for (const key of keys) {
        if (isValid(item[key])) return item[key];
        
        // Case-insensitive check
        const lowerKey = key.toLowerCase();
        const foundKey = Object.keys(item).find(k => k.toLowerCase() === lowerKey);
        if (foundKey && isValid(item[foundKey])) return item[foundKey];
    }

    // 2. Check originalRow if available (Deep Lookup)
    const original = item.originalRow || item.rowData;
    if (original && typeof original === 'object') {
        for (const key of keys) {
            // Case-insensitive check inside originalRow
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
        const tooltip = "Условный индекс (0-100), рассчитанный на основе урбанизации, кол-ва домохозяйств и косвенных данных (объемы продаж, кол-во вет.клиник).";
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">
                    Плотность питомцев
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#10b981', opacity: 0.7}}></span>
                        <span className="text-xs">Высокая (&gt;80)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f59e0b', opacity: 0.5}}></span>
                        <span className="text-xs">Средняя (50-80)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#6b7280', opacity: 0.3}}></span>
                        <span className="text-xs">Низкая (&lt;50)</span>
                    </div>
                </div>
            </div>
        );
    }
    if (mode === 'competitors') {
        const tooltip = "Условный индекс (0-100), учитывающий плотность зоо-ритейла, присутствие федеральных сетей и активность крупных игроков.";
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">
                    Конкуренция
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#ef4444', opacity: 0.7}}></span>
                        <span className="text-xs">Агрессивная (&gt;80)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f97316', opacity: 0.5}}></span>
                        <span className="text-xs">Умеренная (50-80)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#3b82f6', opacity: 0.3}}></span>
                        <span className="text-xs">Слабая (&lt;50)</span>
                    </div>
                </div>
            </div>
        );
    }
    if (mode === 'age') {
        const tooltip = "Средний медианный возраст владельца животного в регионе по данным Росстата и демографической статистики СНГ.";
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">
                    Возраст владельцев
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#10b981', opacity: 0.7}}></span>
                        <span className="text-xs">Молодые (&lt;35)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f59e0b', opacity: 0.5}}></span>
                        <span className="text-xs">Средний (35-45)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
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

// React component for the popup button to ensure stable event handling
const PopupButton: React.FC<{ client: MapPoint; onEdit: (client: MapPoint) => void }> = ({ client, onEdit }) => {
    return (
        <button
            onClick={() => onEdit(client)}
            className="group mt-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40 active:scale-[0.98]"
        >
            <svg className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
            Редактировать адрес
        </button>
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
    
    // Store deduplicated clients for popup reference
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
        if (overlayMode === 'sales' || overlayMode === 'abc') { return { ...baseBorder, fillColor: isSelected ? '#818cf8' : '#111827', fillOpacity: isSelected ? 0.3 : 0.2, interactive: true }; }
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
            
            // Pane setup for z-index layering
            map.createPane('regionsPane');
            map.getPane('regionsPane')!.style.zIndex = '400';
            
            // General markers pane (e.g. potential clients)
            map.createPane('markersPane');
            map.getPane('markersPane')!.style.zIndex = '600'; 

            // IMPORTANT: Dedicated pane for active markers to ensure they are always on top
            map.createPane('activeMarkersPane');
            map.getPane('activeMarkersPane')!.style.zIndex = '650';

            L.control.zoom({ position: 'topleft' }).addTo(map);
            layerControl.current = L.control.layers({}, {}, { position: 'bottomleft' }).addTo(map);

            const legend = new (L.Control.extend({
                onAdd: function() { const div = L.DomUtil.create('div', 'info legend'); legendContainerRef.current = div; return div; },
                onRemove: function() { legendContainerRef.current = null; }
            }))({ position: 'bottomright' });
            
            legend.addTo(map);
            map.on('click', resetHighlight);

            // --- REFACTORED POPUP LOGIC ---
            
            map.on('popupopen', (e) => {
                const popup = e.popup as any;

                const renderButton = () => {
                    const popupNode = popup.getElement();
                    if (!popupNode) return;

                    // Try to find the placeholder
                    const placeholder = popupNode.querySelector('[data-popup-edit]');
                    if (!placeholder) return;

                    const rawKey = placeholder.getAttribute('data-key');
                    if (!rawKey) return;

                    const key = decodeURIComponent(rawKey);
                    
                    const client = activeClientsDataRef.current.find(
                        c => String(c.key) === String(key)
                    );

                    if (!client) return;

                    if (popup.__reactRoot) {
                        popup.__reactRoot.unmount();
                    }
                    
                    popup.__reactRoot = ReactDOM.createRoot(placeholder);
                    
                    popup.__reactRoot.render(
                        <PopupButton client={client} onEdit={(c) => {
                            setIsFullscreen(false);
                            onEditClientRef.current(c);
                        }} />
                    );
                };

                renderButton();
                popup.once('contentupdate', renderButton);
                requestAnimationFrame(renderButton);
            });

            map.on('popupclose', (e) => {
                const popup = e.popup as any;
                if (popup.__reactRoot) {
                    popup.__reactRoot.unmount();
                    popup.__reactRoot = null;
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
    
    const createGroupPopupContent = (clients: MapPoint[]) => {
        const totalFact = clients.reduce((sum, c) => sum + (c.fact || 0), 0);
        const firstClient = clients[0];
        
        // Sort by volume descending for better visibility
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
            <div class="flex items-start justify-between py-2 border-b border-gray-700/50 last:border-0 hover:bg-white/5 transition-colors px-1 rounded-md">
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-8 h-8 rounded-lg ${brandColor} bg-opacity-20 text-white flex items-center justify-center font-bold text-xs border border-white/10 flex-shrink-0">
                        ${(c.brand || '?').charAt(0).toUpperCase()}
                    </div>
                    <div class="min-w-0">
                        <div class="font-bold text-gray-200 text-xs truncate" title="${c.brand} ${c.packaging || ''}">${c.brand} <span class="font-normal text-gray-500">${c.packaging || ''}</span></div>
                        <div class="text-[10px] text-gray-400 truncate">${c.type || 'Канал не указан'}</div>
                    </div>
                </div>
                <div class="text-right pl-2 flex-shrink-0">
                    <div class="font-mono font-bold text-emerald-400 text-xs whitespace-nowrap">${new Intl.NumberFormat('ru-RU').format(c.fact || 0)}</div>
                    <div class="w-12 h-1 bg-gray-700 rounded-full mt-1 ml-auto overflow-hidden">
                        <div class="h-full ${brandColor} transition-all" style="width: ${pct}%"></div>
                    </div>
                </div>
            </div>
        `}).join('');

        const addressParts = firstClient.address.split(',').map(p => p.trim());
        const shortAddress = addressParts.length > 2 
            ? `${addressParts[0]}, ...${addressParts[addressParts.length-1]}` 
            : firstClient.address;

        return `
        <div class="popup-inner-content" style="min-width: 280px; padding: 0;">
            <!-- Header -->
            <div style="background: linear-gradient(to right, rgba(17, 24, 39, 0.95), rgba(31, 41, 55, 0.9)); padding: 12px; border-bottom: 1px solid rgba(75, 85, 99, 0.5); border-radius: 8px 8px 0 0;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; font-weight: 700;">
                        ${firstClient.city || 'Город не определен'}
                    </div>
                    <span style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 9px; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700; text-transform: uppercase;">
                        Активен
                    </span>
                </div>
                <div style="font-weight: 700; color: #f3f4f6; font-size: 13px; line-height: 1.4; word-break: break-word;">
                    ${firstClient.address}
                </div>
                <div style="margin-top: 6px; display: flex; gap: 8px;">
                     <div style="font-size: 10px; color: #d1d5db; background: rgba(55, 65, 81, 0.5); padding: 2px 6px; rounded: 4px;">
                        Клиентов: <strong style="color: white;">${clients.length}</strong>
                    </div>
                </div>
            </div>
            
            <!-- Body -->
            <div class="custom-scrollbar" style="max-height: 180px; overflow-y: auto; padding: 8px 12px; background: rgba(17, 24, 39, 0.8);">
                ${listHtml}
            </div>
            
            <!-- Footer -->
            <div style="background: rgba(17, 24, 39, 0.95); padding: 10px 12px; border-top: 1px solid rgba(75, 85, 99, 0.5); border-radius: 0 0 8px 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Всего продажи</span>
                    <span style="font-size: 16px; color: #10b981; font-weight: 800; font-family: monospace; text-shadow: 0 0 10px rgba(16, 185, 129, 0.3);">
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
        
        // Renderers: One for standard (blue), one for active (green/abc)
        const standardRenderer = L.canvas({ pane: 'markersPane' });
        const activeRenderer = L.canvas({ pane: 'activeMarkersPane' }); // Higher z-index

        if (potentialClientMarkersLayer.current) { map.removeLayer(potentialClientMarkersLayer.current); layerControl.current.removeLayer(potentialClientMarkersLayer.current); }
        potentialClientMarkersLayer.current = L.layerGroup();
        if (activeClientMarkersLayer.current) { map.removeLayer(activeClientMarkersLayer.current); layerControl.current.removeLayer(activeClientMarkersLayer.current); }
        activeClientMarkersLayer.current = L.layerGroup(); activeClientMarkersRef.current.clear();
    
        const pointsForBounds: L.LatLngExpression[] = [];

        // Only show potential clients if NOT in ABC mode (to reduce clutter)
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
                        fillColor: '#3b82f6', color: '#1d4ed8', weight: 1, opacity: 0.8, fillOpacity: 0.6, radius: 4, 
                        pane: 'markersPane', renderer: standardRenderer
                    }).bindPopup(popupContent);
                    potentialClientMarkersLayer.current?.addLayer(marker);
                }
            });
        }

        // --- MARKER GROUPING LOGIC START ---
        // Group clients by normalized address
        // This ensures points at the same location are collapsed into one visual marker
        const groupedClientsMap = new Map<string, MapPoint[]>();
        
        activeClients.forEach(client => {
            // Group STRICTLY by address string first
            const normAddr = normalizeAddress(client.address);
            
            // Fallback: If address is empty, use coordinate hash as key
            let groupKey = normAddr;
            if (!groupKey) {
                // For ACTIVE clients, strictly use .lat/.lon properties.
                // Do NOT use getCoordinate here to avoid falling back to stale originalRow data.
                const lat = parseCoord(client.lat);
                const lon = parseCoord(client.lon);
                if (lat && lon) {
                    groupKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
                } else {
                    return; // Skip invalid or cleared coordinates
                }
            }
            
            if (!groupedClientsMap.has(groupKey)) {
                groupedClientsMap.set(groupKey, []);
            }
            
            // Push ALL clients to the group array
            groupedClientsMap.get(groupKey)!.push(client);
        });

        // Store a flat list of ALL clients for popup lookups (keys must be preserved)
        // The popup renderer will find the client by key to mount the edit button
        activeClientsDataRef.current = activeClients;

        groupedClientsMap.forEach((groupClients) => {
            // FIX: Sort to find the "Anchor" - the most authoritative point in the group.
            // 1. Most recently updated.
            // 2. Explicitly confirmed coords.
            // 3. Valid (non-zero) coords.
            const sortedGroup = [...groupClients].sort((a, b) => {
                const timeA = a.lastUpdated || 0;
                const timeB = b.lastUpdated || 0;
                if (timeA !== timeB) return timeB - timeA; // Newest first

                const isConfirmedA = a.coordStatus === 'confirmed';
                const isConfirmedB = b.coordStatus === 'confirmed';
                if (isConfirmedA !== isConfirmedB) return isConfirmedA ? -1 : 1;

                const hasCoordsA = a.lat && a.lon && a.lat !== 0;
                const hasCoordsB = b.lat && b.lon && b.lat !== 0;
                if (hasCoordsA !== hasCoordsB) return hasCoordsA ? -1 : 1;

                return 0;
            });

            // The first one in sorted list is our best candidate for position
            const representative = sortedGroup[0];
            
            // Safety Net: If status is explicitly pending, do not show marker
            if (representative.coordStatus === 'pending' || representative.isGeocoding) {
                return;
            }
            
            // CRITICAL FIX: Direct access to properties to avoid stale originalRow data fallback
            const lat = parseCoord(representative.lat);
            let lon = parseCoord(representative.lon);

            // Only render if valid
            if (lat !== null && lon !== null && (Math.abs(lat) > 1 || Math.abs(lon) > 1)) {
                if (lon < -170) lon += 360;
                
                pointsForBounds.push([lat, lon]);

                // Generate popup content summarizing ALL clients in the group (passed original array)
                const popupContent = createGroupPopupContent(groupClients);
                
                // Representative used for edit button ID (usually the first one for stability)
                const popupRep = groupClients[0];
                
                let markerColor = '#10b981'; // Default Green (Sales mode)
                let markerBorder = '#047857';
                let markerRadius = 5;

                // Adjust size if it's a group
                if (groupClients.length > 1) {
                    markerRadius = 7; 
                    // Visual cue for group? Maybe thicker border
                    markerBorder = '#064e3b'; // Darker green
                }

                if (overlayMode === 'abc') {
                    // For ABC mode, use the best category in the group to determine color
                    const bestCategory = groupClients.reduce((best, curr) => {
                        if (curr.abcCategory === 'A') return 'A';
                        if (best === 'A') return 'A';
                        if (curr.abcCategory === 'B') return 'B';
                        if (best === 'B') return 'B';
                        return 'C';
                    }, 'C');

                    switch (bestCategory) {
                        case 'A':
                            markerColor = '#f59e0b'; // Amber
                            markerBorder = '#b45309';
                            markerRadius = groupClients.length > 1 ? 9 : 7;
                            break;
                        case 'B':
                            markerColor = '#10b981'; // Emerald
                            markerBorder = '#047857';
                            markerRadius = groupClients.length > 1 ? 7 : 5;
                            break;
                        default: // C
                            markerColor = '#9ca3af'; // Gray
                            markerBorder = '#4b5563';
                            markerRadius = groupClients.length > 1 ? 5 : 3;
                            break;
                    }
                }

                const marker = L.circleMarker([lat, lon], {
                    fillColor: markerColor, 
                    color: markerBorder, 
                    weight: groupClients.length > 1 ? 2 : 1, 
                    opacity: 1, 
                    fillOpacity: 0.8, 
                    radius: markerRadius, 
                    pane: 'activeMarkersPane', // FORCE ON TOP
                    renderer: activeRenderer
                }).bindPopup(popupContent, { minWidth: 280, maxWidth: 320 });
                
                activeClientMarkersLayer.current?.addLayer(marker);
                
                // Map the representative key to the marker for flyTo operations
                activeClientMarkersRef.current.set(popupRep.key, marker);
            }
        });
        // --- MARKER GROUPING LOGIC END ---

        if (overlayMode !== 'abc') potentialClientMarkersLayer.current.addTo(map);
        activeClientMarkersLayer.current.addTo(map);
        
        if (overlayMode !== 'abc') layerControl.current.addOverlay(potentialClientMarkersLayer.current, '<span class="text-blue-400 font-bold">●</span> Потенциал (ОКБ)');
        layerControl.current.addOverlay(activeClientMarkersLayer.current, '<span class="text-emerald-400 font-bold">●</span> Активные ТТ');

        if (pointsForBounds.length > 0 && !flyToClientKey) { map.fitBounds(L.latLngBounds(pointsForBounds).pad(0.1)); }
    }, [potentialClients, activeClients, overlayMode]); // Re-run when data or mode changes

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
