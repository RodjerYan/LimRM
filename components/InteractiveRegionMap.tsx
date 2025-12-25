
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

// --- MANUAL BOUNDARIES for special regions ---
const MANUAL_BOUNDARIES: any[] = [
    { "type": "Feature", "properties": { "name": "Луганская Народная Республика" }, "geometry": { "type": "MultiPolygon", "coordinates": [[[[37.82, 49.5], [40.2, 49.6], [40.1, 48.2], [37.8, 48.3], [37.82, 49.5]]]] } },
    { "type": "Feature", "properties": { "name": "Донецкая Народная Республика" }, "geometry": { "type": "MultiPolygon", "coordinates": [[[[36.5, 48.0], [39.1, 47.9], [38.3, 46.8], [36.6, 47.7], [36.5, 48.0]]]] } }
];

const MapLegend: React.FC<{ mode: OverlayMode }> = ({ mode }) => {
    const configs: Record<OverlayMode, { title: string; items: { color: string; label: string }[] }> = {
        sales: { title: 'Легенда', items: [{ color: '#10b981', label: 'Активные ТТ' }, { color: '#3b82f6', label: 'Потенциал (ОКБ)' }] },
        pets: { title: 'Плотность питомцев', items: [{ color: '#10b981', label: 'Высокая' }, { color: '#f59e0b', label: 'Средняя' }, { color: '#6b7280', label: 'Низкая' }] },
        competitors: { title: 'Конкуренция', items: [{ color: '#ef4444', label: 'Агрессивная' }, { color: '#f97316', label: 'Умеренная' }, { color: '#3b82f6', label: 'Слабая' }] },
        age: { title: 'Возраст владельцев', items: [{ color: '#10b981', label: 'Молодые (<35)' }, { color: '#f59e0b', label: 'Средний' }, { color: '#8b5cf6', label: 'Старший (>45)' }] }
    };
    const c = configs[mode];
    return (
        <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main shadow-xl">
            <h4 className="font-bold text-[10px] mb-2 uppercase tracking-wider text-gray-400">{c.title}</h4>
            <div className="space-y-1.5">
                {c.items.map(i => (
                    <div key={i.label} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: i.color }}></span>
                        <span className="text-[10px] font-medium">{i.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, flyToClientKey, theme = 'dark', onEditClient }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayer = useRef<L.GeoJSON | null>(null);
    const markersLayer = useRef<L.LayerGroup | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [isLoadingGeo, setIsLoadingGeo] = useState(true);
    const [localTheme, setLocalTheme] = useState<Theme>(theme);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchGeo = async () => {
            try {
                const res = await fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson');
                const d = await res.json();
                const features = [...MANUAL_BOUNDARIES, ...d.features.filter((f: any) => !MANUAL_BOUNDARIES.find(m => m.properties.name === f.properties.name))];
                setGeoJsonData({ type: 'FeatureCollection', features } as any);
            } catch (e) { console.error(e); } finally { setIsLoadingGeo(false); }
        };
        fetchGeo();
    }, []);

    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;
        const map = L.map(mapContainer.current, { center: [55, 60], zoom: 3, zoomControl: false, attributionControl: false, preferCanvas: true });
        mapInstance.current = map;
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
                else if (overlayMode === 'age') fill = m.avgOwnerAge < 35 ? '#10b981' : m.avgOwnerAge < 45 ? '#f59e0b' : '#8b5cf6';
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
                    L.circleMarker([c.lat, c.lon], { radius: 4, fillColor: '#10b981', color: '#fff', weight: 1, fillOpacity: 0.8, pane: 'markersPane' })
                        .bindPopup(`<b>${c.name}</b><br>${c.address}`)
                        .addTo(markersLayer.current!);
                }
            });
            potentialClients.slice(0, 500).forEach(c => {
                if (c.lat && c.lon) {
                    L.circleMarker([c.lat, c.lon], { radius: 3, fillColor: '#3b82f6', color: '#fff', weight: 1, fillOpacity: 0.6, pane: 'markersPane' })
                        .bindPopup(`<b>${c.name}</b> (ОКБ)<br>${c.address}`)
                        .addTo(markersLayer.current!);
                }
            });
        }
    }, [activeClients, potentialClients, overlayMode]);

    return (
        <div className={`bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-indigo-500/10 ${isFullscreen ? 'fixed inset-0 z-[100] p-0' : 'p-6 relative h-[65vh]'}`}>
            <div className="absolute top-4 left-4 z-[1001] flex flex-wrap gap-2 pointer-events-none">
                <div className="bg-gray-900/80 p-1 rounded-lg border border-gray-700 flex gap-1 pointer-events-auto shadow-xl">
                    {(['sales', 'pets', 'competitors', 'age'] as OverlayMode[]).map(m => (
                        <button key={m} onClick={() => setOverlayMode(m)} className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${overlayMode === m ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>{m.toUpperCase()}</button>
                    ))}
                </div>
                {isLoadingGeo && <div className="bg-indigo-600 px-3 py-1 rounded text-white text-[10px] animate-pulse pointer-events-auto">ЗАГРУЗКА ГЕОМЕТРИИ...</div>}
            </div>
            <div className="absolute top-4 right-4 z-[1001] flex flex-col gap-2">
                <button onClick={() => setLocalTheme(t => t === 'dark' ? 'light' : 'dark')} className="bg-gray-900 p-2 rounded-lg text-white border border-gray-700 shadow-xl">{localTheme === 'dark' ? <SunIcon/> : <MoonIcon/>}</button>
                <button onClick={() => setIsFullscreen(!isFullscreen)} className="bg-gray-900 p-2 rounded-lg text-white border border-gray-700 shadow-xl">{isFullscreen ? <MinimizeIcon/> : <MaximizeIcon/>}</button>
            </div>
            <div ref={mapContainer} className="h-full w-full rounded-xl overflow-hidden bg-gray-800" />
            <div className="absolute bottom-6 right-6 z-[1001] pointer-events-none">
                <div className="pointer-events-auto"><MapLegend mode={overlayMode} /></div>
            </div>
        </div>
    );
};

export default InteractiveRegionMap;
