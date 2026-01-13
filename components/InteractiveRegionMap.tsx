
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

// Функция для исправления геометрии Чукотки (сшивание карты на 180 меридиане)
const fixRussiaGeoJSON = (fc: FeatureCollection): FeatureCollection => {
    const fixedFeatures = fc.features.map((feature: any) => {
        const props = feature.properties || {};
        const name = props.name || props.name_ru || '';
        
        // Ищем Чукотку по названию (в разных источниках может быть по-разному)
        const isChukotka = name.includes('Чукотск') || name.includes('Chukotka');

        if (isChukotka && feature.geometry) {
            const shiftCoords = (coords: any[]): any[] => {
                // Если это пара координат [lon, lat]
                if (typeof coords[0] === 'number') {
                    let [lon, lat] = coords;
                    // Если долгота отрицательная (Западное полушарие), сдвигаем ее вправо (+360)
                    // Это "приклеивает" кусок Аляски обратно к России визуально
                    if (lon < 0) lon += 360; 
                    return [lon, lat];
                }
                // Рекурсивно проходим по массивам (для Polygon и MultiPolygon)
                return coords.map(shiftCoords);
            };

            return {
                ...feature,
                geometry: {
                    ...feature.geometry,
                    coordinates: shiftCoords(feature.geometry.coordinates)
                }
            };
        }
        return feature;
    });
    return { ...fc, features: fixedFeatures };
};

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
            // Используем страны для контекста, но основной фокус на РФ
            const WORLD_URL = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson';

            try {
                setIsLoadingGeo(true);
                let russiaData: any = null;
                
                // Пробуем загрузить из кэша
                if ('caches' in window) {
                    try {
                        const cache = await caches.open(CACHE_NAME);
                        const russiaRes = await cache.match(RUSSIA_URL);
                        if (russiaRes) {
                            russiaData = await russiaRes.json();
                            setIsFromCache(true);
                        } else {
                            const rNetwork = await fetch(RUSSIA_URL);
                            if (rNetwork.ok) {
                                cache.put(RUSSIA_URL, rNetwork.clone());
                                russiaData = await rNetwork.json();
                            }
                        }
                    } catch (e) { console.warn('Cache API error:', e); }
                }
                
                if (!russiaData) {
                    const rRes = await fetch(RUSSIA_URL);
                    russiaData = await rRes.json();
                }

                // ВАЖНО: Исправляем геометрию (Чукотку) перед установкой в стейт
                const fixedRussiaData = fixRussiaGeoJSON(russiaData);
                
                setGeoJsonData(fixedRussiaData);
            } catch (error) { 
                console.error("Error fetching map geometry:", error); 
            } finally { 
                setIsLoadingGeo(false); 
            }
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
        const isSelected = selectedRegions.includes(regionName);
        
        // Dynamic styling based on Overlay Mode
        let fillColor = isSelected ? '#818cf8' : '#111827';
        let fillOpacity = isSelected ? 0.3 : 0.2;

        if (overlayMode !== 'sales') {
            const marketData = getMarketData(regionName);
            if (overlayMode === 'pets') {
                const val = marketData.petDensityIndex;
                fillColor = val > 80 ? '#10b981' : val > 50 ? '#f59e0b' : '#6b7280';
                fillOpacity = 0.4;
            } else if (overlayMode === 'competitors') {
                const val = marketData.competitorDensityIndex;
                fillColor = val > 80 ? '#ef4444' : val > 50 ? '#f97316' : '#3b82f6';
                fillOpacity = 0.4;
            } else if (overlayMode === 'age') {
                const val = marketData.avgOwnerAge;
                fillColor = val < 35 ? '#10b981' : val < 45 ? '#f59e0b' : '#8b5cf6';
                fillOpacity = 0.4;
            }
        }

        return { 
            weight: isSelected ? 2 : 1, 
            opacity: 1, 
            color: isSelected ? '#818cf8' : '#6b7280', 
            fillColor: fillColor, 
            fillOpacity: fillOpacity 
        };
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
            const map = L.map(mapContainer.current, { 
                center: [60, 95], // Центр смещен, чтобы видеть всю Россию
                zoom: 3, 
                minZoom: 2, 
                scrollWheelZoom: true, 
                preferCanvas: true,
                worldCopyJump: true, 
                zoomControl: false, 
                attributionControl: false 
            });
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
                Редактировать
            </button>
        </div>
    `;
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;
        if (potentialClientMarkersLayer.current) { map.removeLayer(potentialClientMarkersLayer.current); layerControl.current.removeLayer(potentialClientMarkersLayer.current); }
        potentialClientMarkersLayer.current = L.layerGroup();
        if (activeClientMarkersLayer.current) { map.removeLayer(activeClientMarkersLayer.current); layerControl.current.removeLayer(activeClientMarkersLayer.current); }
        activeClientMarkersLayer.current = L.layerGroup(); activeClientMarkersRef.current.clear();
    
        potentialClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                // Если координата отрицательная (на карте Leaflet это может быть слева), нормализуем для отображения справа
                let lon = tt.lon;
                if (lon < 0) lon += 360;

                const popupContent = `<b>${findValueInRow(tt, ['наименование', 'клиент'])}</b><br>${findValueInRow(tt, ['юридический адрес', 'адрес'])}<br><small>${findValueInRow(tt, ['вид деятельности', 'тип']) || 'н/д'}</small>`;
                const marker = L.circleMarker([tt.lat, lon], {
                    fillColor: '#3b82f6', color: '#2563eb', radius: 3, weight: 1, opacity: 1, fillOpacity: 0.8,
                    pane: 'markersPane'
                }).bindPopup(popupContent);
                potentialClientMarkersLayer.current?.addLayer(marker);
            }
        });
    
        activeClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                let lon = tt.lon;
                if (lon < 0) lon += 360;

                const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts, tt.key);
                const marker = L.circleMarker([tt.lat, lon], {
                    fillColor: '#22c55e', color: '#16a34a', radius: 4, weight: 1, opacity: 1, fillOpacity: 0.9,
                    pane: 'markersPane'
                }).bindPopup(popupContent);
                activeClientMarkersLayer.current?.addLayer(marker);
                activeClientMarkersRef.current.set(tt.key, marker);
            }
        });
    
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
            onEachFeature: (feature, layer) => {
               layer.on({
                   mouseover: (e) => highlightRegion(e.target),
                   mouseout: resetHighlight,
                   click: (e) => {
                       map.fitBounds(e.target.getBounds());
                   }
               });
               const props = feature.properties;
               if (props && props.name) {
                   layer.bindTooltip(props.name, { sticky: true, direction: 'top' });
               }
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
