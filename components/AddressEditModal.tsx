import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from './Modal';
import { MapPoint, UnidentifiedRow, EnrichedParsedAddress } from '../types';
import { findAddressInRow, findValueInRow, normalizeAddress } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';
import { LoaderIcon, SaveIcon, ErrorIcon, RetryIcon, CheckIcon, ArrowLeftIcon, TrashIcon } from './icons';

type EditableData = MapPoint | UnidentifiedRow;
type Status = 'idle' | 'saving' | 'geocoding' | 'deleting' | 'error_saving' | 'error_geocoding' | 'error_deleting' | 'success_geocoding';

const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
const blueIcon = new L.Icon.Default(); 

interface AddressEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  data: EditableData | null;
  onDataUpdate: (oldKey: string, newPoint: MapPoint, originalIndex?: number) => void;
  onStartPolling: (rmName: string, address: string, tempKey: string, basePoint: MapPoint, originalIndex?: number) => void;
  onDelete: (key: string) => void;
}

const SinglePointMap: React.FC<{ lat?: number; lon?: number, address: string, isSuccess: boolean }> = ({ lat, lon, address, isSuccess }) => {
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
            const iconToUse = isSuccess ? greenIcon : blueIcon;

            if (markerRef.current) {
                markerRef.current.setLatLng(latLng).setIcon(iconToUse);
            } else {
                markerRef.current = L.marker(latLng, { icon: iconToUse }).addTo(map);
            }
             markerRef.current.bindPopup(address, { maxWidth: 350 }).openPopup();
             map.setView(latLng, 15);
        } else {
            map.setView([55.75, 37.61], 5);
            if (markerRef.current) {
                map.removeLayer(markerRef.current);
                markerRef.current = null;
            }
        }
        
        const timer = setTimeout(() => map.invalidateSize(), 400);
        return () => clearTimeout(timer);

    }, [lat, lon, address, isSuccess]);

    return <div ref={mapContainerRef} className="h-full w-full rounded-lg bg-gray-800" />;
};


