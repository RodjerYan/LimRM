
import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { russiaRegionsGeoJSON } from '../data/russia_regions_geojson';
import { MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon } from './icons';
import type { FeatureCollection, Feature } from 'geojson';

type Theme = 'dark' | 'light';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    potentialClients: OkbDataRow[];
    activeClients: MapPoint[];
    flyToClientKey: string | null;
    theme?: Theme;
    onToggleTheme?: () => void;
    onEditClient: (client: MapPoint) => void;
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ 
    data, 
    selectedRegions, 
    activeClients, 
    theme = 'dark', 
    onEditClient 
}) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [localTheme, setLocalTheme] = useState<Theme>(theme);

    // Ссылка на данные для использования внутри обработчиков Leaflet
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    // Загрузка основной карты России + объединение с новыми территориями
    useEffect(() => {
        const fetchGeoData = async () => {
            try {
                const RUSSIA_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson';
                const res = await fetch(RUSSIA_URL);
                const baseData = await res.json();
                
                // Объединяем базовый GeoJSON с нашими новыми регионами
                const combinedFeatures = [
                    ...russiaRegionsGeoJSON.features,
                    ...baseData.features.filter((f: any) => 
                        !russiaRegionsGeoJSON.features.some(m => m.properties.name === f.properties.name)
                    )
                ];

                setGeoJsonData({ type: 'FeatureCollection', features: combinedFeatures } as FeatureCollection);
            } catch (e) {
                console.error('Ошибка загрузки карты:', e);
            }
        };
        fetchGeoData();
    }, []);

    // Стиль региона
    const getStyleForRegion = (feature: any) => {
        const name = feature?.properties?.name;
        const isSelected = selectedRegions.includes(name);
        const isHovered = hoveredRegion === name;

        return {
            weight: isHovered || isSelected ? 2 : 1,
            opacity: 1,
            color: isSelected ? '#818cf8' : (isHovered ? '#6366f1' : '#4b5563'),
            fillColor: isSelected ? '#818cf8' : (isHovered ? '#4f46e5' : '#111827'),
            fillOpacity: isSelected ? 0.5 : (isHovered ? 0.3 : 0.15),
            interactive: true
        };
    };

    // Инициализация карты
    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;

        const map = L.map(mapContainer.current, { 
            center: [55, 60], 
            zoom: 3, 
            zoomControl: false, 
            attributionControl: false 
        });
        mapInstance.current = map;
        
        L.control.zoom({ position: 'topleft' }).addTo(map);
        L.tileLayer(localTheme === 'dark' 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' 
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        ).addTo(map);

        // Обработка кликов в попапах (редактирование ТТ)
        map.on('popupopen', (e) => {
            const btn = e.popup.getElement()?.querySelector('.edit-location-btn');
            if (btn) {
                L.DomEvent.on(btn as HTMLElement, 'click', (ev) => {
                    L.DomEvent.stopPropagation(ev);
                    const key = btn.getAttribute('data-key');
                    const client = activeClients.find(c => c.key === key);
                    if (client) onEditClient(client);
                });
            }
        });

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, []);

    // Обновление GeoJSON слоя с интерактивностью
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !geoJsonData) return;

        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);

        geoJsonLayer.current = L.geoJSON(geoJsonData as any, {
            style: getStyleForRegion,
            onEachFeature: (feature: Feature, layer: L.Layer) => {
                const regionName = feature.properties?.name;
                
                // Находим данные по региону в текущем Fact
                const regionData = dataRef.current.filter(d => d.region === regionName);
                const totalFact = regionData.reduce((sum, d) => sum + d.fact, 0);

                // Тултип с бизнес-данными
                layer.bindTooltip(`
                    <div class="p-2 text-xs font-sans">
                        <div class="font-bold text-indigo-400 mb-1">${regionName}</div>
                        <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                            <span class="text-gray-400">Продажи:</span>
                            <span class="text-white font-mono font-bold">${new Intl.NumberFormat('ru-RU').format(Math.round(totalFact))} кг</span>
                        </div>
                    </div>
                `, { sticky: true, opacity: 0.9 });

                layer.on({
                    mouseover: (e) => {
                        const l = e.target;
                        setHoveredRegion(regionName);
                        l.setStyle({ fillOpacity: 0.4, weight: 2 });
                        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                            l.bringToFront();
                        }
                    },
                    mouseout: (e) => {
                        setHoveredRegion(null);
                        geoJsonLayer.current?.resetStyle(e.target);
                    },
                    click: (e) => {
                        map.fitBounds(e.target.getBounds(), { padding: [20, 20] });
                    }
                });
            }
        }).addTo(map);

        geoJsonLayer.current.bringToBack();
    }, [geoJsonData, selectedRegions, data]);

    // Обновление маркеров активных клиентов
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;
        if (activeClientMarkersLayer.current) map.removeLayer(activeClientMarkersLayer.current);
        
        activeClientMarkersLayer.current = L.layerGroup().addTo(map);

        activeClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const marker = L.circleMarker([tt.lat, tt.lon], { 
                    radius: 5, 
                    color: '#22c55e', 
                    fillColor: '#22c55e', 
                    fillOpacity: 0.8,
                    weight: 1
                });

                marker.bindPopup(`
                    <div class="p-1 min-w-[150px]">
                        <b class="text-indigo-400 block mb-1">${tt.name}</b>
                        <div class="text-[10px] text-gray-400 leading-tight mb-2">${tt.address}</div>
                        <button class="edit-location-btn w-full bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 px-2 rounded font-bold text-[10px] transition-colors" data-key="${tt.key}">
                            Изменить местоположение
                        </button>
                    </div>
                `, { maxWidth: 250 });

                activeClientMarkersLayer.current?.addLayer(marker);
            }
        });
    }, [activeClients]);

    return (
        <div className={`bg-card-bg/70 backdrop-blur-md rounded-2xl border border-indigo-500/10 ${isFullscreen ? 'fixed inset-0 z-[100]' : 'p-6 relative transition-all duration-300'}`}>
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-xl font-bold text-white">Карта Потенциала РФ и СНГ</h2>
                    <p className="text-xs text-text-muted mt-1">Интерактивный анализ охвата территорий</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setLocalTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors" title="Сменить тему"><SunIcon /></button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors" title="На весь экран">{isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}</button>
                </div>
            </div>
            <div className={`w-full ${isFullscreen ? 'h-[calc(100%-5rem)]' : 'h-[60vh]'} rounded-xl overflow-hidden border border-gray-700 shadow-inner group/map`}>
                <div ref={mapContainer} className="h-full w-full bg-gray-900" />
            </div>
            
            {/* Легенда */}
            <div className="mt-4 flex flex-wrap gap-4 text-[10px] uppercase font-bold tracking-widest text-gray-500">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span>Активные ТТ</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded border border-indigo-400 bg-indigo-500/20"></div>
                    <span>Приоритетные регионы</span>
                </div>
                <div className="ml-auto text-indigo-400 animate-pulse">
                    Наведите на регион для статистики
                </div>
            </div>
        </div>
    );
};

export default InteractiveRegionMap;
