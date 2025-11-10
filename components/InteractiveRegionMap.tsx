import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { capitals } from '../utils/capitals';
import { SearchIcon, ErrorIcon } from './icons';
import type { FeatureCollection } from 'geojson';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    potentialClients: OkbDataRow[];
    activeClients: MapPoint[];
    conflictZones: FeatureCollection | null;
}

interface SearchableLocation {
    name: string;
    type: 'region' | 'capital' | 'country' | 'urban_center';
    lat?: number;
    lon?: number;
}

/**
 * A robust helper to find a value in a data row by searching for keywords in its keys.
 * This makes data extraction resilient to variations in column names from the source file.
 * @param row The data row object (e.g., from OKB).
 * @param keywords An array of lowercase keywords to search for (e.g., ['наименование', 'клиент']).
 * @returns The found string value or an empty string if not found.
 */
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


const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, conflictZones }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const capitalsLayer = useRef<L.LayerGroup | null>(null);
    const urbanCentersLayer = useRef<L.LayerGroup | null>(null);
    const potentialClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const conflictZonesLayer = useRef<L.GeoJSON | null>(null);
    const layerControl = useRef<L.Control.Layers | null>(null);

    const highlightedLayer = useRef<L.Layer | null>(null);
    const capitalMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);
    const [isWarningVisible, setIsWarningVisible] = useState(true);

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

    const regionalData = useMemo(() => {
        const aggregation = new Map<string, {
            totalGrowth: number;
            totalPotential: number;
            totalFact: number;
            clientCount: number;
            rmSet: Set<string>;
        }>();
        data.forEach(row => {
            const region = row.region;
            if (!region || region === 'Регион не определен') return;
            if (!aggregation.has(region)) {
                aggregation.set(region, { totalGrowth: 0, totalPotential: 0, totalFact: 0, clientCount: 0, rmSet: new Set() });
            }
            const current = aggregation.get(region)!;
            current.totalGrowth += row.growthPotential;
            current.totalPotential += row.potential;
            current.totalFact += row.fact;
            current.clientCount += row.clients?.length || 1;
            current.rmSet.add(row.rm);
        });
        return aggregation;
    }, [data]);

    const invisibleStyle = { weight: 0, opacity: 0, fillOpacity: 0, interactive: true };

    const resetHighlight = useCallback(() => {
        if (highlightedLayer.current && geoJsonLayer.current) {
            geoJsonLayer.current.resetStyle(highlightedLayer.current as L.Path);
        }
        highlightedLayer.current = null;
    }, []);

    const highlightRegion = useCallback((layer: L.Layer) => {
        resetHighlight();
        if (layer instanceof L.Path) {
             layer.setStyle({ weight: 2.5, color: '#f59e0b', fillOpacity: 0.4 }).bringToFront();
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
    
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, { center: [60, 90], zoom: 3, scrollWheelZoom: true, preferCanvas: true });
            mapInstance.current = map;

            // Create a dedicated pane for markers to ensure they are always on top
            map.createPane('markerPane');
            const markerPane = map.getPane('markerPane');
            if (markerPane) {
                markerPane.style.zIndex = '650'; // Higher than default overlay pane (400)
            }


            const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
            });
            const lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
            });

            darkLayer.addTo(map);

            const baseMaps = {
                "Темная карта": darkLayer,
                "Светлая карта": lightLayer
            };
            
            layerControl.current = L.control.layers(baseMaps, {}).addTo(map);

            map.on('baselayerchange', function(e) {
                if (mapContainer.current) {
                    mapContainer.current.classList.remove('theme-dark', 'theme-light');
                    if (e.name === 'Светлая карта') {
                        mapContainer.current.classList.add('theme-light');
                    } else {
                        mapContainer.current.classList.add('theme-dark');
                    }
                }
            });


            map.on('click', resetHighlight);
        }
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, [resetHighlight]);
    
    // Generic marker creation function
    const createPopupContent = (name: string, address: string, type: string, contacts?: string) => `
        <b>${name}</b><br>
        ${address}<br>
        <small>${type || 'н/д'}</small>
        ${contacts ? `<hr style="margin: 5px 0;"/><small>Контакты: ${contacts}</small>` : ''}
    `;
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;

        // --- Potential Clients (from OKB, blue markers) ---
        if (potentialClientMarkersLayer.current) {
            layerControl.current.removeLayer(potentialClientMarkersLayer.current);
            map.removeLayer(potentialClientMarkersLayer.current);
        }
        potentialClientMarkersLayer.current = L.layerGroup();
        potentialClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const popupContent = createPopupContent(
                    findValueInRow(tt, ['наименование', 'клиент']),
                    findValueInRow(tt, ['юридический адрес', 'адрес']),
                    findValueInRow(tt, ['вид деятельности', 'тип']),
                    findValueInRow(tt, ['контакты'])
                );
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    pane: 'markerPane', // Render in the top pane
                    fillColor: '#3b82f6', color: '#2563eb', radius: 4, weight: 1, opacity: 1, fillOpacity: 0.8
                }).bindPopup(popupContent);
                potentialClientMarkersLayer.current?.addLayer(marker);
            }
        });
        map.addLayer(potentialClientMarkersLayer.current);
        layerControl.current.addOverlay(potentialClientMarkersLayer.current, "Потенциал (ОКБ)");
        
        // --- Active Clients (from sales file, green markers) ---
        if (activeClientMarkersLayer.current) {
            layerControl.current.removeLayer(activeClientMarkersLayer.current);
            map.removeLayer(activeClientMarkersLayer.current);
        }
        activeClientMarkersLayer.current = L.layerGroup();
        activeClients.forEach(tt => {
            const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts);
            const marker = L.circleMarker([tt.lat, tt.lon], {
                pane: 'markerPane', // Render in the top pane
                fillColor: '#22c55e', color: '#16a34a', radius: 5, weight: 1, opacity: 1, fillOpacity: 0.9
            }).bindPopup(popupContent);
            activeClientMarkersLayer.current?.addLayer(marker);
        });
        map.addLayer(activeClientMarkersLayer.current);
        layerControl.current.addOverlay(activeClientMarkersLayer.current, "Активные ТТ (из файла)");
        
    }, [potentialClients, activeClients]);


    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;

        // Remove old layers
        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        if (capitalsLayer.current) {
            layerControl.current.removeLayer(capitalsLayer.current);
            map.removeLayer(capitalsLayer.current);
        }
        if (urbanCentersLayer.current) {
            layerControl.current.removeLayer(urbanCentersLayer.current);
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
                    pane: 'markerPane', // Render in the top pane
                    radius,
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8,
                    fillColor: '#fbbf24', // Yellow for all
                    color: '#f59e0b',     // Yellow border for all
                    className: 'pulsing-marker' // Pulsing for all
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

        if (capitalsLayer.current) {
            map.addLayer(capitalsLayer.current);
            layerControl.current.addOverlay(capitalsLayer.current, "Столицы и страны");
        }

        if (urbanCentersLayer.current) {
            map.addLayer(urbanCentersLayer.current);
            layerControl.current.addOverlay(urbanCentersLayer.current, "Крупные города");
        }


        geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, {
            style: invisibleStyle,
            onEachFeature: (feature, layer) => {
                layer.bindTooltip(feature.properties.name, { sticky: true, className: 'leaflet-tooltip-custom' });
                layer.on({
                    // Remove mouseover to prevent visual clutter
                    // mouseover: (e) => { if (e.target !== highlightedLayer.current) e.target.setStyle({ weight: 2, color: '#a78bfa', fillOpacity: 0.2 }); },
                    mouseout: (e) => { if (e.target !== highlightedLayer.current) geoJsonLayer.current?.resetStyle(e.target); },
                    click: (e) => {
                        L.DomEvent.stop(e);
                        map.fitBounds(e.target.getBounds());
                        highlightRegion(e.target);
                    }
                });
            }
        }).addTo(map);

    }, [regionalData, selectedRegions, highlightRegion]);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;

        // Remove old layer if it exists
        if (conflictZonesLayer.current) {
            layerControl.current.removeLayer(conflictZonesLayer.current);
            map.removeLayer(conflictZonesLayer.current);
        }

        if (conflictZones) {
            conflictZonesLayer.current = L.geoJSON(conflictZones, {
                style: (feature) => {
                    const status = feature?.properties?.status;
                    if (status === 'occupied') {
                        // Style for the main SVO zone
                        return { color: '#dc2626', weight: 1.5, fillColor: '#b91c1c', fillOpacity: 0.45 };
                    }
                    if (status === 'border_danger_zone') {
                        // Style for Russian border danger zones
                        return { color: '#f59e0b', weight: 1, fillColor: '#f59e0b', fillOpacity: 0.4 };
                    }
                    // Default/fallback style
                    return { color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.3 };
                },
                onEachFeature: (feature, layer) => {
                    const props = feature.properties;
                    if (props && props.name) {
                        const popupContent = `<b>${props.name}</b><br>${props.description || 'Нет описания.'}`;
                        layer.bindPopup(popupContent);
                    }
                }
            }).addTo(map);

            layerControl.current.addOverlay(conflictZonesLayer.current, "⚠️ Зоны опасности");
        }
    }, [conflictZones]);
    
    const typeToLabel: Record<SearchableLocation['type'], string> = {
        region: 'Регион',
        capital: 'Столица',
        country: 'Страна',
        urban_center: 'Городской центр'
    };

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 relative">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Карта рыночного потенциала</h2>
                <div className="relative z-[1001] w-full max-w-xs md:max-w-sm">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Поиск города или региона..."
                            className="w-full p-2 pl-10 bg-card-bg/80 backdrop-blur-sm border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-400 transition"
                        />
                        {searchResults.length > 0 && (
                            <ul className="absolute z-10 w-full mt-1 bg-card-bg/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                                {searchResults.map(loc => (
                                    <li key={loc.name} onClick={() => handleLocationSelect(loc)} className="px-4 py-2 text-white cursor-pointer hover:bg-indigo-500/20">
                                        {loc.name} <span className="text-xs text-gray-400 ml-2">{typeToLabel[loc.type]}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
            
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg theme-dark" />
            
            {conflictZones && isWarningVisible && (
                <div className="absolute bottom-4 left-4 z-[1000] bg-red-900/50 backdrop-blur-sm p-3 rounded-lg border border-danger/50 text-xs text-red-200 flex items-start gap-2 max-w-sm">
                    <div className="w-6 h-6 flex-shrink-0 text-danger mt-0.5"><ErrorIcon/></div>
                    <div className="pr-4">
                        <p className="font-bold">ОСТОРОЖНО! ЗОНЫ ПОВЫШЕННОЙ ОПАСНОСТИ</p>
                        <p className="mt-1">
                            На карте отмечены зона проведения СВО и приграничные территории РФ с повышенным риском. Данные основаны на открытых источниках (zaschitnikiotechestva.ru). Планируйте маршруты с максимальной осторожностью.
                        </p>
                        <p className="mt-2 text-yellow-200/80">
                            Торговые точки в зоне или в непосредственной близости проведения СВО могут не соответствовать действительности. Они не участвуют в расчете ОКБ и выведены на карту в качестве информации.
                        </p>
                    </div>
                     <button
                        onClick={() => setIsWarningVisible(false)}
                        className="absolute top-1 right-1 p-1 text-red-200 hover:text-white transition-colors rounded-full hover:bg-black/20"
                        aria-label="Закрыть предупреждение"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};

export default InteractiveRegionMap;