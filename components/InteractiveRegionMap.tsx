
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { getMarketData } from '../utils/marketData';
import { SunIcon, MoonIcon, MaximizeIcon, MinimizeIcon } from './icons';
import type { FeatureCollection } from 'geojson';

type Theme = 'dark' | 'light';
type OverlayMode = 'sales' | 'pets' | 'competitors';

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    potentialClients: OkbDataRow[];
    activeClients: MapPoint[];
    flyToClientKey: string | null;
    theme?: Theme;
    onEditClient: (client: MapPoint) => void;
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ selectedRegions, potentialClients, activeClients, theme = 'dark' }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const markersLayer = useRef<L.LayerGroup | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

    useEffect(() => {
        const fetchGeo = async () => {
            try {
                const res = await fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson');
                setGeoJsonData(await res.json());
            } catch (e) { console.error(e); }
        };
        fetchGeo();
    }, []);

    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;
        const map = L.map(mapContainer.current, { center: [55, 60], zoom: 3, zoomControl: false, attributionControl: false });
        mapInstance.current = map;
        
        // КРИТИЧНО: Создаем слои для правильного наложения
        map.createPane('regionsPane').style.zIndex = '200';
        map.createPane('markersPane').style.zIndex = '600';
        
        L.control.zoom({ position: 'topleft' }).addTo(map);
        markersLayer.current = L.layerGroup().addTo(map);
    }, []);

    useEffect(() => {
        const map = mapInstance.current; if (!map) return;
        const url = localTheme === 'dark' ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        if (tileLayerRef.current) tileLayerRef.current.setUrl(url); else tileLayerRef.current = L.tileLayer(url).addTo(map);
    }, [localTheme]);

    useEffect(() => {
        const map = mapInstance.current; if (!map || !geoJsonData) return;
        if (geoJsonLayer.current) map.removeLayer(geoJsonLayer.current);
        
        geoJsonLayer.current = L.geoJSON(geoJsonData as any, {
            pane: 'regionsPane',
            style: (f) => {
                const name = f?.properties?.name;
                const m = getMarketData(name);
                const isS = selectedRegions.includes(name);
                let fill = '#111827';
                if (overlayMode === 'pets') fill = m.petDensityIndex > 80 ? '#10b981' : m.petDensityIndex > 50 ? '#f59e0b' : '#6b7280';
                else if (overlayMode === 'competitors') fill = m.competitorDensityIndex > 80 ? '#ef4444' : m.competitorDensityIndex > 50 ? '#f97316' : '#3b82f6';
                return { weight: isS ? 2 : 1, color: isS ? '#818cf8' : '#374151', fillColor: fill, fillOpacity: isS ? 0.5 : 0.2 };
            },
            onEachFeature: (f, l) => {
                l.bindTooltip(f.properties.name, { sticky: true });
                l.on('click', (e) => { map.fitBounds((e.target as L.Polygon).getBounds()); });
            }
        }).addTo(map);
    }, [geoJsonData, selectedRegions, overlayMode]);

    useEffect(() => {
        if (!markersLayer.current) return;
        markersLayer.current.clearLayers();
        if (overlayMode === 'sales') {
            activeClients.forEach(c => {
                if (c.lat && c.lon) {
                    L.circleMarker([c.lat, c.lon], { radius: 5, fillColor: '#10b981', color: '#fff', weight: 2, fillOpacity: 0.9, pane: 'markersPane' })
                        .bindPopup(`<b>${c.name}</b><br>${c.address}`)
                        .addTo(markersLayer.current!);
                }
            });
            potentialClients.slice(0, 400).forEach(c => {
                if (c.lat && c.lon) {
                    L.circleMarker([c.lat, c.lon], { radius: 3, fillColor: '#3b82f6', color: '#fff', weight: 1, fillOpacity: 0.6, pane: 'markersPane' })
                        .bindPopup(`<b>${c.name}</b> (ОКБ)<br>${c.address}`)
                        .addTo(markersLayer.current!);
                }
            });
        }
    }, [activeClients, potentialClients, overlayMode]);

    return (
        <div className={`bg-gray-900/40 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-[100]' : 'relative h-[65vh]'}`}>
            <div className="absolute top-4 left-4 z-[1001] bg-gray-900/80 p-1.5 rounded-2xl border border-gray-700 flex gap-1 shadow-2xl">
                {(['sales', 'pets', 'competitors'] as OverlayMode[]).map(m => (
                    <button key={m} onClick={() => setOverlayMode(m)} className={`px-4 py-1.5 text-[10px] font-bold rounded-xl transition-all ${overlayMode === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>{m.toUpperCase()}</button>
                ))}
            </div>
            <div className="absolute top-4 right-4 z-[1001] flex flex-col gap-2">
                <button onClick={() => setLocalTheme(t => t === 'dark' ? 'light' : 'dark')} className="bg-gray-900/80 p-3 rounded-2xl text-white border border-gray-700 shadow-xl transition-transform active:scale-90">{localTheme === 'dark' ? <SunIcon/> : <MoonIcon/>}</button>
                <button onClick={() => setIsFullscreen(!isFullscreen)} className="bg-gray-900/80 p-3 rounded-2xl text-white border border-gray-700 shadow-xl transition-transform active:scale-90">{isFullscreen ? <MinimizeIcon/> : <MaximizeIcon/>}</button>
            </div>
            <div ref={mapContainer} className="h-full w-full bg-gray-800" />
        </div>
    );
};

export default InteractiveRegionMap;
