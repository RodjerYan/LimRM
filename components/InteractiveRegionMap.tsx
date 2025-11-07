import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';

// Define props for the component
interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

    // 1. Aggregate data by region
    const regionMetrics = useMemo(() => {
        const metrics: { [key: string]: { totalGrowth: number; count: number } } = {};
        data.forEach(row => {
            if (!metrics[row.region]) {
                metrics[row.region] = { totalGrowth: 0, count: 0 };
            }
            metrics[row.region].totalGrowth += row.growthPotential;
            metrics[row.region].count++;
        });
        return metrics;
    }, [data]);

    // 2. Determine color scale
    const { minGrowth, maxGrowth } = useMemo(() => {
        const growthValues = Object.values(regionMetrics).map(m => m.totalGrowth).filter(v => v > 0);
        if (growthValues.length === 0) return { minGrowth: 0, maxGrowth: 1 };
        const min = Math.min(...growthValues);
        const max = Math.max(...growthValues);
        return { minGrowth: min, maxGrowth: max };
    }, [regionMetrics]);

    // 3. Define styling functions for GeoJSON layer
    const getColor = (growth: number) => {
        if (growth <= 0 || maxGrowth === minGrowth) return '#4A5568'; // Default color for no data or single value

        // Simple linear scale from yellow (low growth) to red (high growth)
        const ratio = (growth - minGrowth) / (maxGrowth - minGrowth);
        const hue = 60 - ratio * 60; // 60 (yellow) to 0 (red)

        return `hsl(${hue}, 90%, 50%)`;
    };

    const styleFeature = (feature?: GeoJSON.Feature): L.PathOptions => {
        const regionName = feature?.properties?.name;
        const metrics = regionName ? regionMetrics[regionName] : undefined;
        const growth = metrics ? metrics.totalGrowth : 0;
        const isSelected = selectedRegions.includes(regionName);

        return {
            fillColor: getColor(growth),
            weight: isSelected ? 3 : 1,
            opacity: 1,
            color: isSelected ? '#FFFFFF' : '#A0AEC0',
            dashArray: isSelected ? '' : '3',
            fillOpacity: isSelected ? 0.9 : 0.7,
        };
    };

    const onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
        const regionName = feature.properties?.name;
        if (regionName) {
            const metrics = regionMetrics[regionName];
            const growthText = metrics ? `Потенциал роста: ${metrics.totalGrowth.toLocaleString('ru-RU')} кг/ед` : 'Нет данных о росте';
            const tooltipContent = `<div class="font-sans"><b>${regionName}</b><br>${growthText}</div>`;
            layer.bindTooltip(tooltipContent, {
                sticky: true,
                className: 'custom-leaflet-tooltip'
            });
        }
    };

    // 4. Initialize map
    useEffect(() => {
        if (mapContainerRef.current && !mapInstanceRef.current) {
            const map = L.map(mapContainerRef.current, {
                center: [60, 90], // Center of Russia
                zoom: 3,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);

            mapInstanceRef.current = map;
        }
    }, []);

    // 5. Update GeoJSON layer when data or selection changes
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        if (geoJsonLayerRef.current) {
            geoJsonLayerRef.current.setStyle(styleFeature);
        } else {
            // The type assertion is needed because the GeoJSON object is large and TS might struggle.
            const geoJsonData = russiaRegionsGeoJSON as GeoJSON.FeatureCollection;
            const geoJsonLayer = L.geoJSON(geoJsonData, {
                style: styleFeature,
                onEachFeature: onEachFeature,
            }).addTo(map);
            geoJsonLayerRef.current = geoJsonLayer;
        }

    }, [regionMetrics, selectedRegions]); // Re-run when data changes

    // Cleanup on unmount
    useEffect(() => {
        const map = mapInstanceRef.current;
        return () => {
            if (map) {
                map.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Карта потенциала роста по регионам</h2>
            <div ref={mapContainerRef} className="h-[60vh] w-full rounded-lg" />
            <style>{`
                .custom-leaflet-tooltip {
                    background-color: rgba(31, 41, 55, 0.8);
                    border: 1px solid #4B5563;
                    color: #E5E7EB;
                    border-radius: 4px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                    padding: 6px 10px;
                }
            `}</style>
        </div>
    );
};

export default InteractiveRegionMap;
