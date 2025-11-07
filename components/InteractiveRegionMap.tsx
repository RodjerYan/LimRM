
import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
// FIX: Import the 'Feature' type from 'geojson' to resolve the "Cannot find namespace 'GeoJSON'" error.
import type { Feature } from 'geojson';
import { AggregatedDataRow, OkbDataRow } from '../types';
// FIX: Import from the corrected russia_regions_geojson file which now exports an empty FeatureCollection.
// This resolves the module export error.
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson'; 
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';
import { REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { exportAggregatedToExcel } from '../utils/exportUtils';
import { SearchIcon, ExportIcon } from './icons';
import { capitals } from '../utils/capitals';

// Fix for default icon path issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const markerPinHtml = (colorClass: string) => `<div class="marker-pin ${colorClass}"></div>`;

const customIcon = (color: 'green' | 'blue') => new L.DivIcon({
    className: 'custom-div-icon',
    html: markerPinHtml(color),
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -35]
});

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    okbData: OkbDataRow[];
}

const formatNumber = (num: number) => {
    if (isNaN(num)) return '0';
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)} млн`;
    if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)} тыс.`;
    return num.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, okbData }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
    const markerClusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
    const capitalsLayerRef = useRef<L.LayerGroup | null>(null);
    const tempMarkerRef = useRef<L.Marker | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);

    const regionDataMap = useMemo(() => {
        const map = new Map<string, AggregatedDataRow>();
        data.forEach(row => map.set(row.region, row));
        return map;
    }, [data]);

    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            mapInstance.current = L.map(mapContainer.current, {
                scrollWheelZoom: true,
                center: [62, 95], // Center of Russia
                zoom: 3,
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            }).addTo(mapInstance.current);
            
            geoJsonLayerRef.current = L.geoJSON(undefined, { style: () => ({ weight: 0 }) }).addTo(mapInstance.current);
            markerClusterGroupRef.current = L.markerClusterGroup().addTo(mapInstance.current);
            
            // Add capitals layer
            capitalsLayerRef.current = L.layerGroup().addTo(mapInstance.current);
            capitals.forEach(capital => {
                const radius = capital.type === 'country' ? 6 : 4;
                const marker = L.circleMarker([capital.lat, capital.lon], {
                    radius: radius,
                    fillColor: "#fbbf24", // yellow-400
                    color: "#f59e0b",     // yellow-500
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });

                marker.bindTooltip(capital.name, {
                    permanent: false,
                    direction: 'top'
                });

                capitalsLayerRef.current?.addLayer(marker);
            });
        }
    }, []);

    useEffect(() => {
        const map = mapInstance.current;
        const geoJsonLayer = geoJsonLayerRef.current;
        if (!map || !geoJsonLayer) return;

        geoJsonLayer.clearLayers();

        const allGrowthValues = Array.from(regionDataMap.values()).map(r => r.growthPotential).filter(g => g > 0);
        if (allGrowthValues.length === 0) {
            geoJsonLayer.addData(russiaRegionsGeoJSON as any); // Add outlines even if no data
            return;
        }

        const maxGrowth = Math.max(...allGrowthValues);

        const getColor = (growth: number) => {
            if (growth <= 0) return '#4A5568'; // gray-600
            const ratio = Math.log1p(growth) / Math.log1p(maxGrowth);
            const hue = 220 + ratio * 40; // from blue to purple
            return `hsl(${hue}, 70%, 50%)`;
        };

        // FIX: Replaced 'GeoJSON.Feature' with the imported 'Feature' type.
        const styleFeature = (feature?: Feature): L.PathOptions => {
            const regionName = feature?.properties?.name;
            const regionData = regionName ? regionDataMap.get(regionName) : undefined;
            const growth = regionData?.growthPotential ?? 0;

            return {
                fillColor: getColor(growth),
                weight: 1,
                opacity: 1,
                color: '#1a202c',
                fillOpacity: regionData ? 0.7 : 0.2,
            };
        };
        
        geoJsonLayer.options.style = styleFeature;
        geoJsonLayer.addData(russiaRegionsGeoJSON as any);
        
    }, [regionDataMap]);

     useEffect(() => {
        const map = mapInstance.current;
        const markerClusterGroup = markerClusterGroupRef.current;
        if (!map || !markerClusterGroup) return;

        markerClusterGroup.clearLayers();
        
        const activeRegions = new Set(data.map(d => d.region));
        const markers: L.Marker[] = [];

        okbData.forEach(okbRow => {
            if (okbRow.lat && okbRow.lon && activeRegions.has(okbRow['Регион'] || '')) {
                const marker = L.marker([okbRow.lat, okbRow.lon], { icon: customIcon('blue') });
                marker.bindPopup(`<b>${okbRow['Наименование']}</b><br>${okbRow['Юридический адрес'] || 'Адрес не указан'}`);
                markers.push(marker);
            }
        });
        markerClusterGroup.addLayers(markers);

    }, [data, okbData]);
    
    const handleSearch = () => {
        const map = mapInstance.current;
        if (!map) return;
        setSearchError(null);
        if (tempMarkerRef.current) map.removeLayer(tempMarkerRef.current);

        const query = searchTerm.toLowerCase().trim();
        if (!query) return;

        // 1. Search for a city
        for (const city in REGION_BY_CITY_WITH_INDEXES) {
            if (city.toLowerCase() === query) {
                const { lat, lon } = REGION_BY_CITY_WITH_INDEXES[city];
                if (lat && lon) {
                    map.flyTo([lat, lon], 12);
                    tempMarkerRef.current = L.marker([lat, lon], { icon: customIcon('green') })
                        .bindPopup(`<b>${city}</b>`)
                        .addTo(map)
                        .openPopup();
                    return;
                }
            }
        }

        // 2. Search for a region (using keywords)
        const normalizedQuery = REGION_KEYWORD_MAP[query] || query;
        let foundLayer: L.Layer | null = null;
        geoJsonLayerRef.current?.eachLayer(layer => {
            const feature = (layer as L.GeoJSON).feature;
            // FIX: Add a type guard to ensure `feature` is a GeoJSON Feature with properties.
            // This resolves the TypeScript error "Property 'properties' does not exist on type '...'"
            // by safely checking the object's structure before accessing nested properties.
            if (feature?.type === 'Feature' && feature.properties) {
                const props = feature.properties as { name?: any };
                if (typeof props.name === 'string' && props.name.toLowerCase().includes(normalizedQuery)) {
                    foundLayer = layer;
                }
            }
        });

        if (foundLayer) {
            const bounds = (foundLayer as L.Polygon).getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds.pad(0.1));
            }
        } else {
            setSearchError('Регион или город не найден');
        }
    };

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-indigo-500/10 h-[70vh] flex flex-col">
            <div className="flex-shrink-0 mb-4 p-2 flex flex-col sm:flex-row items-center gap-3 bg-gray-900/50 rounded-lg">
                <h2 className="text-lg font-bold text-white flex-grow">Карта анализа регионов</h2>
                <div className="relative w-full sm:w-auto">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Найти город или регион..."
                        className="w-full sm:w-64 p-2 pl-10 bg-gray-800/60 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white"
                    />
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                </div>
                <button onClick={handleSearch} className="w-full sm:w-auto bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg transition">Найти</button>
                <button onClick={() => exportAggregatedToExcel(data, 'Анализ_потенциала')} className="w-full sm:w-auto bg-success hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2">
                    <ExportIcon />
                    <span>Выгрузить (.xlsx)</span>
                </button>
            </div>
            {searchError && <p className="text-danger text-center text-sm mb-2">{searchError}</p>}
            <div ref={mapContainer} className="h-full w-full rounded-lg flex-grow" />
        </div>
    );
};

export default InteractiveRegionMap;
