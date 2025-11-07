import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow } from '../types';
// FIX: Import the GeoJSON data for rendering region boundaries.
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
}

// Helper function to determine the color of a region based on its growth potential.
// A simple linear scale is used for demonstration.
const getColor = (value: number, maxValue: number): string => {
    if (value <= 0 || maxValue === 0) return '#4A5568'; // Neutral gray for no or negative growth
    const intensity = Math.sqrt(value / maxValue); // Use sqrt for better visual distribution

    if (intensity > 0.85) return '#ef4444'; // Bright Red
    if (intensity > 0.7) return '#f97316';  // Orange
    if (intensity > 0.5) return '#eab308';  // Yellow
    if (intensity > 0.3) return '#84cc16';  // Lime Green
    return '#22c55e'; // Green
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);

    // Memoize the aggregation of data by region to avoid recalculation on every render.
    const dataByRegion = useMemo(() => {
        const aggregated: { [key: string]: { fact: number; potential: number; growthPotential: number; groups: number } } = {};
        data.forEach(row => {
            if (!aggregated[row.region]) {
                aggregated[row.region] = { fact: 0, potential: 0, growthPotential: 0, groups: 0 };
            }
            aggregated[row.region].fact += row.fact;
            aggregated[row.region].potential += row.potential;
            aggregated[row.region].growthPotential += row.growthPotential;
            aggregated[row.region].groups++;
        });
        return aggregated;
    }, [data]);

    // Memoize the calculation of the maximum growth potential for the color scale.
    const maxGrowthPotential = useMemo(() => {
        return Math.max(...Object.values(dataByRegion).map(d => d.growthPotential), 0);
    }, [dataByRegion]);

    const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

    useEffect(() => {
        if (!mapContainer.current) return;

        // Initialize the map instance only once.
        if (mapInstance.current === null) {
            mapInstance.current = L.map(mapContainer.current, {
                center: [60, 90], // A central point in Russia
                zoom: 3,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            }).addTo(mapInstance.current);
        }

        const map = mapInstance.current;

        // Clean up previous GeoJSON layer before adding a new one.
        if (geoJsonLayer.current) {
            map.removeLayer(geoJsonLayer.current);
        }

        geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON as any, {
            style: (feature) => {
                const regionName = feature?.properties.name;
                const regionData = dataByRegion[regionName];
                const isSelected = selectedRegions.length > 0 && selectedRegions.includes(regionName);

                return {
                    fillColor: regionData ? getColor(regionData.growthPotential, maxGrowthPotential) : '#374151',
                    weight: isSelected ? 2.5 : 1,
                    opacity: 1,
                    color: isSelected ? '#a78bfa' : 'white',
                    dashArray: isSelected ? '' : '3',
                    fillOpacity: isSelected ? 0.9 : 0.7
                };
            },
            onEachFeature: (feature, layer) => {
                const regionName = feature.properties.name;
                const regionData = dataByRegion[regionName];

                let popupContent = `<strong class="text-base">${regionName}</strong>`;
                if (regionData) {
                    popupContent += `<hr class="my-1 border-gray-600">
                                     <div>Рост: <span class="font-bold text-yellow-400">${formatNumber(regionData.growthPotential)}</span></div>
                                     <div>Факт: <span class="font-bold text-green-400">${formatNumber(regionData.fact)}</span></div>
                                     <div>Потенциал: <span class="font-bold text-indigo-400">${formatNumber(regionData.potential)}</span></div>
                                     <div>Групп: <span class="font-bold">${regionData.groups}</span></div>`;
                } else {
                    popupContent += `<br/>Нет данных для анализа.`;
                }
                layer.bindPopup(popupContent);

                layer.on({
                    mouseover: (e) => e.target.setStyle({ weight: 2, color: '#c4b5fd', fillOpacity: 0.85 }),
                    mouseout: () => geoJsonLayer.current?.resetStyle(layer),
                });
            }
        }).addTo(map);

    }, [dataByRegion, maxGrowthPotential, selectedRegions, formatNumber]);

    // Cleanup map instance on component unmount.
    useEffect(() => {
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Карта Потенциала по Регионам</h2>
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg" />
        </div>
    );
};

export default InteractiveRegionMap;
