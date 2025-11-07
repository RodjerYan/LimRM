import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { capitals } from '../utils/capitals';
import 'leaflet-search';
import { GeoJsonObject } from 'geojson';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
}

const getColor = (value: number, maxValue: number): string => {
    if (value <= 0 || maxValue === 0) return '#4A5568'; // gray-600
    const intensity = Math.sqrt(value / maxValue);
    if (intensity > 0.85) return '#B91C1C'; // red-700
    if (intensity > 0.7) return '#EA580C'; // orange-600
    if (intensity > 0.5) return '#D97706'; // amber-600
    if (intensity > 0.3) return '#65A30D'; // lime-600
    return '#16A34A'; // green-600
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const capitalsLayer = useRef<L.FeatureGroup | null>(null);
    const regionLayers = useRef<{[key: string]: L.Layer}>({});
    const searchControl = useRef<any>(null);

    const dataByRegion = useMemo(() => {
        const aggregated: { [key: string]: { fact: number; potential: number; growthPotential: number; groups: number, clients: Set<string> } } = {};
        data.forEach(row => {
            if (!aggregated[row.region]) {
                aggregated[row.region] = { fact: 0, potential: 0, growthPotential: 0, groups: 0, clients: new Set() };
            }
            aggregated[row.region].fact += row.fact;
            aggregated[row.region].potential += row.potential;
            aggregated[row.region].growthPotential += row.growthPotential;
            aggregated[row.region].groups++;
            row.clients.forEach(client => aggregated[row.region].clients.add(client));
        });
        return aggregated;
    }, [data]);

    const maxGrowthPotential = useMemo(() => {
        return Math.max(...Object.values(dataByRegion).map(d => d.growthPotential), 0);
    }, [dataByRegion]);

    const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

    const dataForSearch = useMemo(() => [
        ...(russiaRegionsGeoJSON as any).features.map((feature: any) => ({
            title: feature.properties.name,
            feature: feature,
            type: 'region' as const,
        })),
        ...capitals.map(capital => ({
            title: capital.name,
            lat: capital.lat,
            lon: capital.lon,
            type: 'city' as const,
        }))
    ], []);

    useEffect(() => {
        if (mapContainer.current && !mapInstance.current) {
            const map = L.map(mapContainer.current, {
                center: [60, 90],
                zoom: 3,
                scrollWheelZoom: true,
                attributionControl: false,
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO',
            }).addTo(map);
            L.control.attribution({ prefix: '<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>' }).addTo(map);

            mapInstance.current = map;
        }
    }, []);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        if (!geoJsonLayer.current) {
            geoJsonLayer.current = L.geoJSON(undefined, {
                style: { fillColor: '#374151', weight: 1, opacity: 1, color: '#6B7280', fillOpacity: 0.2 },
                onEachFeature: (feature, layer) => {
                    const regionName = feature.properties.name;
                    regionLayers.current[regionName] = layer;
                    layer.on({
                        mouseover: (e) => {
                            if (!selectedRegions.includes(regionName)) {
                                e.target.setStyle({ weight: 2, color: '#F97316' });
                            }
                        },
                        mouseout: () => {
                             if (!selectedRegions.includes(regionName)) {
                                geoJsonLayer.current?.resetStyle(layer);
                             }
                        },
                    });
                }
            }).addTo(map);
            geoJsonLayer.current.addData(russiaRegionsGeoJSON as GeoJsonObject);
        }

        if (!capitalsLayer.current) {
            capitalsLayer.current = L.featureGroup().addTo(map);
            const capitalsRenderer = L.svg({ padding: 0.5 });
            capitals.forEach(capital => {
                const isCountryCapital = capital.type === 'country';
                const marker = L.circleMarker([capital.lat, capital.lon], {
                    renderer: capitalsRenderer, radius: isCountryCapital ? 6 : 2,
                    fillColor: '#facc15', fillOpacity: 1, color: '#fde047', weight: 1,
                    className: 'capital-marker'
                });
                marker.bindPopup(`<b>${capital.name}</b>`);
                marker.on({
                    mouseover: function (this: L.CircleMarker) { this.setRadius(isCountryCapital ? 10 : 5); this.openPopup(); },
                    mouseout: function (this: L.CircleMarker) { this.setRadius(isCountryCapital ? 6 : 2); this.closePopup(); }
                });
                marker.addTo(capitalsLayer.current!);
            });
        }
        
        if (!searchControl.current) {
            searchControl.current = new (L.Control as any).Search({
                sourceData: (text: string, callResponse: (data: Array<{title: string, loc: L.LatLng}>) => void) => {
                    const lowerText = text.toLowerCase();
                    const filtered = dataForSearch.filter(item => 
                        item.title.toLowerCase().includes(lowerText)
                    );
                    
                    const responseData = filtered.map(item => {
                        let loc: L.LatLng;
                        if (item.type === 'region') {
                            const tempLayer = L.geoJSON(item.feature);
                            loc = tempLayer.getBounds().getCenter();
                        } else { // 'city'
                            loc = L.latLng(item.lat, item.lon);
                        }
                        return { title: item.title, loc };
                    });
                    
                    callResponse(responseData);
                },
                marker: false,
                moveToLocation: (latlng: L.LatLng, title: string, map: L.Map) => {
                    const foundItem = dataForSearch.find(item => item.title === title);
                    if (foundItem?.type === 'region') {
                        const regionLayer = Object.values(regionLayers.current).find(l => (l as any).feature.properties.name === title);
                        if (regionLayer) map.fitBounds((regionLayer as L.GeoJSON).getBounds());
                    } else if (foundItem?.type === 'city') {
                        map.flyTo(latlng, 10);
                    }
                },
                textPlaceholder: 'Поиск регионов и городов...',
                textErr: 'Не найдено',
            });
            map.addControl(searchControl.current);
        }
        
        capitalsLayer.current?.bringToFront();

    }, [dataForSearch, selectedRegions]);

    useEffect(() => {
        Object.entries(regionLayers.current).forEach(([name, layer]) => {
            const regionData = dataByRegion[name];
            const isSelected = selectedRegions.includes(name);

            const style = {
                fillColor: regionData ? getColor(regionData.growthPotential, maxGrowthPotential) : '#374151',
                weight: isSelected ? 3 : 1,
                opacity: 1,
                color: isSelected ? '#F97316' : '#6B7280',
                dashArray: isSelected ? '' : '3',
                fillOpacity: isSelected ? 0.7 : (regionData ? 0.6 : 0.2)
            };
            (layer as L.Path).setStyle(style);

            let popupContent = `<strong class="text-base">${name}</strong>`;
            if (regionData) {
                popupContent += `<hr class="my-1 border-gray-600">
                                 <div>Рост: <span class="font-bold text-yellow-400">${formatNumber(regionData.growthPotential)}</span></div>
                                 <div>Факт: <span class="font-bold text-green-400">${formatNumber(regionData.fact)}</span></div>
                                 <div>Потенциал: <span class="font-bold text-indigo-400">${formatNumber(regionData.potential)}</span></div>
                                 <div>Активных клиентов: <span class="font-bold">${regionData.clients.size}</span></div>`;
            } else {
                popupContent += `<br/>Нет данных для анализа.`;
            }
            layer.bindPopup(popupContent);
        });

        if (selectedRegions.length > 0) {
            const selectedLayers = selectedRegions.map(r => regionLayers.current[r]).filter(Boolean);
            if (selectedLayers.length > 0) {
                const group = L.featureGroup(selectedLayers as L.Layer[]);
                mapInstance.current?.fitBounds(group.getBounds().pad(0.1));
            }
        } else if (data.length === 0) {
            mapInstance.current?.flyTo([60, 90], 3);
        }
        
        capitalsLayer.current?.bringToFront();

    }, [dataByRegion, maxGrowthPotential, selectedRegions, formatNumber]);

    useEffect(() => () => {
        if (mapInstance.current) {
            mapInstance.current.remove();
            mapInstance.current = null;
        }
    }, []);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Карта Потенциала по Регионам</h2>
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg bg-gray-800" />
        </div>
    );
};

export default InteractiveRegionMap;