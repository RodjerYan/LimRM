import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from './Modal';
import { MapPoint, UnidentifiedRow, EnrichedParsedAddress } from '../types';
import { findAddressInRow, findValueInRow, normalizeAddress } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';
import { LoaderIcon, SaveIcon, ErrorIcon, RetryIcon } from './icons';

type EditableData = MapPoint | UnidentifiedRow;
type Status = 'idle' | 'saving' | 'geocoding' | 'error_saving' | 'error_geocoding';

interface AddressEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: EditableData | null;
  onSaveSuccess: (oldKey: string, newPoint: MapPoint) => void;
}

// A simple map component for the modal
const SinglePointMap: React.FC<{ lat?: number; lon?: number, address: string }> = ({ lat, lon, address }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        if (!mapContainerRef.current) return;

        if (!mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, { scrollWheelZoom: false });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO',
            }).addTo(mapRef.current);
        }

        const map = mapRef.current;
        if (lat && lon) {
            const latLng = L.latLng(lat, lon);
            map.setView(latLng, 15);
            if (markerRef.current) {
                markerRef.current.setLatLng(latLng);
            } else {
                markerRef.current = L.marker(latLng).addTo(map);
            }
            markerRef.current.bindPopup(address).openPopup();
        } else {
            map.setView([55.75, 37.61], 5); // Default to Moscow if no coords
            if (markerRef.current) {
                map.removeLayer(markerRef.current);
                markerRef.current = null;
            }
        }
        
        // Invalidate size after modal animation
        const timer = setTimeout(() => map.invalidateSize(), 400);
        return () => clearTimeout(timer);

    }, [lat, lon, address]);

    return <div ref={mapContainerRef} className="h-full w-full rounded-lg bg-gray-800" />;
};


