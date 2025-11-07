import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
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

    // Memoize searchable locations to prevent recalculation on every render
    const searchableLocations = useMemo<SearchableLocation[]>(() => {
        const locations: SearchableLocation[] = [];
        const addedNames = new Set<string>();

        // Add capitals
        capitals.forEach(capital => {
            if (!addedNames.has(capital.name)) {
                locations.push({ name: capital.name, type: capital.type, lat: capital.lat, lon: capital.lon });
                addedNames.add(capital.name);
            }
        });

        // Add regions from GeoJSON and keyword map
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

        // Add regions from the current dataset
        data.forEach(row => {
            const regionName = row.region;
            if (regionName && regionName !== 'Регион не определен' && !addedNames.has(regionName)) {
                locations.push({ name: regionName, type: 'region' });
                addedNames.add(regionName);
            }
        });

        return locations.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }, [data]);

    // Update search results based on the search term
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

    // Memoize aggregated data for performance
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

    // Define styles for different layer states - ALL ARE INVISIBLE
    const invisibleStyle = { weight: 0, opacity: 0, fillOpacity: 0 };
    const highlightStyle = invisibleStyle;
    const baseStyle = invisibleStyle;
    const dataStyle = invisibleStyle;
    const filterSelectedStyle = invisibleStyle;


    // Function to reset the previously highlighted layer
    const resetHighlight = useCallback(() => {
        if (highlightedLayer.current && geoJsonLayer.current) {
            geoJsonLayer.current.resetStyle(highlightedLayer.current as L.Path);
        }
        highlightedLayer.current = null;
    }, []);

    // Function to highlight a specific layer
    const highlightRegion = useCallback((layer: L.Layer) => {
        resetHighlight();
        if (layer instanceof L.Path) {
             layer.setStyle(highlightStyle).bringToFront();
             highlightedLayer.current = layer;
        }
    }, [resetHighlight]);

    // Handler for when a location is selected from the search results
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
    
    // Initialize map
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

    // Update GeoJSON layer and markers when data changes
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        // Clear existing layers to redraw
        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        if (capitalsLayer.current) map.removeLayer(capitalsLayer.current);

        // Add capital markers
        capitalsLayer.current = L.layerGroup().addTo(map);
        capitals.forEach(capital => {
            const marker = L.circleMarker([capital.lat, capital.lon], {
                radius: 4,
                fillColor: '#fbbf24',
                color: '#f59e0b',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8,
                className: 'pulsing-marker' // Add class for animation
            }).bindTooltip(capital.name);
            marker.on('mouseover', function(this: L.CircleMarker) { this.setRadius(8); });
            marker.on('mouseout', function(this: L.CircleMarker) { this.setRadius(4); });
            capitalsLayer.current?.addLayer(marker);
            capitalMarkersRef.current.set(capital.name, marker);
        });

        // Add region boundaries (now invisible)
        geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, {
            style: (feature) => {
                const regionName = feature?.properties?.name;
                if (selectedRegions.includes(regionName)) return filterSelectedStyle;
                if (regionalData.has(regionName)) return dataStyle;
                return baseStyle;
            },
            onEachFeature: (feature, layer) => {
                const regionName = feature.properties.name;
                layer.bindTooltip(regionName, { sticky: true, className: 'leaflet-tooltip-custom' });

                layer.on({
                    mouseover: (e) => { if (e.target !== highlightedLayer.current) e.target.setStyle(highlightStyle); },
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