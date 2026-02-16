
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPoint, AggregatedDataRow, PotentialClient } from '../types';
import { regionBoundingBoxes } from '../utils/regionBounds';

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    activeClients: MapPoint[];
    potentialClients: (MapPoint | PotentialClient)[];
    onEditClient: (client: MapPoint) => void;
    selectedRegions: string[];
    flyToClientKey: string | null;
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ 
    data, 
    activeClients, 
    potentialClients, 
    onEditClient, 
    selectedRegions, 
    flyToClientKey 
}) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const markersLayer = useRef<L.LayerGroup | null>(null);

    // Initialize Map
    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;

        const map = L.map(mapContainer.current, {
            zoomControl: false,
            attributionControl: false
        }).setView([55.75, 37.61], 5); // Default center (Moscow)

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(map);
        
        L.control.zoom({ position: 'topright' }).addTo(map);

        mapInstance.current = map;
        markersLayer.current = L.layerGroup().addTo(map);

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, []);

    // Render Markers
    useEffect(() => {
        if (!mapInstance.current || !markersLayer.current) return;

        markersLayer.current.clearLayers();

        const bounds = L.latLngBounds([]);
        let hasBounds = false;

        // Active Clients (Green Markers)
        activeClients.forEach(client => {
            if (client.lat && client.lon) {
                const marker = L.marker([client.lat, client.lon], {
                    icon: new L.Icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    })
                });
                
                const volume = (client as MapPoint).fact 
                    ? new Intl.NumberFormat('ru-RU').format((client as MapPoint).fact!) 
                    : '0';

                marker.bindPopup(`
                    <div class="font-sans min-w-[200px]">
                        <div class="font-bold text-sm mb-1">${client.name}</div>
                        <div class="text-xs text-gray-500 mb-1">${client.address}</div>
                        <div class="text-xs font-mono font-bold text-emerald-600">Объем: ${volume} кг</div>
                        <div class="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">${client.type || 'Тип не указан'}</div>
                    </div>
                `);
                
                marker.on('click', () => onEditClient(client));
                marker.addTo(markersLayer.current!);
                bounds.extend([client.lat, client.lon]);
                hasBounds = true;
            }
        });

        // Potential Clients (Small Dots)
        potentialClients.forEach(client => {
             if (client.lat && client.lon) {
                const marker = L.circleMarker([client.lat, client.lon], {
                    radius: 4,
                    fillColor: '#94a3b8',
                    color: '#64748b',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.6
                });
                marker.bindPopup(`
                    <div class="font-sans">
                        <div class="font-bold text-gray-600 text-sm">${client.name || 'Потенциал'}</div>
                        <div class="text-xs text-gray-500">${client.address}</div>
                        <div class="text-[10px] text-indigo-500 mt-1 uppercase">Потенциал (ОКБ)</div>
                    </div>
                `);
                marker.addTo(markersLayer.current!);
                
                // If we have very few active clients, include potential in bounds
                if (activeClients.length < 5) {
                    bounds.extend([client.lat, client.lon]);
                    hasBounds = true;
                }
            }
        });

        if (hasBounds && selectedRegions.length === 0) {
            mapInstance.current.fitBounds(bounds, { padding: [50, 50] });
        }

    }, [activeClients, potentialClients, onEditClient, selectedRegions]);

    // Handle Region Selection / Fly To
    useEffect(() => {
        if (!mapInstance.current || selectedRegions.length === 0) return;
        
        const groupBounds = L.latLngBounds([]);
        let hasRegionBounds = false;

        selectedRegions.forEach(regionName => {
            const bbox = regionBoundingBoxes[regionName];
            if (bbox) {
                // bbox is [minLon, minLat, maxLon, maxLat]
                const [minLon, minLat, maxLon, maxLat] = bbox;
                groupBounds.extend([minLat, minLon]);
                groupBounds.extend([maxLat, maxLon]);
                hasRegionBounds = true;
            }
        });

        if (hasRegionBounds) {
            mapInstance.current.fitBounds(groupBounds, { padding: [20, 20] });
        }
    }, [selectedRegions]);

    return (
        <div className="w-full h-[500px] rounded-3xl overflow-hidden border border-slate-200 shadow-md relative z-0">
            <div ref={mapContainer} className="w-full h-full bg-slate-100" />
            
            {/* Legend Overlay */}
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-200 z-[1000]">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Легенда</div>
                
                <div className="flex items-center gap-3 mb-2">
                    <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png" className="w-3 h-5 object-contain" alt="Active" />
                    <div>
                        <div className="text-xs font-bold text-slate-800">Активные клиенты</div>
                        <div className="text-[10px] text-slate-500">{activeClients.length} точек</div>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-slate-400 border border-slate-500"></div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-700">Потенциал (ОКБ)</div>
                        <div className="text-[10px] text-slate-500">{potentialClients.length} точек</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InteractiveRegionMap;
