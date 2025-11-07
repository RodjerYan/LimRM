import React, { useState, useEffect, useRef, useCallback } from 'react';
// FIX: Changed the Leaflet import from `import * as L from 'leaflet'` to `import L from 'leaflet'`.
// This aligns with the import style used in other components of the project and allows TypeScript
// to correctly resolve the types for the `leaflet.markercluster` plugin, fixing errors related
// to `L.MarkerClusterGroup` and `L.markerClusterGroup`.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster'; // Import JS for clustering
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { OkbDataRow } from '../types';
import { geoJsonData } from '../data/russia_regions_geojson';
import { exportToExcel } from '../utils/exportUtils';
import { SearchIcon, ExportIcon } from './icons';

// Interface for correct typing of Leaflet layers created from GeoJSON
interface FeatureLayer extends L.Path {
    feature?: GeoJSON.Feature;
}

interface InteractiveRegionMapProps {
    okbData: OkbDataRow[];
}

const normalizeString = (str: string) => str ? str.toLowerCase().replace(/ё/g, 'е').trim() : '';
const findValue = (row: OkbDataRow, keys: string[]): string => {
    for (const key of keys) { if (row[key]) return String(row[key]); }
    return '';
};

// Custom DivIcon for individual markers to avoid default icon loading issues
const customMarkerIcon = L.divIcon({
    html: `<div class="marker-pin blue"></div>`,
    className: 'custom-marker-div-icon', // Wrapper class for scoping
    iconSize: [30, 42],
    iconAnchor: [15, 42] // Point of the pin
});

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ okbData }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
    const markersLayerRef = useRef<L.MarkerClusterGroup | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filteredPoints, setFilteredPoints] = useState<OkbDataRow[]>([]);
    const [error, setError] = useState<string | null>(null);

    const defaultStyle = { color: '#4b5563', weight: 1, opacity: 0.6, fillColor: '#374151', fillOpacity: 0.1 };
    const highlightStyle = { color: '#f97316', weight: 3, opacity: 0.9, fillColor: '#f97316', fillOpacity: 0.2 };

    const updateMapDisplay = useCallback((query: string, data: OkbDataRow[]) => {
        const map = mapInstance.current;
        const markersLayer = markersLayerRef.current;
        const geoJsonLayer = geoJsonLayerRef.current;
        if (!map || !markersLayer || !geoJsonLayer) return;

        markersLayer.clearLayers();
        setError(null);
        const normalizedQuery = normalizeString(query);
        const pointsWithCoords = data.filter(p => p.lat && p.lon);

        const addMarkers = (points: OkbDataRow[]) => {
            const markers: L.Marker[] = [];
            points.forEach(point => {
                const marker = L.marker([point.lat!, point.lon!], { icon: customMarkerIcon });
                const address = findValue(point, ['Юридический адрес', 'Адрес']);
                marker.bindPopup(`<b>${point['Наименование']}</b><br/><small>${address}</small>`);
                markers.push(marker);
            });
            markersLayer.addLayers(markers);
        };

        if (!normalizedQuery) {
            geoJsonLayer.eachLayer(layer => {
                if (layer instanceof L.Path) layer.setStyle(defaultStyle);
            });
            setFilteredPoints(pointsWithCoords);
            addMarkers(pointsWithCoords);
            if (pointsWithCoords.length > 0) {
                // A small delay ensures that the map container has rendered before fitting bounds
                setTimeout(() => map.fitBounds(markersLayer.getBounds().pad(0.1)), 100);
            } else {
                map.setView([60, 90], 3); // Default view of Russia
            }
        } else {
            let regionFound = false;
            geoJsonLayer.eachLayer(layer => {
                const featureLayer = layer as FeatureLayer;
                if (layer instanceof L.Path && featureLayer.feature?.properties) {
                    if (normalizeString(featureLayer.feature.properties.name) === normalizedQuery) {
                        layer.setStyle(highlightStyle);
                        layer.bringToFront();
                        map.fitBounds((layer as L.Polygon).getBounds());
                        regionFound = true;
                    } else {
                        layer.setStyle(defaultStyle);
                    }
                }
            });

            if (regionFound) {
                const pointsInRegion = pointsWithCoords.filter(
                    (row) => normalizeString(findValue(row, ['Регион'])) === normalizedQuery
                );
                setFilteredPoints(pointsInRegion);
                addMarkers(pointsInRegion);
            } else {
                setError(`Регион "${query}" не найден. Проверьте название.`);
                setFilteredPoints([]);
                geoJsonLayer.eachLayer(layer => {
                    if (layer instanceof L.Path) layer.setStyle(defaultStyle);
                });
                map.setView([60, 90], 3);
            }
        }
    }, []);

    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, {
                center: [60, 90],
                zoom: 3,
                scrollWheelZoom: true,
            });
            mapInstance.current = map;

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            }).addTo(map);
            
            markersLayerRef.current = L.markerClusterGroup({
                chunkedLoading: true,
                maxClusterRadius: 80,
                iconCreateFunction: (cluster) => {
                    const count = cluster.getChildCount();
                    let sizeClass = 'small';
                    if (count >= 100) sizeClass = 'large';
                    else if (count >= 10) sizeClass = 'medium';
                    return L.divIcon({
                        html: `<span>${count}</span>`,
                        className: `marker-cluster marker-cluster-${sizeClass}`,
                        iconSize: undefined // Let CSS control the size
                    });
                }
            }).addTo(map);

            geoJsonLayerRef.current = L.geoJSON(geoJsonData as any, { style: defaultStyle }).addTo(map);

            const resizeObserver = new ResizeObserver(() => {
                mapInstance.current?.invalidateSize(true);
            });
            resizeObserver.observe(mapContainer.current);

            return () => {
                resizeObserver.disconnect();
                map.remove();
                mapInstance.current = null;
            };
        }
    }, []);

    useEffect(() => {
        if (okbData.length > 0 && mapInstance.current) {
            updateMapDisplay(searchQuery, okbData);
        }
    }, [okbData, searchQuery, updateMapDisplay]);

    const handleSearch = () => {
        updateMapDisplay(searchQuery, okbData);
    };
    
    const handleExport = () => {
        if (filteredPoints.length > 0) {
            const fileName = searchQuery ? `ТТ_${searchQuery.replace(/\s/g, '_')}` : 'Все_ТТ';
            exportToExcel(filteredPoints, fileName);
        }
    };

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-grow">
                    <input
                        type="text" value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Введите название региона (напр., Крым)..."
                        className="w-full p-2.5 pl-10 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                    />
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                </div>
                <button onClick={handleSearch} className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white font-bold rounded-lg transition duration-200">Найти</button>
                <button onClick={handleExport} disabled={filteredPoints.length === 0} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition duration-200 flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                    <ExportIcon /><span>Выгрузить (.xlsx)</span>
                </button>
            </div>
            {error && <p className="text-danger text-center mb-2">{error}</p>}
            <div ref={mapContainer} className="h-[65vh] w-full rounded-lg z-10" />
        </div>
    );
};

export default InteractiveRegionMap;