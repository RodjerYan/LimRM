
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { getMarketData } from '../utils/marketData';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon, CheckIcon, ErrorIcon, RetryIcon } from './icons';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson'; // Import hardcoded add-ons

type Theme = 'dark' | 'light';
type OverlayMode = 'sales' | 'pets' | 'competitors';

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

// Dictionary to map English GeoJSON names to Russian Data names
const GEO_NAME_MAPPING: Record<string, string> = {
    'Moscow': 'Москва',
    'Saint Petersburg': 'Санкт-Петербург',
    'Moscow Region': 'Московская область',
    'Leningrad Region': 'Ленинградская область',
    'Adygey Republic': 'Республика Адыгея',
    'Altai Republic': 'Республика Алтай',
    'Altai Krai': 'Алтайский край',
    'Amur Region': 'Амурская область',
    'Arkhangelsk Region': 'Архангельская область',
    'Astrakhan Region': 'Астраханская область',
    'Republic of Bashkortostan': 'Республика Башкортостан',
    'Belgorod Region': 'Белгородская область',
    'Bryansk Region': 'Брянская область',
    'Republic of Buryatia': 'Республика Бурятия',
    'Vladimir Region': 'Владимирская область',
    'Volgograd Region': 'Волгоградская область',
    'Vologda Region': 'Вологодская область',
    'Voronezh Region': 'Воронежская область',
    'Republic of Dagestan': 'Республика Дагестан',
    'Jewish Autonomous Region': 'Еврейская автономная область',
    'Zabaykalsky Krai': 'Забайкальский край',
    'Ivanovo Region': 'Ивановская область',
    'Republic of Ingushetia': 'Республика Ингушетия',
    'Irkutsk Region': 'Иркутская область',
    'Kabardino-Balkar Republic': 'Кабардино-Балкарская Республика',
    'Kaliningrad Region': 'Калининградская область',
    'Republic of Kalmykia': 'Республика Калмыкия',
    'Kaluga Region': 'Калужская область',
    'Kamchatka Krai': 'Камчатский край',
    'Karachay-Cherkess Republic': 'Карачаево-Черкесская Республика',
    'Republic of Karelia': 'Республика Карелия',
    'Kemerovo Region': 'Кемеровская область',
    'Kirov Region': 'Кировская область',
    'Komi Republic': 'Республика Коми',
    'Kostroma Region': 'Костромская область',
    'Krasnodar Krai': 'Краснодарский край',
    'Krasnoyarsk Krai': 'Красноярский край',
    'Kurgan Region': 'Курганская область',
    'Kursk Region': 'Курская область',
    'Lipetsk Region': 'Липецкая область',
    'Magadan Region': 'Магаданская область',
    'Mari El Republic': 'Республика Марий Эл',
    'Republic of Mordovia': 'Республика Мордовия',
    'Murmansk Region': 'Мурманская область',
    'Nenets Autonomous Okrug': 'Ненецкий автономный округ',
    'Nizhny Novgorod Region': 'Нижегородская область',
    'Novgorod Region': 'Новгородская область',
    'Novosibirsk Region': 'Новосибирская область',
    'Omsk Region': 'Омская область',
    'Orenburg Region': 'Оренбургская область',
    'Oryol Region': 'Орловская область',
    'Penza Region': 'Пензенская область',
    'Perm Krai': 'Пермский край',
    'Primorsky Krai': 'Приморский край',
    'Pskov Region': 'Псковская область',
    'Rostov Region': 'Ростовская область',
    'Ryazan Region': 'Рязанская область',
    'Samara Region': 'Самарская область',
    'Saratov Region': 'Саратовская область',
    'Sakha Republic': 'Республика Саха (Якутия)',
    'Sakhalin Region': 'Сахалинская область',
    'Sverdlovsk Region': 'Свердловская область',
    'Republic of North Ossetia-Alania': 'Республика Северная Осетия — Алания',
    'Smolensk Region': 'Смоленская область',
    'Stavropol Krai': 'Ставропольский край',
    'Tambov Region': 'Тамбовская область',
    'Republic of Tatarstan': 'Республика Татарстан',
    'Tver Region': 'Тверская область',
    'Tomsk Region': 'Томская область',
    'Tula Region': 'Тульская область',
    'Tyva Republic': 'Республика Тыва',
    'Tyumen Region': 'Тюменская область',
    'Udmurt Republic': 'Удмуртская Республика',
    'Ulyanovsk Region': 'Ульяновская область',
    'Khabarovsk Krai': 'Хабаровский край',
    'Republic of Khakassia': 'Республика Хакасия',
    'Khanty-Mansi Autonomous Okrug': 'Ханты-Мансийский автономный округ — Югра',
    'Chelyabinsk Region': 'Челябинская область',
    'Chechen Republic': 'Чеченская Республика',
    'Chuvash Republic': 'Чувашская Республика',
    'Chukotka Autonomous Okrug': 'Чукотский автономный округ',
    'Yamalo-Nenets Autonomous Okrug': 'Ямало-Ненецкий автономный округ',
    'Yaroslavl Region': 'Ярославская область'
};

