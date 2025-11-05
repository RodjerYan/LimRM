import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPoint } from '../types';

interface GlobalMapViewProps {
    points: MapPoint[];
}

const createMarkerIcon = (status: MapPoint['status']) => {
    const colorClass = status === 'match' ? 'green' : 'blue';
    return L.divIcon({
        html: `<div class="marker-pin ${colorClass}"></div>`,
        className: 'marker-container', // Use a container class to avoid Leaflet overriding styles
        iconSize: [30, 42],
        iconAnchor: [15, 42]
    });
};

const GlobalMapView: React.FC<GlobalMapViewProps> = ({ points }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const markersLayer = useRef<L.LayerGroup | null>(null);

    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;

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

        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
        };
    }, []);

    useEffect(() => {
        const layer = markersLayer.current;
        const map = mapInstance.current;
        if (!layer || !map) return;

        layer.clearLayers();
        
        if (points.length === 0) {
            // Reset view if no points
            map.flyTo([60, 90], 3);
            return;
        }

        const markers: L.Marker[] = [];
        points.forEach(point => {
            const marker = L.marker([point.lat, point.lon], { icon: createMarkerIcon(point.status) });
            marker.bindPopup(`<b>${point.name}</b><br>${point.type}<br><small>${point.address}</small>`);
            markers.push(marker);
            layer.addLayer(marker);
        });

        if (markers.length > 0) {
            const featureGroup = L.featureGroup(markers);
            map.fitBounds(featureGroup.getBounds().pad(0.1), { maxZoom: 15 });
        }

    }, [points]);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
             <h2 className="text-xl font-bold mb-4 text-white">Карта торговых точек</h2>
             <div ref={mapContainer} className="h-[60vh] w-full rounded-lg z-10" />
        </div>
    );
};

export default GlobalMapView;