import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
// FIX: Explicitly import the 'Feature' type from 'geojson' to resolve the 'Cannot find namespace "GeoJSON"' error.
// This ensures the type definitions for GeoJSON objects are available to TypeScript.
import type { Feature } from 'geojson';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { OkbDataRow } from '../types';
import { geoJsonData } from '../data/russia_regions_geojson';
import { exportToExcel } from '../utils/exportUtils';
import { SearchIcon, ExportIcon } from './icons';

// FIX: Correctly type FeatureLayer as a Polygon, which is a Path layer that Leaflet
// creates for GeoJSON polygon features, not the GeoJSON container itself. This resolves
// type incompatibilities for the 'feature' property and allows direct access
// to Path methods like setStyle without unsafe casting, fixing both reported errors.
interface FeatureLayer extends L.Polygon {
    // FIX: Use the imported 'Feature' type instead of the unresolved 'GeoJSON.Feature' namespace.
    feature?: Feature;
}

interface InteractiveRegionMapProps {
    okbData: OkbDataRow[];
}

const normalizeString = (str: string) => str ? str.toLowerCase().replace(/ё/g, 'е').trim() : '';
const findValue = (row: OkbDataRow, keys: string[]): string => {
    for (const key of keys) { if (row[key]) return String(row[key]); }
    return '';
};

const customMarkerIcon = L.divIcon({
    html: `<div class="marker-pin blue"></div>`,
    className: 'custom-marker-div-icon',
    iconSize: [30, 42],
    iconAnchor: [15, 42]
});

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ okbData }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
    const markersLayerRef = useRef<L.MarkerClusterGroup | null>(null);
    const highlightedLayerRef = useRef<L.Layer | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filteredPoints, setFilteredPoints] = useState<OkbDataRow[]>([]);
    const [error, setError] = useState<string | null>(null);

    const defaultStyle: L.PathOptions = { color: '#6b7280', weight: 1, opacity: 0.6, fillColor: '#374151', fillOpacity: 0.4 };
    const highlightStyle: L.PathOptions = { color: '#f97316', weight: 3, opacity: 1, fillColor: '#fdba74', fillOpacity: 0.3 };

    const updateMapDisplay = useCallback((query: string, data: OkbDataRow[]) => {
        const map = mapInstance.current;
        const markersLayer = markersLayerRef.current;
        const geoJsonLayer = geoJsonLayerRef.current;
        if (!map || !markersLayer || !geoJsonLayer) return;

        markersLayer.clearLayers();
        setError(null);
        highlightedLayerRef.current = null;
        
        const normalizedQuery = normalizeString(query);
        const pointsWithCoords = data.filter(p => p.lat && p.lon);

        const addMarkers = (points: OkbDataRow[]) => {
            const markers = points.map(point => {
                const marker = L.marker([point.lat!, point.lon!], { icon: customMarkerIcon });
                const address = findValue(point, ['Юридический адрес', 'Адрес']);
                marker.bindPopup(`<b>${point['Наименование']}</b><br/><small>${address}</small>`);
                return marker;
            });
            markersLayer.addLayers(markers);
        };
        
        geoJsonLayer.eachLayer(l => { (l as L.Path).setStyle(defaultStyle); });

        if (!normalizedQuery) {
            setFilteredPoints(pointsWithCoords);
            addMarkers(pointsWithCoords);
            if (pointsWithCoords.length > 0) {
                 setTimeout(() => {
                    if (map && markersLayer.getLayers().length > 0) {
                        map.fitBounds(markersLayer.getBounds().pad(0.1));
                    }
                 }, 100);
            } else {
                map.fitBounds(geoJsonLayer.getBounds());
            }
        } else {
            let targetLayer: FeatureLayer | undefined;
            geoJsonLayer.eachLayer(layer => {
                const featureLayer = layer as FeatureLayer;
                if (!targetLayer && featureLayer.feature?.properties) {
                    const regionName = normalizeString(featureLayer.feature.properties.name);
                    if (regionName.includes(normalizedQuery)) {
                        targetLayer = featureLayer;
                    }
                }
            });

            if (targetLayer) {
                targetLayer.setStyle(highlightStyle).bringToFront();
                highlightedLayerRef.current = targetLayer;
                map.fitBounds(targetLayer.getBounds());
                
                const foundRegionName = normalizeString(targetLayer.feature!.properties!.name);
                const pointsInRegion = pointsWithCoords.filter(row => {
                     const sheetRegion = normalizeString(findValue(row, ['Регион']));
                     return sheetRegion && (foundRegionName.includes(sheetRegion) || sheetRegion.includes(foundRegionName));
                });
                setFilteredPoints(pointsInRegion);
                addMarkers(pointsInRegion);
            } else {
                 setError(`Регион "${query}" не найден. Проверьте название.`);
                 setFilteredPoints([]);
                 map.fitBounds(geoJsonLayer.getBounds());
            }
        }
    }, [defaultStyle, highlightStyle]);

    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, { scrollWheelZoom: true });
            mapInstance.current = map;

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            }).addTo(map);
            
            markersLayerRef.current = L.markerClusterGroup({
                chunkedLoading: true,
                maxClusterRadius: 80,
                iconCreateFunction: (cluster) => {
                    const count = cluster.getChildCount();
                    let sizeClass = 'small';
                    if (count >= 100) sizeClass = 'large';
                    else if (count >= 10) sizeClass = 'medium';
                    return L.divIcon({ html: `<span>${count}</span>`, className: `marker-cluster marker-cluster-${sizeClass}`, iconSize: undefined });
                }
            }).addTo(map);

            // FIX: Use the imported 'Feature' type instead of the unresolved 'GeoJSON.Feature' namespace.
            const onEachFeature = (feature: Feature, layer: L.Layer) => {
                layer.on({
                    mouseover: (e) => {
                        if (layer !== highlightedLayerRef.current) {
                           (e.target as L.Path).setStyle(highlightStyle);
                           layer.bindTooltip(feature.properties.name).openTooltip();
                        }
                    },
                    mouseout: (e) => {
                        if (layer !== highlightedLayerRef.current) {
                           (e.target as L.Path).setStyle(defaultStyle);
                           layer.closeTooltip();
                        }
                    },
                    click: () => setSearchQuery(feature.properties.name),
                });
            };

            geoJsonLayerRef.current = L.geoJSON(geoJsonData as any, { style: defaultStyle, onEachFeature }).addTo(map);
            map.fitBounds(geoJsonLayerRef.current.getBounds());

            return () => { map.remove(); mapInstance.current = null; };
        }
    }, [defaultStyle, highlightStyle]);

    useEffect(() => {
        if (okbData.length > 0) {
            updateMapDisplay(searchQuery, okbData);
        }
    }, [okbData, searchQuery, updateMapDisplay]);

    const handleSearch = () => updateMapDisplay(searchQuery, okbData);
    
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