
import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from './Modal';
import { MapPoint, UnidentifiedRow } from '../types';
import { findAddressInRow, findValueInRow, normalizeAddress } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';
import { LoaderIcon, SaveIcon, ErrorIcon, RetryIcon, ArrowLeftIcon, TrashIcon, CheckIcon, InfoIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, SearchIcon } from './icons';

// --- Fix Leaflet Icons ---
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// --- Types ---
type EditableData = MapPoint | UnidentifiedRow;
type Status = 'idle' | 'saving' | 'success' | 'geocoding' | 'deleting' | 'error_saving' | 'error_geocoding' | 'error_deleting' | 'success_geocoding';
type Theme = 'dark' | 'light';

interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
}

interface AddressEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBack: () => void;
    data: EditableData | null;
    onDataUpdate: (oldKey: string, newPoint: MapPoint, originalIndex?: number) => void;
    onStartPolling: (rmName: string, address: string, tempKey: string, basePoint: MapPoint, originalIndex?: number) => void;
    onDelete: (rm: string, address: string) => void;
    globalTheme?: Theme;
}

// --- Safe Data Getter ---
const getSafeOriginalRow = (data: EditableData | null): any => {
    if (!data) return {};
    const rawRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
    return (rawRow && typeof rawRow === 'object') ? rawRow : {};
};

