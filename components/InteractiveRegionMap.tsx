import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { AggregatedDataRow, OkbDataRow } from '../types';
import { regionsGeoJson } from '../data/russia_regions_geojson';
import { exportAggregatedToExcel } from '../utils/exportUtils';
import { ExportIcon, SearchIcon } from './icons';
import { Feature } from 'geojson';
import { standardizeRegion, REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';


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
    okbData: OkbDataRow[];
}

const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, okbData }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const markersLayer = useRef<L.MarkerClusterGroup | null>(null);
    const cityMarker = useRef<L.CircleMarker | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchError, setSearchError] = useState('');
    
    const okbDataByRegion = React.useMemo(() => {
        const map = new Map<string, OkbDataRow[]>();
        okbData.forEach(row => {
            const region = standardizeRegion(row['Регион']);
            if (region && region !== 'Регион не определен') {
                if (!map.has(region)) map.set(region, []);
                map.get(region)!.push(row);
            }
        });
        return map;
    }, [okbData]);


    // --- Map Initialization Effect ---
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            mapInstance.current = L.map(mapContainer.current, {
                center: [60, 90],
                zoom: 3,
                scrollWheelZoom: true,
                attributionControl: false,
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
            }).addTo(mapInstance.current);

            const resizeObserver = new ResizeObserver(() => {
                setTimeout(() => mapInstance.current?.invalidateSize(), 0);
            });
            resizeObserver.observe(mapContainer.current);
            
            return () => {
                resizeObserver.disconnect();
                mapInstance.current?.remove();
                mapInstance.current = null;
            };
        }
    }, []);

    // --- Data Layer Update Effect ---
    useEffect(() => {
        if (!mapInstance.current) return;

        const map = mapInstance.current;

        // --- 1. Update GeoJSON Polygons ---
        if (geoJsonLayer.current) {
            map.removeLayer(geoJsonLayer.current);
        }

        const dataMap = new Map(data.map(d => [standardizeRegion(d.region), d]));
        const maxGrowth = Math.max(...data.map(d => d.growthPotential), 0);

        const getColor = (growthPotential?: number) => {
            if (growthPotential === undefined || maxGrowth === 0) return '#4B5563'; // Gray
            const intensity = Math.sqrt(growthPotential / maxGrowth);
            if (intensity > 0.8) return '#c026d3'; 
            if (intensity > 0.6) return '#9333ea';
            if (intensity > 0.4) return '#7c3aed';
            if (intensity > 0.2) return '#6366f1';
            if (intensity > 0) return '#4f46e5';
            return '#4B5563';
        };

        const styleFeature = (feature?: Feature) => {
            if (!feature?.properties) return { weight: 0, opacity: 0, fillOpacity: 0 };
            const regionData = dataMap.get(standardizeRegion(feature.properties.name));
            return {
                fillColor: getColor(regionData?.growthPotential),
                weight: 1, opacity: 1, color: '#111827',
                fillOpacity: regionData ? 0.8 : 0.3
            };
        };

        const onEachFeature = (feature: Feature, layer: L.Layer) => {
            if (feature.properties) {
                const regionName = standardizeRegion(feature.properties.name);
                const regionData = dataMap.get(regionName);
                let popupContent = `<b>${regionName}</b>`;
                if (regionData) {
                    popupContent += `<br/>Потенциал роста: <b>${formatNumber(regionData.growthPotential)}</b>`;
                } else {
                    popupContent += `<br/><i>Нет данных по продажам</i>`;
                }
                layer.bindPopup(popupContent);
                layer.on({
                    mouseover: (e) => e.target.setStyle({ weight: 3, color: '#f87171' }),
                    mouseout: () => geoJsonLayer.current?.resetStyle(layer as L.Path),
                });
            }
        };

        geoJsonLayer.current = L.geoJSON(regionsGeoJson as any, { style: styleFeature, onEachFeature }).addTo(map);

        // --- 2. Update Markers for Trade Points ---
        if (markersLayer.current) {
            markersLayer.current.clearLayers();
        } else {
            markersLayer.current = L.markerClusterGroup();
            map.addLayer(markersLayer.current);
        }
        
        const activeRegions = new Set(data.map(d => standardizeRegion(d.region)));
        
        activeRegions.forEach(region => {
            const regionOkb = okbDataByRegion.get(region) || [];
            regionOkb.forEach(client => {
                if (client.lat && client.lon) {
                    const marker = L.marker([client.lat, client.lon]);
                    marker.bindPopup(`<b>${client['Наименование']}</b><br>${client['Юридический адрес']}`);
                    markersLayer.current!.addLayer(marker);
                }
            });
        });

    }, [data, okbDataByRegion]);

    const handleSearch = () => {
        setSearchError('');
        if (!mapInstance.current || !searchTerm.trim()) return;

        const map = mapInstance.current;
        const lowerTerm = searchTerm.toLowerCase().trim().replace('г.', '').trim();
        
        // --- Cleanup previous search visuals ---
        if (cityMarker.current) {
            map.removeLayer(cityMarker.current);
            cityMarker.current = null;
        }
        if (geoJsonLayer.current) {
            geoJsonLayer.current.eachLayer(layer => {
                geoJsonLayer.current!.resetStyle(layer as L.Path);
            });
        }
        
        // --- PRIORITY 1: SEARCH FOR A CITY ---
        const cityData = REGION_BY_CITY_WITH_INDEXES[lowerTerm];
        if (cityData && cityData.lat && cityData.lon) {
            const cityCoords: L.LatLngTuple = [cityData.lat, cityData.lon];
            map.flyTo(cityCoords, 11, { animate: true, duration: 1 }); // Zoom level 11 is good for a city

            cityMarker.current = L.circleMarker(cityCoords, {
                radius: 15,
                color: '#fbbf24',
                fillColor: '#fbbf24',
                fillOpacity: 0.5,
                weight: 2
            }).addTo(map);
            
            setTimeout(() => {
                if (cityMarker.current) {
                    map.removeLayer(cityMarker.current);
                    cityMarker.current = null;
                }
            }, 4000);
            return;
        }

        // --- PRIORITY 2: SEARCH FOR A REGION ---
        let targetRegionName: string | null = null;
        const regionFromAlias = Object.entries(REGION_KEYWORD_MAP).find(([key]) => key.toLowerCase() === lowerTerm);
        if (regionFromAlias) {
            targetRegionName = regionFromAlias[1];
        } else {
            const allCanonicalNames = [...new Set(Object.values(REGION_KEYWORD_MAP))];
            const bestMatch = allCanonicalNames.find(name => name.toLowerCase().startsWith(lowerTerm))
                           || allCanonicalNames.find(name => name.toLowerCase().includes(lowerTerm));
            if (bestMatch) {
                targetRegionName = bestMatch;
            }
        }
        
        if (!targetRegionName) {
            setSearchError('Объект не найден. Уточните запрос.');
            return;
        }

        let foundLayer: L.Layer | null = null;
        const targetRegionLower = standardizeRegion(targetRegionName).toLowerCase();

        geoJsonLayer.current?.eachLayer(layer => {
            const feature = (layer as any).feature as Feature;
            const regionName = standardizeRegion(feature?.properties?.name).toLowerCase();
            if (regionName === targetRegionLower) {
                foundLayer = layer;
            }
        });

        if (foundLayer && typeof (foundLayer as L.GeoJSON).getBounds === 'function') {
            const bounds = (foundLayer as L.Polygon).getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { paddingTopLeft: [20, 20], paddingBottomRight: [20, 20], maxZoom: 10 });
                const pathLayer = foundLayer as L.Path;
                pathLayer.setStyle({ weight: 4, color: '#fbbf24' });
            } else {
                setSearchError('Не удалось определить границы региона');
            }
        } else {
            setSearchError(`Границы для региона '${targetRegionName}' не найдены`);
        }
    };
    
    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold text-white whitespace-nowrap">Карта анализа регионов</h2>
                <div className="w-full md:w-auto flex items-center gap-3">
                    <div className="relative w-full md:w-64">
                         <input
                            type="text" value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Введите регион или город..."
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