const AddressEditModal: React.FC<AddressEditModalProps> = ({ isOpen, onClose, data, onSaveSuccess }) => {
    const [editedAddress, setEditedAddress] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);

    const geocodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Reset state when modal opens or data changes
    useEffect(() => {
        if (isOpen && data) {
            const currentAddress = (data as MapPoint).address || findAddressInRow((data as UnidentifiedRow).rowData) || '';
            setEditedAddress(currentAddress);
            setStatus('idle');
            setError(null);
        }
        return () => {
            if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
        };
    }, [isOpen, data]);

    const attemptGeocode = useCallback(async (newAddress: string, parsedInfo: EnrichedParsedAddress, baseData: EditableData) => {
        try {
            const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(newAddress)}`);
            if (!geoRes.ok) {
                throw new Error('Координаты не найдены.');
            }
            const { lat, lon } = await geoRes.json();
            
            const originalRow = (baseData as MapPoint).originalRow || (baseData as UnidentifiedRow).rowData;
            const oldKey = normalizeAddress(findAddressInRow(originalRow));

            const newPoint: MapPoint = {
                key: normalizeAddress(newAddress),
                lat, lon, status: 'match',
                name: findValueInRow(originalRow, ['наименование клиента', 'контрагент', 'клиент']) || 'N/A',
                address: newAddress,
                city: parsedInfo.city,
                region: parsedInfo.region,
                rm: findValueInRow(originalRow, ['рм']),
                brand: findValueInRow(originalRow, ['торговая марка']),
                type: findValueInRow(originalRow, ['канал продаж']),
                contacts: findValueInRow(originalRow, ['контакты']),
                originalRow: originalRow,
            };
            onSaveSuccess(oldKey, newPoint);

        } catch (e) {
            setStatus('error_geocoding');
            setError((e as Error).message);
        }
    }, [onSaveSuccess]);

    const handleSave = async () => {
        if (!data) return;
        
        const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
        const oldAddress = findAddressInRow(originalRow) || '';

        if (editedAddress.trim() === '' || editedAddress.trim() === oldAddress.trim()) {
            setStatus('error_saving');
            setError('Адрес не был изменен или поле пустое.');
            return;
        }

        setStatus('saving');
        setError(null);
        
        try {
            const rm = findValueInRow(originalRow, ['рм']);
            const res = await fetch('/api/update-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: rm, oldAddress, newAddress: editedAddress }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.details || 'Ошибка при сохранении адреса в кэше.');
            }

            setStatus('geocoding');
            geocodeTimeoutRef.current = setTimeout(() => {
                const distributor = findValueInRow(originalRow, ['дистрибьютор']);
                const parsed = parseRussianAddress(editedAddress, distributor);
                attemptGeocode(editedAddress, parsed, data);
            }, 120000); // 2 minutes

        } catch (e) {
            setStatus('error_saving');
            setError((e as Error).message);
        }
    };
    
    const handleRetryGeocode = () => {
        if (!data) return;
        const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
        const distributor = findValueInRow(originalRow, ['дистрибьютор']);
        const parsed = parseRussianAddress(editedAddress, distributor);

        setStatus('geocoding');
        setError(null);
        // Retry immediately on user click
        attemptGeocode(editedAddress, parsed, data);
    };

    if (!data) return null;

    const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
    const clientName = findValueInRow(originalRow, ['наименование клиента', 'контрагент', 'клиент']);
    const currentLat = (data as MapPoint).lat;
    const currentLon = (data as MapPoint).lon;

    const detailsToShow = Object.entries(originalRow).map(([key, value]) => ({
        key: String(key).trim(),
        value: String(value).trim()
    })).filter(item => item.value && item.value !== 'null' && item.key !== '__rowNum__');

    const modalTitle = `Редактирование: ${clientName || 'Неизвестный клиент'}`;
    const isProcessing = status === 'saving' || status === 'geocoding';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side: Details */}
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <h4 className="font-bold text-lg mb-3 text-indigo-400">Исходные данные строки</h4>
                    <table className="w-full text-sm">
                        <tbody>
                            {detailsToShow.map(({ key, value }, index) => (
                                <tr key={index} className="border-b border-gray-700/50">
                                    <td className="py-2 pr-2 text-gray-400 font-medium align-top w-1/3">{key}</td>
                                    <td className="py-2 text-white break-words">{value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Right side: Map and Edit Form */}
                <div className="space-y-4">
                    <div className="h-64">
                         <SinglePointMap lat={currentLat} lon={currentLon} address={editedAddress} />
                    </div>
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="font-bold text-lg mb-3 text-accent">Адрес для геокодирования</h4>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="address-input" className="block text-sm font-medium text-gray-300 mb-1">Адрес ТТ LimKorm</label>
                                <textarea
                                    id="address-input"
                                    rows={3}
                                    value={editedAddress}
                                    onChange={e => setEditedAddress(e.target.value)}
                                    disabled={isProcessing}
                                    className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-accent disabled:opacity-50"
                                />
                            </div>
                            
                            {status === 'idle' && (
                                <button onClick={handleSave} className="w-full bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2">
                                    <SaveIcon /> Сохранить и найти координаты
                                </button>
                            )}

                            {status === 'saving' && (
                                <div className="text-center text-cyan-400 flex items-center justify-center gap-2"><LoaderIcon /> Сохранение адреса в кэше...</div>
                            )}

                             {status === 'geocoding' && (
                                <div className="text-center text-cyan-400 flex items-center justify-center gap-2"><LoaderIcon /> Ожидание и поиск координат (до 2 мин)...</div>
                            )}

                             {(status === 'error_saving' || status === 'error_geocoding') && (
                                <div className="text-center text-danger space-y-2">
                                    <p className="flex items-center justify-center gap-2"><ErrorIcon /> {error}</p>
                                    <button onClick={status === 'error_geocoding' ? handleRetryGeocode : handleSave} className="w-full bg-warning/80 hover:bg-warning text-black font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2">
                                        <RetryIcon /> Повторить попытку
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default AddressEditModal;