import React, { useEffect, useRef, useMemo, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { capitals } from '../utils/capitals';
import { REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { SearchIcon } from './icons';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
}

interface SearchableLocation {
    name: string;
    type: 'region' | 'capital' | 'country';
    lat?: number;
    lon?: number;
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const capitalsLayer = useRef<L.LayerGroup | null>(null);
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

        return locations.sort((a, b) => a.name.localeCompare(b.name));
    }, [data]);

    useEffect(() => {
        if (searchTerm.trim().length > 1) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            const results = searchableLocations.filter(loc =>
                loc.name.toLowerCase().includes(lowerSearchTerm)
            ).slice(0, 7);
            setSearchResults(results);
        } else {
            setSearchResults([]);
        }
    }, [searchTerm, searchableLocations]);

    const regionalData = useMemo(() => {
        if (!data || data.length === 0) return new Map();
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

    // Define styles for different states
    const highlightStyle = { color: '#FF4500', weight: 3, opacity: 1, fillOpacity: 0 };
    const baseStyle = { weight: 1, fillOpacity: 0, opacity: 0.6, color: '#4B5563' }; // For regions with no data
    const dataStyle = { ...baseStyle, weight: 1.5, opacity: 0.9, color: '#738299' }; // For regions with data
    const filterSelectedStyle = { color: '#818cf8', weight: 2.5, opacity: 1, fillOpacity: 0 }; // For regions selected in filter

    const resetHighlight = () => {
        if (highlightedLayer.current && geoJsonLayer.current) {
            geoJsonLayer.current.resetStyle(highlightedLayer.current as L.Path);
        }
        highlightedLayer.current = null;
    };

    const highlightRegion = (layer: L.Layer) => {
        resetHighlight();
        (layer as L.Path).setStyle(highlightStyle).bringToFront();
        highlightedLayer.current = layer;
    };

    const handleLocationSelect = (location: SearchableLocation) => {
        const map = mapInstance.current;
        if (!map) return;

        setSearchTerm('');
        setSearchResults([]);
        resetHighlight();

        if (location.type === 'capital' || location.type === 'country') {
            const marker = capitalMarkersRef.current.get(location.name);
            map.flyTo([location.lat!, location.lon!], 10);
            if (marker) setTimeout(() => marker.openPopup(), 500);
        } else if (location.type === 'region') {
            let foundLayer: L.Layer | null = null;
            geoJsonLayer.current?.eachLayer(layer => {
                if ((layer as any).feature?.properties?.name === location.name) {
                    foundLayer = layer;
                }
            });

            if (foundLayer) {
                map.fitBounds((foundLayer as L.Polygon).getBounds());
                highlightRegion(foundLayer);
            } else {
                const capitalForRegion = capitals.find(c => c.region_name === location.name || c.name === location.name);
                if (capitalForRegion) map.flyTo([capitalForRegion.lat, capitalForRegion.lon], 7);
            }
        }
    };

    useEffect(() => {
        if (mapContainer.current && mapInstance.current === null) {
            const map = L.map(mapContainer.current, { center: [60, 90], zoom: 3, scrollWheelZoom: true, preferCanvas: true });
            mapInstance.current = map;
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
            }).addTo(map);

            capitalsLayer.current = L.layerGroup().addTo(map);
            capitals.forEach(capital => {
                const marker = L.circleMarker([capital.lat, capital.lon], {
                    radius: capital.type === 'country' ? 6 : 2,
                    fillColor: '#fbbf24', color: '#f59e0b', weight: 1, opacity: 1, fillOpacity: 0.8
                }).bindPopup(`<b>${capital.name}</b>`);
                marker.on('mouseover', function(this: L.CircleMarker) { this.setRadius(capital.type === 'country' ? 10 : 6); });
                marker.on('mouseout', function(this: L.CircleMarker) { this.setRadius(capital.type === 'country' ? 6 : 2); });
                capitalsLayer.current?.addLayer(marker);
                capitalMarkersRef.current.set(capital.name, marker);
            });
        }
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        capitalMarkersRef.current.forEach((marker, name) => marker.bindPopup(`<b>${name}</b>`));

        if (regionalData.size === 0 && selectedRegions.length === 0) {
             geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, { style: baseStyle }).addTo(map);
            map.flyTo([60, 90], 3);
            return;
        }

        const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

        if (russiaRegionsGeoJSON?.features.length > 0) {
            geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, {
                style: (feature) => {
                    const regionName = feature?.properties?.name;
                    const hasData = regionalData.has(regionName);
                    const isSelectedByFilter = selectedRegions.includes(regionName);
                    
                    if (isSelectedByFilter) return filterSelectedStyle;
                    if (hasData) return dataStyle;
                    return baseStyle;
                },
                onEachFeature: (feature, layer) => {
                    const regionName = feature.properties.name;
                    layer.bindTooltip(regionName, { sticky: true, className: 'leaflet-tooltip-custom' });
                    const regionStats = regionalData.get(regionName);
                    const popupContent = regionStats ?
                        `<b>${regionName}</b><br/>Потенциал роста: ${formatNumber(regionStats.totalGrowth)}` :
                        `<b>${regionName}</b><br/>Нет данных`;
                    layer.bindPopup(popupContent);

                    layer.on({
                        mouseover: (e) => {
                            if (e.target !== highlightedLayer.current) {
                                e.target.setStyle(highlightStyle).bringToFront();
                            }
                        },
                        mouseout: (e) => {
                           if (e.target !== highlightedLayer.current) {
                                geoJsonLayer.current?.resetStyle(e.target);
                           }
                        },
                        click: (e) => {
                            map.fitBounds(e.target.getBounds());
                            highlightRegion(e.target);
                        }
                    });
                }
            }).addTo(map);
        }

        const dataBounds = L.latLngBounds([]);
        regionalData.forEach((stats, regionName) => {
            const capital = capitals.find(c => c.region_name === regionName || c.name === regionName);
            const marker = capital ? capitalMarkersRef.current.get(capital.name) : undefined;
            if (marker) {
                const popupContent = `<b>${regionName}</b><br/><b>Потенциал роста: ${formatNumber(stats.totalGrowth)}</b><br/>Факт: ${formatNumber(stats.totalFact)}<br/>Потенциал: ${formatNumber(stats.totalPotential)}<br/>Клиентов: ${stats.clientCount}<br/>РМ: ${Array.from(stats.rmSet).join(', ')}`;
                marker.bindPopup(popupContent);
                dataBounds.extend(marker.getLatLng());
            }
        });

        if (selectedRegions.length > 0) {
            const selectionBounds = L.latLngBounds([]);
            geoJsonLayer.current?.eachLayer(layer => {
                const featureName = (layer as any).feature?.properties?.name;
                if (featureName && selectedRegions.includes(featureName)) {
                    selectionBounds.extend((layer as L.Polygon).getBounds());
                }
            });
            if (selectionBounds.isValid()) map.fitBounds(selectionBounds.pad(0.1));
        } else if (dataBounds.isValid()) {
            map.fitBounds(dataBounds.pad(0.2), { maxZoom: 8 });
        }

    }, [regionalData, selectedRegions]);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 relative">
            <div className="absolute top-4 right-4 z-[1000]">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <SearchIcon />
                    </div>
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

export default InteractiveRegionMap;.