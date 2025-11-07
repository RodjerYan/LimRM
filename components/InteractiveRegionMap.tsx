import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { capitals } from '../utils/capitals';
import { REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { SearchIcon } from './icons';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    okbData: OkbDataRow[];
}

interface SearchableLocation {
    name: string;
    type: 'region' | 'capital' | 'country';
    lat?: number;
    lon?: number;
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, okbData }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const capitalsLayer = useRef<L.LayerGroup | null>(null);
    const ttMarkersLayer = useRef<L.LayerGroup | null>(null);
    const highlightedLayer = useRef<L.Layer | null>(null);
    const capitalMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);

    const searchableLocations = useMemo<SearchableLocation[]>(() => {
        const locations: SearchableLocation[] = [];
        const addedNames = new Set<string>();

        capitals.forEach(capital => {
            if (!addedNames.has(capital.name)) {
                locations.push({ name: capital.name, type: capital.type, lat: capital.lat, lon: capital.lon });
                addedNames.add(capital.name);
            }
        });

        const regionNamesFromMap = new Set(Object.values(REGION_KEYWORD_MAP));
        russiaRegionsGeoJSON.features.forEach(feature => {
            const name = feature.properties?.name;
            if (name) regionNamesFromMap.add(name);
        });
        regionNamesFromMap.forEach(name => {
            if (name && !addedNames.has(name)) {
                locations.push({ name, type: 'region' });
                addedNames.add(name);
            }
        });

        data.forEach(row => {
            const regionName = row.region;
            if (regionName && regionName !== 'Регион не определен' && !addedNames.has(regionName)) {
                locations.push({ name: regionName, type: 'region' });
                addedNames.add(regionName);
            }
        });

        return locations.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }, [data]);

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
                if ((layer as any).feature?.properties?.name === location.name) {
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

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
            }).addTo(map);
            
            map.on('click', resetHighlight);
        }
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, [resetHighlight]);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !okbData) return;

        if (ttMarkersLayer.current) {
            map.removeLayer(ttMarkersLayer.current);
        }

        ttMarkersLayer.current = L.layerGroup().addTo(map);
        const ttWithCoords = okbData.filter(tt => tt.lat && tt.lon);

        ttWithCoords.forEach(tt => {
            const name = tt['Наименование'] || 'Без названия';
            const address = tt['Адрес'] || tt['Юридический адрес'] || 'Адрес не указан';
            const activity = tt['Вид деятельности'] || 'н/д';
            const contacts = tt['Контакты'] || '';
            
            const popupContent = `
                <b>${name}</b><br>
                ${address}<br>
                <small>${activity}</small>
                ${contacts ? `<hr style="margin: 5px 0;"/><small>Контакты: ${contacts}</small>` : ''}
            `;

            const marker = L.circleMarker([tt.lat!, tt.lon!], {
                radius: 3,
                fillColor: '#22d3ee', // cyan-400
                color: '#06b6d4', // cyan-500
                weight: 1,
                opacity: 1,
                fillOpacity: 0.7,
            }).bindPopup(popupContent);
            
            marker.on('mouseover', function(this: L.CircleMarker) { this.setRadius(6); });
            marker.on('mouseout', function(this: L.CircleMarker) { this.setRadius(3); });

            ttMarkersLayer.current?.addLayer(marker);
        });

    }, [okbData]);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        if (capitalsLayer.current) map.removeLayer(capitalsLayer.current);

        capitalsLayer.current = L.layerGroup().addTo(map);
        capitals.forEach(capital => {
            const isCountryCapital = capital.type === 'country';
            const radius = isCountryCapital ? 6 : 4;
            const hoverRadius = isCountryCapital ? 10 : 8;

            const marker = L.circleMarker([capital.lat, capital.lon], {
                radius: radius,
                fillColor: '#fbbf24', // yellow-400
                color: '#f59e0b',     // yellow-500
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8,
                className: 'pulsing-marker'
            }).bindTooltip(capital.name);

            marker.on('mouseover', function(this: L.CircleMarker) { this.setRadius(hoverRadius); });
            marker.on('mouseout', function(this: L.CircleMarker) { this.setRadius(radius); });

            capitalsLayer.current?.addLayer(marker);
            capitalMarkersRef.current.set(capital.name, marker);
        });

        geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, {
            style: invisibleStyle,
            onEachFeature: (feature, layer) => {
                const regionName = feature.properties.name;
                layer.bindTooltip(regionName, { sticky: true, className: 'leaflet-tooltip-custom' });

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

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 relative">
            <div className="absolute top-4 right-4 z-[1000]">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Поиск города или региона..."
                        className="w-64 p-2 pl-10 bg-card-bg/80 backdrop-blur-sm border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-400 transition"
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
            <h2 className="text-xl font-bold mb-4 text-white">Карта рыночного потенциала по регионам</h2>
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg" />
        </div>
    );
};

export default InteractiveRegionMap;