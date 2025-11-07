import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow } from '../types';
// @ts-ignore
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    okbData: OkbDataRow[];
}

// Function to determine color based on growth potential
const getColor = (value: number, max: number): string => {
    if (max === 0 || value === 0) return '#4B5563'; // Gray for no data
    const percentage = value / max;
    if (percentage > 0.8) return '#ef4444'; // Red-600
    if (percentage > 0.6) return '#f97316'; // Orange-500
    if (percentage > 0.4) return '#f59e0b'; // Amber-500
    if (percentage > 0.2) return '#84cc16'; // Lime-500
    if (percentage > 0) return '#22c55e';   // Green-500
    return '#4B5563'; // Gray-600
};

const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

    const regionalMetrics = useMemo(() => {
        const metrics: { [key: string]: { totalGrowth: number; totalFact: number; totalPotential: number; clientCount: number } } = {};
        
        data.forEach(row => {
            if (!metrics[row.region]) {
                metrics[row.region] = { totalGrowth: 0, totalFact: 0, totalPotential: 0, clientCount: 0 };
            }
            metrics[row.region].totalGrowth += row.growthPotential;
            metrics[row.region].totalFact += row.fact;
            metrics[row.region].totalPotential += row.potential;
            metrics[row.region].clientCount += row.clients.length;
        });
        return metrics;
    }, [data]);

    const maxGrowth = useMemo(() => {
        return Math.max(...Object.values(regionalMetrics).map(m => m.totalGrowth), 0);
    }, [regionalMetrics]);

    useEffect(() => {
        if (mapContainerRef.current && !mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapContainerRef.current, {
                center: [60, 90],
                zoom: 3,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(mapInstanceRef.current);
        }
    }, []);

    useEffect(() => {
        if (!mapInstanceRef.current) return;

        if (geoJsonLayerRef.current) {
            mapInstanceRef.current.removeLayer(geoJsonLayerRef.current);
        }
        
        const styleFeature = (feature?: GeoJSON.Feature): L.PathOptions => {
            const regionName = feature?.properties?.name || '';
            const metrics = regionalMetrics[regionName];
            const isSelected = selectedRegions.length > 0 && selectedRegions.includes(regionName);

            return {
                fillColor: metrics ? getColor(metrics.totalGrowth, maxGrowth) : '#4B5563',
                weight: isSelected ? 2.5 : 1,
                opacity: 1,
                color: isSelected ? '#a78bfa' : 'white', // Highlight selected regions
                dashArray: isSelected ? '' : '3',
                fillOpacity: isSelected ? 0.8 : 0.6,
            };
        };

        geoJsonLayerRef.current = L.geoJSON(russiaRegionsGeoJSON as GeoJSON.FeatureCollection, {
            style: styleFeature,
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: (e) => {
                        const l = e.target;
                        l.setStyle({ weight: 2, color: '#c4b5fd', fillOpacity: 0.8 });
                        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                            l.bringToFront();
                        }
                    },
                    mouseout: (e) => {
                        geoJsonLayerRef.current?.resetStyle(e.target);
                    },
                });

                const regionName = feature?.properties?.name;
                if (!regionName) return;

                const metrics = regionalMetrics[regionName];
                let popupContent = `<strong class="text-base">${regionName}</strong><br/>Нет данных`;
                if (metrics) {
                    popupContent = `
                        <div class="text-sm">
                            <strong class="text-base text-white">${regionName}</strong>
                            <ul class="mt-2 space-y-1">
                                <li><strong>Потенциал роста:</strong> ${formatNumber(metrics.totalGrowth)}</li>
                                <li><strong>Текущий факт:</strong> ${formatNumber(metrics.totalFact)}</li>
                                <li><strong>Общий потенциал:</strong> ${formatNumber(metrics.totalPotential)}</li>
                                <li><strong>Клиентов:</strong> ${metrics.clientCount}</li>
                            </ul>
                        </div>
                    `;
                }
                layer.bindPopup(popupContent);
            }
        }).addTo(mapInstanceRef.current);

    }, [regionalMetrics, maxGrowth, selectedRegions]);

    return <div ref={mapContainerRef} className="h-[50vh] w-full rounded-2xl shadow-lg border border-indigo-500/10" />;
};

export default InteractiveRegionMap;