const normalizeGeoName = (name: string): string => {
    if (!name) return '';
    return GEO_NAME_MAPPING[name] || name;
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
    const [geoError, setGeoError] = useState<string | null>(null);
    
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    // Fetch High-Quality GeoJSONs with Caching and Fault Tolerance
    const fetchGeoData = useCallback(async () => {
        const CACHE_NAME = 'limkorm-geo-v3'; 
        
        // Sources
        const SOURCES = {
            RUSSIA: 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson',
            WORLD: 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',
        };

        try {
            setIsLoadingGeo(true);
            setGeoError(null);
            
            const results: Record<string, any> = {};
            let usedCache = false;

            // 1. Try Cache API
            if ('caches' in window) {
                try {
                    const cache = await caches.open(CACHE_NAME);
                    const keys = Object.keys(SOURCES) as (keyof typeof SOURCES)[];
                    const cachedResponses = await Promise.all(keys.map(k => cache.match(SOURCES[k])));
                    
                    if (cachedResponses.every(r => r)) {
                        for (let i = 0; i < keys.length; i++) {
                            results[keys[i]] = await cachedResponses[i]?.json();
                        }
                        usedCache = true;
                        setIsFromCache(true);
                    }
                } catch (e) {
                    console.warn('Cache API access failed:', e);
                }
            }

            // 2. Fetch from Network if not fully cached
            if (!usedCache) {
                const keys = Object.keys(SOURCES) as (keyof typeof SOURCES)[];
                
                const fetchPromises = keys.map(key => 
                    fetch(SOURCES[key])
                        .then(r => {
                            if (!r.ok) throw new Error(`${r.status}`);
                            return r.json();
                        })
                        .then(data => ({ key, status: 'fulfilled', value: data }))
                        .catch(err => ({ key, status: 'rejected', reason: err }))
                );

                const settled = await Promise.allSettled(fetchPromises);
                
                settled.forEach((res, index) => {
                    const result = res as any; 
                    if (result.value && result.value.status === 'fulfilled') {
                        results[result.value.key] = result.value.value;
                        if ('caches' in window) {
                            caches.open(CACHE_NAME).then(cache => {
                                const jsonStr = JSON.stringify(result.value.value);
                                const response = new Response(jsonStr, { headers: { 'Content-Type': 'application/json' } });
                                cache.put(SOURCES[keys[index]], response);
                            }).catch(() => {});
                        }
                    } else {
                        console.warn(`Failed to load ${keys[index]}:`, result.value?.reason || result.reason);
                    }
                });
            }

            if (!results.RUSSIA) {
                throw new Error("Не удалось загрузить карту РФ. Проверьте интернет-соединение.");
            }

            // --- DATA PROCESSING & MERGING ---

            const features: Feature[] = [];

            // 1. Process Russia (Base)
            if (results.RUSSIA && results.RUSSIA.features) {
                results.RUSSIA.features.forEach((f: any) => {
                    if (f.properties?.name) {
                        f.properties.name = normalizeGeoName(f.properties.name);
                    }
                    features.push(f);
                });
            }

            // 2. FORCE ADD Local Missing Territories (Crimea, DNR, LNR, Unrecognized)
            // This ensures they appear regardless of network status or external map versions.
            if (russiaRegionsGeoJSON && russiaRegionsGeoJSON.features) {
                const existingNames = new Set(features.map(f => f.properties?.name));
                russiaRegionsGeoJSON.features.forEach((f: any) => {
                    // Only add if not already present (prevents duplicates if base map updates)
                    const name = f.properties?.name;
                    if (!existingNames.has(name)) {
                        features.push(f);
                    }
                });
            }

            // 3. Process CIS Countries (Parent Shapes)
            const cisCountriesMap: Record<string, string> = {
                'Belarus': 'Республика Беларусь',
                'Kazakhstan': 'Республика Казахстан',
                'Kyrgyzstan': 'Кыргызская Республика',
                'Uzbekistan': 'Республика Узбекистан',
                'Tajikistan': 'Республика Таджикистан',
                'Turkmenistan': 'Туркменистан',
                'Armenia': 'Армения',
                'Azerbaijan': 'Азербайджан',
                'Georgia': 'Грузия', // Main Georgia body
                'Moldova': 'Республика Молдова' // Main Moldova body
            };

            if (results.WORLD && results.WORLD.features) {
                const cisFeatures = results.WORLD.features.filter((f: any) => cisCountriesMap[f.properties.name]);
                cisFeatures.forEach((f: any) => {
                    f.properties.name = cisCountriesMap[f.properties.name];
                });
                features.push(...cisFeatures);
            }

            setGeoJsonData({
                type: 'FeatureCollection',
                features: features as Feature<Geometry, { [name: string]: any; }>[]
            });

        } catch (error) {
            console.error("Error fetching map geometry:", error);
            setGeoError((error as Error).message);
        } finally {
            setIsLoadingGeo(false);
        }
    }, []);

    useEffect(() => {
        fetchGeoData();
    }, [fetchGeoData]);

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

        // Custom Highlight for disputed/new territories to make them distinct but integrated
        const isNewTerritory = ['Донецкая Народная Республика', 'Луганская Народная Республика', 'Запорожская область', 'Херсонская область', 'Республика Крым', 'Севастополь', 'Республика Абхазия', 'Южная Осетия', 'Приднестровье'].includes(regionName);
        
        if (isNewTerritory) {
             baseBorder.color = isSelected ? '#818cf8' : (localTheme === 'dark' ? '#9ca3af' : '#6b7280'); 
             baseBorder.weight = isSelected ? 2.5 : 1.5; // Slightly thicker borders for new territories to ensure visibility
        }

        // Mode 1: Sales (Clean) - Default
        if (overlayMode === 'sales') {
            return {
                ...baseBorder,
                fillColor: isSelected ? '#818cf8' : '#374151', 
                // Increased opacity for new territories so they look like solid regions, not just outlines
                fillOpacity: isSelected ? 0.2 : (isNewTerritory ? 0.15 : 0), 
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
    
    // Region Layer
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
                            <LoaderIcon /> Загрузка геометрии РФ и СНГ...
                        </div>
                    ) : geoError ? (
                        <div className="flex items-center gap-2 px-3 py-1 bg-red-600/80 rounded-lg text-white text-xs shadow-lg backdrop-blur-md cursor-pointer hover:bg-red-500" onClick={fetchGeoData} title="Нажмите, чтобы повторить">
                            <ErrorIcon /> Ошибка загрузки (Повторить)
                        </div>
                    ) : isFromCache ? (
                        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-600/20 border border-emerald-500/50 rounded-lg text-emerald-400 text-xs shadow-lg backdrop-blur-md">
                            <CheckIcon /> Данные активны
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
