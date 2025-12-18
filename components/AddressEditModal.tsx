
import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from './Modal';
import { MapPoint, UnidentifiedRow } from '../types';
import { findAddressInRow, findValueInRow, normalizeAddress } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';
import { LoaderIcon, SaveIcon, ErrorIcon, RetryIcon, ArrowLeftIcon, TrashIcon, CheckIcon, InfoIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, SearchIcon } from './icons';

type EditableData = MapPoint | UnidentifiedRow;
type Status = 'idle' | 'saving' | 'geocoding' | 'deleting' | 'error_saving' | 'error_geocoding' | 'error_deleting' | 'success_geocoding';
type Theme = 'dark' | 'light';

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
  globalTheme: Theme;
}

const SinglePointMap: React.FC<{ 
    lat?: number; 
    lon?: number; 
    address: string; 
    isSuccess: boolean;
    onCoordinatesChange: (lat: number, lon: number) => void;
    theme: Theme;
    onToggleTheme: () => void;
    onExpand?: () => void;
    onCollapse?: () => void;
    isExpanded?: boolean;
}> = ({ lat, lon, address, isSuccess, onCoordinatesChange, theme, onToggleTheme, onExpand, onCollapse, isExpanded }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const lightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    // 1. Initialize Map
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        const map = L.map(mapContainerRef.current, { 
            scrollWheelZoom: true,
            zoomControl: false,
            center: [55.75, 37.61],
            zoom: 5,
            attributionControl: false
        });
        
        mapRef.current = map;
        L.control.zoom({ position: 'topleft' }).addTo(map);

        tileLayerRef.current = L.tileLayer(theme === 'dark' ? darkUrl : lightUrl).addTo(map);

        // КРИТИЧНО: Отключаем проваливание кликов через поиск на карту
        if (searchContainerRef.current) {
            L.DomEvent.disableClickPropagation(searchContainerRef.current);
            L.DomEvent.disableScrollPropagation(searchContainerRef.current);
        }

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // 2. Theme Toggle
    useEffect(() => {
        if (tileLayerRef.current) {
            tileLayerRef.current.setUrl(theme === 'dark' ? darkUrl : lightUrl);
        }
    }, [theme]);

    // 3. Coordinate Updates
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        if (lat && lon) {
            const latLng = L.latLng(lat, lon);
            const iconToUse = isSuccess ? greenIcon : blueIcon;

            if (!markerRef.current) {
                markerRef.current = L.marker(latLng, { 
                    icon: iconToUse,
                    draggable: true,
                    autoPan: true
                }).addTo(map);
                
                markerRef.current.on('dragend', (e) => {
                    const p = e.target.getLatLng();
                    onCoordinatesChange(p.lat, p.lng);
                });
            } else {
                markerRef.current.setLatLng(latLng).setIcon(iconToUse);
            }
             
            markerRef.current.bindPopup(`<b>${address}</b>`).openPopup();
            map.setView(latLng, isExpanded ? 16 : 15);
        }
        
        const timer = setTimeout(() => map.invalidateSize(), 200);
        return () => clearTimeout(timer);
    }, [lat, lon, isSuccess, isExpanded]); 

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setSearchQuery(q);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (q.length < 3) { setSearchResults([]); return; }

        setIsSearching(true);
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=ru`);
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data);
                }
            } catch (err) { console.error(err); } finally { setIsSearching(false); }
        }, 600);
    };

    const selectResult = (result: any) => {
        const newLat = parseFloat(result.lat);
        const newLon = parseFloat(result.lon);
        if (!isNaN(newLat) && !isNaN(newLon)) {
            onCoordinatesChange(newLat, newLon);
            setSearchResults([]);
            setSearchQuery('');
            mapRef.current?.setView([newLat, newLon], 16);
        }
    };

    return (
        <div className="relative h-full w-full isolate">
            <div ref={mapContainerRef} className="h-full w-full rounded-lg bg-gray-800 z-0" />
            
            {/* Search Bar - High Z-Index & pointer-events-auto */}
            <div ref={searchContainerRef} className="absolute top-3 left-14 z-[1001] w-[calc(100%-8rem)] md:w-80">
                <div className="relative shadow-lg rounded-lg bg-card-bg/90 backdrop-blur-md border border-gray-600">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
                        {isSearching ? <div className="animate-spin h-4 w-4 border-2 border-accent border-t-transparent rounded-full"/> : <SearchIcon />}
                    </div>
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={handleSearch}
                        placeholder="Поиск места..."
                        className="w-full py-2 pl-10 pr-4 bg-transparent text-sm text-text-main rounded-lg focus:ring-1 focus:ring-accent outline-none"
                    />
                    {searchResults.length > 0 && (
                        <ul className="absolute mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                            {searchResults.map((res, idx) => (
                                <li 
                                    key={idx}
                                    onClick={() => selectResult(res)}
                                    className="px-4 py-2 text-sm text-text-main hover:bg-indigo-600/40 cursor-pointer border-b border-gray-700/50 last:border-0"
                                >
                                    {res.display_name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <div className="absolute top-3 right-3 z-[1001] flex flex-col gap-2">
                {/* Fix: Using lowercase 'theme' prop value correctly instead of 'Theme' type and wrapping in a JSX expression block */}
                <button onClick={onToggleTheme} className="flex items-center justify-center w-10 h-10 bg-card-bg/90 hover:bg-gray-700 text-text-main rounded-lg border border-gray-600 shadow-lg backdrop-blur-sm transition-all">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</button>
                <button onClick={isExpanded ? onCollapse : onExpand} className="flex items-center justify-center w-10 h-10 bg-card-bg/90 hover:bg-gray-700 text-text-main rounded-lg border border-gray-600 shadow-lg backdrop-blur-sm transition-all">{isExpanded ? <MinimizeIcon /> : <MaximizeIcon />}</button>
            </div>
        </div>
    );
};


const AddressEditModal: React.FC<AddressEditModalProps> = ({ isOpen, onClose, onBack, data, onDataUpdate, onStartPolling, onDelete, globalTheme }) => {
    const [editedAddress, setEditedAddress] = useState('');
    const [comment, setComment] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [lastUpdatedStr, setLastUpdatedStr] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    
    const [manualCoords, setManualCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [mapTheme, setMapTheme] = useState<Theme>(globalTheme);
    const [isMapExpanded, setIsMapExpanded] = useState(false);

    const justSaved = useRef(false);

    useEffect(() => { if (isOpen) setMapTheme(globalTheme); }, [isOpen, globalTheme]);

    const fetchHistory = async (rmName: string, address: string) => {
        setIsLoadingHistory(true);
        try {
            const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(address)}`);
            if (res.ok) {
                const result = await res.json();
                if (result.history) setHistory(result.history.split(/\r?\n|\s*\|\|\s*/).filter(Boolean).reverse());
                if (result.comment && !comment) setComment(result.comment);
            }
        } catch (e) { console.error(e); } finally { setIsLoadingHistory(false); }
    };

    const isUnidentified = (item: EditableData): item is UnidentifiedRow => (item as UnidentifiedRow).originalIndex !== undefined;

    useEffect(() => {
        if (isOpen && data) {
            const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
            let currentAddress = '';
            if (isUnidentified(data)) {
                const rawAddress = findAddressInRow(originalRow) || '';
                let distributor = findValueInRow(originalRow, ['дистрибьютор', 'партнер']);
                const parsed = parseRussianAddress(rawAddress, distributor);
                currentAddress = parsed.finalAddress || rawAddress;
            } else {
                currentAddress = (data as MapPoint).address;
            }

            setEditedAddress(currentAddress);
            setComment((data as MapPoint).comment || ''); 
            setManualCoords(null);
            setIsMapExpanded(false);
            setStatus((data as MapPoint).isGeocoding ? 'geocoding' : 'idle');
            setError(null);
            setShowDeleteConfirm(false);
            setSaveSuccess(false);

            if ((data as MapPoint).lastUpdated) setLastUpdatedStr(new Date((data as MapPoint).lastUpdated!).toLocaleString('ru-RU'));
            else setLastUpdatedStr(null);

            const rm = findValueInRow(originalRow, ['рм']);
            if (rm && currentAddress) fetchHistory(rm, currentAddress);
        }
    }, [isOpen, data]);

    const handleSave = async () => {
        if (!data) return;
        const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
        const oldAddress = (data as MapPoint).address || findAddressInRow(originalRow) || '';
        const oldKey = (data as MapPoint).key || normalizeAddress(oldAddress);

        setStatus('saving');
        try {
            const rm = findValueInRow(originalRow, ['рм']);
            if (editedAddress !== oldAddress || comment !== (data as MapPoint).comment) {
                await fetch('/api/update-address', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rmName: rm, oldAddress, newAddress: editedAddress, comment }),
                });
            }

            if (manualCoords) {
                await fetch('/api/update-coords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rmName: rm, updates: [{ address: editedAddress, lat: manualCoords.lat, lon: manualCoords.lon }] })
                });
            }

            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);

            const parsed = parseRussianAddress(editedAddress);
            const newPoint: MapPoint = {
                ...((data as MapPoint).originalRow ? (data as MapPoint) : {} as any),
                key: normalizeAddress(editedAddress),
                lat: manualCoords?.lat || (data as MapPoint).lat,
                lon: manualCoords?.lon || (data as MapPoint).lon,
                status: 'match',
                address: editedAddress,
                city: parsed.city,
                region: parsed.region,
                comment: comment,
                lastUpdated: Date.now()
            };
            
            onDataUpdate(oldKey, newPoint, (data as UnidentifiedRow).originalIndex);
            setStatus('idle');
        } catch (e) {
            setStatus('error_saving');
            setError((e as Error).message);
        }
    };

    if (!data) return null;
    const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
    const displayLat = manualCoords ? manualCoords.lat : (data as MapPoint).lat;
    const displayLon = manualCoords ? manualCoords.lon : (data as MapPoint).lon;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Редактирование: ${findValueInRow(originalRow, ['наименование']) || 'ТТ'}`} maxWidth="max-w-7xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="bg-card-bg/50 p-4 rounded-lg border border-gray-700 max-h-[40vh] overflow-y-auto custom-scrollbar">
                        <h4 className="font-bold text-lg mb-3 text-indigo-400">Исходные данные</h4>
                        <table className="w-full text-xs">
                            <tbody>
                                {Object.entries(originalRow).map(([k, v], i) => (
                                    <tr key={i} className="border-b border-gray-700/50 last:border-0"><td className="py-2 pr-2 text-text-muted font-medium w-1/3">{k}</td><td className="py-2 text-text-main break-all">{String(v)}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="bg-card-bg/50 p-4 rounded-lg border border-gray-700 h-[30vh] flex flex-col">
                        <h4 className="font-bold mb-2">История изменений</h4>
                        <div className="flex-grow overflow-y-auto custom-scrollbar text-xs space-y-2">
                            {history.length > 0 ? history.map((h, i) => <div key={i} className="p-2 bg-gray-800 rounded border border-gray-700">{h}</div>) : <div className="text-gray-500 italic">История пуста</div>}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="h-64 rounded-lg overflow-hidden border border-gray-700 shadow-inner">
                         <SinglePointMap 
                            lat={displayLat} lon={displayLon} address={editedAddress} isSuccess={saveSuccess}
                            onCoordinatesChange={(lat, lon) => setManualCoords({ lat, lon })}
                            theme={mapTheme} onToggleTheme={() => setMapTheme(t => t === 'dark' ? 'light' : 'dark')}
                            onExpand={() => setIsMapExpanded(true)} isExpanded={false}
                         />
                    </div>
                    <div className="bg-card-bg/50 p-5 rounded-xl border border-gray-700 space-y-4">
                        <div>
                            <label className="block text-xs text-text-muted mb-1">Адрес ТТ</label>
                            <textarea value={editedAddress} onChange={e => setEditedAddress(e.target.value)} rows={2} className="w-full p-2 bg-gray-900/50 border border-gray-600 rounded-md focus:ring-1 focus:ring-accent outline-none text-sm transition-colors"/>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1">Комментарий</label>
                            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} className="w-full p-2 bg-gray-900/50 border border-gray-600 rounded-md focus:ring-1 focus:ring-accent outline-none text-sm"/>
                        </div>
                        <button onClick={handleSave} disabled={status === 'saving'} className="w-full bg-accent hover:bg-accent-dark text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                            {status === 'saving' ? <LoaderIcon /> : <SaveIcon />} {status === 'saving' ? 'Сохранение...' : 'Сохранить изменения'}
                        </button>
                    </div>
                </div>
            </div>

            {isMapExpanded && (
                <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col">
                    <div className="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-700">
                        <h3 className="font-bold text-white">Уточнение координат</h3>
                        <button onClick={() => setIsMapExpanded(false)} className="bg-gray-800 text-white px-4 py-2 rounded-lg">Закрыть</button>
                    </div>
                    <div className="flex-grow">
                        <SinglePointMap 
                            lat={displayLat} lon={displayLon} address={editedAddress} isSuccess={false}
                            onCoordinatesChange={(lat, lon) => setManualCoords({ lat, lon })}
                            theme={mapTheme} onToggleTheme={() => setMapTheme(t => t === 'dark' ? 'light' : 'dark')}
                            onCollapse={() => setIsMapExpanded(false)} isExpanded={true}
                        />
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default AddressEditModal;
