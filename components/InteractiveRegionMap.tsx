import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow } from '../types';
import { REGION_BY_CITY_WITH_INDEXES } from '../utils/regionMap';

// Define custom icons to avoid default marker issues with bundlers
// This is a common workaround for Leaflet with React/Vite/Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});


interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    okbData: OkbDataRow[]; // Prop is available if needed in the future
}

interface RegionMetrics {
    region: string;
    totalFact: number;
    totalPotential: number;
    totalGrowth: number;
    clientCount: number;
}

const formatNumber = (num: number) => {
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)} млн`;
    if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)} тыс.`;
    return num.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const layerGroupRef = useRef<L.LayerGroup | null>(null);

    const regionCoords = useMemo(() => {
        const coords = new Map<string, { lat: number; lon: number }>();
        // Iterate through the map to get coordinates for each region.
        // The first city encountered for a region is used as its center point.
        for (const city in REGION_BY_CITY_WITH_INDEXES) {
            const { region, lat, lon } = REGION_BY_CITY_WITH_INDEXES[city];
            if (!coords.has(region) && lat && lon) {
                coords.set(region, { lat, lon });
            }
        }
        return coords;
    }, []);

    const aggregatedByRegion = useMemo(() => {
        const aggregation = new Map<string, RegionMetrics>();
        data.forEach(row => {
            let regionData = aggregation.get(row.region);
            if (!regionData) {
                regionData = {
                    region: row.region,
                    totalFact: 0,
                    totalPotential: 0,
                    totalGrowth: 0,
                    clientCount: 0,
                };
            }
            regionData.totalFact += row.fact;
            regionData.totalPotential += row.potential;
            regionData.totalGrowth += row.growthPotential;
            regionData.clientCount += row.clients.length;
            aggregation.set(row.region, regionData);
        });
        return Array.from(aggregation.values());
    }, [data]);
    
    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            mapInstance.current = L.map(mapContainer.current, {
                scrollWheelZoom: true,
                center: [62, 95], // Center of Russia
                zoom: 3,
            });
            
            // Using a dark theme tile layer to match the app's aesthetic
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19,
            }).addTo(mapInstance.current);

            layerGroupRef.current = L.layerGroup().addTo(mapInstance.current);
        }
    }, []);

    useEffect(() => {
        const layerGroup = layerGroupRef.current;
        if (!layerGroup) return;

        layerGroup.clearLayers();
        
        const allGrowthValues = aggregatedByRegion.map(r => r.totalGrowth).filter(g => g > 0);
        if (allGrowthValues.length === 0) return;

        const maxGrowth = Math.max(...allGrowthValues);
        const minGrowth = Math.min(...allGrowthValues);

        // Function to scale radius based on growth potential
        const getRadius = (growth: number) => {
            if (maxGrowth === minGrowth || maxGrowth <= 0) return 15;
            const scale = (growth - minGrowth) / (maxGrowth - minGrowth);
            return 10 + scale * 30; // Scale radius from 10px to 40px
        };

        aggregatedByRegion.forEach(regionData => {
            const coords = regionCoords.get(regionData.region);
            if (coords) {
                const circle = L.circle([coords.lat, coords.lon], {
                    radius: getRadius(regionData.totalGrowth),
                    color: '#fbbf24', // Warning color for potential
                    fillColor: '#fbbf24',
                    fillOpacity: 0.6,
                    weight: 1,
                });

                const popupContent = `
                    <div class="bg-gray-800 text-white p-2 rounded-md shadow-lg border border-gray-700" style="font-family: Inter, sans-serif;">
                        <h4 class="font-bold text-lg text-accent mb-2">${regionData.region}</h4>
                        <ul class="text-sm space-y-1">
                            <li><strong>Потенциал роста:</strong> <span class="font-semibold text-warning">${formatNumber(regionData.totalGrowth)}</span></li>
                            <li><strong>Текущий факт:</strong> ${formatNumber(regionData.totalFact)}</li>
                            <li><strong>Общий потенциал:</strong> ${formatNumber(regionData.totalPotential)}</li>
                            <li><strong>Клиентов:</strong> ${regionData.clientCount}</li>
                        </ul>
                    </div>
                `;

                circle.bindPopup(popupContent);
                layerGroup.addLayer(circle);
            }
        });

    }, [aggregatedByRegion, regionCoords]);
    
    useEffect(() => {
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 h-[60vh] flex flex-col">
            <h2 className="text-xl font-bold mb-4 text-white flex-shrink-0">Карта потенциала по регионам</h2>
            <div ref={mapContainer} className="h-full w-full rounded-lg flex-grow" />
        </div>
    );
};

export default InteractiveRegionMap;
