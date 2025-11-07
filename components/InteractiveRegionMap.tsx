import React, { useEffect, useRef, useMemo, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { capitals } from '../utils/capitals';
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
    const legendControl = useRef<L.Control | null>(null);
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
        
        if (russiaRegionsGeoJSON?.features) {
            russiaRegionsGeoJSON.features.forEach(feature => {
                const name = feature.properties?.name;
                if (name && !addedNames.has(name)) {
                    locations.push({ name, type: 'region' });
                    addedNames.add(name);
                }
            });
        }
        return locations.sort((a, b) => a.name.localeCompare(b.name));
    }, []);
    
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
    
    const handleLocationSelect = (location: SearchableLocation) => {
        const map = mapInstance.current;
        if (!map) return;
    
        setSearchTerm('');
        setSearchResults([]);
    
        if (location.type === 'capital' || location.type === 'country') {
            const marker = capitalMarkersRef.current.get(location.name);
            map.flyTo([location.lat!, location.lon!], 10);
            if (marker) {
                setTimeout(() => marker.openPopup(), 500);
            }
        } else if (location.type === 'region') {
            geoJsonLayer.current?.eachLayer(layer => {
                const featureName = (layer as any).feature?.properties?.name;
                if (featureName === location.name) {
                    // Fix: Cast layer to L.Polygon to access getBounds() method. The type definitions for L.Path do not include it.
                    map.fitBounds((layer as L.Polygon).getBounds());
                    (layer as L.Polygon).setStyle({ color: '#fbbf24', weight: 3 });
                    setTimeout(() => {
                        geoJsonLayer.current?.resetStyle(layer as L.Polygon);
                    }, 3000);
                }
            });
        }
    };

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

    useEffect(() => {
        if (mapContainer.current && mapInstance.current === null) {
            const map = L.map(mapContainer.current, { center: [60, 90], zoom: 3, scrollWheelZoom: true });
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
        if (legendControl.current) map.removeControl(legendControl.current);
        capitalMarkersRef.current.forEach((marker, name) => marker.bindPopup(`<b>${name}</b>`));

        if (regionalData.size === 0 && selectedRegions.length === 0) {
            if (map.getZoom() > 4) map.flyTo([60, 90], 3);
            return;
        }

        const growthValues = Array.from(regionalData.values()).map(d => d.totalGrowth).filter(v => v > 0);
        const maxGrowth = growthValues.length > 0 ? Math.max(...growthValues) : 0;
        const minGrowth = growthValues.length > 0 ? Math.min(...growthValues) : 0;
        const getColor = (value: number) => {
            if (value <= 0) return '#374151';
            const range = Math.log(maxGrowth + 1) - Math.log(minGrowth + 1);
            if (range === 0) return 'hsl(180, 70%, 50%)';
            const intensity = (Math.log(value + 1) - Math.log(minGrowth + 1)) / range;
            const hue = 240 - intensity * 180;
            return `hsl(${hue}, 70%, 50%)`;
        };
        const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

        if (russiaRegionsGeoJSON?.features.length > 0) {
            geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, {
                style: (feature) => {
                    const regionName = feature?.properties?.name;
                    const regionStats = regionalData.get(regionName);
                    const isSelected = selectedRegions.includes(regionName);
                    return {
                        fillColor: regionStats ? getColor(regionStats.totalGrowth) : '#1F2937',
                        weight: isSelected ? 3 : 1,
                        opacity: 1,
                        color: isSelected ? '#818cf8' : '#4B5563',
                        fillOpacity: isSelected ? 0.8 : 0.7,
                    };
                },
                onEachFeature: (feature, layer) => {
                    const regionName = feature.properties.name;
                    const regionStats = regionalData.get(regionName);
                    layer.bindPopup(regionStats ?
                        `<b>${regionName}</b><br/>Потенциал роста: ${formatNumber(regionStats.totalGrowth)}` :
                        `<b>${regionName}</b><br/>Нет данных`
                    );
                }
            }).addTo(map);
        }

        const dataBounds = L.latLngBounds([]);
        const selectionBounds = L.latLngBounds([]);

        regionalData.forEach((stats, regionName) => {
            const marker = capitalMarkersRef.current.get(regionName);
            if (marker) {
                const popupContent = `<b>${regionName}</b><br/><b>Потенциал роста: ${formatNumber(stats.totalGrowth)}</b><br/>Факт: ${formatNumber(stats.totalFact)}<br/>Потенциал: ${formatNumber(stats.totalPotential)}<br/>Клиентов: ${stats.clientCount}<br/>РМ: ${Array.from(stats.rmSet).join(', ')}`;
                marker.bindPopup(popupContent);
                dataBounds.extend(marker.getLatLng());
            }
        });

        if (selectedRegions.length > 0 && geoJsonLayer.current) {
            geoJsonLayer.current.eachLayer(layer => {
                const featureName = (layer as any).feature?.properties?.name;
                if (featureName && selectedRegions.includes(featureName)) {
                    // Fix: Cast layer to L.Polygon to access getBounds() method. The type definitions for L.Path do not include it.
                    selectionBounds.extend((layer as L.Polygon).getBounds());
                }
            });
        }
        
        if (selectionBounds.isValid()) {
            map.fitBounds(selectionBounds.pad(0.1));
        } else if (dataBounds.isValid()) {
            map.fitBounds(dataBounds.pad(0.2), { maxZoom: 8 });
        }

        if (maxGrowth > 0) {
            const legend = new L.Control({ position: 'bottomright' });
            legend.onAdd = () => {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.backgroundColor = 'rgba(31, 41, 55, 0.8)'; div.style.padding = '10px'; div.style.borderRadius = '5px';
                div.style.color = 'white'; div.style.lineHeight = '1.5';
                const grades = [0, maxGrowth * 0.1, maxGrowth * 0.25, maxGrowth * 0.5, maxGrowth * 0.75].filter((v, i, a) => a.indexOf(v) === i);
                let innerHTML = '<h4>Потенциал Роста</h4>';
                for (let i = 0; i < grades.length; i++) {
                    const from = grades[i]; const to = grades[i + 1];
                    innerHTML += `<i style="background:${getColor(from + 1)}"></i> ${formatNumber(from)}${to ? '&ndash;' + formatNumber(to) : '+'}<br>`;
                }
                div.innerHTML = innerHTML;
                const style = document.createElement('style');
                style.innerHTML = `.legend i { width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.8; border-radius: 3px; }`;
                div.appendChild(style);
                return div;
            };
            legend.addTo(map);
            legendControl.current = legend;
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

export default InteractiveRegionMap;