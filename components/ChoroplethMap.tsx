import React, { useEffect, useRef, useMemo } from 'react';
import { AggregatedDataRow } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';

declare const L: any; // Using Leaflet from CDN

interface ChoroplethMapProps {
    data: AggregatedDataRow[];
    onRegionClick: (regionName: string) => void;
    selectedRegions: string[];
}

// Function to normalize region names for matching with GeoJSON properties
const normalizeRegionName = (name: string): string => {
    return name
        .toLowerCase()
        .replace('область', '')
        .replace('край', '')
        .replace('республика', '')
        .replace('автономный округ', '')
        .replace('- югра', '')
        .replace(' - алания', '')
        .replace(' - кузбасс', '')
        .replace('г.', '')
        .trim();
};

const ChoroplethMap: React.FC<ChoroplethMapProps> = ({ data, onRegionClick, selectedRegions }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const geoJsonLayer = useRef<any>(null);
    const legendControl = useRef<any>(null);

    const aggregatedData = useMemo(() => {
        const regionData = new Map<string, { growthPotential: number; fact: number }>();
        data.forEach(item => {
            const region = item.city;
            const current = regionData.get(region) || { growthPotential: 0, fact: 0 };
            const growth = (item.newPlan || item.fact) - item.fact;
            current.growthPotential += growth > 0 ? growth : 0; // Only positive growth
            current.fact += item.fact;
            regionData.set(region, current);
        });

        // Normalize keys for matching
        const normalizedRegionData = new Map<string, { growthPotential: number; fact: number }>();
        regionData.forEach((value, key) => {
            normalizedRegionData.set(normalizeRegionName(key), value);
        });

        return normalizedRegionData;
    }, [data]);

    useEffect(() => {
        let isMounted = true;
        
        const initializeMap = async () => {
            if (!mapContainer.current || !isMounted) return;

            // Fetch GeoJSON data
            let geoJsonData;
            try {
                const response = await fetch('https://code.highcharts.com/mapdata/countries/ru/ru-all.geo.json');
                if (!response.ok) throw new Error('Failed to load map data');
                geoJsonData = await response.json();
            } catch (error) {
                console.error("Error fetching GeoJSON:", error);
                if (mapContainer.current) {
                    mapContainer.current.innerHTML = '<p class="text-center text-danger p-4">Не удалось загрузить карту регионов.</p>';
                }
                return;
            }

            if (!mapInstance.current && mapContainer.current) {
                mapInstance.current = L.map(mapContainer.current, {
                    center: [65, 95],
                    zoom: 3,
                    scrollWheelZoom: false,
                    attributionControl: false,
                });
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
                    maxZoom: 19
                }).addTo(mapInstance.current);
            }
            
            if (!mapInstance.current) return;
            const map = mapInstance.current;

            const growthValues = Array.from(aggregatedData.values()).map(d => d.growthPotential).filter(v => v > 0);
            const maxGrowth = growthValues.length > 0 ? Math.max(...growthValues) : 0;
            const minGrowth = growthValues.length > 0 ? Math.min(...growthValues) : 0;

            const getColor = (d: number) => {
                if (d <= 0) return '#4b5563'; // Gray for no/negative growth
                // Hue: 0 (red) to 120 (green). We map our range to a segment of this, e.g., 0-120.
                const h = Math.min(120, ((d - minGrowth) / (maxGrowth - minGrowth + 1)) * 120); 
                return `hsl(${h}, 90%, 35%)`;
            };

            const style = (feature: any) => {
                const regionName = normalizeRegionName(feature.properties.name || '');
                const regionData = aggregatedData.get(regionName);
                const growth = regionData ? regionData.growthPotential : 0;
                
                const isSelected = selectedRegions.length > 0 && selectedRegions.includes(feature.properties.name);

                return {
                    fillColor: getColor(growth),
                    weight: isSelected ? 3 : 1,
                    opacity: 1,
                    color: isSelected ? '#a78bfa' : 'white',
                    dashArray: '3',
                    fillOpacity: isSelected ? 0.8 : 0.6,
                };
            };
            
            if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
            if (legendControl.current) map.removeControl(legendControl.current);

            geoJsonLayer.current = L.geoJson(geoJsonData, {
                style,
                onEachFeature: (feature: any, layer: any) => {
                    const originalRegionName = feature.properties.name || 'Неизвестный регион';
                    const regionNameNormalized = normalizeRegionName(originalRegionName);
                    const regionData = aggregatedData.get(regionNameNormalized);
                    
                    const popupContent = `
                        <div class="font-sans">
                            <h4 class="font-bold text-base text-white">${originalRegionName}</h4>
                            ${regionData ? `
                                <p class="text-sm text-gray-300">Потенциал роста: <span class="font-bold text-warning">${formatLargeNumber(regionData.growthPotential)}</span></p>
                                <p class="text-sm text-gray-300">Текущий факт: <span class="font-bold text-success">${formatLargeNumber(regionData.fact)}</span></p>
                            ` : '<p class="text-sm text-gray-400 italic">Нет данных по росту</p>'}
                        </div>
                    `;
                    layer.bindPopup(popupContent);
                    layer.on({
                        mouseover: (e: any) => e.target.setStyle({ weight: 3, fillOpacity: 0.8 }),
                        mouseout: () => geoJsonLayer.current.resetStyle(layer),
                        click: () => onRegionClick(originalRegionName)
                    });
                }
            }).addTo(map);

            legendControl.current = new (L.Control.extend({
                 onAdd: function() {
                    const div = L.DomUtil.create('div', 'info legend bg-card-bg/80 p-2 rounded-md border border-border-color text-xs text-gray-300 w-32');
                    const grades = [0, maxGrowth * 0.2, maxGrowth * 0.4, maxGrowth * 0.6, maxGrowth * 0.8];
                    div.innerHTML = '<h4 class="font-bold mb-1 text-white">Потенциал роста</h4>';
                    
                    for (let i = 0; i < grades.length; i++) {
                        const from = grades[i];
                        const to = grades[i + 1];
                        div.innerHTML +=
                            `<i style="background:${getColor(from + 1)}" class="w-4 h-4 inline-block mr-1 opacity-70 align-middle"></i> ` +
                            formatLargeNumber(from) + (to ? '&ndash;' + formatLargeNumber(to) + '<br>' : '+');
                    }
                    return div;
                },
            }));
            legendControl.current.options.position = 'bottomright';
            legendControl.current.addTo(map);
        };

        initializeMap();

        return () => { isMounted = false; };
    }, [aggregatedData, onRegionClick, selectedRegions]);

    useEffect(() => {
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white">Карта потенциала регионов</h2>
            <div ref={mapContainer} className="relative h-[45vh] w-full rounded-lg overflow-hidden bg-gray-900" />
            <p className="text-xs text-gray-500 mt-2 text-center">
                Кликните на регион, чтобы отфильтровать таблицу. Зеленый цвет — высокий потенциал роста.
            </p>
        </div>
    );
};

export default ChoroplethMap;
