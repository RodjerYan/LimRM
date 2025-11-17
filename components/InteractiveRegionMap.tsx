import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
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
    flyToClientKey: string | null;
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

const MapLegend: React.FC = () => (
     <div className="p-2 bg-card-bg/80 backdrop-blur-md rounded-lg border border-gray-700" style={{ color: 'white', maxWidth: '200px' }}>
        <h4 className="font-bold text-sm mb-2">Легенда</h4>
        <div className="flex items-center mb-1">
            <i className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#22c55e' }}></i>
            <span className="text-xs">Активные ТТ (из файла)</span>
        </div>
        <div className="flex items-center">
            <i className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#3b82f6' }}></i>
            <span className="text-xs">Потенциал (из ОКБ)</span>
        </div>
    </div>
);


const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, conflictZones, flyToClientKey }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const capitalsLayer = useRef<L.LayerGroup | null>(null);
    const urbanCentersLayer = useRef<L.LayerGroup | null>(null);
    const potentialClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const conflictZonesLayer = useRef<L.GeoJSON | null>(null);
    const layerControl = useRef<L.Control.Layers | null>(null);
    const activeClientMarkersRef = useRef<Map<string, L.Layer>>(new Map());

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
    
    const invisibleStyle = {
        weight: 0,
        color: 'transparent',
        opacity: 0,
        fillOpacity: 0,
        interactive: true
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
             layer.setStyle({ weight: 2.5, color: '#f59e0b', opacity: 1, fillColor: '#f59e0b', fillOpacity: 0.3 }).bringToFront();
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
        const map = mapInstance.current;
        if (map) {
            const timer = setTimeout(() => map.invalidateSize(true), 200);
            return () => clearTimeout(timer);
        }
    }, [data]);
    
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, { 
                center: [60, 90], 
                zoom: 3, 
                scrollWheelZoom: true, 
                preferCanvas: true,
                worldCopyJump: true
            });
            mapInstance.current = map;

            map.createPane('markerPane');
            const markerPane = map.getPane('markerPane');
            if (markerPane) {
                markerPane.style.zIndex = '650';
            }


            const darkLayer = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
            });
            const lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
            });

            darkLayer.addTo(map);

            const baseMaps = {
                "Темная карта": darkLayer,
                "Светлая карта": lightLayer
            };
            
            layerControl.current = L.control.layers(baseMaps, {}).addTo(map);

            const legend = new (L.Control.extend({
                onAdd: function() {
                    const div = L.DomUtil.create('div', 'info legend');
                    // This is a simple container. React will render into it.
                    return div;
                },
                onRemove: function() {}
            }))({ position: 'bottomright' });
            
            legend.addTo(map);
            
            // Render the React legend component into the container created by Leaflet
            const legendContainer = legend.getContainer();
            if(legendContainer){
                 const root = createRoot(legendContainer);
                 root.render(<MapLegend />);
            }

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
    
    const createPopupContent = (name: string, address: string, type: string, contacts?: string) => `
        <b>${name}</b><br>
        ${address}<br>
        <small>${type || 'н/д'}</small>
        ${contacts ? `<hr style="margin: 5px 0;"/><small>Контакты: ${contacts}</small>` : ''}
    `;
    
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
                const popupContent = createPopupContent(
                    findValueInRow(tt, ['наименование', 'клиент']),
                    findValueInRow(tt, ['юридический адрес', 'адрес']),
                    findValueInRow(tt, ['вид деятельности', 'тип']),
                    findValueInRow(tt, ['контакты'])
                );
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    pane: 'markerPane',
                    fillColor: '#3b82f6', color: '#2563eb', radius: 4, weight: 1, opacity: 1, fillOpacity: 0.8
                }).bindPopup(popupContent);
                potentialClientMarkersLayer.current?.addLayer(marker);
            }
        });
    
        activeClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const popupContent = createPopupContent(tt.name, tt.address, tt.type, tt.contacts);
                const marker = L.circleMarker([tt.lat, tt.lon], {
                    pane: 'markerPane',
                    fillColor: '#22c55e', // Green for all active clients
                    color: '#16a34a',
                    radius: 5, weight: 1, opacity: 1, fillOpacity: 0.9
                }).bindPopup(popupContent);
                activeClientMarkersLayer.current?.addLayer(marker);
                activeClientMarkersRef.current.set(tt.key, marker);
            }
        });
    
        map.addLayer(potentialClientMarkersLayer.current);
        layerControl.current.addOverlay(potentialClientMarkersLayer.current, "Потенциал (ОКБ)");
        
        map.addLayer(activeClientMarkersLayer.current);
        layerControl.current.addOverlay(activeClientMarkersLayer.current, "Активные ТТ (из файла)");
    
        const allMarkers = [
            ...(potentialClientMarkersLayer.current?.getLayers() || []),
            ...(activeClientMarkersLayer.current?.getLayers() || [])
        ];
    
        if (allMarkers.length > 0) {
            const featureGroup = L.featureGroup(allMarkers as L.Layer[]);
            try {
                const bounds = featureGroup.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds.pad(0.2));
                } else {
                     console.warn("Could not fit bounds: bounds are invalid.");
                     map.setView([60, 90], 3);
                }
            } catch(e) {
                console.error("Error calculating bounds for map:", e);
                map.setView([60, 90], 3);
            }
        } else if (data.length === 0) {
            map.setView([60, 90], 3);
        }
        
    }, [potentialClients, activeClients, data]);
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !flyToClientKey) return;

        const marker = activeClientMarkersRef.current.get(flyToClientKey);
        if (marker && typeof (marker as any).getLatLng === 'function') {
            const markerLatLng = (marker as L.Marker).getLatLng();
            map.flyTo(markerLatLng, 16, { animate: true, duration: 1 });

            setTimeout(() => {
                if (typeof (marker as any).openPopup === 'function') {
                    (marker as L.Marker).openPopup();
                }
            }, 1000);
        }
    }, [flyToClientKey]);


    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;

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

        if (conflictZonesLayer.current) {
            layerControl.current.removeLayer(conflictZonesLayer.current);
            map.removeLayer(conflictZonesLayer.current);
        }

        if (conflictZones) {
            conflictZonesLayer.current = L.geoJSON(conflictZones, {
                style: (feature) => {
                    const status = feature?.properties?.status;
                    if (status === 'occupied') {
                        return { color: '#dc2626', weight: 1.5, fillColor: '#b91c1c', fillOpacity: 0.45 };
                    }
                    if (status === 'border_danger_zone') {
                        return { color: '#f59e0b', weight: 1, fillColor: '#f59e0b', fillOpacity: 0.4 };
                    }
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
        <div id="interactive-map-container" className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold text-white whitespace-nowrap">Карта рыночного потенциала</h2>
                <div className="relative w-full md:w-auto md:min-w-[300px]">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <SearchIcon />
                    </div>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Поиск города или региона..."
                        className="w-full p-2 pl-10 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                    />
                    {searchResults.length > 0 && (
                        <ul className="absolute z-50 w-full mt-1 bg-card-bg/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                            {searchResults.map((loc) => (
                                <li
                                    key={`${loc.name}-${loc.type}`}
                                    onClick={() => handleLocationSelect(loc)}
                                    className="px-4 py-2 text-white cursor-pointer hover:bg-indigo-500/20 flex justify-between items-center"
                                >
                                    <span>{loc.name}</span>
                                    <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded-md">{typeToLabel[loc.type]}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {isWarningVisible && conflictZones && (
                <div className="bg-red-900/50 border border-danger/50 text-danger text-sm rounded-lg p-3 mb-4 flex justify-between items-center">
                    <div className="flex items-center">
                        <div className="w-5 h-5 mr-2 flex-shrink-0"><ErrorIcon/></div>
                        <span>
                            Внимание: слой "Зоны опасности" носит информационный характер и может быть неполным. Всегда сверяйтесь с официальными источниками.
                        </span>
                    </div>
                    <button onClick={() => setIsWarningVisible(false)} className="text-red-300 hover:text-white text-lg">&times;</button>
                </div>
            )}
            
            <div ref={mapContainer} className="h-[65vh] w-full rounded-lg theme-dark bg-gray-800 border border-gray-700" />
        </div>
    );
};

export default InteractiveRegionMap;