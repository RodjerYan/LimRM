import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PotentialClient } from '../types';

interface InteractiveMapProps {
    currentClients: PotentialClient[];
    potentialClients: PotentialClient[];
}

// Custom SVG icons for markers
const createMarkerIcon = (color: string) => {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
            <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            <circle cx="12" cy="9" r="2.5" fill="white" opacity="0.8"/>
        </svg>`;
    return L.icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
    });
};

const greenIcon = createMarkerIcon('#34d399'); // success color
const redIcon = createMarkerIcon('#f87171');   // danger color

const InteractiveMap: React.FC<InteractiveMapProps> = ({ currentClients, potentialClients }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const markersLayer = useRef<L.FeatureGroup | null>(null);

    useEffect(() => {
        if (!mapContainer.current) return;

        // Initialize map only once
        if (mapInstance.current === null) {
            mapInstance.current = L.map(mapContainer.current, {
                scrollWheelZoom: true,
            });
            
            // Using a dark theme tile layer from CartoDB
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            }).addTo(mapInstance.current);
        }

        const map = mapInstance.current;

        // Clear previous markers
        if (markersLayer.current) {
            markersLayer.current.clearLayers();
        } else {
            markersLayer.current = L.featureGroup().addTo(map);
        }

        const addClientMarkers = (clients: PotentialClient[], icon: L.Icon, type: string) => {
            clients.forEach(client => {
                if (client.lat && client.lon) {
                    const marker = L.marker([client.lat, client.lon], { icon });
                    marker.bindPopup(`<b>${client.name}</b><br><span style="color: ${icon === greenIcon ? '#34d399' : '#f87171'};">${type}</span><br><small>${client.address}</small>`);
                    markersLayer.current?.addLayer(marker);
                }
            });
        };

        addClientMarkers(currentClients, greenIcon, 'Текущий клиент');
        addClientMarkers(potentialClients, redIcon, 'Потенциальный клиент');
        
        // Fit map to markers bounds if there are any markers
        if (markersLayer.current && markersLayer.current.getLayers().length > 0) {
            const bounds = markersLayer.current.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds.pad(0.1));
            } else {
                 map.setView([55.75, 37.61], 5); // Fallback view
            }
        } else {
            map.setView([55.75, 37.61], 5); // Default view if no clients
        }

    }, [currentClients, potentialClients]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return <div ref={mapContainer} className="h-full w-full rounded-lg" style={{ minHeight: '500px' }} />;
};

export default InteractiveMap;
