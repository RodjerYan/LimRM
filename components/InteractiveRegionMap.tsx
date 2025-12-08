
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { getMarketData } from '../utils/marketData';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon, CheckIcon } from './icons';
import type { FeatureCollection } from 'geojson';
import { moldovaGeoJSON } from '../data/moldova_geojson';

type Theme = 'dark' | 'light';
type OverlayMode = 'sales' | 'pets' | 'competitors';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    potentialClients: OkbDataRow[];
    activeClients: MapPoint[];
    flyToClientKey: string | null;
    theme?: Theme; // Global theme (initial state)
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

const MapLegend: React.FC<{ mode: OverlayMode }> = ({ mode }) => {
    if (mode === 'pets') {
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">
                    <span className="text-lg">🐶</span> Плотность питомцев
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
                    <span className="text-lg">⚔️</span> Конкуренция
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
    
    // Remote GeoJSON Data State
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [isLoadingGeo, setIsLoadingGeo] = useState(true);
    const [isFromCache, setIsFromCache] = useState(false);
    
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    // Fetch High-Quality GeoJSONs with Caching
    useEffect(() => {
        const fetchGeoData = async () => {
            const CACHE_NAME = 'limkorm-geo-v1';
            const RUSSIA_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson';
            const WORLD_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

            try {
                setIsLoadingGeo(true);
                let russiaData, worldData;
                let usedCache = false;

                // 1. Try Cache API
                if ('caches' in window) {
                    try {
                        const cache = await caches.open(CACHE_NAME);
                        const [russiaRes, worldRes] = await Promise.all([
                            cache.match(RUSSIA_URL),
                            cache.match(WORLD_URL)
                        ]);

                        if (russiaRes && worldRes) {
                            russiaData = await russiaRes.json();
                            worldData = await worldRes.json();
                            usedCache = true;
                            setIsFromCache(true);
                        } else {
                            // Fetch and Cache
                            const [rNetwork, wNetwork] = await Promise.all([
                                fetch(RUSSIA_URL),
                                fetch(WORLD_URL)
                            ]);
                            
                            if (rNetwork.ok && wNetwork.ok) {
                                cache.put(RUSSIA_URL, rNetwork.clone());
                                cache.put(WORLD_URL, wNetwork.clone());
                                russiaData = await rNetwork.json();
                                worldData = await wNetwork.json();
                            }
                        }
                    } catch (e) {
                        console.warn('Cache API error:', e);
                    }
                }

                // Fallback if cache failed or data missing
                if (!russiaData || !worldData) {
                    const [rRes, wRes] = await Promise.all([
                        fetch(RUSSIA_URL),
                        fetch(WORLD_URL)
                    ]);
                    russiaData = await rRes.json();
                    worldData = await wRes.json();
                }

                // Filter & Translate CIS Countries
                const cisCountriesMap: Record<string, string> = {
                    'Belarus': 'Республика Беларусь',
                    'Kazakhstan': 'Республика Казахстан',
                    'Kyrgyzstan': 'Кыргызская Республика',
                    'Uzbekistan': 'Республика Узбекистан',
                    'Tajikistan': 'Республика Таджикистан',
                    'Turkmenistan': 'Туркменистан',
                    'Armenia': 'Армения',
                    'Azerbaijan': 'Азербайджан',
                    'Georgia': 'Грузия',
                    'Moldova': 'Республика Молдова'
                };

                const cisFeatures = worldData.features.filter((f: any) => cisCountriesMap[f.properties.name]);
                cisFeatures.forEach((f: any) => {
                    f.properties.name = cisCountriesMap[f.properties.name];
                    
                    // --- HIGH-RES GEOMETRY OVERRIDE ---
                    // Replace simplified Moldova geometry with detailed polygon
                    if (f.properties.name === 'Республика Молдова' && moldovaGeoJSON) {
                        f.geometry = moldovaGeoJSON.geometry;
                    }
                });

                // Merge collections
                setGeoJsonData({
                    type: 'FeatureCollection',
                    features: [...russiaData.features, ...cisFeatures]
                });

            } catch (error) {
                console.error("Error fetching map geometry:", error);
            } finally {
                setIsLoadingGeo(false);
            }
        };

        fetchGeoData();
    }, []);

    // Sync refs with props
    useEffect(() => {
        activeClientsDataRef.current = activeClients;
    }, [activeClients]);

    useEffect(() => {
        onEditClientRef.current = onEditClient;
    }, [onEditClient]);

    const searchableLocations = useMemo<SearchableLocation[]>(() => {
        if (!geoJsonData) return [];
        const locations: SearchableLocation[] = [];
        const addedNames = new Set<string>();

        geoJsonData.features.forEach((feature: any) => {
            const name = feature.properties?.name;
            if (name && !addedNames.has(name)) {
                locations.push({ name, type: 'region' });
                addedNames.add(name);
            }
        });
        return locations.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }, [geoJsonData]);

    useEffect(() => {
        if (searchTerm.trim().length > 1) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            const results = searchableLocations
                .filter(loc => loc.name.toLowerCase().includes(lowerSearchTerm))
                .slice(0, 7);
            setSearchResults(results);
        } else {
            setSearchResults([]);
        }
    }, [searchTerm, searchableLocations]);

    // --- STYLING LOGIC ---
    
    const getStyleForRegion = (feature: any) => {
        const regionName = feature.properties?.name;
        const marketData = getMarketData(regionName);
        const isSelected = selectedRegions.includes(regionName);
        
        // Base border style - SHARPER and more visible
        const baseBorder = {
            weight: isSelected ? 2 : 1, // Thinner, crisper borders
            opacity: 1,
            color: isSelected ? '#818cf8' : (localTheme === 'dark' ? '#6b7280' : '#9ca3af'), 
            fillColor: 'transparent',
            fillOpacity: 0,
            className: isSelected ? 'selected-region-layer' : ''
        };

        // Mode 1: Sales (Clean) - Default
        if (overlayMode === 'sales') {
            return {
                ...baseBorder,
                fillColor: isSelected ? '#818cf8' : '#374151', 
                fillOpacity: isSelected ? 0.2 : 0, // Zero opacity for non-selected to show base map clearly
                interactive: true
            };
        }

        // Mode 2: Pets (Heat map)
        if (overlayMode === 'pets') {
            const density = marketData.petDensityIndex;
            let fillColor = '#6b7280'; 
            let fillOpacity = 0.3;
            
            if (density > 80) {
                fillColor = '#10b981'; 
                fillOpacity = 0.6;
            } else if (density > 50) {
                fillColor = '#f59e0b';
                fillOpacity = 0.5;
            }
            
            return {
                ...baseBorder,
                color: isSelected ? '#ffffff' : '#4b5563',
                fillColor: fillColor,
                fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity,
                interactive: true
            };
        } 
        
        // Mode 3: Competitors
        if (overlayMode === 'competitors') {
            const comp = marketData.competitorDensityIndex;
            let fillColor = '#3b82f6';
            let fillOpacity = 0.3;
            
            if (comp > 80) {
                fillColor = '#ef4444';
                fillOpacity = 0.6;
            } else if (comp > 50) {
                fillColor = '#f97316';
                fillOpacity = 0.5;
            }

            return {
                ...baseBorder,
                color: isSelected ? '#ffffff' : '#4b5563',
                fillColor: fillColor,
                fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity,
                interactive: true
            };
        }

        return baseBorder;
    };

    const resetHighlight = useCallback(() => {
        if (highlightedLayer.current && geoJsonLayer.current) {
            geoJsonLayer.current.resetStyle(highlightedLayer.current as L.Path);
        }
        highlightedLayer.current = null;
    }, [overlayMode, localTheme]); 

    const highlightRegion = useCallback((layer: L.Layer) => {
        resetHighlight();
        if (layer instanceof L.Path) {
             layer.setStyle({ 
                 weight: 2, 
                 color: '#fbbf24', // Amber-400 Highlight
                 opacity: 1, 
                 fillOpacity: 0.2,
                 dashArray: '' 
             }).bringToFront();
             highlightedLayer.current = layer;
        }
    }, [resetHighlight]);

    const handleLocationSelect = useCallback((location: SearchableLocation) => {
        const map = mapInstance.current;
        if (!map) return;

        setSearchTerm('');
        setSearchResults([]);

        let foundLayer: L.Layer | null = null;
        if (location.type === 'region') {
            geoJsonLayer.current?.eachLayer(layer => {
                if ((layer as any).feature?.properties?.name.toLowerCase() === location.name.toLowerCase()) {
                    foundLayer = layer;
                }
            });
        }
        
        if (foundLayer) {
            map.fitBounds((foundLayer as L.Polygon).getBounds());
            highlightRegion(foundLayer);
        }
    }, [highlightRegion]);

    // Handle Map Resize
    useEffect(() => {
        const map = mapInstance.current;
        if (map) {
            const timer = setTimeout(() => map.invalidateSize(true), 200);
            return () => clearTimeout(timer);
        }
    }, [data, isFullscreen]);
    
    // Initialize Map Structure
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, { 
                center: [55, 60], 
                zoom: 3, 
                minZoom: 2, 
                scrollWheelZoom: true, 
                preferCanvas: true, // IMPORTANT for performance
                worldCopyJump: true,
                zoomControl: false, 
                attributionControl: false 
            });
            mapInstance.current = map;
            
            L.control.zoom({ position: 'topleft' }).addTo(map);

            map.createPane('markerPane');
            const markerPane = map.getPane('markerPane');
            if (markerPane) {
                markerPane.style.zIndex = '650';
            }

            layerControl.current = L.control.layers({}, {}, { position: 'bottomleft' }).addTo(map);

            const legend = new (L.Control.extend({
                onAdd: function() {
                    const div = L.DomUtil.create('div', 'info legend');
                    legendContainerRef.current = div;
                    return div;
                },
                onRemove: function() {
                    legendContainerRef.current = null;
                }
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
                                if (client) {
                                    onEditClientRef.current(client);
                                }
                            }
                        });
                    }
                }
            });
        }
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
                tileLayerRef.current = null;
            }
        };
    }, []); 

    // Render Legend
    useEffect(() => {
        if (legendContainerRef.current) {
            const root = (ReactDOM as any).createRoot(legendContainerRef.current);
            root.render(<MapLegend mode={overlayMode} />);
        }
    }, [overlayMode]);

    // Handle Theme
    useEffect(() => {
        const map = mapInstance.current;
        if (mapContainer.current && map) {
            const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
            const lightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            const targetUrl = localTheme === 'dark' ? darkUrl : lightUrl;
            
            if (tileLayerRef.current) {
                tileLayerRef.current.setUrl(targetUrl);
            } else {
                tileLayerRef.current = L.tileLayer(targetUrl, {
                    attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
                }).addTo(map);
                tileLayerRef.current.bringToBack();
            }
            
            if (mapContainer.current) {
                mapContainer.current.classList.remove('theme-dark', 'theme-light');
                mapContainer.current.classList.add(`theme-${localTheme}`);
            }
            setTimeout(() => map.invalidateSize(), 100);
        }
    }, [localTheme]);
    
    // ... createPopupContent helper remains same ...
    const createPopupContent = (name: string, address: string, type: string, contacts: string | undefined, key: string) => `
        <div class="popup-inner-content">
            <b>${name}</b><br>
            ${address}<br>
            <small>${type || 'н/д'}</small>
            ${contacts ? `<hr style="margin: 5px 0;"/><small>Контакты: ${contacts}</small>` : ''}
            <button 
                class="edit-location-btn mt-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1.5 px-3 rounded text-xs transition-colors flex items-center justify-center gap-2"
                data-key="${key}"
            >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                Изменить местоположение
            </button>
        </div>
    `;
    
    // Data Layers (Active/Potential)
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;
    
        if (potentialClientMarkersLayer.current) {
            map.removeLayer(potentialClientMarkersLayer.current);
            layerControl.current.removeLayer(potentialClientMarkersLayer.current);
        }
        potentialClientMarkersLayer.current = L.layerGroup();
    
        if (activeClientMarkersLayer.current) {
            map.removeLayer(activeClientMarkersLayer.current);
            layerControl.current.removeLayer(activeClientMarkersLayer.current);
        }
        activeClientMarkersLayer.current = L.layerGroup();
        activeClientMarkersRef.current.clear();
    
        potentialClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const popupContent = `
                    <b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>
                    ${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br>
                    <small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>
                `;
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    pane: 'markerPane',
                    fillColor: '#3b82f6', color: '#2563eb', radius: 3, weight: 1, opacity: 1, fillOpacity: 0.8
                }).bindPopup(popupContent);
                potentialClientMarkersLayer.current?.addLayer(marker);
            }
        });
    
        activeClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts, tt.key);
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    pane: 'markerPane',
                    fillColor: '#22c55e', color: '#16a34a', radius: 4, weight: 1, opacity: 1, fillOpacity: 0.9
                }).bindPopup(popupContent);
                activeClientMarkersLayer.current?.addLayer(marker);
                activeClientMarkersRef.current.set(tt.key, marker);
            }
        });
    
        if (overlayMode === 'sales') {
            map.addLayer(potentialClientMarkersLayer.current);
            map.addLayer(activeClientMarkersLayer.current);
        }
        
        layerControl.current.addOverlay(potentialClientMarkersLayer.current, "Потенциал (ОКБ)");
        layerControl.current.addOverlay(activeClientMarkersLayer.current, "Активные ТТ");
    
    }, [potentialClients, activeClients, data, overlayMode]);
    
    // Region Layer - OSM Source
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !geoJsonData) return;

        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        
        geoJsonLayer.current = L.geoJSON(geoJsonData as any, {
            style: getStyleForRegion,
            onEachFeature: (feature, layer) => {
                const regionName = feature.properties.name;
                if (!regionName) return;

                const marketData = getMarketData(regionName);
                let tooltipText = regionName;
                if (overlayMode === 'pets') tooltipText += `<br/>🐶 Индекс: ${marketData.petDensityIndex.toFixed(0)}`;
                if (overlayMode === 'competitors') tooltipText += `<br/>⚔️ Конкуренция: ${marketData.competitorDensityIndex.toFixed(0)}`;

                layer.bindTooltip(tooltipText, { sticky: true, className: 'leaflet-tooltip-custom' });
                layer.on({
                    click: (e) => {
                        L.DomEvent.stop(e);
                        map.fitBounds(e.target.getBounds());
                        highlightRegion(e.target);
                    },
                    mouseover: (e) => {
                        const layer = e.target;
                        if (layer !== highlightedLayer.current && overlayMode === 'sales') {
                            layer.setStyle({
                                weight: 2,
                                color: '#a5b4fc',
                                opacity: 1,
                                fillOpacity: 0.1, 
                            });
                            layer.bringToFront();
                        }
                    },
                    mouseout: (e) => {
                        const layer = e.target;
                        if (layer !== highlightedLayer.current) {
                            geoJsonLayer.current?.resetStyle(layer);
                        }
                    }
                });
            }
        }).addTo(map);

    }, [geoJsonData, selectedRegions, overlayMode, localTheme]);

    return (
        <div 
            id="interactive-map-container" 
            className={`bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-indigo-500/10 transition-all duration-500 ease-in-out ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none p-0 bg-gray-900' : 'p-6 relative'}`}
        >
            <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
            
            {/* Header Controls */}
            <div className={`flex flex-col md:flex-row justify-between items-center mb-4 gap-4 ${isFullscreen ? 'absolute top-4 left-4 z-[1001] w-[calc(100%-5rem)] pointer-events-none' : ''}`}>
                <div className="flex items-center gap-3 pointer-events-auto">
                    <h2 className={`text-xl font-bold text-text-main whitespace-nowrap drop-shadow-md ${isFullscreen ? 'bg-card-bg/80 px-4 py-2 rounded-lg backdrop-blur-md border border-gray-700' : ''}`}>
                        Карта рыночного потенциала
                    </h2>
                    {isLoadingGeo ? (
                        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-600/80 rounded-lg text-white text-xs animate-pulse shadow-lg backdrop-blur-md">
                            <LoaderIcon /> Загрузка геометрии...
                        </div>
                    ) : isFromCache ? (
                        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-600/20 border border-emerald-500/50 rounded-lg text-emerald-400 text-xs shadow-lg backdrop-blur-md">
                            <CheckIcon /> Из кэша
                        </div>
                    ) : null}
                </div>
                
                <div className={`flex bg-gray-800/80 p-1 rounded-lg border border-gray-600 pointer-events-auto backdrop-blur-md ${isFullscreen ? 'shadow-xl' : ''}`}>
                    <button onClick={() => setOverlayMode('sales')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'sales' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Продажи</button>
                    <button onClick={() => setOverlayMode('pets')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'pets' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}><span className="text-lg leading-none">🐶</span> Питомец-Индекс</button>
                    <button onClick={() => setOverlayMode('competitors')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'competitors' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}><span className="text-lg leading-none">⚔️</span> Конкуренты</button>
                </div>

                <div className={`relative w-full md:w-auto md:min-w-[300px] ${isFullscreen ? 'pointer-events-auto' : ''}`}>
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Поиск региона..." className="w-full p-2 pl-10 bg-card-bg/80 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-text-main placeholder-gray-500 transition backdrop-blur-sm" />
                    {searchResults.length > 0 && (
                        <ul className="absolute z-50 w-full mt-1 bg-card-bg/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                            {searchResults.map((loc) => (
                                <li key={loc.name} onClick={() => handleLocationSelect(loc)} className="px-4 py-2 text-text-main cursor-pointer hover:bg-indigo-500/20 flex justify-between items-center"><span>{loc.name}</span></li>
                            ))}
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
