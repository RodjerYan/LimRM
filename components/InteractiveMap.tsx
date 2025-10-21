

import React, { useEffect, useRef } from 'react';
import { PotentialClient } from '../types';

declare const L: any; // Using Leaflet from CDN

interface InteractiveMapProps {
    city: string;
    clients: PotentialClient[];
    // FIX: Prop name changed from selectedIndex to selectedClientKey for a more robust key-based selection
    selectedClientKey: string | null;
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({ city, clients, selectedClientKey }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    // FIX: Use a Map to store marker references with a stable key (e.g., "lat,lon") instead of a sparse array.
    const markerRefs = useRef<Map<string, any>>(new Map());

    useEffect(() => {
        if (!mapContainer.current) return;

        // Initialize map only once
        if (mapInstance.current === null) {
            mapInstance.current = L.map(mapContainer.current, {
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapInstance.current);
        }

        const map = mapInstance.current;

        // Clear existing markers from the map AND the refs map
        markerRefs.current.forEach(marker => map.removeLayer(marker));
        markerRefs.current.clear();

        const clientsWithCoords = clients.filter(c => c.lat && c.lon);

        if (clientsWithCoords.length > 0) {
            const markersForBounds: any[] = [];
            clientsWithCoords.forEach((client) => {
                // This check is redundant due to filter, but safe
                if (client.lat && client.lon) {
                    const clientKey = `${client.lat},${client.lon}`;
                    const marker = L.marker([client.lat, client.lon]);
                    marker.bindPopup(`<b>${client.name}</b><br>${client.type}<br><small>${client.address}</small>`);
                    marker.addTo(map);
                    // Store the marker in the Map with its unique key
                    markerRefs.current.set(clientKey, marker);
                    markersForBounds.push(marker);
                }
            });
            
            const featureGroup = L.featureGroup(markersForBounds);
            if (markersForBounds.length > 0) {
                 map.fitBounds(featureGroup.getBounds().pad(0.1));
            }

        } else {
            // Fallback if no coordinates are available
            map.setView([55.75, 37.61], 9); // Default to Moscow
        }

    }, [city, clients]);

    // Handle selection changes
    useEffect(() => {
        // FIX: Find the marker using the key and highlight it. This is now robust and independent of list order.
        if (selectedClientKey && markerRefs.current.has(selectedClientKey) && mapInstance.current) {
            const marker = markerRefs.current.get(selectedClientKey);
            if (marker) {
                mapInstance.current.flyTo(marker.getLatLng(), 16, { animate: true, duration: 0.5 });
                marker.openPopup();
            }
        }
    }, [selectedClientKey]);
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return <div ref={mapContainer} className="h-full w-full" />;
};

export default InteractiveMap;