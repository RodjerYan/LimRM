import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PotentialClient } from '../types';

interface InteractiveMapProps {
    city: string;
    clients: PotentialClient[];
    selectedClientKey: string | null;
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({ city, clients, selectedClientKey }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const markerRefs = useRef<Map<string, L.Marker>>(new Map());

    useEffect(() => {
        if (!mapContainer.current) return;

        if (mapInstance.current === null) {
            mapInstance.current = L.map(mapContainer.current, {
                scrollWheelZoom: true,
                attributionControl: false // Disable attribution
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapInstance.current);
        }

        const map = mapInstance.current;

        markerRefs.current.forEach(marker => map.removeLayer(marker));
        markerRefs.current.clear();

        const clientsWithCoords = clients.filter(c => c.lat && c.lon);

        if (clientsWithCoords.length > 0) {
            const markersForBounds: L.Marker[] = [];
            clientsWithCoords.forEach((client) => {
                if (client.lat && client.lon) {
                    const clientKey = `${client.lat},${client.lon}`;
                    const marker = L.marker([client.lat, client.lon]);
                    marker.bindPopup(`<b>${client.name}</b><br>${client.type}<br><small>${client.address}</small>`);
                    marker.addTo(map);
                    markerRefs.current.set(clientKey, marker);
                    markersForBounds.push(marker);
                }
            });
            
            if (markersForBounds.length > 0) {
                 const featureGroup = L.featureGroup(markersForBounds);
                 map.fitBounds(featureGroup.getBounds().pad(0.1));
            }

        } else {
            map.setView([55.75, 37.61], 9);
        }

    }, [city, clients]);

    useEffect(() => {
        if (selectedClientKey && markerRefs.current.has(selectedClientKey) && mapInstance.current) {
            const marker = markerRefs.current.get(selectedClientKey);
            if (marker) {
                mapInstance.current.flyTo(marker.getLatLng(), 16, { animate: true, duration: 0.5 });
                marker.openPopup();
            }
        }
    }, [selectedClientKey]);
    
    useEffect(() => {
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return (
        <div className="h-full w-full relative">
            <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
            <div ref={mapContainer} className="h-full w-full" />
        </div>
    );
};

export default InteractiveMap;