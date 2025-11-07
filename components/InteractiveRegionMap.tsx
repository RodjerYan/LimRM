// FIX: This file was a placeholder, causing "not a module" errors. It has been implemented
// as a full-featured Leaflet map component to visualize client data from the OKB.
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OkbDataRow } from '../types';

// FIX: Default Leaflet icons can be broken in React/Vite setups. 
// This common workaround ensures they load correctly from a CDN.
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface InteractiveRegionMapProps {
    okbData: OkbDataRow[];
}

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ okbData }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);

    useEffect(() => {
        if (!mapContainer.current) return;

        // Initialize map only once
        if (mapInstance.current === null) {
            mapInstance.current = L.map(mapContainer.current, {
                center: [60, 90], // Center on Russia
                zoom: 3,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(mapInstance.current);
        }

        const map = mapInstance.current;

        // Clear existing markers to prevent duplicates on re-render
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        const clientsWithCoords = okbData.filter(c => c.lat && c.lon);

        if (clientsWithCoords.length > 0) {
            const markers: L.Marker[] = [];
            clientsWithCoords.forEach((client) => {
                // Ensure lat/lon are valid numbers before creating a marker
                const lat = typeof client.lat === 'number' ? client.lat : parseFloat(String(client.lat).replace(',', '.'));
                const lon = typeof client.lon === 'number' ? client.lon : parseFloat(String(client.lon).replace(',', '.'));

                if (!isNaN(lat) && !isNaN(lon)) {
                     const marker = L.marker([lat, lon]);
                     marker.bindPopup(`<b>${client['Наименование']}</b><br>${client['Вид деятельности'] || ''}<br><small>${client['Юридический адрес'] || ''}</small>`);
                     marker.addTo(map);
                     markers.push(marker);
                }
            });
            
            // Fit map to show all markers
            if (markers.length > 0) {
                const featureGroup = L.featureGroup(markers);
                map.fitBounds(featureGroup.getBounds().pad(0.1));
            }
        }

    }, [okbData]);
    
    // Cleanup map instance on component unmount
    useEffect(() => {
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Карта торговых точек ОКБ</h2>
            <div ref={mapContainer} className="h-[60vh] w-full rounded-lg" />
        </div>
    );
};

export default InteractiveRegionMap;
