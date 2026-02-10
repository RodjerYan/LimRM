import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from './Modal';
import { MapPoint, UnidentifiedRow } from '../types';
import { findAddressInRow, findValueInRow, normalizeAddress } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';
import {
  LoaderIcon,
  SaveIcon,
  ErrorIcon,
  RetryIcon,
  ArrowLeftIcon,
  TrashIcon,
  CheckIcon,
  InfoIcon,
  MaximizeIcon,
  MinimizeIcon,
  SunIcon,
  MoonIcon,
  SearchIcon,
  SyncIcon,
} from './icons';

// --- Fix Leaflet Icons (Aligned to v1.9.4) ---
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// --- Types ---
type EditableData = MapPoint | UnidentifiedRow;
type Status =
  | 'idle'
  | 'saving'
  | 'success'
  | 'geocoding'
  | 'deleting'
  | 'error_saving'
  | 'error_geocoding'
  | 'error_deleting'
  | 'success_geocoding'
  | 'syncing';
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
  // Updated signature to accept options
  onDataUpdate: (oldKey: string, newPoint: MapPoint, originalIndex?: number, options?: { skipHistory?: boolean }) => void;
  // Updated signature to accept originalAddress
  onStartPolling: (
    rmName: string,
    address: string,
    oldKey: string,
    basePoint: MapPoint,
    originalIndex?: number,
    originalAddress?: string
  ) => void;
  onDelete: (rm: string, address: string) => void;
  globalTheme?: Theme;
}

// --- Safe Data Getter ---
const getSafeOriginalRow = (data: EditableData | null): any => {
  if (!data) return {};
  const rawRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
  return rawRow && typeof rawRow === 'object' ? rawRow : {};
};