// --- Subcomponent: SinglePointMap ---
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
    
    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    // Cleanup Refs
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mapResizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

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
        tileLayerRef.current = L.tileLayer(darkUrl, { attribution: '&copy; CARTO' }).addTo(map);

        return () => {
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
            tileLayerRef.current = null;
        };
    }, []);

    // 2. Handle Theme
    useEffect(() => {
        if (!tileLayerRef.current) return;
        tileLayerRef.current.setUrl(theme === 'dark' ? darkUrl : lightUrl);
    }, [theme]);

    // 3. Handle Markers & View (Strict Coordinate Check)
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // FIXED: Check for non-zero coordinates
        const hasCoords = typeof lat === 'number' && typeof lon === 'number' && lat !== 0 && lon !== 0;

        if (hasCoords) {
            const latLng = L.latLng(lat, lon);
            const iconToUse = isSuccess ? greenIcon : new L.Icon.Default();

            if (!markerRef.current) {
                const marker = L.marker(latLng, { 
                    icon: iconToUse,
                    draggable: true,
                    autoPan: true
                }).addTo(map);

                marker.on('dragend', (e) => {
                    const { lat: newLat, lng: newLon } = e.target.getLatLng();
                    onCoordinatesChange(newLat, newLon);
                });
                markerRef.current = marker;
            } else {
                markerRef.current.setLatLng(latLng).setIcon(iconToUse);
            }

            const popupContent = `<b>${address}</b><br><span style="font-size:10px; color: #9ca3af">Перетащите маркер для уточнения</span>`;
            markerRef.current.bindPopup(popupContent, { maxWidth: 350 });
            
            // FIXED: More distinct zoom levels
            map.setView(latLng, isExpanded ? 17 : 14);
        } else {
            if (markerRef.current) {
                map.removeLayer(markerRef.current);
                markerRef.current = null;
            }
        }
        
        if (mapResizeTimeoutRef.current) clearTimeout(mapResizeTimeoutRef.current);
        mapResizeTimeoutRef.current = setTimeout(() => map.invalidateSize(), 200);

        return () => {
            if (mapResizeTimeoutRef.current) clearTimeout(mapResizeTimeoutRef.current);
        };
    }, [lat, lon, isSuccess, isExpanded, address, onCoordinatesChange]); 

    // Search Logic with AbortController
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setSearchQuery(q);
        
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (q.length < 3) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        searchTimeoutRef.current = setTimeout(async () => {
            // Cancel previous request
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=ru`, {
                    signal: abortControllerRef.current.signal
                });
                if (res.ok) {
                    const data: NominatimResult[] = await res.json();
                    setSearchResults(data);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error(err);
                }
            } finally {
                // Only turn off loading if this was the last request
                if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
                    setIsSearching(false);
                }
            }
        }, 600);
    };

    const selectResult = (result: NominatimResult) => {
        const newLat = parseFloat(result.lat);
        const newLon = parseFloat(result.lon);
        if (!isNaN(newLat) && !isNaN(newLon)) {
            onCoordinatesChange(newLat, newLon);
            setSearchResults([]);
            mapRef.current?.setView([newLat, newLon], 16);
        }
    };

    const btnClass = "flex items-center justify-center w-10 h-10 bg-card-bg/90 hover:bg-gray-600 text-text-main rounded-lg shadow-lg border border-gray-600 transition-all transform active:scale-95 backdrop-blur-sm";

    return (
        <div className="relative h-full w-full group isolate">
            <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
            <div 
                ref={mapContainerRef} 
                className={`h-full w-full rounded-lg bg-gray-800 z-0 ${markerRef.current ? 'cursor-move' : 'cursor-default'}`} 
            />
            
            <div className="absolute top-3 left-14 z-[1000] w-[calc(100%-8rem)] md:w-80 pointer-events-none">
                <div className="relative pointer-events-auto shadow-lg rounded-lg">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                        {isSearching ? <LoaderIcon className="w-4 h-4" /> : <SearchIcon className="w-4 h-4" />}
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
                <button onClick={onToggleTheme} className={btnClass} title="Сменить тему">
                    {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
                </button>
                <button onClick={isExpanded ? onCollapse : onExpand} className={btnClass} title={isExpanded ? "Свернуть" : "Развернуть"}>
                    {isExpanded ? <MinimizeIcon className="w-5 h-5" /> : <MaximizeIcon className="w-5 h-5" />}
                </button>
            </div>
        </div>
    );
};

// --- Main Component: AddressEditModal ---
const AddressEditModal: React.FC<AddressEditModalProps> = ({ isOpen, onClose, onBack, data, onDataUpdate, onStartPolling, onDelete, globalTheme = 'dark' }) => {
    // State
    const [editedAddress, setEditedAddress] = useState('');
    const [comment, setComment] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [lastUpdatedStr, setLastUpdatedStr] = useState<string | null>(null);
    const [history, setHistory] = useState<string[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [manualCoords, setManualCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [mapTheme, setMapTheme] = useState<Theme>(globalTheme);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    
    // Polling State
    const [pollingTarget, setPollingTarget] = useState<{ rm: string, address: string } | null>(null);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const attemptsRef = useRef(0); // FIXED: Use Ref for attempts to persist across renders

    // Refs
    const isCommentTouched = useRef(false);
    const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- Effect 1: Init Data & Theme ---
    useEffect(() => {
        if (!isOpen) return;
        setMapTheme(globalTheme);

        if (data) {
            const originalRow = getSafeOriginalRow(data);
            
            // 1. Resolve Address
            let currentAddress = '';
            const isUnidentifiedRow = (item: any): item is UnidentifiedRow => item.originalIndex !== undefined;

            if (isUnidentifiedRow(data)) {
                const rawAddress = findAddressInRow(originalRow) || '';
                let distributor = findValueInRow(originalRow, ['дистрибьютор', 'distributor', 'партнер']);
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

            // 2. Set State
            setEditedAddress(currentAddress);
            setComment((data as MapPoint).comment || '');
            isCommentTouched.current = false;
            setManualCoords(null);
            setIsMapExpanded(false);
            setShowDeleteConfirm(false);
            setPollingTarget(null);
            attemptsRef.current = 0;

            // 3. Set Status (Initial)
            const pt = data as MapPoint;
            if (pt.geocodingError) {
                setStatus('idle');
                setError(pt.geocodingError);
            } else if (pt.isGeocoding) {
                setStatus('geocoding');
                setError(null);
                // Resume polling if it was geocoding
                const rm = findValueInRow(originalRow, ['рм']);
                if (rm && currentAddress) {
                    setPollingTarget({ rm: rm || 'Unknown_RM', address: currentAddress });
                }
            } else {
                setStatus('idle');
                setError(null);
            }

            if (pt.lastUpdated) {
                setLastUpdatedStr(new Date(pt.lastUpdated).toLocaleString('ru-RU'));
            } else {
                setLastUpdatedStr(null);
            }

            // 4. Fetch History
            const rm = findValueInRow(originalRow, ['рм']) || 'Unknown_RM';
            if (rm && currentAddress) {
                const isRecent = pt.lastUpdated && (Date.now() - pt.lastUpdated < 3000);
                if (!isRecent) {
                    fetchHistory(rm, currentAddress);
                }
            } else {
                setHistory([]);
            }
        }
    }, [isOpen, data, globalTheme]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    // --- UPDATED POLLING LOGIC ---
    useEffect(() => {
        if (!pollingTarget) return;

        // Clear any existing interval to prevent double polling
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        setStatus('geocoding');
        attemptsRef.current = 0;
        
        const maxAttempts = 60; // 5 minutes (5s * 60)

        // Initial check immediately, then poll
        const checkCoordinates = async () => {
            attemptsRef.current++;
            try {
                // Add timestamp to prevent browser caching
                const timestamp = Date.now();
                const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(pollingTarget.rm)}&address=${encodeURIComponent(pollingTarget.address)}&_t=${timestamp}`, {
                    headers: { 'Cache-Control': 'no-cache, no-store' }
                });
                
                if (res.ok) {
                    const result = await res.json();
                    
                    // Validate Coords: Ensure they are numbers and not zero
                    const hasValidCoords = typeof result.lat === 'number' && typeof result.lon === 'number' && result.lat !== 0 && result.lon !== 0;

                    if (hasValidCoords) {
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        setPollingTarget(null);
                        
                        // Update UI with new coordinates
                        setManualCoords({ lat: result.lat, lon: result.lon });
                        setStatus('success');
                        
                        // Sync with parent component
                        if (data) {
                            const originalRow = getSafeOriginalRow(data);
                            const originalIndex = (data as UnidentifiedRow).originalIndex;
                            const oldKey = (data as MapPoint).key || normalizeAddress(pollingTarget.address);
                            const rm = findValueInRow(originalRow, ['рм']);
                            
                            const newPoint: MapPoint = {
                                key: normalizeAddress(pollingTarget.address),
                                lat: result.lat,
                                lon: result.lon,
                                status: 'match',
                                name: findValueInRow(originalRow, ['наименование клиента', 'контрагент', 'клиент']) || 'N/A',
                                address: pollingTarget.address,
                                city: 'Определяется...',
                                region: 'Определяется...',
                                rm: rm,
                                brand: findValueInRow(originalRow, ['торговая марка']),
                                packaging: findValueInRow(originalRow, ['фасовка']) || 'Не указана',
                                type: findValueInRow(originalRow, ['канал продаж']),
                                originalRow: originalRow,
                                fact: (data as MapPoint).fact,
                                isGeocoding: false,
                                lastUpdated: Date.now(),
                                comment: result.comment || comment
                            };
                            
                            onDataUpdate(oldKey, newPoint, originalIndex);
                        }
                    }
                }
            } catch (e) {
                console.warn("Polling error (will retry):", e);
            }

            if (attemptsRef.current >= maxAttempts) {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setPollingTarget(null);
                setStatus('error_geocoding');
                setError('Время ожидания координат истекло. Попробуйте ввести вручную.');
            }
        };

        // Check immediately once, then start interval
        checkCoordinates();
        // Start interval - 5000ms (5 seconds)
        pollIntervalRef.current = setInterval(checkCoordinates, 5000);

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [pollingTarget]);


    // --- Fetch History ---
    const fetchHistory = useCallback(async (rmName: string, address: string) => {
        setIsLoadingHistory(true);
        setHistory([]);
        try {
            const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(address)}&t=${Date.now()}`);
            if (res.ok) {
                const result = await res.json();
                if (result.history) {
                    const historyArray = result.history.split(/\s*\|\|\s*/).filter(Boolean);
                    setHistory(historyArray);
                }
                if (result.comment && !comment && !isCommentTouched.current) {
                    setComment(result.comment);
                }
            }
        } catch (e) {
            console.error("Failed to fetch history", e);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [comment]);

    // --- Handlers ---
    const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setComment(e.target.value);
        isCommentTouched.current = true;
    };

    const handleSave = async () => {
        if (!data) return;
        const originalRow = getSafeOriginalRow(data);
        const originalIndex = (data as UnidentifiedRow).originalIndex;
        const oldAddress = (data as MapPoint).address || findAddressInRow(originalRow) || '';
        const currentComment = (data as MapPoint).comment || '';
        const oldKey = (data as MapPoint).key || normalizeAddress(oldAddress);

        const isAddressChanged = editedAddress.trim() !== '' && editedAddress.trim().toLowerCase() !== oldAddress.trim().toLowerCase();
        const isCoordsChanged = manualCoords !== null;
        const isCommentChanged = comment.trim() !== currentComment.trim();

        if (!isAddressChanged && !isCoordsChanged && !isCommentChanged && typeof originalIndex !== 'number') {
            setStatus('error_saving'); setError('Нет изменений для сохранения.'); return;
        }

        setStatus('saving'); setError(null);

        // FIX: Ensure RM is never empty/undefined to prevent 500 errors
        const rm = findValueInRow(originalRow, ['рм']) || 'Unknown_RM';

        try {
            // 1. API Call: Update Address/Comment
            if (isAddressChanged || isCommentChanged) {
                const res = await fetch('/api/update-address', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rmName: rm, oldAddress, newAddress: editedAddress, comment }),
                });

                if (!res.ok) { 
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || errData.details || 'Ошибка при сохранении.'); 
                }
                
                const timestamp = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                let entryText = '';
                if (isAddressChanged && isCommentChanged) entryText = `Изменен адрес: ${oldAddress}\nНовый комментарий: "${comment}" [${timestamp}]`;
                else if (isAddressChanged) entryText = `Изменен адрес: ${oldAddress} [${timestamp}]`;
                else if (isCommentChanged) entryText = `Добавлен комментарий: "${comment}" [${timestamp}]`;
                if (entryText) setHistory(prev => [entryText, ...prev]);
            }

            // 2. API Call: Manual Coords
            let currentLat = (data as MapPoint).lat;
            let currentLon = (data as MapPoint).lon;
            
            if (manualCoords) {
                currentLat = manualCoords.lat; currentLon = manualCoords.lon;
                await fetch('/api/update-coords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rmName: rm, updates: [{ address: editedAddress, lat: currentLat, lon: currentLon }] })
                });
            }

            // 3. UI Updates & Polling Trigger
            setStatus('success');
            
            const isGeocodingState = isAddressChanged && !manualCoords;
            
            if (isGeocodingState) {
                // START POLLING - Triggers the useEffect above
                setPollingTarget({ rm, address: editedAddress });
            } else {
                if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
                successTimeoutRef.current = setTimeout(() => {
                    setStatus('idle');
                }, 2000);
            }

            // 4. Update Parent State (Optimistic update)
            const updateTimestamp = Date.now();
            let distributor = findValueInRow(originalRow, ['дистрибьютор', 'distributor']);
            const parsed = parseRussianAddress(editedAddress, distributor);

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
                isGeocoding: isGeocodingState, lastUpdated: updateTimestamp, comment,
                geocodingError: undefined 
            };
            
            onDataUpdate(oldKey, tempNewPoint, originalIndex);
            
        } catch (e) {
            console.error("Save Error:", e);
            setStatus('error_saving'); setError((e as Error).message);
        }
    };

    const handleDelete = async () => {
        if (!data) return;
        const originalRow = getSafeOriginalRow(data);
        const addressToDelete = (data as MapPoint).address || findAddressInRow(originalRow) || '';
        const rm = findValueInRow(originalRow, ['рм']) || 'Unknown_RM';
        setStatus('deleting'); setError(null);
        try {
            const res = await fetch('/api/delete-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: rm, address: addressToDelete }),
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.details || 'Ошибка при удалении.'); }
            let keyToDelete = (data as MapPoint).key || normalizeAddress(addressToDelete);
            onDelete(rm, addressToDelete); 
            onClose();
        } catch (e) { setStatus('error_deleting'); setError((e as Error).message); }
    };

    if (!data) return null;

    // --- Computed Values ---
    const clientName = findValueInRow(getSafeOriginalRow(data), ['наименование клиента', 'контрагент', 'клиент']);
    const currentLat = (data as MapPoint).lat;
    const currentLon = (data as MapPoint).lon;
    const detailsToShow = Object.entries(getSafeOriginalRow(data)).map(([key, value]) => ({ key: String(key).trim(), value: String(value).trim() })).filter(item => item.value && item.value !== 'null' && item.key !== '__rowNum__');
    const modalTitle = `Редактирование: ${clientName || 'Неизвестный клиент'}`;
    const isProcessing = status === 'saving' || status === 'deleting';
    
    const displayLat = manualCoords ? manualCoords.lat : currentLat;
    const displayLon = manualCoords ? manualCoords.lon : currentLon;
    
    // FIXED: Robust check for map success (must be non-zero numbers)
    const isMapSuccess = typeof displayLat === 'number' && typeof displayLon === 'number' && displayLat !== 0 && displayLon !== 0 && status !== 'geocoding';

    const isAddressChanged = editedAddress.trim() !== '' && editedAddress.trim().toLowerCase() !== ((data as MapPoint).address || '').toLowerCase();
    const isCoordsChanged = manualCoords !== null;
    const isCommentChanged = comment.trim() !== ((data as MapPoint).comment || '').trim();

    let saveButtonText = "Сохранить изменения";
    if (isAddressChanged) saveButtonText = "Сохранить новый адрес";
    if (isCoordsChanged) saveButtonText = "Сохранить новые координаты";
    if (isAddressChanged && isCoordsChanged) saveButtonText = "Сохранить адрес и координаты";
    if (isCommentChanged && !isAddressChanged && !isCoordsChanged) saveButtonText = "Сохранить комментарий";

    const customFooter = (
        <div className="flex justify-between items-center p-4 bg-gray-900/80 rounded-b-2xl border-t border-gray-700 flex-shrink-0 backdrop-blur-md">
            <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition duration-200 flex items-center gap-2 shadow-sm"><ArrowLeftIcon className="w-4 h-4" /> Назад</button>
            <button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg transition duration-200 shadow-md">Закрыть</button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} footer={customFooter} maxWidth="max-w-7xl" zIndex="z-[9999]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Левая колонка */}
                <div className="flex flex-col gap-6">
                    <div className="bg-gray-900/60 p-5 rounded-2xl border border-gray-700 max-h-[40vh] overflow-y-auto custom-scrollbar shadow-inner">
                        <h4 className="font-bold text-xs uppercase tracking-widest mb-4 text-indigo-400">Исходные данные строки</h4>
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-gray-800">
                                {detailsToShow.map(({ key, value }, index) => (
                                    <tr key={index} className="group">
                                        <td className="py-2.5 pr-4 text-gray-500 font-medium align-top w-1/3 group-hover:text-gray-400 transition-colors">{key}</td>
                                        <td className="py-2.5 text-gray-300 break-words leading-relaxed">{value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-gray-900/60 p-5 rounded-2xl border border-gray-700 flex-grow flex flex-col shadow-inner">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-xs uppercase tracking-widest text-gray-400 flex items-center gap-2">История изменений {isLoadingHistory && <LoaderIcon className="w-3 h-3" />}</h4>
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-800 px-2 py-1 rounded-md border border-gray-700 uppercase">Всего: {history.length}</span>
                        </div>
                        <div className="flex-grow overflow-y-auto custom-scrollbar rounded-xl bg-black/20 p-2 border border-white/5 min-h-[140px]">
                            {history.length > 0 ? (
                                <ul className="space-y-3">
                                    {history.map((item, idx) => (
                                        <li key={idx} className="p-3 bg-gray-800/40 rounded-lg border border-gray-700/50 text-sm text-gray-400 flex flex-col gap-1.5 hover:bg-gray-800 transition-colors group">
                                            <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-bold uppercase tracking-tighter"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 group-hover:animate-ping"></span><span>Событие #{history.length - idx}</span></div>
                                            <span className="pl-3 border-l border-gray-700 text-gray-300 break-words whitespace-pre-wrap leading-relaxed">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-600 text-sm p-8 opacity-40"><InfoIcon className="w-10 h-10 mb-2" /><span>История изменений пуста</span></div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Правая колонка */}
                <div className="flex flex-col gap-6">
                    <div className="h-72 shadow-2xl rounded-2xl overflow-hidden border border-gray-700 bg-gray-900">
                         <SinglePointMap 
                            lat={displayLat} lon={displayLon} address={editedAddress} 
                            isSuccess={isMapSuccess}
                            onCoordinatesChange={(lat, lon) => setManualCoords({ lat, lon })}
                            theme={mapTheme} onToggleTheme={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                            onExpand={() => setIsMapExpanded(true)} isExpanded={false}
                         />
                    </div>
                    
                    <div className="bg-gray-900/60 p-6 rounded-2xl border border-gray-700 shadow-xl relative flex flex-col gap-5">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-xs uppercase tracking-widest text-indigo-300 flex items-center gap-2">
                                <SaveIcon className="w-4 h-4" />
                                Параметры объекта
                            </h4>
                            {!showDeleteConfirm ? (
                                <button onClick={() => setShowDeleteConfirm(true)} className="text-gray-500 hover:text-red-400 transition-colors p-2 hover:bg-red-500/10 rounded-full" title="Удалить запись"><TrashIcon className="w-4 h-4" /></button>
                            ) : (
                                <div className="flex items-center gap-3 bg-red-900/30 px-3 py-1.5 rounded-xl border border-red-500/30 animate-fade-in"><span className="text-[10px] font-bold text-red-300 uppercase">Удалить?</span><button onClick={handleDelete} className="text-[10px] bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg font-bold uppercase transition-all shadow-md">Да</button><button onClick={() => setShowDeleteConfirm(false)} className="text-[10px] bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg font-bold uppercase transition-all">Нет</button></div>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            <div className="relative">
                                <label htmlFor="address-input" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 ml-1">Адрес ТТ LimKorm</label>
                                <textarea id="address-input" rows={2} value={editedAddress} onChange={e => setEditedAddress(e.target.value)} disabled={isProcessing || status === 'geocoding' || status === 'success'} className={`w-full p-4 bg-black/40 border rounded-xl focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 transition-all duration-300 text-sm text-gray-100 shadow-inner resize-none ${status === 'success' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : (error ? 'border-red-500 ring-2 ring-red-500/20' : 'border-gray-700 hover:border-gray-600')}`} />
                                {status === 'success' && <CheckIcon className="absolute right-4 top-10 text-emerald-400 animate-bounce w-6 h-6" />}
                            </div>

                            <div className="relative">
                                <label htmlFor="comment-input" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 ml-1">Заметка менеджера</label>
                                <textarea id="comment-input" rows={2} value={comment} onChange={handleCommentChange} disabled={isProcessing || status === 'geocoding' || status === 'success'} placeholder="Добавьте важный комментарий..." className="w-full p-4 bg-black/40 border border-gray-700 hover:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 transition-all duration-300 text-sm text-gray-100 shadow-inner resize-none" />
                            </div>

                            {lastUpdatedStr && <div className="text-[10px] text-gray-500 text-right italic -mt-1 uppercase tracking-tighter">Обновлено: {lastUpdatedStr}</div>}
                            
                            <div className="pt-2">
                                {status === 'idle' && !error && (
                                    <button onClick={handleSave} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-indigo-900/40 active:scale-[0.98]">
                                        <SaveIcon className="w-5 h-5" /> {saveButtonText}
                                    </button>
                                )}
                                
                                {status === 'success' && (
                                    <div className="w-full bg-emerald-600 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-900/40 animate-pulse">
                                        <CheckIcon className="w-6 h-6" /> Сохранено успешно!
                                    </div>
                                )}
                                
                                {status === 'saving' && (
                                    <div className="w-full bg-gray-800/80 py-4 rounded-xl border border-gray-700 text-center text-indigo-400 flex items-center justify-center gap-3 font-bold shadow-sm">
                                        <LoaderIcon className="w-5 h-5 animate-spin" /> Сохранение...
                                    </div>
                                )}
                                
                                {status === 'deleting' && (
                                    <div className="w-full bg-red-900/10 py-4 rounded-xl border border-red-900/30 text-center text-red-500 flex items-center justify-center gap-3 font-bold animate-pulse">
                                        <LoaderIcon className="w-5 h-5" /> Удаление объекта...
                                    </div>
                                )}

                                {status === 'geocoding' && !error && (
                                    <div className="flex flex-col gap-4 p-5 bg-indigo-900/20 rounded-2xl border border-indigo-500/30 animate-pulse shadow-inner">
                                        <div className="text-center text-indigo-300 flex items-center justify-center gap-3 font-bold text-sm">
                                            <LoaderIcon className="w-4 h-4" /> 
                                            <span>Ожидание координат от Google (5s)...</span>
                                        </div>
                                        <p className="text-center text-[10px] leading-relaxed text-gray-500 px-4 italic uppercase tracking-tighter">
                                            Запрос передан. Система проверяет таблицу каждые 5 секунд.
                                        </p>
                                    </div>
                                )}

                                {(status === 'error_saving' || status === 'error_deleting' || status === 'error_geocoding') && (
                                    <div className="text-center space-y-4 animate-fade-in">
                                        <div className="flex items-center justify-center gap-3 text-red-400 text-xs bg-red-900/20 p-3 rounded-xl border border-red-500/20 shadow-inner">
                                            <ErrorIcon className="w-4 h-4" /> {error || 'Сбой соединения'}
                                        </div>
                                        {status !== 'error_deleting' && (
                                            <button onClick={handleSave} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all">
                                                <RetryIcon className="w-4 h-4" /> Повторить попытку
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Modal Map Expanded */}
            {isMapExpanded && (
                <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-fade-in">
                    <div className="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-800 backdrop-blur-md">
                        <div className="flex flex-col">
                            <h3 className="text-lg font-bold text-white uppercase tracking-wider">Уточнение координат</h3>
                            <span className="text-xs text-gray-500 truncate max-w-lg">{editedAddress}</span>
                        </div>
                        <button onClick={() => setIsMapExpanded(false)} className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-xl transition-all border border-gray-700 font-bold text-sm">Закрыть карту</button>
                    </div>
                    <div className="flex-grow relative">
                        <SinglePointMap 
                            lat={displayLat} lon={displayLon} address={editedAddress} 
                            isSuccess={isMapSuccess}
                            onCoordinatesChange={(lat, lon) => setManualCoords({ lat, lon })}
                            theme={mapTheme} onToggleTheme={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                            onCollapse={() => setIsMapExpanded(false)} isExpanded={true}
                        />
                    </div>
                    <div className="p-5 bg-gray-900 border-t border-gray-800 flex justify-between items-center backdrop-blur-md">
                         <div className="text-xs text-gray-500 uppercase tracking-widest flex items-center gap-2">
                             <InfoIcon className="w-4 h-4 text-indigo-400" />
                             Перетащите маркер в нужное место. Координаты обновятся мгновенно.
                         </div>
                         <button onClick={() => setIsMapExpanded(false)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-10 rounded-xl shadow-lg transition-all active:scale-95">Применить</button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default AddressEditModal;
