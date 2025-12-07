
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { capitals } from '../utils/capitals';
import { getMarketData } from '../utils/marketData';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, UsersIcon, AlertIcon, TargetIcon } from './icons';

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
    type: 'region' | 'capital' | 'country' | 'urban_center';
    lat?: number;
    lon?: number;
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
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2"><TargetIcon small/> Плотность питомцев</h4>
                <div className="space-y-1">
                    <div className="flex items-center"><span className="w-3 h-3 rounded-full mr-2 bg-[#10b981]"></span><span className="text-xs">Высокая (&gt;80)</span></div>
                    <div className="flex items-center"><span className="w-3 h-3 rounded-full mr-2 bg-[#f59e0b]"></span><span className="text-xs">Средняя (50-80)</span></div>
                    <div className="flex items-center"><span className="w-3 h-3 rounded-full mr-2 bg-[#6b7280]"></span><span className="text-xs">Низкая (&lt;50)</span></div>
                </div>
            </div>
        );
    }
    if (mode === 'competitors') {
        return (
            <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2"><AlertIcon small/> Конкуренция</h4>
                <div className="space-y-1">
                    <div className="flex items-center"><span className="w-3 h-3 rounded-full mr-2 bg-[#ef4444]"></span><span className="text-xs">Агрессивная</span></div>
                    <div className="flex items-center"><span className="w-3 h-3 rounded-full mr-2 bg-[#f97316]"></span><span className="text-xs">Умеренная</span></div>
                    <div className="flex items-center"><span className="w-3 h-3 rounded-full mr-2 bg-[#3b82f6]"></span><span className="text-xs">Слабая</span></div>
                </div>
            </div>
        );
    }
    return (
        <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
            <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted">Легенда</h4>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 border border-emerald-500"></span>
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
    const capitalsLayer = useRef<L.LayerGroup | null>(null);
    const urbanCentersLayer = useRef<L.LayerGroup | null>(null);
    const potentialClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const layerControl = useRef<L.Control.Layers | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const activeClientMarkersRef = useRef<Map<string, L.Layer>>(new Map());
    const legendContainerRef = useRef<HTMLDivElement | null>(null);
    
    // Refs to hold latest props to avoid stale closures in event listeners without triggering re-init
    const activeClientsDataRef = useRef<MapPoint[]>(activeClients);
    const onEditClientRef = useRef(onEditClient);

    const highlightedLayer = useRef<L.Layer | null>(null);
    const capitalMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);
    
    // Local Map Theme State (independent of App theme)
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    
    // New UI States
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    // Sync refs with props
    useEffect(() => {
        activeClientsDataRef.current = activeClients;
    }, [activeClients]);

    useEffect(() => {
        onEditClientRef.current = onEditClient;
    }, [onEditClient]);

    const searchableLocations = useMemo<SearchableLocation[]>(() => {
        const locations: SearchableLocation[] = [];
        const addedNames = new Set<string>();

        russiaRegionsGeoJSON.features.forEach(feature => {
            const name = feature.properties?.name;
            if (name && !addedNames.has(name)) {
                locations.push({ name, type: 'region' });
                addedNames.add(name);
            }
        });

        capitals.forEach(capital => {
            if (!addedNames.has(capital.name)) {
                locations.push({ 
                    name: capital.name, 
                    type: capital.type, 
                    lat: capital.lat, 
                    lon: capital.lon 
                });
                addedNames.add(capital.name);
            }
        });

        return locations.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }, []);

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
    // Updated to be clean, sharp, and transparent by default to show the high-quality base map
    const getStyleForRegion = (feature: any) => {
        const regionName = feature.properties?.name;
        const marketData = getMarketData(regionName);
        
        // Base style for border only
        const baseStyle = {
            weight: 1, // Thin, crisp border
            opacity: 0.6, // Semi-transparent border
            color: '#6b7280', // Neutral gray border
            fillOpacity: 0, // Transparent fill by default! Let the base map show.
            fillColor: 'transparent',
            interactive: true // Ensure it can still be clicked/hovered
        };

        if (overlayMode === 'pets') {
            const density = marketData.petDensityIndex;
            return {
                ...baseStyle,
                color: '#10b981', // Green tint for border
                fillColor: density > 80 ? '#10b981' : density > 50 ? '#f59e0b' : '#374151',
                fillOpacity: density > 80 ? 0.3 : density > 50 ? 0.2 : 0.05, // Very light fill
            };
        }
        
        if (overlayMode === 'competitors') {
            const comp = marketData.competitorDensityIndex;
            return {
                ...baseStyle,
                color: '#ef4444', // Red tint for border
                fillColor: comp > 80 ? '#ef4444' : comp > 50 ? '#f97316' : '#3b82f6',
                fillOpacity: comp > 80 ? 0.3 : comp > 50 ? 0.2 : 0.05,
            };
        }

        // Default 'sales' mode: Just the border, maybe highlighted if selected
        const isSelected = selectedRegions.includes(regionName);
        if (isSelected) {
            return {
                ...baseStyle,
                weight: 2,
                color: '#818cf8', // Indigo border for selected
                opacity: 1,
                fillColor: '#818cf8',
                fillOpacity: 0.1
            };
        }

        return baseStyle;
    };

    const resetHighlight = useCallback(() => {
        if (highlightedLayer.current && geoJsonLayer.current) {
            // Need to reset to current mode's style
            geoJsonLayer.current.resetStyle(highlightedLayer.current as L.Path);
        }
        highlightedLayer.current = null;
    }, [overlayMode]);

    const highlightRegion = useCallback((layer: L.Layer) => {
        resetHighlight();
        if (layer instanceof L.Path) {
             // Sharp highlight style
             layer.setStyle({ 
                 weight: 2, 
                 color: '#f59e0b', // Amber highlight
                 opacity: 1, 
                 fillColor: '#f59e0b', 
                 fillOpacity: 0.15 // Light fill to indicate selection but keep map visible
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
        } else if (location.lat && location.lon) {
             map.flyTo([location.lat, location.lon], 8);
             const marker = capitalMarkersRef.current.get(location.name);
             if (marker) setTimeout(() => marker.openPopup(), 500);
        }
    }, [highlightRegion]);

    // Handle Map Resize when data changes or fullscreen toggles
    useEffect(() => {
        const map = mapInstance.current;
        if (map) {
            const timer = setTimeout(() => map.invalidateSize(true), 200);
            return () => clearTimeout(timer);
        }
    }, [data, isFullscreen]);
    
    // Initialize Map (Structure Only)
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, { 
                center: [55, 55], 
                zoom: 4, 
                minZoom: 3, 
                scrollWheelZoom: true, 
                preferCanvas: true,
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

            // Layer Control for Overlays Only
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

    // Render Legend Portal
    useEffect(() => {
        if (legendContainerRef.current) {
            const root = (ReactDOM as any).createRoot(legendContainerRef.current);
            root.render(<MapLegend mode={overlayMode} />);
        }
    }, [overlayMode]);

    // Handle Theme Change & Tile Layer Management
    useEffect(() => {
        const map = mapInstance.current;
        if (mapContainer.current && map) {
            // Using CartoDB basemaps which have very sharp, clean lines
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
    
    // Data Layers (Active/Potential) - Visibility Control based on Mode
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
    
        // Potential Clients (Blue)
        potentialClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const popupContent = `
                    <b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>
                    ${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br>
                    <small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>
                    ${findValueInRow(tt, ['контакты']) ? `<hr style="margin: 5px 0;"/><small>Контакты: ${findValueInRow(tt, ['контакты'])}</small>` : ''}
                `;
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    pane: 'markerPane',
                    fillColor: '#3b82f6', color: '#2563eb', radius: 4, weight: 1, opacity: 1, fillOpacity: 0.8
                }).bindPopup(popupContent);
                potentialClientMarkersLayer.current?.addLayer(marker);
            }
        });
    
        // Active Clients (Green)
        activeClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts, tt.key);
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    pane: 'markerPane',
                    fillColor: '#22c55e', // Green
                    color: '#16a34a',
                    radius: 5, weight: 1, opacity: 1, fillOpacity: 0.9
                }).bindPopup(popupContent);
                activeClientMarkersLayer.current?.addLayer(marker);
                activeClientMarkersRef.current.set(tt.key, marker);
            }
        });
    
        // Add layers to map ONLY if mode is 'sales' (default)
        if (overlayMode === 'sales') {
            map.addLayer(potentialClientMarkersLayer.current);
            map.addLayer(activeClientMarkersLayer.current);
        }
        
        layerControl.current.addOverlay(potentialClientMarkersLayer.current, "Потенциал (ОКБ)");
        layerControl.current.addOverlay(activeClientMarkersLayer.current, "Активные ТТ (из файла)");
    
    }, [potentialClients, activeClients, data, overlayMode]);
    
    // Region/Capital Layers - UPDATED FOR STYLING
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        if (capitalsLayer.current) {
            if (layerControl.current) layerControl.current.removeLayer(capitalsLayer.current);
            map.removeLayer(capitalsLayer.current);
        }
        if (urbanCentersLayer.current) {
            if (layerControl.current) layerControl.current.removeLayer(urbanCentersLayer.current);
            map.removeLayer(urbanCentersLayer.current);
        }

        capitalsLayer.current = L.layerGroup();
        urbanCentersLayer.current = L.layerGroup();
        capitalMarkersRef.current.clear();

        capitals.forEach(capital => {
            const isCountryCapital = capital.type === 'country';
            const isCapital = capital.type === 'capital';
            const isUrbanCenter = capital.type === 'urban_center';

            if (isCountryCapital || isCapital || isUrbanCenter) {
                const radius = isCountryCapital ? 6 : 4;
                const hoverRadius = isCountryCapital ? 10 : 8;
                
                const options: L.CircleMarkerOptions = {
                    pane: 'markerPane',
                    radius,
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8,
                    fillColor: '#fbbf24',
                    color: '#f59e0b',
                    className: 'pulsing-marker'
                };

                let tooltipContent = capital.name;
                if (isUrbanCenter) {
                    tooltipContent = `${capital.name}<br/><small>Городской центр</small>`;
                }
                
                const marker = L.circleMarker([capital.lat, capital.lon], options).bindTooltip(tooltipContent);
                
                marker.on('mouseover', function(this: L.CircleMarker) { this.setRadius(hoverRadius); });
                marker.on('mouseout', function(this: L.CircleMarker) { this.setRadius(radius); });

                if (isUrbanCenter) {
                    urbanCentersLayer.current?.addLayer(marker);
                } else {
                    capitalsLayer.current?.addLayer(marker);
                }
                capitalMarkersRef.current.set(capital.name, marker);
            }
        });

        if (capitalsLayer.current && layerControl.current) {
            map.addLayer(capitalsLayer.current);
            layerControl.current.addOverlay(capitalsLayer.current, "Столицы и страны");
        }

        if (urbanCentersLayer.current && layerControl.current) {
            map.addLayer(urbanCentersLayer.current);
            layerControl.current.addOverlay(urbanCentersLayer.current, "Крупные города");
        }

        // Apply style based on current mode
        geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, {
            style: getStyleForRegion, // Use the dynamic style function
            onEachFeature: (feature, layer) => {
                const regionName = feature.properties.name;
                const marketData = getMarketData(regionName);
                
                let tooltipText = regionName;
                if (overlayMode === 'pets') tooltipText += `<br/>🐶 Индекс питомцев: ${marketData.petDensityIndex.toFixed(0)}`;
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
                                color: '#9ca3af',
                                opacity: 1,
                                fillOpacity: 0.1
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

    }, [selectedRegions, overlayMode]); // Re-run when mode changes
    
    const typeToLabel: Record<SearchableLocation['type'], string> = {
        region: 'Регион',
        capital: 'Столица',
        country: 'Страна',
        urban_center: 'Городской центр'
    };

    return (
        <div 
            id="interactive-map-container" 
            className={`bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-indigo-500/10 transition-all duration-500 ease-in-out ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none p-0 bg-gray-900' : 'p-6 relative'}`}
        >
            <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
            <div className={`flex flex-col md:flex-row justify-between items-center mb-4 gap-4 ${isFullscreen ? 'absolute top-4 left-4 z-[1001] w-[calc(100%-5rem)] pointer-events-none' : ''}`}>
                <h2 className={`text-xl font-bold text-text-main whitespace-nowrap drop-shadow-md ${isFullscreen ? 'pointer-events-auto bg-card-bg/80 px-4 py-2 rounded-lg backdrop-blur-md border border-gray-700' : ''}`}>
                    Карта рыночного потенциала
                </h2>
                
                {/* Overlay Switcher */}
                <div className={`flex bg-gray-800/80 p-1 rounded-lg border border-gray-600 pointer-events-auto backdrop-blur-md ${isFullscreen ? 'shadow-xl' : ''}`}>
                    <button 
                        onClick={() => setOverlayMode('sales')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'sales' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    >
                        Продажи (Clean)
                    </button>
                    <button 
                        onClick={() => setOverlayMode('pets')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'pets' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    >
                        <span className="text-lg leading-none">🐶</span> Питомец-Индекс
                    </button>
                    <button 
                        onClick={() => setOverlayMode('competitors')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${overlayMode === 'competitors' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    >
                        <span className="text-lg leading-none">⚔️</span> Конкуренты
                    </button>
                </div>

                <div className={`relative w-full md:w-auto md:min-w-[300px] ${isFullscreen ? 'pointer-events-auto' : ''}`}>
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <SearchIcon />
                    </div>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Поиск города или региона..."
                        className="w-full p-2 pl-10 bg-card-bg/80 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-text-main placeholder-gray-500 transition backdrop-blur-sm"
                    />
                    {searchResults.length > 0 && (
                        <ul className="absolute z-50 w-full mt-1 bg-card-bg/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                            {searchResults.map((loc) => (
                                <li
                                    key={`${loc.name}-${loc.type}`}
                                    onClick={() => handleLocationSelect(loc)}
                                    className="px-4 py-2 text-text-main cursor-pointer hover:bg-indigo-500/20 flex justify-between items-center"
                                >
                                    <span>{loc.name}</span>
                                    <span className="text-xs text-text-muted bg-gray-700 px-1.5 py-0.5 rounded-md">{typeToLabel[loc.type]}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            
            <div className={`relative w-full ${isFullscreen ? 'h-full' : 'h-[65vh]'} rounded-lg overflow-hidden border border-gray-700`}>
                <div ref={mapContainer} className="h-full w-full bg-gray-800 z-0" />
                
                <div className="absolute top-4 right-4 z-[2000] flex flex-col gap-3 pointer-events-auto">
                    <button
                        onClick={() => setLocalTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                        className="bg-card-bg/90 hover:bg-gray-700 text-text-main p-2.5 rounded-lg shadow-lg border border-gray-600 transition-all backdrop-blur-md flex items-center justify-center"
                        title={localTheme === 'dark' ? "Переключить на светлую карту" : "Переключить на темную карту"}
                    >
                        {localTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
                    </button>
                    
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="bg-card-bg/90 hover:bg-gray-700 text-text-main p-2.5 rounded-lg shadow-lg border border-gray-600 transition-all backdrop-blur-md flex items-center justify-center"
                        title={isFullscreen ? "Свернуть" : "Развернуть"}
                    >
                        {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InteractiveRegionMap;
