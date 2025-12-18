
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { getMarketData } from '../utils/marketData';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon, CheckIcon } from './icons';
import type { FeatureCollection } from 'geojson';

type Theme = 'dark' | 'light';
type OverlayMode = 'sales' | 'pets' | 'competitors' | 'age';

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

interface SearchableLocation {
    name: string;
    type: 'region';
}

const findValueInRow = (row: OkbDataRow, keywords: string[]): string => {
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().includes(keyword));
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }
    return '';
};

const fixChukotkaGeoJSON = (feature: any) => {
    const transformCoord = (coord: number[]) => {
        let [lon, lat] = coord;
        if (lon < 0) lon += 360;
        return [lon, lat];
    };
    const transformRing = (ring: number[][]) => ring.map(transformCoord);
    const transformPolygon = (coords: number[][][]) => coords.map(transformRing);
    if (feature.geometry.type === 'Polygon') feature.geometry.coordinates = transformPolygon(feature.geometry.coordinates);
    else if (feature.geometry.type === 'MultiPolygon') feature.geometry.coordinates = feature.geometry.coordinates.map(transformPolygon);
    return feature;
};

const MANUAL_BOUNDARIES: any[] = [
    { "type": "Feature", "properties": { "name": "Республика Крым" }, "geometry": { "type": "MultiPolygon", "coordinates": [ [ [[ 32.25, 45.54 ], [ 36.135, 45.67 ], [ 36.68, 45.645 ], [ 36.7, 45.455 ], [ 34.498, 44.165 ], [ 32.25, 45.54 ]] ] ] } },
    { "type": "Feature", "properties": { "name": "Севастополь" }, "geometry": { "type": "MultiPolygon", "coordinates": [ [ [[ 33.24, 44.822 ], [ 33.555, 44.844 ], [ 33.929, 44.418 ], [ 33.24, 44.822 ]] ] ] } }
];

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, flyToClientKey, theme = 'dark', onEditClient }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const potentialClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
    const layerControl = useRef<L.Control.Layers | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const activeClientMarkersRef = useRef<Map<string, L.Layer>>(new Map());
    const legendContainerRef = useRef<HTMLDivElement | null>(null);
    const activeClientsRef = useRef<MapPoint[]>(activeClients);
    const onEditClientRef = useRef(onEditClient);

    useEffect(() => { activeClientsRef.current = activeClients; }, [activeClients]);
    useEffect(() => { onEditClientRef.current = onEditClient; }, [onEditClient]);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [isLoadingGeo, setIsLoadingGeo] = useState(true);
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    useEffect(() => {
        const fetchGeoData = async () => {
            try {
                const RUSSIA_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson';
                const res = await fetch(RUSSIA_URL);
                const data = await res.json();
                const features = data.features.map((f: any) => f.properties.name === 'Чукотский автономный округ' ? fixChukotkaGeoJSON(f) : f);
                setGeoJsonData({ type: 'FeatureCollection', features: [...MANUAL_BOUNDARIES, ...features] });
            } catch (e) { console.error(e); } finally { setIsLoadingGeo(false); }
        };
        fetchGeoData();
    }, []);

    const getStyleForRegion = (feature: any) => {
        const name = feature.properties?.name;
        const isSelected = selectedRegions.includes(name);
        return {
            weight: isSelected ? 2 : 1,
            opacity: 1,
            color: isSelected ? '#818cf8' : '#6b7280',
            fillColor: isSelected ? '#818cf8' : '#111827',
            fillOpacity: isSelected ? 0.4 : 0.2,
            interactive: true
        };
    };

    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;
        const map = L.map(mapContainer.current, { center: [55, 60], zoom: 3, zoomControl: false, attributionControl: false });
        mapInstance.current = map;
        L.control.zoom({ position: 'topleft' }).addTo(map);
        tileLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
        
        // Глобальный слушатель открытия попапов для привязки событий к кнопкам
        map.on('popupopen', (e) => {
            const container = e.popup.getElement();
            if (!container) return;
            const btn = container.querySelector('.edit-location-btn');
            if (btn) {
                const key = btn.getAttribute('data-key');
                // Используем Leaflet DomEvent для надежности
                L.DomEvent.on(btn as HTMLElement, 'click', (ev) => {
                    L.DomEvent.stopPropagation(ev);
                    if (key) {
                        const client = activeClientsRef.current.find(c => c.key === key);
                        if (client) onEditClientRef.current(client);
                    }
                });
            }
        });
    }, []);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !geoJsonData) return;
        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        geoJsonLayer.current = L.geoJSON(geoJsonData as any, { style: getStyleForRegion }).addTo(map);
        geoJsonLayer.current.bringToBack();
    }, [geoJsonData, selectedRegions]);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;
        if (activeClientMarkersLayer.current) map.removeLayer(activeClientMarkersLayer.current);
        activeClientMarkersLayer.current = L.layerGroup().addTo(map);

        activeClients.forEach(tt => {
            if (tt.lat && tt.lon) {
                const marker = L.circleMarker([tt.lat, tt.lon], { radius: 5, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.8 });
                marker.bindPopup(`
                    <div class="p-1">
                        <b class="text-indigo-400">${tt.name}</b><br/>
                        <span class="text-xs">${tt.address}</span><br/>
                        <button class="edit-location-btn mt-3 w-full bg-indigo-600 text-white py-1.5 px-3 rounded font-bold text-xs" data-key="${tt.key}">
                            Изменить местоположение
                        </button>
                    </div>
                `, { maxWidth: 250 });
                activeClientMarkersLayer.current?.addLayer(marker);
            }
        });
    }, [activeClients]);

    return (
        <div className={`bg-card-bg/70 rounded-2xl border border-indigo-500/10 ${isFullscreen ? 'fixed inset-0 z-[100]' : 'p-6 relative'}`}>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Карта потенциала</h2>
                <div className="flex gap-2">
                    <button onClick={() => setLocalTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-2 bg-gray-800 rounded-lg">{localTheme === 'dark' ? <SunIcon /> : <MoonIcon />}</button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-gray-800 rounded-lg">{isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}</button>
                </div>
            </div>
            <div className={`w-full ${isFullscreen ? 'h-[calc(100%-5rem)]' : 'h-[60vh]'} rounded-lg overflow-hidden border border-gray-700`}>
                <div ref={mapContainer} className="h-full w-full bg-gray-800" />
            </div>
        </div>
    );
};

export default InteractiveRegionMap;