const AddressEditModal: React.FC<AddressEditModalProps> = ({ isOpen, onClose, onBack, data, onDataUpdate, onStartPolling, onDelete }) => {
    const [editedAddress, setEditedAddress] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (isOpen && data) {
            const currentAddress = (data as MapPoint).address || findAddressInRow((data as UnidentifiedRow).rowData) || '';
            setEditedAddress(currentAddress);
            
            // FIX: Check if the object is already in geocoding state.
            // This ensures that if the modal is closed and reopened during the process, the UI reflects the ongoing status.
            if ((data as MapPoint).isGeocoding) {
                setStatus('geocoding');
            } else {
                setStatus('idle');
            }
            
            setError(null);
            setShowDeleteConfirm(false);
        }
    }, [isOpen, data]);

    const handleSave = async () => {
        if (!data) return;
        
        const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
        const originalIndex = (data as UnidentifiedRow).originalIndex;
        const oldAddress = (data as MapPoint).address || findAddressInRow(originalRow) || '';
        
        // CRITICAL: Use exact existing key if available to prevent duplicates
        let oldKey = '';
        if ((data as MapPoint).key) {
            oldKey = (data as MapPoint).key;
        } else {
            oldKey = normalizeAddress(oldAddress);
        }

        if (editedAddress.trim() === '' || editedAddress.trim().toLowerCase() === oldAddress.trim().toLowerCase()) {
            if (typeof originalIndex !== 'number') { // Is Identified (Active Client)
                 setStatus('error_saving');
                 setError('Адрес не был изменен или поле пустое.');
                 return;
            }
        }

        setStatus('saving');
        setError(null);
        
        try {
            const rm = findValueInRow(originalRow, ['рм']);
            // 1. Save text to Cache Sheet
            const res = await fetch('/api/update-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: rm, oldAddress, newAddress: editedAddress }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.details || 'Ошибка при сохранении адреса в кэше.');
            }

            // 2. Optimistic Update: Update text immediately so UI reflects changes
            setStatus('geocoding');
            const distributor = findValueInRow(originalRow, ['дистрибьютор']);
            const parsed = parseRussianAddress(editedAddress, distributor);
            const currentLat = (data as MapPoint).lat;
            const currentLon = (data as MapPoint).lon;

            const tempNewPoint: MapPoint = {
                key: normalizeAddress(editedAddress), // This becomes the new key
                lat: currentLat, lon: currentLon, status: 'match',
                name: findValueInRow(originalRow, ['наименование клиента', 'контрагент', 'клиент']) || 'N/A',
                address: editedAddress,
                city: parsed.city,
                region: parsed.region,
                rm: rm,
                brand: findValueInRow(originalRow, ['торговая марка']),
                type: findValueInRow(originalRow, ['канал продаж']),
                contacts: findValueInRow(originalRow, ['контакты']),
                originalRow: originalRow,
                fact: (data as MapPoint).fact,
                isGeocoding: true // Flag to show spinner in list
            };
            
            // Immediately update the app state
            onDataUpdate(oldKey, tempNewPoint, originalIndex);

            // 3. Start Active Geocoding Process (Handled by App.tsx)
            // This will fetch coords, save them to sheet, and update state again when done.
            onStartPolling(rm, editedAddress, tempNewPoint.key, tempNewPoint, originalIndex);

        } catch (e) {
            setStatus('error_saving');
            setError((e as Error).message);
        }
    };

    const handleDelete = async () => {
        if (!data) return;
        const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
        const addressToDelete = (data as MapPoint).address || findAddressInRow(originalRow) || '';
        const rm = findValueInRow(originalRow, ['рм']);

        setStatus('deleting');
        setError(null);

        try {
            const res = await fetch('/api/delete-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: rm, address: addressToDelete }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.details || 'Ошибка при удалении строки.');
            }
            
            // If we have a specific key, use it. Otherwise normalize address.
            let keyToDelete = '';
            if ((data as MapPoint).key) {
                keyToDelete = (data as MapPoint).key;
            } else {
                keyToDelete = normalizeAddress(addressToDelete);
            }
            
            onDelete(keyToDelete);

        } catch (e) {
            setStatus('error_deleting');
            setError((e as Error).message);
        }
    };
    
    const handleRetryGeocode = () => {
       handleSave();
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
    const isProcessing = status === 'saving' || status === 'deleting';
    
    const displayLat = currentLat;
    const displayLon = currentLon;

    const customFooter = (
        <div className="flex justify-between items-center p-4 bg-gray-900/50 rounded-b-2xl border-t border-gray-700 flex-shrink-0">
            <button
                onClick={onBack}
                className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition duration-200 flex items-center gap-2"
                aria-label="Вернуться к предыдущему окну"
            >
                <ArrowLeftIcon /> Назад
            </button>
            <button
                onClick={onClose}
                className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-6 rounded-lg transition duration-200"
            >
                Закрыть
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} footer={customFooter}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                <div className="space-y-4">
                    <div className="h-64">
                         <SinglePointMap lat={displayLat} lon={displayLon} address={editedAddress} isSuccess={false} />
                    </div>
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-bold text-lg text-accent">Адрес для геокодирования</h4>
                            {!showDeleteConfirm ? (
                                <button 
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="text-danger hover:text-red-400 transition-colors flex items-center gap-1 text-sm"
                                    title="Удалить строку"
                                >
                                    <TrashIcon />
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-300">Удалить?</span>
                                    <button onClick={handleDelete} className="text-xs bg-danger hover:bg-red-600 text-white px-2 py-1 rounded">Да</button>
                                    <button onClick={() => setShowDeleteConfirm(false)} className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded">Нет</button>
                                </div>
                            )}
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="address-input" className="block text-sm font-medium text-gray-300 mb-1">Адрес ТТ LimKorm</label>
                                <textarea
                                    id="address-input"
                                    rows={3}
                                    value={editedAddress}
                                    onChange={e => setEditedAddress(e.target.value)}
                                    disabled={isProcessing || status === 'geocoding'}
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
                            
                            {status === 'deleting' && (
                                <div className="text-center text-danger flex items-center justify-center gap-2"><LoaderIcon /> Удаление строки...</div>
                            )}

                             {status === 'geocoding' && (
                                <div className="flex flex-col gap-3 p-3 bg-indigo-900/20 rounded-lg border border-indigo-500/30 animate-pulse">
                                    <div className="text-center text-cyan-400 flex items-center justify-center gap-2 font-bold text-sm">
                                        <LoaderIcon /> <span>Запрос на геокодирование...</span>
                                    </div>
                                    <div className="text-center text-xs text-gray-300">
                                        Мы ищем координаты прямо сейчас. Этот процесс продолжится даже если вы закроете окно.
                                    </div>
                                </div>
                            )}

                             {(status === 'error_saving' || status === 'error_geocoding' || status === 'error_deleting') && (
                                <div className="text-center text-danger space-y-2">
                                    <p className="flex items-center justify-center gap-2"><ErrorIcon /> {error}</p>
                                    {status !== 'error_deleting' && (
                                        <button onClick={handleRetryGeocode} className="w-full bg-warning/80 hover:bg-warning text-black font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2">
                                            <RetryIcon /> Повторить попытку
                                        </button>
                                    )}
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