import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OkbDataRow } from '../types';
import { geoJsonData } from '../data/russia_regions_geojson';
import { exportToExcel } from '../utils/exportUtils';
import { SearchIcon, ExportIcon } from './icons';

// Интерфейс для корректной работы с типами слоев Leaflet, созданными из GeoJSON
interface FeatureLayer extends L.Path {
    feature?: GeoJSON.Feature;
}

interface InteractiveRegionMapProps {
    okbData: OkbDataRow[];
}

const normalizeString = (str: string) => str ? str.toLowerCase().replace(/ё/g, 'е').trim() : '';

const findValue = (row: OkbDataRow, keys: string[]): string => {
    for (const key of keys) {
        if (row[key]) return String(row[key]);
    }
    return '';
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ okbData }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
    // FIX: Changed LayerGroup to FeatureGroup to support getBounds() method for fitting the map view to markers.
    const markersLayerRef = useRef<L.FeatureGroup | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filteredPoints, setFilteredPoints] = useState<OkbDataRow[]>([]);
    const [error, setError] = useState<string | null>(null);

    const defaultStyle = {
        color: '#4b5563', // gray-600
        weight: 1,
        opacity: 0.6,
        fillColor: '#374151', // gray-700
        fillOpacity: 0.1,
    };

    const highlightStyle = {
        color: '#f97316', // orange-500
        weight: 3,
        opacity: 0.9,
        fillColor: '#f97316',
        fillOpacity: 0.2,
    };

    const updateMapDisplay = useCallback((query: string, data: OkbDataRow[]) => {
        const map = mapInstance.current;
        const markersLayer = markersLayerRef.current;
        const geoJsonLayer = geoJsonLayerRef.current;

        if (!map || !markersLayer || !geoJsonLayer) return;

        markersLayer.clearLayers();
        setError(null);
        const normalizedQuery = normalizeString(query);

        if (!normalizedQuery) {
            // --- РЕЖИМ "ПОКАЗАТЬ ВСЁ" ---
            geoJsonLayer.setStyle(defaultStyle);
            const allPoints = data.filter(p => p.lat && p.lon);
            setFilteredPoints(allPoints);

            allPoints.forEach(point => {
                const marker = L.marker([point.lat!, point.lon!]);
                const address = findValue(point, ['Юридический адрес', 'Адрес']);
                marker.bindPopup(`<b>${point['Наименование']}</b><br/><small>${address}</small>`);
                markersLayer.addLayer(marker);
            });

            if (allPoints.length > 0) {
                // FIX: Property 'getBounds' does not exist on type 'LayerGroup<any>'. 
                // This is now valid because markersLayerRef is a FeatureGroup.
                map.fitBounds(markersLayer.getBounds().pad(0.1));
            } else {
                map.setView([60, 90], 3);
            }
        } else {
            // --- РЕЖИМ ПОИСКА И ФИЛЬТРАЦИИ ---
            let targetBounds: L.LatLngBounds | null = null;
            let regionFound = false;

            geoJsonLayer.eachLayer(layer => {
                const featureLayer = layer as FeatureLayer;
                // FIX: Property 'getBounds' does not exist on type 'FeatureLayer'.
                // Use a type guard to ensure the layer is a Path (like a Polygon) before accessing Path-specific methods.
                if (layer instanceof L.Path && featureLayer.feature?.properties) {
                    if (normalizeString(featureLayer.feature.properties.name) === normalizedQuery) {
                        layer.setStyle(highlightStyle);
                        targetBounds = layer.getBounds();
                        regionFound = true;
                    } else {
                        layer.setStyle(defaultStyle);
                    }
                }
            });

            if (regionFound) {
                const pointsInRegion = data.filter(
                    (row) => row.lat && row.lon && normalizeString(findValue(row, ['Регион'])) === normalizedQuery
                );
                setFilteredPoints(pointsInRegion);

                pointsInRegion.forEach(point => {
                    const marker = L.marker([point.lat!, point.lon!]);
                    const address = findValue(point, ['Юридический адрес', 'Адрес']);
                    marker.bindPopup(`<b>${point['Наименование']}</b><br/><small>${address}</small>`);
                    markersLayer.addLayer(marker);
                });

                if (targetBounds) {
                    map.fitBounds(targetBounds);
                }
            } else {
                setError(`Регион "${query}" не найден. Проверьте название.`);
                setFilteredPoints([]);
                geoJsonLayer.setStyle(defaultStyle);
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
            
            // FIX: Initialize as a FeatureGroup instead of a LayerGroup.
            markersLayerRef.current = L.featureGroup().addTo(map);
            geoJsonLayerRef.current = L.geoJSON(geoJsonData as any, { style: defaultStyle }).addTo(map);
        }
        
        // Показываем все точки при первой загрузке данных
        if (okbData.length > 0) {
            updateMapDisplay(searchQuery, okbData);
        }
    }, [okbData, updateMapDisplay, searchQuery]);

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
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Введите название региона (напр., Крым)..."
                        className="w-full p-2.5 pl-10 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                    />
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <SearchIcon />
                    </div>
                </div>
                <button
                    onClick={handleSearch}
                    className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white font-bold rounded-lg transition duration-200"
                >
                    Найти
                </button>
                <button
                    onClick={handleExport}
                    disabled={filteredPoints.length === 0}
                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition duration-200 flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                    <ExportIcon />
                    <span>Выгрузить (.xlsx)</span>
                </button>
            </div>
             {error && <p className="text-danger text-center mb-2">{error}</p>}
            <div ref={mapContainer} className="h-[65vh] w-full rounded-lg z-10" />
        </div>
    );
};

export default InteractiveRegionMap;