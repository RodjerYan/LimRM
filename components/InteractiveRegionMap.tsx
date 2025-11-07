import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { capitals } from '../utils/capitals';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    okbData: any[]; // Kept for future compatibility, not used in this implementation
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const markersLayer = useRef<L.LayerGroup | null>(null);
    const legendControl = useRef<L.Control | null>(null);

    // 1. Aggregate data by region
    const regionalData = useMemo(() => {
        if (!data || data.length === 0) return new Map();
        
        const aggregation = new Map<string, {
            totalGrowth: number;
            totalPotential: number;
            totalFact: number;
            clientCount: number;
            rmSet: Set<string>;
        }>();

        data.forEach(row => {
            const region = row.region;
            if (!region || region === 'Регион не определен') return;

            if (!aggregation.has(region)) {
                aggregation.set(region, { totalGrowth: 0, totalPotential: 0, totalFact: 0, clientCount: 0, rmSet: new Set() });
            }
            const current = aggregation.get(region)!;
            current.totalGrowth += row.growthPotential;
            current.totalPotential += row.potential;
            current.totalFact += row.fact;
            current.clientCount += row.clients?.length || 1;
            current.rmSet.add(row.rm);
        });

        return aggregation;
    }, [data]);

    // Initialize map
    useEffect(() => {
        if (mapContainer.current && mapInstance.current === null) {
            mapInstance.current = L.map(mapContainer.current, {
                center: [60, 90], // Center of Russia
                zoom: 3,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(mapInstance.current);

            markersLayer.current = L.layerGroup().addTo(mapInstance.current);
        }

        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    // Update Choropleth and Markers based on data
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !regionalData) return;

        // Clear previous layers
        if (geoJsonLayer.current) {
            map.removeLayer(geoJsonLayer.current);
            geoJsonLayer.current = null;
        }
        if (legendControl.current) {
            map.removeControl(legendControl.current);
            legendControl.current = null;
        }
        markersLayer.current?.clearLayers();

        if (regionalData.size === 0) return;

        const growthValues = Array.from(regionalData.values()).map(d => d.totalGrowth).filter(v => v > 0);
        const maxGrowth = growthValues.length > 0 ? Math.max(...growthValues) : 0;
        const minGrowth = growthValues.length > 0 ? Math.min(...growthValues) : 0;

        // Color scale function
        const getColor = (value: number) => {
            if (value <= 0) return '#374151'; // Gray for no/negative growth
            const range = Math.log(maxGrowth + 1) - Math.log(minGrowth + 1);
            if (range === 0) return 'hsl(180, 70%, 50%)'; // Single color if all values are the same
            const intensity = (Math.log(value + 1) - Math.log(minGrowth + 1)) / range;
            const hue = 240 - intensity * 180; // from blue to red/pink
            return `hsl(${hue}, 70%, 50%)`;
        };
        
        const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

        // Create GeoJSON layer if geo data is available
        if (russiaRegionsGeoJSON && russiaRegionsGeoJSON.features.length > 0) {
            geoJsonLayer.current = L.geoJSON(russiaRegionsGeoJSON, {
                style: (feature) => {
                    const regionName = feature?.properties?.name;
                    const regionStats = regionalData.get(regionName);
                    return {
                        fillColor: regionStats ? getColor(regionStats.totalGrowth) : '#1F2937',
                        weight: 1,
                        opacity: 1,
                        color: '#4B5563',
                        fillOpacity: 0.7,
                    };
                },
                onEachFeature: (feature, layer) => {
                    const regionName = feature.properties.name;
                    const regionStats = regionalData.get(regionName);
                    const popupContent = regionStats
                        ? `<b>${regionName}</b><br/>Потенциал роста: ${formatNumber(regionStats.totalGrowth)}<br/>Факт: ${formatNumber(regionStats.totalFact)}<br/>Клиентов: ${regionStats.clientCount}`
                        : `<b>${regionName}</b><br/>Нет данных`;
                    layer.bindPopup(popupContent);
                }
            }).addTo(map);
        }

        // Add Markers for regional capitals
        const capitalMarkers: L.Marker[] = [];
        regionalData.forEach((stats, regionName) => {
            const capital = capitals.find(c => c.name === regionName || regionName.startsWith(c.name));
            if (capital) {
                const marker = L.marker([capital.lat, capital.lon])
                    .bindPopup(`<b>${regionName}</b><br/><b>Потенциал роста: ${formatNumber(stats.totalGrowth)}</b><br/>Факт: ${formatNumber(stats.totalFact)}<br/>Потенциал: ${formatNumber(stats.totalPotential)}<br/>Клиентов: ${stats.clientCount}<br/>РМ: ${Array.from(stats.rmSet).join(', ')}`);
                markersLayer.current?.addLayer(marker);
                capitalMarkers.push(marker);
            }
        });
        
        if (capitalMarkers.length > 1) {
            const group = L.featureGroup(capitalMarkers);
            map.fitBounds(group.getBounds().pad(0.2));
        } else if (capitalMarkers.length === 1) {
            map.flyTo(capitalMarkers[0].getLatLng(), 6);
        }

        // Add Legend
        const legend = new L.Control({ position: 'bottomright' });
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            div.style.backgroundColor = 'rgba(31, 41, 55, 0.8)';
            div.style.padding = '10px';
            div.style.borderRadius = '5px';
            div.style.color = 'white';
            div.style.lineHeight = '1.5';

            const grades = [0, maxGrowth * 0.1, maxGrowth * 0.25, maxGrowth * 0.5, maxGrowth * 0.75].filter((v, i, a) => a.indexOf(v) === i);
            let innerHTML = '<h4>Потенциал Роста</h4>';
            for (let i = 0; i < grades.length; i++) {
                const from = grades[i];
                const to = grades[i + 1];
                innerHTML += `<i style="background:${getColor(from + 1)}"></i> ${formatNumber(from)}${to ? '&ndash;' + formatNumber(to) : '+'}<br>`;
            }
            div.innerHTML = innerHTML;

            const style = document.createElement('style');
            style.innerHTML = `.legend i { width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.8; border-radius: 3px; }`;
            div.appendChild(style);
            
            return div;
        };

        if (maxGrowth > 0) {
             legend.addTo(map);
             legendControl.current = legend;
        }

    }, [regionalData]);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Карта рыночного потенциала по регионам</h2>
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg" />
        </div>
    );
};

export default InteractiveRegionMap;
