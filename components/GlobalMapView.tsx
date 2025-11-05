import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPoint } from '../types';
import { geoJsonData } from '../data/russia_regions_geojson';

interface HybridMapViewProps {
    activeRegions: Set<string>;
    potentialPoints: MapPoint[];
}

// Function to create custom styled markers for potential clients
const createMarkerIcon = () => {
    return L.divIcon({
        html: `<div class="marker-pin blue"></div>`,
        className: 'marker-container',
        iconSize: [30, 42],
        iconAnchor: [15, 42]
    });
};

const GlobalMapView: React.FC<HybridMapViewProps> = ({ activeRegions, potentialPoints }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
    const markersLayerRef = useRef<L.LayerGroup | null>(null);

    // Initialize map
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
        
        markersLayerRef.current = L.layerGroup().addTo(mapInstance.current);

        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
        };
    }, []);

    // Update GeoJSON layer (colored regions)
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        if (geoJsonLayerRef.current) {
            map.removeLayer(geoJsonLayerRef.current);
        }

        const style = (feature?: any): L.PathOptions => {
            const regionName = feature?.properties.name || '';
            const isActive = activeRegions.has(regionName);
            return {
                fillColor: isActive ? '#22c55e' : '#374151', // green-500 for active, gray-700 for inactive
                weight: 1,
                opacity: 1,
                color: '#1F2937', // card-bg for borders
                fillOpacity: isActive ? 0.65 : 0.3
            };
        };

        const highlightFeature = (e: L.LeafletMouseEvent) => {
            const layer = e.target;
            layer.setStyle({ weight: 3, color: '#818cf8', fillOpacity: 0.8 });
            layer.bringToFront();
        };

        const resetHighlight = (e: L.LeafletMouseEvent) => {
            geoJsonLayerRef.current?.resetStyle(e.target);
        };
        
        const onEachFeature = (feature: any, layer: L.Layer) => {
            layer.bindPopup(`<b>${feature.properties.name}</b>`);
            layer.on({ mouseover: highlightFeature, mouseout: resetHighlight });
        };

        geoJsonLayerRef.current = L.geoJSON(geoJsonData as any, { style, onEachFeature }).addTo(map);

    }, [activeRegions]);

    // Update potential client markers
    useEffect(() => {
        const layer = markersLayerRef.current;
        const map = mapInstance.current;
        if (!layer || !map) return;

        layer.clearLayers();
        
        if (potentialPoints.length === 0) return;

        potentialPoints.forEach(point => {
            const marker = L.marker([point.lat, point.lon], { icon: createMarkerIcon() });
            let popupContent = `<b>${point.name}</b><br><small>${point.address}</small>`;
            if (point.contacts) {
                popupContent += `<br><i>${point.contacts}</i>`;
            }
            marker.bindPopup(popupContent);
            layer.addLayer(marker);
        });

    }, [potentialPoints]);


    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
             <h2 className="text-xl font-bold mb-4 text-white">Карта присутствия и потенциала</h2>
             <div ref={mapContainer} className="h-[60vh] w-full rounded-lg z-10" />
        </div>
    );
};

export default GlobalMapView;