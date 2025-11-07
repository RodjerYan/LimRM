import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { capitals } from '../utils/capitals';
import { SearchIcon, ErrorIcon } from './icons';
import type { FeatureCollection } from 'geojson';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    potentialClients: OkbDataRow[];
    activeClients: OkbDataRow[];
    conflictZones: FeatureCollection | null;
}

interface SearchableLocation {
    name: string;
    type: 'region' | 'capital' | 'country';
    lat?: number;
    lon?: number;
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, conflictZones }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const capitalsLayer = useRef<L.LayerGroup | null>(null);
    const potentialClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const conflictZonesLayer = useRef<L.GeoJSON | null>(null);
    const layerControl = useRef<L.Control.Layers | null>(null);

    const highlightedLayer = useRef<L.Layer | null>(null);
    const capitalMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);

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

    const invisibleStyle = { weight: 0, opacity: 0, fillOpacity: 0 };

    const resetHighlight = useCallback(() => {
        if (highlightedLayer.current && geoJsonLayer.current) {
            geoJsonLayer.current.resetStyle(highlightedLayer.current as L.Path);
        }
        highlightedLayer.current = null;
    }, []);

    const highlightRegion = useCallback((layer: L.Layer) => {
        resetHighlight();
        if (layer instanceof L.Path) {
             layer.setStyle(invisibleStyle).bringToFront();
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

            const baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
            }).addTo(map);
            
            layerControl.current = L.control.layers({ "Темная карта": baseLayer }, {}).addTo(map);

            map.on('click', resetHighlight);
        }
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, [resetHighlight]);
    
    const createClientMarker = (tt: OkbDataRow, options: L.CircleMarkerOptions) => {
        const name = tt['Наименование'] || 'Без названия';
        const address = tt['Юридический адрес'] || 'Адрес не указан';
        const activity = tt['Вид деятельности'] || 'н/д';
        const contacts = tt['Контакты'] || '';
        
        const popupContent = `
            <b>${name}</b><br>
            ${address}<br>
            <small>${activity}</small>
            ${contacts ? `<hr style="margin: 5px 0;"/><small>Контакты: ${contacts}</small>` : ''}
        `;

        const marker = L.circleMarker([tt.lat!, tt.lon!], {
            ...options,
            radius: 4,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
        }).bindPopup(popupContent);
        
        marker.on('mouseover', function(this: L.CircleMarker) { this.setRadius(7); });
        marker.on('mouseout', function(this: L.CircleMarker) { this.setRadius(4); });

        return marker;
    };
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;

        if (potentialClientMarkersLayer.current) {
            layerControl.current.removeLayer(potentialClientMarkersLayer.current);
            map.removeLayer(potentialClientMarkersLayer.current);
        }
        potentialClientMarkersLayer.current = L.layerGroup();
        potentialClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const marker = createClientMarker(tt, { fillColor: '#3b82f6', color: '#2563eb' });
                potentialClientMarkersLayer.current?.addLayer(marker);
            }
        });
        map.addLayer(potentialClientMarkersLayer.current);
        layerControl.current.addOverlay(potentialClientMarkersLayer.current, "Потенциальные клиенты");


        if (activeClientMarkersLayer.current) {
            layerControl.current.removeLayer(activeClientMarkersLayer.current);
            map.removeLayer(activeClientMarkersLayer.current);
        }
        activeClientMarkersLayer.current = L.layerGroup();
        activeClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const marker = createClientMarker(tt, { fillColor: '#22c55e', color: '#16a34a' });
                activeClientMarkersLayer.current?.addLayer(marker);
            }
        });
        map.addLayer(activeClientMarkersLayer.current);
        layerControl.current.addOverlay(activeClientMarkersLayer.current, "Активные клиенты");
        
    }, [potentialClients, activeClients]);


    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !layerControl.current) return;

        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        if (capitalsLayer.current) {
             layerControl.current.removeLayer(capitalsLayer.current);
             map.removeLayer(capitalsLayer.current);
        }

        capitalsLayer.current = L.layerGroup();
        capitals.forEach(capital => {
            const isCountryCapital = capital.type === 'country';
            const radius = isCountryCapital ? 6 : 4;
            const hoverRadius = isCountryCapital ? 10 : 8;
            const marker = L.circleMarker([capital.lat, capital.lon], {
                radius, fillColor: '#fbbf24', color: '#f59e0b', weight: 1, opacity: 1, fillOpacity: 0.8, className: 'pulsing-marker'
            }).bindTooltip(capital.name);
            marker.on('mouseover', function(this: L.CircleMarker) { this.setRadius(hoverRadius); });
            marker.on('mouseout', function(this: L.CircleMarker) { this.setRadius(radius); });
            capitalsLayer.current?.addLayer(marker);
            capitalMarkersRef.current.set(capital.name, marker);
        });
        map.addLayer(capitalsLayer.current);
        layerControl.current.addOverlay(capitalsLayer.current, "Столицы");


        geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, {
            style: invisibleStyle,
            onEachFeature: (feature, layer) => {
                layer.bindTooltip(feature.properties.name, { sticky: true, className: 'leaflet-tooltip-custom' });
                layer.on({
                    mouseover: (e) => { if (e.target !== highlightedLayer.current) e.target.setStyle(invisibleStyle); },
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
                    switch (status) {
                        case 'occupied':
                            return { color: '#dc2626', weight: 1, fillColor: '#b91c1c', fillOpacity: 0.4 };
                        case 'liberated':
                            return { color: '#059669', weight: 1, fillColor: '#065f46', fillOpacity: 0.45 };
                        case 'special_risk':
                             return { color: '#facc15', weight: 1, fillColor: '#facc15', fillOpacity: 0.3, dashArray: '5, 5' };
                        case 'drone_danger':
                            return { color: '#f97316', weight: 1, fillColor: '#fb923c', fillOpacity: 0.4, dashArray: '4, 4' };
                        default:
                            return { color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.3 };
                    }
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


    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 relative">
            <div className="absolute top-4 left-4 z-[1000] w-full max-w-xs md:max-w-sm">
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
                                    {loc.name} <span className="text-xs text-gray-400 ml-2">{loc.type}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
             {conflictZones && (
                <div className="absolute bottom-4 left-4 z-[1000] bg-red-900/50 backdrop-blur-sm p-3 rounded-lg border border-danger/50 text-xs text-red-200 flex items-center gap-2 max-w-sm">
                    <div className="w-6 h-6 flex-shrink-0 text-danger"><ErrorIcon/></div>
                    <div>
                        <strong>ОСТОРОЖНО!</strong> Отображены зоны проведения СВО и приграничные территории с высоким риском. Данные основаны на открытых источниках и предназначены для информационных целей безопасности. Планируйте маршруты с особой осторожностью.
                    </div>
                </div>
            )}
            <h2 className="text-xl font-bold mb-4 text-white text-center">Карта рыночного потенциала и оперативной обстановки</h2>
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg" />
        </div>
    );
};

export default InteractiveRegionMap;