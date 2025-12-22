
import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from './Modal';
import { MapPoint, UnidentifiedRow } from '../types';
import { findAddressInRow, findValueInRow, normalizeAddress } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';
import { LoaderIcon, SaveIcon, ErrorIcon, RetryIcon, ArrowLeftIcon, TrashIcon, CheckIcon, InfoIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, SearchIcon } from './icons';

// Fix for default marker icons in Leaflet when using build tools
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const lightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    useEffect(() => {
        if (!mapContainerRef.current) return;
        if (mapRef.current) return;
        const map = L.map(mapContainerRef.current, { 
            scrollWheelZoom: true,
            zoomControl: false,
            center: [55.75, 37.61],
            zoom: 5,
            attributionControl: false
        });
        mapRef.current = map;
        L.control.zoom({ position: 'topleft' }).addTo(map);
        tileLayerRef.current = L.tileLayer(darkUrl, {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
        }).addTo(map);
        return () => {
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
            tileLayerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!tileLayerRef.current) return;
        const targetUrl = theme === 'dark' ? darkUrl : lightUrl;
        tileLayerRef.current.setUrl(targetUrl);
    }, [theme]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (lat && lon) {
            const latLng = L.latLng(lat, lon);
            const iconToUse = isSuccess ? greenIcon : new L.Icon.Default();
            if (!markerRef.current) {
                const marker = L.marker(latLng, { 
                    icon: iconToUse,
                    draggable: true,
                    autoPan: true
                }).addTo(map);
                marker.on('dragend', (e) => {
                    const m = e.target;
                    const p = m.getLatLng();
                    onCoordinatesChange(p.lat, p.lng);
                });
                markerRef.current = marker;
            } else {
                markerRef.current.setLatLng(latLng).setIcon(iconToUse);
            }
            const popupContent = `<b>${address}</b><br><span style="font-size:10px; color: #9ca3af">Перетащите маркер для уточнения</span>`;
            markerRef.current.bindPopup(popupContent, { maxWidth: 350 });
            map.setView(latLng, isExpanded ? 16 : 15);
        } else {
            if (markerRef.current) {
                map.removeLayer(markerRef.current);
                markerRef.current = null;
            }
        }
        const timer = setTimeout(() => map.invalidateSize(), 200);
        return () => clearTimeout(timer);
    }, [lat, lon, isSuccess, isExpanded, address]); 

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setSearchQuery(q);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (q.length < 3) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=ru`);
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 600);
    };

    const selectResult = (result: any) => {
        const newLat = parseFloat(result.lat);
        const newLon = parseFloat(result.lon);
        if (!isNaN(newLat) && !isNaN(newLon)) {
            onCoordinatesChange(newLat, newLon);
            setSearchResults([]);
            mapRef.current?.setView([newLat, newLon], 16);
        }
    };

    return (
        <div className="relative h-full w-full group isolate">
            <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
            <div ref={mapContainerRef} className="h-full w-full rounded-lg bg-gray-800 cursor-move z-0" />
            <div className="absolute top-3 left-14 z-[1000] w-[calc(100%-8rem)] md:w-80 pointer-events-none">
                <div className="relative pointer-events-auto shadow-lg rounded-lg">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                        {isSearching ? <div className="animate-spin h-4 w-4 border-2 border-accent border-t-transparent rounded-full"/> : <SearchIcon />}
                    </div>
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={handleSearch}
                        placeholder="Поиск места на карте..."
                        className="w-full py-2 pl-10 pr-4 bg-card-bg/90 backdrop-blur text-sm text-text-main border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent shadow-sm transition-all"
                    />
                    {searchResults.length > 0 && (
                        <ul className="absolute mt-1 w-full bg-card-bg/95 backdrop-blur border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar z-[1050]">
                            {searchResults.map((res, idx) => (
                                <li 
                                    key={idx}
                                    onClick={() => selectResult(res)}
                                    className="px-4 py-2 text-sm text-text-main hover:bg-indigo-600/30 hover:text-white cursor-pointer border-b border-gray-700/50 last:border-0 transition-colors"
                                >
                                    {res.display_name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 pointer-events-auto">
                <button 
                    onClick={onToggleTheme}
                    className="flex items-center justify-center w-10 h-10 bg-card-bg/90 hover:bg-gray-600 text-text-main rounded-lg shadow-lg border border-gray-600 transition-all transform active:scale-95 backdrop-blur-sm"
                    title={theme === 'dark' ? "Светлая карта" : "Темная карта"}
                >
                    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                </button>
                {isExpanded ? (
                    <button onClick={onCollapse} className="flex items-center justify-center w-10 h-10 bg-card-bg/90 hover:bg-gray-600 text-text-main rounded-lg shadow-lg border border-gray-600 transition-all transform active:scale-95 backdrop-blur-sm" title="Свернуть карту">
                        <MinimizeIcon />
                    </button>
                ) : (
                    <button onClick={onExpand} className="flex items-center justify-center w-10 h-10 bg-card-bg/90 hover:bg-gray-600 text-text-main rounded-lg shadow-lg border border-gray-600 transition-all transform active:scale-95 backdrop-blur-sm" title="Развернуть карту">
                        <MaximizeIcon />
                    </button>
                )}
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

    useEffect(() => {
        if (isOpen) {
            setMapTheme(globalTheme);
        }
    }, [isOpen, globalTheme]);

    // NEW/FIX: Синхронизируем локальный статус модалки с флагом isGeocoding из пропсов.
    // Если polling в App.tsx нашел координаты и обновил editingClient, мы увидим это здесь.
    useEffect(() => {
        if (isOpen && data && 'key' in data) {
            const pt = data as MapPoint;
            if (pt.isGeocoding) {
                setStatus('geocoding');
                setManualCoords(null);
            } else if (status === 'geocoding' && pt.lat && pt.lon) {
                // Если мы ЖДАЛИ (были в статусе geocoding) и ПРИШЛИ координаты
                setStatus('idle');
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
                setManualCoords(null);
                if (pt.lastUpdated) {
                    setLastUpdatedStr(new Date(pt.lastUpdated).toLocaleString('ru-RU'));
                }
            }
        }
    }, [data, isOpen]);

    const fetchHistory = async (rmName: string, address: string) => {
        setIsLoadingHistory(true);
        setHistory([]);
        try {
            const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(address)}&t=${Date.now()}`);
            if (res.ok) {
                const result = await res.json();
                if (result.history) {
                    const historyArray = result.history.split(/\r?\n|\s*\|\|\s*/).filter(Boolean).reverse();
                    setHistory(historyArray);
                }
                if (result.comment && !comment) {
                    setComment(result.comment);
                }
            }
        } catch (e) {
            console.error("Failed to fetch history", e);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const isUnidentified = (item: EditableData): item is UnidentifiedRow => {
        return (item as UnidentifiedRow).originalIndex !== undefined;
    };

    useEffect(() => {
        if (isOpen && data) {
            const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
            let currentAddress = '';
            if (isUnidentified(data)) {
                const rawAddress = findAddressInRow(originalRow) || '';
                let distributor = findValueInRow(originalRow, ['дистрибьютор', 'дистрибьютер', 'distributor', 'партнер', 'контрагент', 'дистриб']);
                if (!distributor) {
                    const values = Object.values(originalRow);
                    const possibleDistributor = values.find(v => typeof v === 'string' && v.includes('(') && v.includes(')'));
                    if (possibleDistributor) distributor = String(possibleDistributor);
                }
                const parsed = parseRussianAddress(rawAddress, distributor);
                currentAddress = parsed.finalAddress || rawAddress;
            } else {
                currentAddress = (data as MapPoint).address;
            }
            setEditedAddress(currentAddress);
            setComment((data as MapPoint).comment || ''); 
            setManualCoords(null);
            setIsMapExpanded(false);
            
            // Если точка уже в процессе геокодирования (пришла такая из списка)
            if (!isUnidentified(data) && (data as MapPoint).isGeocoding) {
                setStatus('geocoding');
            } else {
                setStatus('idle');
            }

            setError(null);
            setShowDeleteConfirm(false);
            setSaveSuccess(false);
            if ((data as MapPoint).lastUpdated) {
                setLastUpdatedStr(new Date((data as MapPoint).lastUpdated!).toLocaleString('ru-RU'));
            } else {
                setLastUpdatedStr(null);
            }
            const rm = findValueInRow(originalRow, ['рм']);
            if (rm && currentAddress) {
                if (!justSaved.current) fetchHistory(rm, currentAddress);
                else justSaved.current = false;
            } else setHistory([]);
        }
    }, [isOpen, data]);

    const handleSave = async () => {
        if (!data) return;
        const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
        const originalIndex = (data as UnidentifiedRow).originalIndex;
        const oldAddress = (data as MapPoint).address || findAddressInRow(originalRow) || '';
        const currentComment = (data as MapPoint).comment || '';
        let oldKey = (data as MapPoint).key || normalizeAddress(oldAddress);
        const isAddressChanged = editedAddress.trim() !== '' && editedAddress.trim().toLowerCase() !== oldAddress.trim().toLowerCase();
        const isCoordsChanged = manualCoords !== null;
        const isCommentChanged = comment.trim() !== currentComment.trim();

        if (!isAddressChanged && !isCoordsChanged && !isCommentChanged && typeof originalIndex !== 'number') {
            setStatus('error_saving'); setError('Нет изменений для сохранения.'); return;
        }

        setStatus('saving'); setError(null);
        try {
            const rm = findValueInRow(originalRow, ['рм']);
            if (isAddressChanged || isCommentChanged) {
                const res = await fetch('/api/update-address', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rmName: rm, oldAddress, newAddress: editedAddress, comment }),
                });
                if (!res.ok) { const err = await res.json(); throw new Error(err.details || 'Ошибка при сохранении.'); }
                const timestamp = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                if (isAddressChanged) setHistory(prev => [`${oldAddress} [${timestamp}]`, ...prev]);
                else if (isCommentChanged) setHistory(prev => [`Комментарий: "${comment}" [${timestamp}]`, ...prev]);
                justSaved.current = true;
            }

            let distributor = findValueInRow(originalRow, ['дистрибьютор', 'дистрибьютер', 'distributor']);
            if (!distributor) {
                 const values = Object.values(originalRow);
                 const possibleDistributor = values.find(v => typeof v === 'string' && v.includes('(') && v.includes(')'));
                 if (possibleDistributor) distributor = String(possibleDistributor);
            }
            const parsed = parseRussianAddress(editedAddress, distributor);
            let currentLat = (data as MapPoint).lat;
            let currentLon = (data as MapPoint).lon;
            let isGeocodingState = isAddressChanged && !manualCoords;

            if (manualCoords) {
                currentLat = manualCoords.lat; currentLon = manualCoords.lon; isGeocodingState = false;
                await fetch('/api/update-coords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rmName: rm, updates: [{ address: editedAddress, lat: currentLat, lon: currentLon }] })
                });
            }

            setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 2000);
            const updateTimestamp = Date.now();
            const tempNewPoint: MapPoint = {
                key: normalizeAddress(editedAddress),
                lat: currentLat, lon: currentLon, status: 'match',
                name: findValueInRow(originalRow, ['наименование клиента', 'контрагент', 'клиент']) || 'N/A',
                address: editedAddress, city: parsed.city, region: parsed.region, rm: rm,
                brand: findValueInRow(originalRow, ['торговая марка']),
                packaging: findValueInRow(originalRow, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана',
                type: findValueInRow(originalRow, ['канал продаж']),
                contacts: findValueInRow(originalRow, ['контакты']),
                originalRow: originalRow, fact: (data as MapPoint).fact,
                isGeocoding: isGeocodingState, lastUpdated: updateTimestamp, comment
            };
            
            onDataUpdate(oldKey, tempNewPoint, originalIndex);
            
            if (isGeocodingState) {
                setStatus('geocoding');
                onStartPolling(rm, editedAddress, tempNewPoint.key, tempNewPoint, originalIndex);
            } else setStatus('idle');
        } catch (e) {
            setStatus('error_saving'); setError((e as Error).message);
        }
    };

    const handleDelete = async () => {
        if (!data) return;
        const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
        const addressToDelete = (data as MapPoint).address || findAddressInRow(originalRow) || '';
        const rm = findValueInRow(originalRow, ['рм']);
        setStatus('deleting'); setError(null);
        try {
            const res = await fetch('/api/delete-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: rm, address: addressToDelete }),
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.details || 'Ошибка при удалении.'); }
            let keyToDelete = (data as MapPoint).key || normalizeAddress(addressToDelete);
            onDelete(keyToDelete);
        } catch (e) { setStatus('error_deleting'); setError((e as Error).message); }
    };
    
    if (!data) return null;

    const originalRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
    const clientName = findValueInRow(originalRow, ['наименование клиента', 'контрагент', 'клиент']);
    const currentDisplayAddress = (data as MapPoint).address || findAddressInRow(originalRow) || '';
    const currentLat = (data as MapPoint).lat;
    const currentLon = (data as MapPoint).lon;
    const currentComment = (data as MapPoint).comment || '';
    const detailsToShow = Object.entries(originalRow).map(([key, value]) => ({ key: String(key).trim(), value: String(value).trim() })).filter(item => item.value && item.value !== 'null' && item.key !== '__rowNum__');
    const modalTitle = `Редактирование: ${clientName || 'Неизвестный клиент'}`;
    const isProcessing = status === 'saving' || status === 'deleting';
    const displayLat = manualCoords ? manualCoords.lat : currentLat;
    const displayLon = manualCoords ? manualCoords.lon : currentLon;
    const isAddressChanged = editedAddress.trim() !== '' && editedAddress.trim().toLowerCase() !== currentDisplayAddress.trim().toLowerCase();
    const isCoordsChanged = manualCoords !== null;
    const isCommentChanged = comment.trim() !== currentComment.trim();
    
    let saveButtonText = "Сохранить изменения";
    if (isAddressChanged) saveButtonText = "Сохранить новый адрес";
    if (isCoordsChanged) saveButtonText = "Сохранить новые координаты";
    if (isAddressChanged && isCoordsChanged) saveButtonText = "Сохранить адрес и координаты";
    if (isCommentChanged && !isAddressChanged && !isCoordsChanged) saveButtonText = "Сохранить комментарий";

    const customFooter = (
        <div className="flex justify-between items-center p-4 bg-card-bg/50 rounded-b-2xl border-t border-gray-700 flex-shrink-0">
            <button onClick={onBack} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition duration-200 flex items-center gap-2"><ArrowLeftIcon /> Назад</button>
            <button onClick={onClose} className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-6 rounded-lg transition duration-200">Закрыть</button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} footer={customFooter} maxWidth="max-w-7xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                    <div className="bg-card-bg/50 p-4 rounded-lg border border-gray-700 max-h-[40vh] overflow-y-auto custom-scrollbar">
                        <h4 className="font-bold text-lg mb-3 text-indigo-400">Исходные данные строки</h4>
                        <table className="w-full text-sm">
                            <tbody>
                                {detailsToShow.map(({ key, value }, index) => (
                                    <tr key={index} className="border-b border-gray-700/50">
                                        <td className="py-2 pr-2 text-text-muted font-medium align-top w-1/3">{key}</td>
                                        <td className="py-2 text-text-main break-words">{value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="bg-card-bg/50 p-4 rounded-lg border border-gray-700 flex-grow flex flex-col">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-bold text-lg text-text-main flex items-center gap-2">История изменений {isLoadingHistory && <LoaderIcon />}</h4>
                            <span className="text-xs text-text-muted bg-gray-800 px-2 py-1 rounded-full border border-gray-700">Всего: {history.length}</span>
                        </div>
                        <div className="flex-grow overflow-y-auto custom-scrollbar bg-gray-800/30 rounded-lg p-2 border border-gray-700/50 min-h-[120px]">
                            {history.length > 0 ? (
                                <ul className="space-y-2">
                                    {history.map((item, idx) => (
                                        <li key={idx} className="p-3 bg-gray-800 rounded border border-gray-700 text-sm text-gray-300 flex flex-col gap-1 hover:bg-gray-700/80 transition-colors">
                                            <div className="flex items-center gap-2 text-accent text-xs font-bold"><span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span><span>Изменение #{history.length - idx}</span></div>
                                            <span className="pl-4 break-words whitespace-pre-wrap">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm p-4"><div className="w-8 h-8 mb-2 opacity-50"><InfoIcon /></div><span>История изменений пуста</span></div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="h-64">
                         <SinglePointMap 
                            lat={displayLat} lon={displayLon} address={editedAddress} isSuccess={status !== 'geocoding' && !!displayLat}
                            onCoordinatesChange={(lat, lon) => setManualCoords({ lat, lon })}
                            theme={mapTheme} onToggleTheme={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                            onExpand={() => setIsMapExpanded(true)} isExpanded={false}
                         />
                    </div>
                    <div className="bg-card-bg/50 p-4 rounded-lg border border-gray-700">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-bold text-lg text-accent">Редактирование данных</h4>
                            {!showDeleteConfirm ? (
                                <button onClick={() => setShowDeleteConfirm(true)} className="text-danger hover:text-red-400 transition-colors flex items-center gap-1 text-sm" title="Удалить строку"><TrashIcon /></button>
                            ) : (
                                <div className="flex items-center gap-2"><span className="text-xs text-gray-300">Удалить?</span><button onClick={handleDelete} className="text-xs bg-danger hover:bg-red-600 text-white px-2 py-1 rounded">Да</button><button onClick={() => setShowDeleteConfirm(false)} className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded">Нет</button></div>
                            )}
                        </div>
                        <div className="space-y-3">
                            <div className="relative">
                                <label htmlFor="address-input" className="block text-sm font-medium text-text-muted mb-1">Адрес ТТ LimKorm</label>
                                <textarea id="address-input" rows={2} value={editedAddress} onChange={e => setEditedAddress(e.target.value)} disabled={isProcessing || status === 'geocoding'} className={`w-full p-2 bg-gray-900/50 border rounded-md focus:ring-2 focus:ring-accent disabled:opacity-50 transition-colors duration-300 text-text-main ${saveSuccess ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-600'}`} />
                                {saveSuccess && <div className="absolute right-2 top-8 text-green-400 animate-pulse"><CheckIcon /></div>}
                            </div>
                            <div className="relative">
                                <label htmlFor="comment-input" className="block text-sm font-medium text-text-muted mb-1">Комментарий</label>
                                <textarea id="comment-input" rows={2} value={comment} onChange={e => setComment(e.target.value)} disabled={isProcessing || status === 'geocoding'} placeholder="Введите комментарий..." className="w-full p-2 bg-gray-900/50 border border-gray-600 rounded-md focus:ring-2 focus:ring-accent disabled:opacity-50 transition-colors duration-300 text-text-main" />
                            </div>
                            {lastUpdatedStr && <div className="text-xs text-gray-500 text-right italic">Последнее изменение: {lastUpdatedStr}</div>}
                            
                            {/* СЕКЦИЯ СТАТУСА И КНОПОК */}
                            <div className="min-h-[60px] flex flex-col justify-center">
                                {status === 'idle' && <button onClick={handleSave} className="w-full bg-accent hover:bg-accent-dark text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"><SaveIcon /> {saveButtonText}</button>}
                                {status === 'saving' && <div className="text-center text-cyan-400 flex items-center justify-center gap-2 py-2"><LoaderIcon /> Сохранение изменений...</div>}
                                {status === 'deleting' && <div className="text-center text-danger flex items-center justify-center gap-2 py-2"><LoaderIcon /> Удаление строки...</div>}
                                {status === 'geocoding' && (
                                    <div className="flex flex-col gap-3 p-3 bg-indigo-900/30 rounded-lg border border-indigo-500/40 animate-pulse shadow-[0_0_15px_rgba(129,140,248,0.2)]">
                                        <div className="text-center text-cyan-400 flex items-center justify-center gap-2 font-bold text-sm">
                                            <LoaderIcon /> <span>Ожидание ответа от геокодера...</span>
                                        </div>
                                        <div className="text-center text-[10px] leading-tight text-gray-300">Запрос отправлен в Google Таблицу. Поиск координат продолжится в фоне (до 48 часов). Вы можете закрыть это окно.</div>
                                    </div>
                                )}
                                {(status === 'error_saving' || status === 'error_geocoding' || status === 'error_deleting') && (
                                    <div className="text-center text-danger space-y-2">
                                        <p className="flex items-center justify-center gap-2"><ErrorIcon /> {error}</p>
                                        {status !== 'error_deleting' && <button onClick={handleSave} className="w-full bg-warning/80 hover:bg-warning text-black font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2"><RetryIcon /> Повторить попытку</button>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {isMapExpanded && (
                <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-fade-in">
                    <div className="flex justify-between items-center p-4 bg-card-bg/80 backdrop-blur-sm border-b border-gray-700">
                        <h3 className="text-lg font-bold text-white">Уточнение координат: {editedAddress}</h3>
                        <button onClick={() => setIsMapExpanded(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors">Закрыть</button>
                    </div>
                    <div className="flex-grow relative">
                        <SinglePointMap 
                            lat={displayLat} lon={displayLon} address={editedAddress} isSuccess={status !== 'geocoding'}
                            onCoordinatesChange={(lat, lon) => setManualCoords({ lat, lon })}
                            theme={mapTheme} onToggleTheme={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                            onCollapse={() => setIsMapExpanded(false)} isExpanded={true}
                        />
                    </div>
                    <div className="p-4 bg-card-bg/80 backdrop-blur-sm border-t border-gray-700 flex justify-end gap-3">
                         <div className="text-sm text-text-muted flex items-center mr-4">Перетащите маркер в нужное место. Координаты обновятся автоматически.</div>
                         <button onClick={() => setIsMapExpanded(false)} className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-6 rounded-lg">Применить и вернуться</button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default AddressEditModal;
