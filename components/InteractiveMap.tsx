import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PotentialClient } from '../types';

// Исправляем проблему с путями к иконкам маркеров в Leaflet при использовании сборщиков
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

// Создаем кастомные иконки
const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});


interface InteractiveMapProps {
    currentClients: PotentialClient[];
    potentialClients: PotentialClient[];
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({ currentClients, potentialClients }) => {
    
    const allClients = [...currentClients, ...potentialClients];
    const firstClientWithCoords = allClients.find(c => c.lat && c.lon);
    
    // Центрируем карту на первом клиенте с координатами, или на Москве по умолчанию
    const center: [number, number] = firstClientWithCoords 
        ? [firstClientWithCoords.lat!, firstClientWithCoords.lon!] 
        : [55.751244, 37.618423];

    return (
         <MapContainer center={center} zoom={10} scrollWheelZoom={true} style={{ height: '65vh', width: '100%', borderRadius: '0.5rem' }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {currentClients.map((client, index) => (
                client.lat && client.lon && (
                    <Marker key={`current-${index}`} position={[client.lat, client.lon]} icon={greenIcon}>
                        <Popup>
                           <b>{client.name}</b><br/>
                           {client.address}<br/>
                           <i>Тип: {client.type}</i>
                        </Popup>
                    </Marker>
                )
            ))}
            {potentialClients.map((client, index) => (
                 client.lat && client.lon && (
                    <Marker key={`potential-${index}`} position={[client.lat, client.lon]} icon={redIcon}>
                        <Popup>
                           <b>{client.name}</b><br/>
                           {client.address}<br/>
                           <i>Тип: {client.type}</i>
                        </Popup>
                    </Marker>
                )
            ))}
        </MapContainer>
    );
};

export default InteractiveMap;