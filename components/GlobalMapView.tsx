import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPoint, MapPointStatus } from '../types';

interface GlobalMapViewProps {
    points: MapPoint[];
    disabled: boolean;
}

// Function to create custom colored markers
const createMarkerIcon = (status: MapPointStatus) => {
    const color = {
        matched: '#34d399',   // green (success)
        potential: '#818cf8', // blue (accent)
        active: '#f87171',    // red (danger) - Note: not used in current logic but available
    }[status];

    return L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="background-color: ${color};" class="marker-pin"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8]
    });
};

const GlobalMapView: React.FC<GlobalMapViewProps> = ({ points, disabled }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const markersLayer = useRef<L.LayerGroup | null>(null);

    // Initialize map
    useEffect(() => {
        if (mapContainer.current && mapInstance.current === null) {
            mapInstance.current = L.map(mapContainer.current, {
                center: [55.75, 37.61], // Default center on Moscow
                zoom: 5,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(mapInstance.current);

            markersLayer.current = L.layerGroup().addTo(mapInstance.current);
        }
    }, []);

    // Update markers when points change
    useEffect(() => {
        if (!mapInstance.current || !markersLayer.current) return;

        markersLayer.current.clearLayers();

        if (points.length > 0) {
            const markersForBounds: L.Marker[] = [];
            points.forEach(point => {
                const marker = L.marker([point.lat, point.lon], {
                    icon: createMarkerIcon(point.status)
                });
                marker.bindPopup(`<b>${point.name}</b><br><small>${point.address}</small>`);
                markersLayer.current!.addLayer(marker);
                markersForBounds.push(marker);
            });
            
            if (markersForBounds.length > 0) {
                 const featureGroup = L.featureGroup(markersForBounds);
                 mapInstance.current.fitBounds(featureGroup.getBounds().pad(0.1), { animate: true });
            }
        } else {
             mapInstance.current.flyTo([55.75, 37.61], 5, { animate: true });
        }

    }, [points]);
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
        };
    }, []);

    if (disabled) {
         return (
             <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 opacity-50">
                <h2 className="text-xl font-bold mb-4 text-white">Карта Торговых Точек</h2>
                 <div className="h-96 flex items-center justify-center text-center text-gray-400">
                    <p>Загрузите и обработайте файл,<br/>чтобы увидеть данные на карте.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
             <div className="flex justify-between items-center mb-4">
                 <h2 className="text-xl font-bold text-white">Карта Торговых Точек</h2>
                 <div className="flex items-center space-x-4 text-xs">
                    <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-success mr-2"></span>Активные</div>
                    <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-accent mr-2"></span>Потенциальные</div>
                </div>
            </div>
            <div ref={mapContainer} className="h-96 w-full rounded-lg z-10" />
        </div>
    );
};

export default GlobalMapView;
