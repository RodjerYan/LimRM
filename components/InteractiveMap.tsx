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
        // --- DIAGNOSTICS ---
        console.log(`[Map] Received ${currentClients?.length ?? 0} current clients.`);
        console.log(`[Map] Received ${potentialClients?.length ?? 0} potential clients.`);
        // -------------------

        if (!mapContainer.current || !currentClients || !potentialClients) return;

        // Initialize map only once
        if (mapInstance.current === null) {
            console.log('[Map] Initializing Leaflet map instance.');
            mapInstance.current = L.map(mapContainer.current, {
                scrollWheelZoom: true,
            });
            
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
            let addedCount = 0;
            clients.forEach((client, index) => {
                // --- ROBUST COORDINATE VALIDATION ---
                const lat = client.lat;
                const lon = client.lon;
                const areCoordsValid = typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

                if (areCoordsValid) {
                    const marker = L.marker([lat, lon], { icon });
                    marker.bindPopup(`<b>${client.name}</b><br><span style="color: ${icon === greenIcon ? '#34d399' : '#f87171'};">${type}</span><br><small>${client.address}</small>`);
                    markersLayer.current?.addLayer(marker);
                    addedCount++;
                } else if (client.lat !== undefined || client.lon !== undefined) {
                    console.warn(`[Map] Invalid coordinates for client #${index} (${client.name}): lat=${lat}, lon=${lon}`);
                }
            });
            console.log(`[Map] Added ${addedCount} markers for type: ${type}`);
        };

        addClientMarkers(currentClients, greenIcon, 'Текущий клиент');
        addClientMarkers(potentialClients, redIcon, 'Потенциальный клиент');
        
        if (markersLayer.current && markersLayer.current.getLayers().length > 0) {
            const bounds = markersLayer.current.getBounds();
            if (bounds.isValid()) {
                // If there's only one point, fitBounds might zoom in too much.
                // In that case, we set a specific zoom level.
                const northEast = bounds.getNorthEast();
                const southWest = bounds.getSouthWest();
                if (northEast.equals(southWest)) {
                    map.setView(northEast, 13); // Zoom level 13 for a single point
                } else {
                    map.fitBounds(bounds.pad(0.1));
                }
            } else {
                 console.warn('[Map] Bounds are invalid, falling back to default view.');
                 map.setView([55.75, 37.61], 5);
            }
        } else {
            console.log('[Map] No markers to display, setting default view.');
            map.setView([55.75, 37.61], 5);
        }

    }, [currentClients, potentialClients]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mapInstance.current) {
                console.log('[Map] Cleaning up map instance.');
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return <div ref={mapContainer} className="h-full w-full rounded-lg" style={{ minHeight: '500px' }} />;
};

export default InteractiveMap;