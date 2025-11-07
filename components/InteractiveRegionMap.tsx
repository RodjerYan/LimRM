import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow } from '../types';
import { regionsGeoJson } from '../data/russia_regions_geojson';
import { exportAggregatedToExcel } from '../utils/exportUtils';
import { ExportIcon, SearchIcon } from './icons';

// Fix for default Leaflet icons in Vite/React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
}

const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchError, setSearchError] = useState('');

    const dataMap = new Map(data.map(d => [d.region, d]));

    const getColor = (growthPotential: number | undefined, maxGrowth: number) => {
        if (growthPotential === undefined || maxGrowth === 0) return '#4B5563'; // Gray for no data
        const intensity = Math.sqrt(growthPotential / maxGrowth); // Use sqrt for better visual distribution
        if (intensity > 0.8) return '#c026d3'; // Fuchsia 600
        if (intensity > 0.6) return '#9333ea'; // Purple 600
        if (intensity > 0.4) return '#7c3aed'; // Violet 600
        if (intensity > 0.2) return '#6366f1'; // Indigo 500
        if (intensity > 0)   return '#4f46e5';   // Indigo 600
        return '#4B5563';
    };

    const maxGrowth = Math.max(...data.map(d => d.growthPotential), 0);

    const styleFeature = (feature: GeoJSON.Feature) => {
        const regionName = feature?.properties?.name;
        const regionData = dataMap.get(regionName);
        return {
            fillColor: getColor(regionData?.growthPotential, maxGrowth),
            weight: 1,
            opacity: 1,
            color: '#111827', // Dark border
            fillOpacity: regionData ? 0.8 : 0.3
        };
    };

    const handleSearch = () => {
        setSearchError('');
        if (!searchTerm.trim()) return;

        let foundLayer: L.Layer | null = null;
        geoJsonLayer.current?.eachLayer(layer => {
            // @ts-ignore
            if (layer.feature.properties.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                foundLayer = layer;
            }
        });

        if (foundLayer && mapInstance.current) {
            // @ts-ignore
            mapInstance.current.fitBounds(foundLayer.getBounds());
        } else {
            setSearchError('Регион не найден');
        }
    };
    
    useEffect(() => {
        if (!mapContainer.current) return;

        if (mapInstance.current === null) {
            mapInstance.current = L.map(mapContainer.current, {
                center: [60, 90],
                zoom: 3,
                scrollWheelZoom: true,
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
            }).addTo(mapInstance.current);
        }

        if (geoJsonLayer.current) {
            geoJsonLayer.current.clearLayers();
        }

        geoJsonLayer.current = L.geoJSON(regionsGeoJson as any, {
            style: styleFeature,
            onEachFeature: (feature, layer) => {
                const regionName = feature.properties.name;
                const regionData = dataMap.get(regionName);
                let popupContent = `<b>${regionName}</b>`;
                if (regionData) {
                    popupContent += `<br/>Потенциал роста: <b>${formatNumber(regionData.growthPotential)}</b>`;
                    popupContent += `<br/>Факт: ${formatNumber(regionData.fact)}`;
                    popupContent += `<br/>Общий потенциал: ${formatNumber(regionData.potential)}`;
                }
                layer.bindPopup(popupContent);
                
                layer.on({
                    mouseover: (e) => e.target.setStyle({ weight: 3, color: '#f87171' }),
                    mouseout: () => geoJsonLayer.current?.resetStyle(layer),
                });
            },
        }).addTo(mapInstance.current);

    }, [data]); // Re-render GeoJSON when data changes

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold text-white whitespace-nowrap">Карта анализа регионов</h2>
                <div className="w-full md:w-auto flex items-center gap-3">
                    <div className="relative w-full md:w-64">
                         <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Введите название региона..."
                            className="w-full p-2 pl-10 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                        />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                    </div>
                    <button onClick={handleSearch} className="px-4 py-2 bg-accent hover:bg-accent-dark text-white font-bold rounded-lg transition">Найти</button>
                    <button onClick={() => exportAggregatedToExcel(data, 'regional_analysis')} title="Выгрузить отфильтрованные данные в .xlsx" className="p-2.5 bg-success/80 hover:bg-success text-white font-bold rounded-lg transition flex items-center gap-2">
                        <ExportIcon/> Выгрузить (.xlsx)
                    </button>
                </div>
            </div>
            {searchError && <p className="text-danger text-center text-sm mb-2">{searchError}</p>}
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg" />
        </div>
    );
};

export default InteractiveRegionMap;
