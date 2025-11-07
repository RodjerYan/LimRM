import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OkbDataRow } from '../types';
import { geoJsonData } from '../data/russia_regions_geojson';
import { exportToExcel } from '../utils/exportUtils';
import { SearchIcon, ExportIcon } from './icons';

interface InteractiveRegionMapProps {
    okbData: OkbDataRow[];
}

const normalizeString = (str: string) => str.toLowerCase().replace(/ё/g, 'е').trim();

// Функция для поиска значения в строке по разным ключам
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
    const markersLayerRef = useRef<L.LayerGroup | null>(null);

    const [searchQuery, setSearchQuery] = useState('Республика Крым');
    const [filteredPoints, setFilteredPoints] = useState<OkbDataRow[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            mapInstance.current = L.map(mapContainer.current, {
                center: [60, 90],
                zoom: 3,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            }).addTo(mapInstance.current);
            
            markersLayerRef.current = L.layerGroup().addTo(mapInstance.current);
        }
        
        // Initial search on component mount
        if (okbData.length > 0) {
            handleSearch();
        }

    }, [okbData]); // Run once when okbData is available

    const handleSearch = () => {
        const map = mapInstance.current;
        if (!map) return;

        const normalizedQuery = normalizeString(searchQuery);
        setError(null);
        
        // Clear previous layers
        geoJsonLayerRef.current && map.removeLayer(geoJsonLayerRef.current);
        markersLayerRef.current?.clearLayers();

        // Find region GeoJSON
        const regionFeature = geoJsonData.features.find(
            (f) => normalizeString(f.properties.name) === normalizedQuery
        );

        if (!regionFeature) {
            setError(`Регион "${searchQuery}" не найден. Проверьте название.`);
            setFilteredPoints([]);
            map.setView([60, 90], 3); // Reset view
            return;
        }

        // Draw region border
        geoJsonLayerRef.current = L.geoJSON(regionFeature as any, {
            style: {
                color: '#f97316', // orange-500
                weight: 3,
                opacity: 0.8,
                fillColor: '#f97316',
                fillOpacity: 0.1,
            },
        }).addTo(map);

        map.fitBounds(geoJsonLayerRef.current.getBounds());
        
        // Filter and display points
        const pointsInRegion = okbData.filter(
            (row) => row.lat && row.lon && normalizeString(findValue(row, ['Регион'])) === normalizedQuery
        );

        setFilteredPoints(pointsInRegion);

        pointsInRegion.forEach(point => {
            const marker = L.marker([point.lat!, point.lon!]);
            const address = findValue(point, ['Юридический адрес', 'Адрес']);
            marker.bindPopup(`<b>${point['Наименование']}</b><br/><small>${address}</small>`);
            markersLayerRef.current?.addLayer(marker);
        });
    };
    
    const handleExport = () => {
        if (filteredPoints.length > 0) {
            exportToExcel(filteredPoints, `ТТ_${searchQuery.replace(/\s/g, '_')}`);
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
                        placeholder="Введите название региона..."
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
