import React, { useEffect, useRef } from 'react';
import { PotentialClient } from '../types';

declare const L: any; // Using Leaflet from CDN

interface InteractiveMapProps {
    city: string;
    clients: PotentialClient[];
    selectedClientKey: string | null;
    cityCenter?: { lat: number; lon: number };
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({ city, clients, selectedClientKey, cityCenter }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const markersRef = useRef<any>({});

    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;

        mapInstance.current = L.map(mapContainer.current, {
            scrollWheelZoom: true,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19
        }).addTo(mapInstance.current);

        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        // Clear existing markers
        Object.values(markersRef.current).forEach((marker: any) => map.removeLayer(marker));
        markersRef.current = {};

        const validClients = clients.filter(c => c.lat && c.lon);

        if (validClients.length > 0) {
            const bounds = L.latLngBounds();
            validClients.forEach(client => {
                const key = `${client.lat},${client.lon}`;
                const marker = L.marker([client.lat!, client.lon!], {
                    title: client.name,
                }).addTo(map);

                marker.bindPopup(`<b>${client.name}</b><br>${client.address}`);
                markersRef.current[key] = marker;
                bounds.extend([client.lat!, client.lon!]);
            });

            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            }
        } else if (cityCenter && cityCenter.lat && cityCenter.lon) {
            map.setView([cityCenter.lat, cityCenter.lon], 12);
        } else {
             // Fallback if no clients and no city center
            map.setView([55.75, 37.61], 10); // Default to Moscow
        }

    }, [clients, cityCenter]);
    
    useEffect(() => {
        if (!mapInstance.current || !selectedClientKey) return;

        const selectedMarker = markersRef.current[selectedClientKey];
        if (selectedMarker) {
             mapInstance.current.flyTo(selectedMarker.getLatLng(), 16);
             selectedMarker.openPopup();
        }
    }, [selectedClientKey]);


    return <div ref={mapContainer} className="w-full h-full" />;
};

export default InteractiveMap;