// --- Helper to reliably get RM Name ---
const getRmName = (data: EditableData | null): string => {
  if (!data) return '';
  if ('rm' in data && data.rm) return data.rm;
  const row = getSafeOriginalRow(data);
  return findValueInRow(row, ['рм', 'региональный менеджер', 'менеджер', 'manager', 'ответственный']) || '';
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

  const [hasMarker, setHasMarker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const lightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  // 1. Initialize Map
  useLayoutEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      scrollWheelZoom: true,
      zoomControl: false,
      center: [55.75, 37.61],
      zoom: 5,
      attributionControl: false,
    });
    mapRef.current = map;
    L.control.zoom({ position: 'topleft' }).addTo(map);

    requestAnimationFrame(() => {
      map.invalidateSize();
      setTimeout(() => map.invalidateSize(), 200);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // 2. Handle Theme Updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const newUrl = theme === 'dark' ? darkUrl : lightUrl;
    tileLayerRef.current = L.tileLayer(newUrl, { attribution: '&copy; CARTO' }).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [theme]);

  // 3. Handle Markers & View
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasCoords = typeof lat === 'number' && typeof lon === 'number' && lat !== 0 && lon !== 0;

    if (hasCoords) {
      const latLng = L.latLng(lat!, lon!);
      const iconToUse = isSuccess ? greenIcon : new L.Icon.Default();

      if (!markerRef.current) {
        const marker = L.marker(latLng, {
          icon: iconToUse,
          draggable: true,
          autoPan: true,
        }).addTo(map);

        marker.on('dragend', (e) => {
          const { lat: newLat, lng: newLon } = e.target.getLatLng();
          onCoordinatesChange(newLat, newLon);
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(latLng).setIcon(iconToUse);
      }
      setHasMarker(true);

      const popupContent = `<b>${address}</b><br><span style="font-size:10px; color: #6b7280">Перетащите маркер для уточнения</span>`;
      markerRef.current.bindPopup(popupContent, { maxWidth: 350 });

      map.setView(latLng, isExpanded ? 17 : 14, { animate: true });
    } else {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      setHasMarker(false);
      map.setView([55.75, 37.61], 5, { animate: true });
    }
  }, [lat, lon, isSuccess, isExpanded, address, onCoordinatesChange]);

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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=ru`,
          {
            signal: abortControllerRef.current.signal,
          }
        );
        if (res.ok) {
          const data: NominatimResult[] = await res.json();
          setSearchResults(data);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') console.error(err);
      } finally {
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

  // Light modern buttons (controls)
  const btnClass =
    'flex items-center justify-center w-10 h-10 bg-white/90 hover:bg-gray-100 text-gray-700 rounded-lg shadow-md border border-gray-200 transition-all transform active:scale-95 backdrop-blur-sm';

  return (
    <div className="relative h-full w-full group">
      <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
      <div
        ref={mapContainerRef}
        className={`h-full w-full rounded-lg bg-gray-100 border border-gray-200 z-0 ${
          hasMarker ? 'cursor-move' : 'cursor-default'
        }`}
        style={{ minHeight: '100%' }}
      />

      <div className="absolute top-3 left-3 z-[1000] w-[calc(100%-4rem)] md:w-80 pointer-events-none">
        <div className="relative pointer-events-auto shadow-lg rounded-lg">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
            {isSearching ? <LoaderIcon className="w-4 h-4" /> : <SearchIcon className="w-4 h-4" />}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Поиск места на карте..."
            className="w-full py-2 pl-10 pr-4 bg-white/90 backdrop-blur text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 shadow-sm transition-all"
          />
          {searchResults.length > 0 && (
            <ul className="absolute mt-1 w-full bg-white backdrop-blur border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar z-[1050]">
              {searchResults.map((res, idx) => (
                <li
                  key={idx}
                  onClick={() => selectResult(res)}
                  className="px-4 py-2 text-sm text-gray-800 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer border-b border-gray-200 last:border-0 transition-colors"
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
        <button onClick={isExpanded ? onCollapse : onExpand} className={btnClass} title={isExpanded ? 'Свернуть' : 'Развернуть'}>
          {isExpanded ? <MinimizeIcon className="w-5 h-5" /> : <MaximizeIcon className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

// --- Main Component: AddressEditModal ---
const AddressEditModal: React.FC<AddressEditModalProps> = ({
  isOpen,
  onClose,
  onBack,
  data,
  onDataUpdate,
  onStartPolling,
  onDelete,
  globalTheme = 'light',
}) => {
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

  const isCommentTouched = useRef(false);

  const prevKeyRef = useRef<string | number | undefined>(undefined);

  const fetchHistory = async (rm: string, address: string) => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch(`/api/get-history?rm=${encodeURIComponent(rm)}&address=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error('Ошибка загрузки истории');
      const json = await res.json();
      setHistory(Array.isArray(json.history) ? json.history : []);
    } catch (e) {
      console.warn('History load error:', e);
      setHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // --- Effect 1: Init Data & Theme ---
  useEffect(() => {
    if (!isOpen) return;
    setMapTheme(globalTheme);

    if (data) {
      const originalRow = getSafeOriginalRow(data);

      let currentAddress = '';
      const isUnidentifiedRow = (item: any): item is UnidentifiedRow => item.originalIndex !== undefined;

      if (isUnidentifiedRow(data)) {
        const rawAddress = findAddressInRow(originalRow) || '';
        let distributor = findValueInRow(originalRow, ['дистрибьютор', 'distributor', 'партнер']);
        if (!distributor) {
          const values = Object.values(originalRow);
          const possibleDistributor = values.find((v) => typeof v === 'string' && v.includes('(') && v.includes(')'));
          if (possibleDistributor) distributor = String(possibleDistributor);
        }
        const parsed = parseRussianAddress(rawAddress, distributor);
        currentAddress = parsed.finalAddress || rawAddress;
      } else {
        currentAddress = (data as MapPoint).address;
      }

      const currentKey = (data as MapPoint).key || (data as UnidentifiedRow).originalIndex;

      if (currentKey !== prevKeyRef.current) {
        setEditedAddress(currentAddress);
        setComment((data as MapPoint).comment || '');
        isCommentTouched.current = false;
        setManualCoords(null);
        setIsMapExpanded(false);
        setShowDeleteConfirm(false);
        setStatus('idle');
        setError(null);

        const pt = data as MapPoint;
        if (pt.lastUpdated) {
          setLastUpdatedStr(new Date(pt.lastUpdated).toLocaleString('ru-RU'));
        } else {
          setLastUpdatedStr(null);
        }

        const rm = getRmName(data);
        if (rm && currentAddress) {
          const isRecent = pt.lastUpdated && Date.now() - pt.lastUpdated < 3000;
          if (!isRecent) fetchHistory(rm, currentAddress);
        } else {
          setHistory([]);
        }
        prevKeyRef.current = currentKey;
      } else {
        const pt = data as MapPoint;
        if (status === 'geocoding') {
          const isStillGeocoding = pt.isGeocoding;
          const hasCoords = pt.lat && pt.lon && pt.lat !== 0;

          if (!isStillGeocoding && hasCoords) {
            setStatus('success_geocoding');
            console.info('✅ [Modal] Polling complete. Coordinates found!');
          }

          if (!isStillGeocoding && !hasCoords && pt.geocodingError) {
            setStatus('error_geocoding');
            setError(pt.geocodingError);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, data, globalTheme]);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComment(e.target.value);
    isCommentTouched.current = true;
  };

  const handleCloudSync = async () => {
    if (!data) return;
    try {
      setStatus('syncing');
      setError(null);

      const originalRow = getSafeOriginalRow(data);
      const rm = getRmName(data);
      const address = (data as MapPoint).address || findAddressInRow(originalRow) || '';

      const res = await fetch(`/api/sync-google?rm=${encodeURIComponent(rm)}&address=${encodeURIComponent(address)}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || 'Ошибка синхронизации');

      if (json?.updatedPoint) {
        onDataUpdate((data as MapPoint).key, json.updatedPoint, (data as any).originalIndex, { skipHistory: true });
      }

      setStatus('idle');
    } catch (e: any) {
      setStatus('error_saving');
      setError(e?.message || 'Ошибка синхронизации');
    }
  };

  const handleSave = async () => {
    if (!data) return;

    setError(null);
    setStatus('saving');

    const originalRow = getSafeOriginalRow(data);
    const oldKey = (data as MapPoint).key || String((data as any).originalIndex);
    const rm = getRmName(data);
    const oldAddress = (data as MapPoint).address || findAddressInRow(originalRow) || '';
    const originalIndex = (data as any).originalIndex;

    if (!rm) {
      setStatus('error_saving');
      setError('Не удалось определить имя РМ. Проверьте исходные данные.');
      return;
    }

    const isAddressChanged = editedAddress.trim() !== '' && editedAddress.trim().toLowerCase() !== oldAddress.toLowerCase();
    const needsGeocoding = isAddressChanged && !manualCoords;
    const updateTimestamp = Date.now();

    let distributor = findValueInRow(originalRow, ['дистрибьютор', 'distributor']);
    const parsed = parseRussianAddress(editedAddress, distributor);

    const baseNewPoint: MapPoint = {
      key: oldKey,
      lat: needsGeocoding ? undefined : manualCoords?.lat || (data as MapPoint).lat,
      lon: needsGeocoding ? undefined : manualCoords?.lon || (data as MapPoint).lon,
      status: 'match',
      name: findValueInRow(originalRow, ['наименование клиенты', 'контрагент', 'клиент']) || 'N/A',
      address: editedAddress,
      city: parsed.city,
      region: parsed.region,
      rm: rm,
      brand: findValueInRow(originalRow, ['торговая марка']),
      packaging: findValueInRow(originalRow, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана',
      type: findValueInRow(originalRow, ['канал продаж']),
      contacts: findValueInRow(originalRow, ['контакты']),
      originalRow: originalRow,
      fact: (data as MapPoint).fact,
      isGeocoding: needsGeocoding,
      lastUpdated: updateTimestamp,
      comment,
      geocodingError: undefined,
    };

    if (needsGeocoding) {
      setStatus('geocoding');
      console.info('📡 [Modal] Starting geocoding polling for:', editedAddress);
      onStartPolling(rm, editedAddress, oldKey, baseNewPoint, originalIndex, oldAddress);
    } else {
      onDataUpdate(oldKey, baseNewPoint, originalIndex);
      setStatus('success');
      setTimeout(() => onClose(), 350);
    }
  };

  const handleDelete = () => {
    if (!data) return;
    const originalRow = getSafeOriginalRow(data);
    const addressToDelete = (data as MapPoint).address || findAddressInRow(originalRow) || '';
    const rm = getRmName(data);

    console.warn('🗑️ [Modal] Delete requested for:', addressToDelete);

    if (!rm) {
      setStatus('error_deleting');
      setError('Не удалось определить имя РМ. Удаление невозможно.');
      return;
    }

    onDelete(rm, addressToDelete);
    onClose();
  };

  if (!data) return null;

  const clientName = findValueInRow(getSafeOriginalRow(data), ['наименование клиента', 'контрагент', 'клиент']);
  const currentLat = (data as MapPoint).lat;
  const currentLon = (data as MapPoint).lon;
  const detailsToShow = Object.entries(getSafeOriginalRow(data))
    .map(([key, value]) => ({ key: String(key).trim(), value: String(value).trim() }))
    .filter((item) => item.value && item.value !== 'null' && item.key !== '__rowNum__');

  const modalTitle = `Редактирование: ${clientName || 'Неизвестный клиент'}`;
  const isProcessing = status === 'saving' || status === 'deleting' || status === 'syncing';

  const displayLat = manualCoords ? manualCoords.lat : currentLat;
  const displayLon = manualCoords ? manualCoords.lon : currentLon;

  const isMapSuccess =
    typeof displayLat === 'number' && typeof displayLon === 'number' && displayLat !== 0 && displayLon !== 0 && status !== 'geocoding';

  let saveButtonText = 'Сохранить изменения';
  const isAddressChanged = editedAddress.trim() !== '' && editedAddress.trim().toLowerCase() !== ((data as MapPoint).address || '').toLowerCase();
  const isCoordsChanged = manualCoords !== null;
  const isCommentChanged = comment.trim() !== ((data as MapPoint).comment || '').trim();

  if (isAddressChanged) saveButtonText = 'Сохранить новый адрес';
  if (isCoordsChanged) saveButtonText = 'Сохранить новые координаты';
  if (isAddressChanged && isCoordsChanged) saveButtonText = 'Сохранить адрес и координаты';
  if (isCommentChanged && !isAddressChanged && !isCoordsChanged) saveButtonText = 'Сохранить комментарий';

  const handleCoordinatesChange = useCallback((lat: number, lon: number) => {
    setManualCoords({ lat, lon });
  }, []);

  const customFooter = (
    <div className="flex justify-between items-center p-4 bg-white/80 rounded-b-2xl border-t border-gray-200 flex-shrink-0 backdrop-blur-md">
      <button
        onClick={onBack}
        className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-6 rounded-lg transition duration-200 flex items-center gap-2 shadow-sm border border-gray-200"
      >
        <ArrowLeftIcon className="w-4 h-4" /> Назад
      </button>
      <button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg transition duration-200 shadow-md">
        Закрыть
      </button>
    </div>
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} footer={customFooter} maxWidth="max-w-7xl" zIndex="z-[9999]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 max-h-[40vh] overflow-y-auto custom-scrollbar shadow-inner">
              <h4 className="font-bold text-xs uppercase tracking-widest mb-4 text-indigo-700">Исходные данные строки</h4>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-200">
                  {detailsToShow.map(({ key, value }, index) => (
                    <tr key={index} className="group">
                      <td className="py-2.5 pr-4 text-gray-500 font-medium align-top w-1/3 group-hover:text-gray-700 transition-colors">
                        {key}
                      </td>
                      <td className="py-2.5 text-gray-800 break-words leading-relaxed">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 flex-grow flex flex-col shadow-inner">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-xs uppercase tracking-widest text-gray-600 flex items-center gap-2">
                  История изменений {isLoadingHistory && <LoaderIcon className="w-3 h-3" />}
                </h4>
                <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md border border-gray-200 uppercase">
                  Всего: {history.length}
                </span>
              </div>

              <div className="flex-grow overflow-y-auto custom-scrollbar rounded-xl bg-gray-50 p-2 border border-gray-200 min-h-[140px]">
                {history.length > 0 ? (
                  <ul className="space-y-3">
                    {history.map((item, idx) => (
                      <li
                        key={idx}
                        className="p-3 bg-white rounded-lg border border-gray-200 text-sm text-gray-600 flex flex-col gap-1.5 hover:bg-gray-50 transition-colors group"
                      >
                        <div className="flex items-center gap-2 text-indigo-700 text-[10px] font-bold uppercase tracking-tighter">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 group-hover:animate-ping"></span>
                          <span>Событие #{history.length - idx}</span>
                        </div>
                        <span className="pl-3 border-l border-gray-200 text-gray-800 break-words whitespace-pre-wrap leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm p-8">
                    <InfoIcon className="w-10 h-10 mb-2" />
                    <span>История изменений пуста</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-6">
            <div className="h-72 shadow-2xl rounded-2xl overflow-hidden border border-gray-200 bg-white">
              <SinglePointMap
                lat={displayLat}
                lon={displayLon}
                address={editedAddress}
                isSuccess={isMapSuccess}
                onCoordinatesChange={handleCoordinatesChange}
                theme={mapTheme}
                onToggleTheme={() => setMapTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                onExpand={() => setIsMapExpanded(true)}
                isExpanded={isMapExpanded}
              />
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xl relative flex flex-col gap-5">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-xs uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                  <SaveIcon className="w-4 h-4" />
                  Параметры объекта
                </h4>

                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-gray-500 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-full flex items-center gap-2 group"
                    title="Удалить запись"
                  >
                    <TrashIcon className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase hidden group-hover:inline">Удалить</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200 animate-fade-in">
                    <span className="text-[10px] font-bold text-red-700 uppercase">Удалить из базы?</span>
                    <button
                      onClick={handleDelete}
                      className="text-[10px] bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg font-bold uppercase transition-all shadow-md"
                    >
                      Да
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-[10px] bg-white hover:bg-gray-50 text-gray-700 px-3 py-1 rounded-lg font-bold uppercase transition-all border border-gray-200"
                    >
                      Нет
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <label htmlFor="address-input" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 ml-1">
                    Адрес ТТ LimKorm
                  </label>
                  <textarea
                    id="address-input"
                    rows={2}
                    value={editedAddress}
                    onChange={(e) => setEditedAddress(e.target.value)}
                    disabled={isProcessing || status === 'geocoding' || status === 'success'}
                    className={`w-full p-4 bg-white border rounded-xl focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 transition-all duration-300 text-sm text-gray-900 shadow-sm resize-none ${
                      status === 'success'
                        ? 'border-emerald-400 ring-2 ring-emerald-200'
                        : error
                        ? 'border-red-300 ring-2 ring-red-200'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  />
                  {status === 'success' && <CheckIcon className="absolute right-4 top-10 text-emerald-600 animate-bounce w-6 h-6" />}
                </div>

                <div className="relative pt-1">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex gap-4 w-full">
                      <div className="w-1/2">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 ml-1">Широта (Lat)</label>
                        <input
                          type="text"
                          readOnly
                          value={displayLat ? displayLat.toFixed(6) : '—'}
                          className="w-full p-2 bg-white border border-gray-300 rounded-lg text-sm font-mono text-gray-700 text-center"
                        />
                      </div>
                      <div className="w-1/2">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 ml-1">Долгота (Lon)</label>
                        <input
                          type="text"
                          readOnly
                          value={displayLon ? displayLon.toFixed(6) : '—'}
                          className="w-full p-2 bg-white border border-gray-300 rounded-lg text-sm font-mono text-gray-700 text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCloudSync}
                    disabled={isProcessing}
                    className="w-full mt-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    title="Проверить координаты в Google Таблице и обновить, если они отличаются"
                  >
                    <SyncIcon small />
                    Синхронизировать с Google (Проверка координат)
                  </button>
                </div>

                <div className="relative">
                  <label htmlFor="comment-input" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 ml-1">
                    Заметка менеджера
                  </label>
                  <textarea
                    id="comment-input"
                    rows={2}
                    value={comment}
                    onChange={handleCommentChange}
                    disabled={isProcessing || status === 'geocoding' || status === 'success'}
                    placeholder="Добавьте важный комментарий..."
                    className="w-full p-4 bg-white border border-gray-300 hover:border-gray-400 rounded-xl focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 transition-all duration-300 text-sm text-gray-900 shadow-sm resize-none"
                  />
                </div>

                {lastUpdatedStr && (
                  <div className="text-[10px] text-gray-500 text-right italic -mt-1 uppercase tracking-tighter">Обновлено: {lastUpdatedStr}</div>
                )}

                <div className="pt-2">
                  {(status === 'idle' || status === 'success') && !error && (
                    <button
                      onClick={handleSave}
                      disabled={status === 'success'}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg active:scale-[0.98] disabled:bg-emerald-600 disabled:cursor-not-allowed"
                    >
                      {status === 'success' ? (
                        <>
                          <CheckIcon className="w-6 h-6" /> Сохранено!
                        </>
                      ) : (
                        <>
                          <SaveIcon className="w-5 h-5" /> {saveButtonText}
                        </>
                      )}
                    </button>
                  )}

                  {status === 'saving' && (
                    <div className="w-full bg-gray-50 py-4 rounded-xl border border-gray-200 text-center text-indigo-700 flex items-center justify-center gap-3 font-bold shadow-sm">
                      <LoaderIcon className="w-5 h-5 animate-spin" /> Сохранение...
                    </div>
                  )}

                  {status === 'syncing' && (
                    <div className="w-full bg-blue-50 py-4 rounded-xl border border-blue-200 text-center text-blue-700 flex items-center justify-center gap-3 font-bold animate-pulse shadow-sm">
                      <LoaderIcon className="w-5 h-5 animate-spin" /> Проверка в Google...
                    </div>
                  )}

                  {status === 'deleting' && (
                    <div className="w-full bg-red-50 py-4 rounded-xl border border-red-200 text-center text-red-700 flex items-center justify-center gap-3 font-bold animate-pulse">
                      <LoaderIcon className="w-5 h-5" /> Удаление объекта...
                    </div>
                  )}

                  {status === 'geocoding' && (
                    <div className="flex flex-col gap-4 p-5 bg-indigo-50 rounded-2xl border border-indigo-200 animate-pulse shadow-inner">
                      <div className="text-center text-indigo-700 flex items-center justify-center gap-3 font-bold text-sm">
                        <LoaderIcon className="w-4 h-4" />
                        <span>Ожидание координат (Polling)...</span>
                      </div>
                      <p className="text-center text-[10px] leading-relaxed text-gray-500 px-4 italic uppercase tracking-tighter">
                        Запрос отправлен. Система ждет ответ от геокодера...
                      </p>
                    </div>
                  )}

                  {status === 'success_geocoding' && (
                    <div className="w-full bg-emerald-50 py-4 rounded-xl border border-emerald-200 text-center text-emerald-700 flex flex-col items-center justify-center gap-2 font-bold shadow-sm animate-bounce-in">
                      <div className="flex items-center gap-2">
                        <CheckIcon className="w-6 h-6" />
                        <span>Координаты обновлены!</span>
                      </div>
                      <div className="text-[10px] font-normal text-emerald-600/70 uppercase tracking-widest">Точка появилась на карте</div>
                    </div>
                  )}

                  {(status === 'error_saving' || status === 'error_deleting' || status === 'error_geocoding') && (
                    <div className="text-center space-y-4 animate-fade-in">
                      <div className="flex items-center justify-center gap-3 text-red-700 text-xs bg-red-50 p-3 rounded-xl border border-red-200 shadow-inner">
                        <ErrorIcon className="w-4 h-4" /> {error || 'Сбой соединения'}
                      </div>
                      {status !== 'error_deleting' && (
                        <button
                          onClick={handleSave}
                          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all border border-gray-200"
                        >
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
      </Modal>

      {isMapExpanded && (
        <div className="fixed inset-0 z-[10000] bg-white/90 backdrop-blur-md flex flex-col animate-fade-in">
          <div className="flex justify-between items-center p-4 bg-white border-b border-gray-200 backdrop-blur-md">
            <div className="flex flex-col">
              <h3 className="text-lg font-bold text-gray-900 uppercase tracking-wider">Уточнение координат</h3>
              <span className="text-xs text-gray-500 truncate max-w-lg">{editedAddress}</span>
            </div>
            <button
              onClick={() => setIsMapExpanded(false)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2 rounded-xl transition-all border border-gray-200 font-bold text-sm"
            >
              Закрыть карту
            </button>
          </div>

          <div className="flex-grow relative">
            <SinglePointMap
              lat={displayLat}
              lon={displayLon}
              address={editedAddress}
              isSuccess={isMapSuccess}
              onCoordinatesChange={handleCoordinatesChange}
              theme={mapTheme}
              onToggleTheme={() => setMapTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              onCollapse={() => setIsMapExpanded(false)}
              isExpanded={true}
            />
          </div>

          <div className="p-5 bg-white border-t border-gray-200 flex justify-between items-center backdrop-blur-md">
            <div className="text-xs text-gray-600 uppercase tracking-widest flex items-center gap-2">
              <InfoIcon className="w-4 h-4 text-indigo-600" />
              Перетащите маркер в нужное место. Координаты обновятся мгновенно.
            </div>
            <button
              onClick={() => setIsMapExpanded(false)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-10 rounded-xl shadow-lg transition-all active:scale-95"
            >
              Применить
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AddressEditModal;
