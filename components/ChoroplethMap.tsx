import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow } from '../types';
import { geoJsonData } from '../data/russia_regions_geojson';

// Helper to format numbers for display
const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

// Color scale function
const getColor = (value: number, max: number): string => {
    if (value <= 0) return '#4A5568'; // gray-700 for no potential
    const intensity = Math.sqrt(value / max); // Use sqrt for better color distribution
    if (intensity > 0.8) return '#b91c1c'; // red-700
    if (intensity > 0.6) return '#dd6b20'; // orange-600
    if (intensity > 0.4) return '#f59e0b'; // amber-500
    if (intensity > 0.2) return '#facc15'; // yellow-400
    return '#fef08a'; // yellow-200
};

const ChoroplethMap: React.FC<{ data: AggregatedDataRow[] }> = ({ data }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

    const aggregatedData = useMemo(() => {
        const regionData: { [key: string]: { growth: number, fact: number, potential: number } } = {};
        for (const row of data) {
            if (!regionData[row.region]) {
                regionData[row.region] = { growth: 0, fact: 0, potential: 0 };
            }
            regionData[row.region].growth += row.growthPotential;
            regionData[row.region].fact += row.fact;
            regionData[row.region].potential += row.potential;
        }
        return regionData;
    }, [data]);
    
    const maxGrowth = useMemo(() => Math.max(1, ...Object.values(aggregatedData).map(d => d.growth)), [aggregatedData]);

    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;

        mapInstance.current = L.map(mapContainer.current, {
            center: [60, 90],
            zoom: 3,
            scrollWheelZoom: true,
            zoomControl: false,
        });

        L.control.zoom({ position: 'topright' }).addTo(mapInstance.current);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(mapInstance.current);

        // Add legend
        const legend = new L.Control({ position: 'bottomright' });
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            const grades = [0, maxGrowth * 0.2, maxGrowth * 0.4, maxGrowth * 0.6, maxGrowth * 0.8];
            div.innerHTML = '<h4>Потенциал роста</h4>';
            for (let i = 0; i < grades.length; i++) {
                const from = grades[i];
                const to = grades[i + 1];
                div.innerHTML +=
                    `<i style="background:${getColor(from + 1, maxGrowth)}"></i> ` +
                    `${formatNumber(from)}` + (to ? `&ndash;${formatNumber(to)}<br>` : '+');
            }
            return div;
        };
        legend.addTo(mapInstance.current);

        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        if (geoJsonLayerRef.current) {
            map.removeLayer(geoJsonLayerRef.current);
        }

        const style = (feature?: any): L.PathOptions => {
            const regionName = feature?.properties.name || '';
            const value = aggregatedData[regionName]?.growth || 0;
            return {
                fillColor: getColor(value, maxGrowth),
                weight: 1,
                opacity: 1,
                color: '#1F2937',
                fillOpacity: 0.7
            };
        };

        const highlightFeature = (e: L.LeafletMouseEvent) => {
            const layer = e.target;
            layer.setStyle({
                weight: 3,
                color: '#818cf8', // accent
                dashArray: '',
                fillOpacity: 0.9
            });
            layer.bringToFront();
        };

        const resetHighlight = (e: L.LeafletMouseEvent) => {
            geoJsonLayerRef.current?.resetStyle(e.target);
        };
        
        const onEachFeature = (feature: any, layer: L.Layer) => {
            const regionName = feature.properties.name || '';
            const regionStats = aggregatedData[regionName];
            let popupContent = `<b>${regionName}</b><br/>`;
            if (regionStats) {
                popupContent += `Потенциал роста: ${formatNumber(regionStats.growth)}<br/>`;
                popupContent += `Факт: ${formatNumber(regionStats.fact)}<br/>`;
                popupContent += `Потенциал: ${formatNumber(regionStats.potential)}`;
            } else {
                popupContent += 'Нет данных';
            }
            layer.bindPopup(popupContent);
            layer.on({
                mouseover: highlightFeature,
                mouseout: resetHighlight,
            });
        };

        geoJsonLayerRef.current = L.geoJSON(geoJsonData as any, { style, onEachFeature }).addTo(map);

    }, [aggregatedData, maxGrowth]);


    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
             <h2 className="text-xl font-bold mb-4 text-white">Карта потенциала роста по регионам</h2>
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg z-10" />
        </div>
    );
};

export default ChoroplethMap;
