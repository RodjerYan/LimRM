
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { MapPoint, UnidentifiedRow } from '../types';
import { findAddressInRow, findValueInRow, normalizeAddress, detectChannelByName } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';
import { useAuth } from './auth/AuthContext';
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
  ChannelIcon,
  SendIcon,
} from './icons';

// ... (Leaflet icons setup same) ...
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
  onDataUpdate: (oldKey: string, newPoint: MapPoint, originalIndex?: number, options?: { skipHistory?: boolean, reason?: string, type?: 'delete' | 'comment' | 'delete_comment', originalTimestamp?: number }) => void;
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

const SALES_CHANNELS = [
    'Зоо розница',
    'FMCG',
    'Интернет-канал',
    'Бридер канал',
    'Ветеринарный канал',
    'Специализированный канал',
    'Не определен'
];

const isUnidentifiedRow = (item: any): item is UnidentifiedRow => item && item.originalIndex !== undefined;

const getSafeOriginalRow = (data: EditableData | null): any => {
  if (!data) return {};
  const rawRow = (data as MapPoint).originalRow || (data as UnidentifiedRow).rowData;
  return rawRow && typeof rawRow === 'object' ? rawRow : {};
};

const getRmName = (data: EditableData | null): string => {
  if (!data) return '';
  let val = '';
  if ('rm' in data && (data as any).rm) val = String((data as any).rm);
  else {
    const row = getSafeOriginalRow(data);
    val = findValueInRow(row, ['рм', 'региональный менеджер', 'менеджер', 'manager', 'ответственный']) || '';
  }
  return val.trim();
};

// ... (Glow, Card, Chip, Btn components same) ...
const Glow = () => (
  <div
    className="pointer-events-none absolute inset-0 opacity-70"
    style={{
      background:
        'radial-gradient(900px 520px at 20% 10%, rgba(99,102,241,0.16), transparent 60%),' +
        'radial-gradient(880px 520px at 72% 18%, rgba(34,211,238,0.14), transparent 60%),' +
        'radial-gradient(950px 560px at 40% 92%, rgba(163,230,53,0.12), transparent 60%)',
    }}
  />
);

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div
    className={
      'rounded-3xl border border-slate-200/70 bg-white/75 backdrop-blur-xl ' +
      'shadow-[0_18px_50px_rgba(15,23,42,0.08)] ' +
      className
    }
  >
    {children}
  </div>
);

const Chip: React.FC<{ tone?: 'neutral' | 'lime' | 'blue' | 'pink' | 'red'; children: React.ReactNode }> = ({
  tone = 'neutral',
  children,
}) => {
  const map: Record<string, string> = {
    neutral: 'bg-slate-900/5 text-slate-700 border-slate-200',
    lime: 'bg-lime-400/20 text-lime-800 border-lime-300/40',
    blue: 'bg-sky-400/20 text-sky-800 border-sky-300/40',
    pink: 'bg-fuchsia-400/20 text-fuchsia-800 border-fuchsia-300/40',
    red: 'bg-red-400/15 text-red-700 border-red-300/40',
  };
  return (
    <span className={`inline-flex items-center rounded-xl border px-2.5 py-1 text-[11px] font-extrabold ${map[tone]}`}>
      {children}
    </span>
  );
};

const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger' }
> = ({ variant = 'soft', className = '', children, ...props }) => {
  const base =
    'rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
  const v =
    variant === 'primary'
      ? 'bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-[0_14px_40px_rgba(99,102,241,0.22)] hover:from-indigo-500 hover:to-sky-400'
      : variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_14px_40px_rgba(239,68,68,0.18)]'
      : variant === 'ghost'
      ? 'bg-transparent hover:bg-slate-900/5 text-slate-700'
      : 'bg-slate-900/5 hover:bg-slate-900/7 text-slate-800 border border-slate-200';
  return (
    <button {...props} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  );
};

// ... (SinglePointMap component same) ...
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
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const lightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const newUrl = theme === 'dark' ? darkUrl : lightUrl;
    tileLayerRef.current = L.tileLayer(newUrl, { attribution: '&copy; CARTO' }).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasCoords = typeof lat === 'number' && typeof lon === 'number' && lat !== 0 && lon !== 0;

    if (hasCoords) {
      const latLng = L.latLng(lat!, lon!);
      const iconToUse = isSuccess ? greenIcon : new L.Icon.Default();

      if (!markerRef.current) {
        const marker = L.marker(latLng, { icon: iconToUse, draggable: true, autoPan: true }).addTo(map);
        marker.on('dragend', (e) => {
          const { lat: newLat, lng: newLon } = e.target.getLatLng();
          onCoordinatesChange(newLat, newLon);
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(latLng).setIcon(iconToUse);
      }
      const popup = `<b>${address}</b><br><span style="font-size:10px; color:#64748b">Перетащите маркер для уточнения</span>`;
      markerRef.current.bindPopup(popup, { maxWidth: 360 });
      map.setView(latLng, isExpanded ? 17 : 14, { animate: true });
    } else {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
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
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=ru`,
          { signal: abortControllerRef.current.signal }
        );
        if (res.ok) {
          const data: NominatimResult[] = await res.json();
          setSearchResults(data);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') console.error(err);
      } finally {
        setIsSearching(false);
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

  const ctrlBtn =
    'flex items-center justify-center w-10 h-10 rounded-2xl border border-slate-200 bg-white/85 hover:bg-white text-slate-700 shadow-[0_14px_40px_rgba(15,23,42,0.10)] transition-all active:scale-[0.98] backdrop-blur';

  return (
    <div className="relative h-full w-full">
      <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
      <div ref={mapContainerRef} className="h-full w-full rounded-2xl bg-slate-100 border border-slate-200" style={{ minHeight: '100%' }} />
      <div className="absolute top-3 left-3 z-[1000] w-[calc(100%-4rem)] md:w-96">
        <div className="relative rounded-2xl shadow-[0_18px_50px_rgba(15,23,42,0.10)]">
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 pointer-events-none">
            {isSearching ? <LoaderIcon className="w-4 h-4" /> : <SearchIcon className="w-4 h-4" />}
          </div>
          <input
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Поиск места на карте…"
            className="w-full rounded-2xl border border-slate-200 bg-white/90 backdrop-blur px-4 py-3 pl-11 text-sm font-bold text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition"
          />
          {searchResults.length > 0 && (
            <ul className="absolute mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)] max-h-64 overflow-y-auto custom-scrollbar">
              {searchResults.map((r, idx) => (
                <li key={idx} onClick={() => selectResult(r)} className="px-4 py-3 text-sm text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer border-b border-slate-200 last:border-0">{r.display_name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button onClick={onToggleTheme} className={ctrlBtn} title="Сменить тему карты">{theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}</button>
        <button onClick={isExpanded ? onCollapse : onExpand} className={ctrlBtn} title={isExpanded ? 'Свернуть' : 'Развернуть'}>{isExpanded ? <MinimizeIcon className="w-5 h-5" /> : <MaximizeIcon className="w-5 h-5" />}</button>
      </div>
    </div>
  );
};

const AddressEditModal: React.FC<AddressEditModalProps> = ({
  isOpen, onClose, onBack, data, onDataUpdate, onStartPolling, onDelete, globalTheme = 'light',
}) => {
  const { user, token } = useAuth();
  const [editedAddress, setEditedAddress] = useState('');
  const [editedChannel, setEditedChannel] = useState('');
  const [comment, setComment] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lastUpdatedStr, setLastUpdatedStr] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | { user: string; date: string; text: string; timestamp: number })[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [manualCoords, setManualCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [mapTheme, setMapTheme] = useState<Theme>(globalTheme);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  
  // Messenger state
  const [newComment, setNewComment] = useState('');

  const prevKeyRef = useRef<string | number | undefined>(undefined);
  const prevLastUpdatedRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const isPotential = (data as MapPoint)?.status === 'potential';

  const fetchHistory = async (rm: string, address: string) => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch(`/api/get-history?rm=${encodeURIComponent(rm)}&address=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error('Ошибка загрузки истории');
      const json = await res.json();
      setHistory(Array.isArray(json.history) ? json.history : []);
    } catch (e) { console.warn('History load error:', e); setHistory([]); } finally { setIsLoadingHistory(false); }
  };

  useEffect(() => {
    if (!isOpen) return;
    setMapTheme(globalTheme);
    if (!data) return;

    const originalRow = getSafeOriginalRow(data);
    let currentAddress = '';
    let currentChannel = '';

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
      const rowChannel = findValueInRow(originalRow, ['канал продаж', 'тип тт', 'сегмент']);
      const detected = detectChannelByName(findValueInRow(originalRow, ['клиент', 'name']) || '');
      currentChannel = (detected && detected !== 'Не определен') ? detected : (rowChannel || 'Не определен');
    } else {
      currentAddress = (data as MapPoint).address;
      currentChannel = (data as MapPoint).type || 'Не определен';
    }

    const currentKey = (data as MapPoint).key || (data as UnidentifiedRow).originalIndex;

    if (currentKey !== prevKeyRef.current) {
      setEditedAddress(currentAddress);
      setEditedChannel(currentChannel);
      setComment((data as MapPoint).comment || '');
      setDeleteReason('');
      setNewComment('');

      setManualCoords(null);
      setIsMapExpanded(false);
      setShowDeleteConfirm(false);
      setStatus('idle');
      setError(null);

      const pt = data as MapPoint;
      setLastUpdatedStr(pt.lastUpdated ? new Date(pt.lastUpdated).toLocaleString('ru-RU') : null);

      if (isPotential) {
          if (originalRow.changeHistory && Array.isArray(originalRow.changeHistory)) {
              setHistory(originalRow.changeHistory);
          } else {
              setHistory([]);
          }
      } else {
          const rm = getRmName(data);
          if (rm && currentAddress) {
             const isRecent = pt.lastUpdated && Date.now() - pt.lastUpdated < 3000;
             // Fetch if not recent OR if history is empty (to ensure we have it)
             // We also want to refetch if lastUpdated changed (meaning we just saved), 
             // but we need to be careful not to loop. 
             // Since lastUpdated changes only on user action, it's safe to trigger fetch.
             fetchHistory(rm, currentAddress);
          } else {
             if (!rm) console.warn("Cannot fetch history: RM name missing");
             setHistory([]);
          }
      }

      prevKeyRef.current = currentKey;
    } else {
        // Same key, but data might have updated (e.g. lastUpdated changed after save)
        const pt = data as MapPoint;
        
        // Refetch history if lastUpdated changed significantly (implying a save)
        // We use a ref to track the last timestamp we fetched for
        if (!isPotential) {
             const rm = getRmName(data);
             if (rm && currentAddress && pt.lastUpdated && pt.lastUpdated !== prevLastUpdatedRef.current) {
                 // Add a small delay to allow backend write to propagate
                 setTimeout(() => fetchHistory(rm, currentAddress), 500);
                 prevLastUpdatedRef.current = pt.lastUpdated;
             }
        }

        if (status === 'geocoding') {
            // ... existing geocoding logic ...
            const isStillGeocoding = pt.isGeocoding;
            const hasCoords = pt.lat && pt.lon && pt.lat !== 0;
            if (!isStillGeocoding && hasCoords) setStatus('success_geocoding');
            if (!isStillGeocoding && !hasCoords && pt.geocodingError) {
              setStatus('error_geocoding');
              setError(pt.geocodingError);
            }
        }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, data, globalTheme]);

  useEffect(() => {
      // Auto-scroll to bottom of chat
      if (isPotential && chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
  }, [history, isPotential]);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value);
  const handleCoordinatesChange = useCallback((lat: number, lon: number) => setManualCoords({ lat, lon }), []);

  const handleCloudSync = async () => {
    if (!data) return;
    try {
      setStatus('syncing'); setError(null);
      const originalRow = getSafeOriginalRow(data);
      const rm = getRmName(data);
      const address = (data as MapPoint).address || findAddressInRow(originalRow) || '';
      if (!rm) throw new Error('Не удалось определить РМ. Синхронизация невозможна.');
      const res = await fetch(`/api/sync-google?rm=${encodeURIComponent(rm)}&address=${encodeURIComponent(address)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Ошибка синхронизации');
      if (json?.updatedPoint) {
        const name = (data as MapPoint).name || findValueInRow(originalRow, ['наименование', 'клиент']) || 'ТТ';
        const mergedPoint: MapPoint = { ...json.updatedPoint, rm, name, status: (json.updatedPoint.lat && json.updatedPoint.lon) ? 'match' : 'potential' };
        onDataUpdate((data as MapPoint).key || String((data as any).originalIndex), mergedPoint, (data as any).originalIndex, { skipHistory: true });
      }
      setStatus('idle');
    } catch (e: any) { setStatus('error_saving'); setError(e?.message || 'Ошибка синхронизации'); }
  };

  const handleSendComment = async () => {
      if (!newComment.trim() || !data) return;
      
      const oldKey = (data as MapPoint).key;
      const baseNewPoint: MapPoint = { ...(data as MapPoint), comment: newComment, lastUpdated: Date.now() };
      
      const timestamp = Date.now();
      const dateStr = new Date(timestamp).toLocaleString('ru-RU'); // Date + Time
      const userName = user ? `${user.lastName || ''} ${user.firstName || ''}`.trim() || user.email || 'Пользователь' : 'Пользователь';

      const optimisticEntry = {
          user: userName,
          date: dateStr,
          text: newComment,
          timestamp: timestamp
      };
      
      setHistory(prev => [...prev, optimisticEntry]);
      setNewComment('');

      let backendOk = true;

      // Call backend to save comment to Sheet (Persistent)
      try {
          const originalRow = getSafeOriginalRow(data);
          const rm = getRmName(data);
          const address = (data as MapPoint).address || findAddressInRow(originalRow) || '';
          
          if (rm && address) {
              const res = await fetch('/api/get-full-cache?action=update-address', {
                  method: 'POST',
                  headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({
                      rmName: rm,
                      oldAddress: address,
                      newAddress: address, // No change in address
                      comment: newComment,
                      skipHistory: false
                  })
              });
              if (!res.ok) backendOk = false;
          } else {
              backendOk = false;
          }
      } catch (e) {
          console.error("Failed to save comment to backend:", e);
          backendOk = false;
      }

      if (!backendOk) {
          // rollback optimistic entry
          setHistory(prev => prev.filter((h) => {
              if (typeof h === 'object') return h.timestamp !== timestamp;
              return true;
          }));
          setStatus('error_saving');
          setError('Не удалось сохранить комментарий в базе (Google).');
          return;
      }

      // Call parent to save delta (Local/Sync)
      onDataUpdate(oldKey, baseNewPoint, undefined, { type: 'comment' });
  };

  const handleDeleteComment = async (idx: number, item: string | { user: string, date: string, text: string, timestamp: number }) => {
      if (!data) return;
      const oldKey = (data as MapPoint).key;
      
      // Construct entryText for deletion (legacy support)
      let entryText = '';
      let timestamp: number | undefined;
      let commentText: string | undefined;

      if (typeof item === 'string') {
          entryText = item;
      } else {
          // For object items (optimistic), we use timestamp + text matching
          timestamp = item.timestamp;
          commentText = item.text;
          
          // Also construct entryText as fallback if needed, but backend prefers timestamp/text for objects
          const prefix = item.text.startsWith('Комментарий:') ? '' : 'Комментарий: ';
          entryText = `${item.user}: ${prefix}${item.text} [${item.date}]`;
      }

      // Optimistic removal + backup for rollback
      setHistory(prev => {
          const copy = [...prev];
          copy.splice(idx, 1);
          return copy;
      });

      let backendOk = true;

      // Call backend to delete from Sheet
      try {
          const originalRow = getSafeOriginalRow(data);
          const rm = getRmName(data);
          const address = (data as MapPoint).address || findAddressInRow(originalRow) || '';
          
          if (rm && address) {
              const res = await fetch('/api/get-full-cache?action=delete-history-entry', {
                  method: 'POST',
                  headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({
                      rmName: rm,
                      address: address,
                      entryText: entryText,
                      timestamp: timestamp,
                      commentText: commentText
                  })
              });
              if (!res.ok) backendOk = false;
          } else {
              backendOk = false;
          }
      } catch (e) {
          console.error("Failed to delete comment from backend:", e);
          backendOk = false;
      }

      // Rollback UI if backend failed
      if (!backendOk) {
          setHistory(prev => {
              const copy = [...prev];
              copy.splice(idx, 0, item);
              return copy;
          });
          setStatus('error_deleting');
          setError('Не удалось удалить комментарий в базе (Google). Изменение отменено.');
          return;
      }

      // Call parent to save delta (delete_comment)
      const originalTimestamp = typeof item === 'object' ? item.timestamp : 0;
      
      // If the deleted comment is the current comment on the point, clear it
      const currentComment = (data as MapPoint).comment || '';
      const isCurrent = typeof item === 'string' ? item.includes(currentComment) : item.text === currentComment;
      const pointToUpdate = { ...(data as MapPoint) };
      if (isCurrent && currentComment) {
          pointToUpdate.comment = '';
      }

      onDataUpdate(oldKey, pointToUpdate, undefined, { type: 'delete_comment', originalTimestamp: originalTimestamp });
  };

  const handleSave = async () => {
    if (!data) return;
    setError(null); setStatus('saving');

    const originalRow = getSafeOriginalRow(data);
    const oldKey = (data as MapPoint).key || String((data as any).originalIndex);
    const rm = getRmName(data);
    const originalIndex = (data as any).originalIndex;

    // For potential clients, we primarily just save comments via the messenger UI.
    // The "Save" button here might be redundant or used to close.
    if (isPotential) {
        setStatus('success');
        setTimeout(() => onClose(), 350);
        return;
    }

    if (!rm) { setStatus('error_saving'); setError('Не удалось определить имя РМ. Проверьте исходные данные.'); return; }

    const oldAddress = (data as MapPoint).address || findAddressInRow(originalRow) || '';
    const isAddressChanged = editedAddress.trim() !== '' && editedAddress.trim().toLowerCase() !== oldAddress.toLowerCase();
    const needsGeocoding = isAddressChanged && !manualCoords;
    const updateTimestamp = Date.now();
    const distributor = findValueInRow(originalRow, ['дистрибьютор', 'distributor']);
    const parsed = parseRussianAddress(editedAddress, distributor);
    const stableKey = isUnidentifiedRow(data) ? `${normalizeAddress(editedAddress)}#${Date.now()}` : oldKey;
    const clientName = findValueInRow(originalRow, ['наименование клиенты', 'контрагент', 'клиент', 'name']) || 'N/A';
    const finalType = editedChannel || 'Не определен';

    const baseNewPoint: MapPoint = {
      key: stableKey,
      lat: needsGeocoding ? undefined : manualCoords?.lat || (data as MapPoint).lat,
      lon: needsGeocoding ? undefined : manualCoords?.lon || (data as MapPoint).lon,
      status: 'match',
      name: clientName,
      address: editedAddress,
      city: parsed.city,
      region: parsed.region,
      rm: rm,
      brand: findValueInRow(originalRow, ['торговая марка']),
      packaging: findValueInRow(originalRow, ['фасовка', 'упаковка', 'вид упаковки']) || 'Не указана',
      type: finalType,
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
      onStartPolling(rm, editedAddress, oldKey, baseNewPoint, originalIndex, oldAddress);
    } else {
      onDataUpdate(oldKey, baseNewPoint, originalIndex);
      setStatus('success');
      
      // Only close if address/coords changed. If just comment/channel, keep open.
      if (isAddressChanged || (manualCoords && (manualCoords.lat !== (data as MapPoint).lat || manualCoords.lon !== (data as MapPoint).lon))) {
          setTimeout(() => onClose(), 350);
      } else {
          // Reset status to idle after a delay so user can edit again
          setTimeout(() => setStatus('idle'), 2000);
      }
    }
  };

  const handleDelete = () => {
    if (!data) return;
    
    if (isPotential) {
        if (!deleteReason.trim()) {
            setStatus('error_deleting');
            setError('Обязательно укажите причину удаления!');
            return;
        }
        const oldKey = (data as MapPoint).key;
        onDataUpdate(oldKey, data as MapPoint, undefined, { reason: deleteReason, type: 'delete' });
        onClose();
        return;
    }

    const originalRow = getSafeOriginalRow(data);
    const addressToDelete = (data as MapPoint).address || findAddressInRow(originalRow) || '';
    const rm = getRmName(data);

    if (!rm) {
      setStatus('error_deleting');
      setError('Не удалось определить имя РМ. Удаление невозможно.');
      return;
    }

    onDelete(rm, addressToDelete);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  const originalRow = getSafeOriginalRow(data);
  const clientName = findValueInRow(originalRow, ['наименование клиента', 'контрагент', 'клиент']);
  const displayLat = manualCoords ? manualCoords.lat : (data as MapPoint).lat;
  const displayLon = manualCoords ? manualCoords.lon : (data as MapPoint).lon;
  const isMapSuccess = typeof displayLat === 'number' && typeof displayLon === 'number' && displayLat !== 0 && displayLon !== 0 && status !== 'geocoding';
  const isProcessing = status === 'saving' || status === 'deleting' || status === 'syncing';

  // Details Logic
  const detailsToShow = Object.entries(originalRow)
    .map(([k, v]) => {
      const key = String(k).trim();
      const keyLower = key.toLowerCase();
      let value = String(v).trim();
      if (typeof displayLat === 'number' && displayLat !== 0) { if (['lat', 'latitude', 'широта', 'geo_lat'].includes(keyLower)) { value = displayLat.toFixed(6); } }
      if (typeof displayLon === 'number' && displayLon !== 0) { if (['lon', 'lng', 'longitude', 'долгота', 'geo_lon'].includes(keyLower)) { value = displayLon.toFixed(6); } }
      return { key, value };
    })
    .filter((x) => x.value && x.value !== 'null' && x.key !== '__rowNum__' && x.key !== 'changeHistory');

  // Button text logic
  let saveButtonText = 'Сохранить изменения';
  if (!isPotential) {
      const oldAddressStr = (data as MapPoint).address || '';
      const isAddressChangedState = editedAddress.trim() !== '' && editedAddress.trim().toLowerCase() !== oldAddressStr.toLowerCase();
      const isCoordsChanged = manualCoords !== null;
      const isChannelChanged = editedChannel !== ((data as MapPoint).type || 'Не определен');
      if (isAddressChangedState) saveButtonText = 'Сохранить новый адрес';
      if (isCoordsChanged) saveButtonText = 'Сохранить новые координаты';
      if (isAddressChangedState && isCoordsChanged) saveButtonText = 'Сохранить адрес и координаты';
      if (isChannelChanged && !isAddressChangedState && !isCoordsChanged) saveButtonText = 'Сохранить канал';
  } else {
      saveButtonText = 'Закрыть';
  }

  return (
    <>
      <div className="fixed inset-0 z-[9999]">
        <div className="absolute inset-0 bg-white/55 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
        <div className="absolute inset-0 pointer-events-none"><Glow /></div>

        <div className="relative z-[10000] h-full w-full flex items-center justify-center p-3 md:p-6">
          <div className="relative w-full max-w-7xl h-[92vh]">
            <Card className="relative h-full overflow-hidden flex flex-col">
              {/* HEADER */}
              <div className="relative px-6 pt-6 pb-4 border-b border-slate-200/70 bg-white/70 flex-shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white font-black flex items-center justify-center shadow-[0_14px_40px_rgba(99,102,241,0.18)]">✦</div>
                      <div className="min-w-0">
                        <div className="text-base md:text-lg font-black text-slate-900 truncate">Редактирование: {clientName || 'Неизвестный клиент'}</div>
                        <div className="text-xs text-slate-500 truncate">Адрес • координаты • канал продаж • история</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={isPotential ? 'blue' : status === 'geocoding' ? 'blue' : status === 'success' || status === 'success_geocoding' ? 'lime' : status.startsWith('error') ? 'red' : 'neutral'}>
                      {isPotential ? 'ОКБ (Потенциал)' : status === 'geocoding' ? 'GEOCODING' : status === 'success' || status === 'success_geocoding' ? 'SAVED' : status.startsWith('error') ? 'ERROR' : 'EDIT'}
                    </Chip>
                    <Btn variant="ghost" onClick={onClose} className="px-3 py-2">Закрыть</Btn>
                  </div>
                </div>
              </div>

              {/* BODY */}
              <div className="relative p-6 flex-grow overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                  <div className="flex flex-col gap-6 h-full">
                    {/* DETAILS CARD */}
                    <Card className="p-5 bg-white/70 flex-shrink-0 max-h-[30%] overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-indigo-700 font-black">Исходные данные строки</div>
                        <Chip tone="neutral">{detailsToShow.length} полей</Chip>
                      </div>
                      <div className="overflow-y-auto custom-scrollbar rounded-2xl border border-slate-200 bg-white/70">
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-slate-200">
                            {detailsToShow.map(({ key, value }, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="py-3 px-4 text-slate-500 font-bold align-top w-1/3">{key}</td>
                                <td className="py-3 pr-4 text-slate-900 break-words">{value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                    
                    {/* HISTORY / COMMENTS CARD */}
                    <Card className="p-5 bg-white/70 flex-grow flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-600 font-black">
                          {isPotential ? "Комментарии" : "История изменений"} {isLoadingHistory && <LoaderIcon className="w-3 h-3" />}
                        </div>
                        <Chip tone="neutral">Всего: {history.length}</Chip>
                      </div>
                      
                      {/* Comments List */}
                      <div className="flex-grow overflow-y-auto custom-scrollbar rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3 mb-3">
                        {history.length > 0 ? (
                            history.map((item, idx) => {
                                const isAdmin = user?.role === 'admin';
                                const currentUserFull = `${user?.lastName || ''} ${user?.firstName || ''}`.trim();
                                
                                let displayUser = 'СИСТЕМА';
                                let displayText = '';
                                let displayDate = '';
                                let timestamp = 0;
                                let isAuthor = false;

                                if (typeof item === 'string') {
                                    // Robust parsing for "User: Text [Date]" or "Text [Date]"
                                    // 1. Extract Date from the end
                                    const dateMatch = item.match(/\[([^\]]+)\]$/);
                                    if (dateMatch) {
                                        const rawDate = dateMatch[1].trim();

                                        // If no time is present, append "00:00"
                                        // Simple check: does it contain HH:MM pattern?
                                        displayDate = /(\d{1,2}:\d{2})/.test(rawDate) ? rawDate : `${rawDate} 00:00`;

                                        const contentWithoutDate = item.substring(0, dateMatch.index).trim();
                                        
                                        // 2. Extract User from the remaining content
                                        // Look for the FIRST colon. Everything before it is User, after is Text.
                                        // Constraint: User shouldn't be too long (e.g. < 50 chars) to avoid matching address parts.
                                        const userMatch = contentWithoutDate.match(/^([^:]{1,50}):\s*(.*)/);
                                        if (userMatch) {
                                            displayUser = userMatch[1].trim();
                                            displayText = userMatch[2].trim();
                                        } else {
                                            // No user prefix found, assume System/Legacy
                                            displayText = contentWithoutDate;
                                        }
                                    } else {
                                        // No date found, treat whole string as text
                                        displayText = item;
                                    }
                                    
                                    // Check authorship
                                    if (displayUser === currentUserFull) isAuthor = true;

                                } else {
                                    displayUser = item.user || 'СИСТЕМА';
                                    displayText = item.text;
                                    displayDate = item.date;
                                    timestamp = item.timestamp;
                                    if (displayUser === currentUserFull) isAuthor = true;
                                }

                                const isComment = displayText.startsWith('Комментарий:') || displayText.startsWith('Комментарий');
                                // Clean up display text if it starts with "Комментарий: " for cleaner look? 
                                // User didn't ask for this, but it might be nice. 
                                // User asked: "сделай так что бы в заголовке коментария и изменения было имя..."
                                
                                return (
                                  <div key={idx} className="group relative p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex justify-between items-center mb-2">
                                      <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                                            {displayUser}
                                          </span>
                                          <span className="text-[11px] font-semibold text-slate-400">
                                            {displayDate}
                                          </span>
                                      </div>
                                      
                                      {(isComment && (isAdmin || isAuthor)) && (
                                          <button 
                                              onClick={() => handleDeleteComment(idx, item)}
                                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-all"
                                              title="Удалить комментарий"
                                          >
                                              <TrashIcon className="w-3.5 h-3.5" />
                                          </button>
                                      )}
                                    </div>
                                    <div className="text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                                      {displayText}
                                    </div>
                                  </div>
                                );
                            })
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm p-8">
                            <InfoIcon className="w-10 h-10 mb-2" />
                            <span>{isPotential ? "Комментариев нет" : "История изменений пуста"}</span>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Input Area for Blue Points */}
                      {isPotential && (
                          <div className="flex gap-2 pt-2 border-t border-slate-200 flex-shrink-0">
                              <input 
                                  type="text" 
                                  value={newComment}
                                  onChange={(e) => setNewComment(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
                                  placeholder="Напишите комментарий..."
                                  className="flex-grow p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                              />
                              <button 
                                  onClick={handleSendComment}
                                  disabled={!newComment.trim()}
                                  className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                              >
                                  <SendIcon />
                              </button>
                          </div>
                      )}
                    </Card>
                  </div>

                  <div className="flex flex-col gap-6">
                    {/* MAP CARD */}
                    <Card className="overflow-hidden flex-shrink-0">
                      <div className="h-72 md:h-80">
                        <SinglePointMap
                          lat={displayLat} lon={displayLon} address={editedAddress} isSuccess={isMapSuccess}
                          onCoordinatesChange={handleCoordinatesChange} theme={mapTheme}
                          onToggleTheme={() => setMapTheme((p) => (p === 'dark' ? 'light' : 'dark'))}
                          onExpand={() => setIsMapExpanded(true)} isExpanded={false}
                        />
                      </div>
                      <div className="px-5 py-4 border-t border-slate-200 bg-white/70 flex items-center justify-between">
                        <div className="text-xs text-slate-600 flex items-center gap-2"><InfoIcon className="w-4 h-4 text-indigo-600" />Перетащите маркер для точной привязки</div>
                        <Chip tone={isMapSuccess ? 'lime' : 'neutral'}>{isMapSuccess ? 'COORDS OK' : 'NO COORDS'}</Chip>
                      </div>
                    </Card>

                    {/* EDIT FORM CARD */}
                    <Card className="p-6 bg-white/70 flex-grow flex flex-col">
                      <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-indigo-700 font-black flex items-center gap-2"><SaveIcon className="w-4 h-4" />Параметры объекта</div>
                        {!showDeleteConfirm ? (
                          <button onClick={() => setShowDeleteConfirm(true)} className="text-slate-500 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-2xl flex items-center gap-2" title="Удалить запись">
                            <TrashIcon className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-[0.16em]">Удалить</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-2xl border border-red-200 flex-wrap">
                            <span className="text-[10px] font-black text-red-700 uppercase tracking-[0.16em]">Удалить?</span>
                            {/* NEW: Input for Reason */}
                            <input 
                                type="text" 
                                placeholder="Причина удаления..." 
                                value={deleteReason} 
                                onChange={(e) => setDeleteReason(e.target.value)} 
                                className="text-xs px-2 py-1 rounded border border-red-200 focus:outline-none w-32"
                            />
                            <Btn variant="danger" onClick={handleDelete} disabled={isPotential && !deleteReason.trim()} className="px-3 py-2 text-[11px] rounded-xl">Да</Btn>
                            <Btn variant="soft" onClick={() => setShowDeleteConfirm(false)} className="px-3 py-2 text-[11px] rounded-xl">Нет</Btn>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4 flex-grow overflow-y-auto custom-scrollbar pr-1">
                        {!isPotential && (
                            <div>
                              <label className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2">Адрес ТТ LimKorm</label>
                              <textarea
                                rows={2} value={editedAddress} onChange={(e) => setEditedAddress(e.target.value)} disabled={isProcessing || status === 'geocoding' || status === 'success'}
                                className={`w-full rounded-2xl border bg-white/85 px-4 py-3 text-sm font-bold text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition resize-none ${status === 'success' ? 'border-emerald-300' : error ? 'border-red-300' : 'border-slate-200 hover:border-slate-300'}`}
                              />
                              {status === 'success' && <div className="mt-2 text-xs text-emerald-700 font-bold flex items-center gap-2"><CheckIcon className="w-4 h-4" /> Сохранено</div>}
                            </div>
                        )}

                        {!isPotential && (
                            <div>
                              <label className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2 flex items-center gap-2"><ChannelIcon small /> Канал продаж</label>
                              <select value={editedChannel} onChange={(e) => setEditedChannel(e.target.value)} disabled={isProcessing || status === 'geocoding' || status === 'success'} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-bold text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition cursor-pointer appearance-none">
                                 {SALES_CHANNELS.map(ch => (<option key={ch} value={ch}>{ch}</option>))}
                              </select>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2">Широта (Lat)</label>
                            <input readOnly value={displayLat ? displayLat.toFixed(6) : '—'} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-black text-slate-700 text-center" />
                          </div>
                          <div>
                            <label className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2">Долгота (Lon)</label>
                            <input readOnly value={displayLon ? displayLon.toFixed(6) : '—'} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-black text-slate-700 text-center" />
                          </div>
                        </div>

                        {!isPotential && (
                            <Btn onClick={handleCloudSync} disabled={isProcessing} className="w-full py-3 rounded-2xl" variant="soft">
                              <span className="inline-flex items-center gap-2"><SyncIcon small /> Синхронизировать с Google (Проверка координат)</span>
                            </Btn>
                        )}

                        {!isPotential && (
                            <div>
                              <label className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2">Заметка менеджера</label>
                              <textarea
                                rows={2} value={comment} onChange={handleCommentChange} disabled={isProcessing || status === 'geocoding' || status === 'success'}
                                placeholder="Добавьте важный комментарий…"
                                className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-bold text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition resize-none"
                              />
                            </div>
                        )}

                        {lastUpdatedStr && <div className="text-[11px] text-slate-500 text-right italic">Обновлено: {lastUpdatedStr}</div>}

                        {status === 'geocoding' && (
                          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><div className="flex items-center justify-center gap-2 text-indigo-700 font-black"><LoaderIcon className="w-4 h-4" /> Ожидание координат (Polling)…</div><div className="mt-2 text-xs text-slate-600 text-center">Запрос отправлен. Ждём ответ от геокодера.</div></div>
                        )}
                        {status === 'success_geocoding' && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center justify-center gap-2 text-emerald-700 font-black"><CheckIcon className="w-5 h-5" /> Координаты обновлены!</div><div className="mt-1 text-xs text-emerald-700/70 text-center">Точка появилась на карте</div></div>
                        )}
                        {(status === 'error_saving' || status === 'error_deleting' || status === 'error_geocoding') && (
                          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3"><div className="flex items-center gap-2 text-red-700 font-black text-sm"><ErrorIcon className="w-4 h-4" /> {error || 'Сбой соединения'}</div>{status !== 'error_deleting' && (<Btn onClick={handleSave} variant="soft" className="w-full py-3 rounded-2xl"><span className="inline-flex items-center gap-2"><RetryIcon className="w-4 h-4" /> Повторить попытку</span></Btn>)}</div>
                        )}
                      </div>
                      
                      <div className="mt-4 flex-shrink-0">
                        {status === 'saving' ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-indigo-700 font-black flex items-center justify-center gap-2"><LoaderIcon className="w-4 h-4 animate-spin" /> Сохранение…</div>
                        ) : status === 'syncing' ? (
                          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center text-sky-800 font-black flex items-center justify-center gap-2"><LoaderIcon className="w-4 h-4 animate-spin" /> Проверка в Google…</div>
                        ) : (
                          <Btn onClick={handleSave} disabled={status === 'success'} variant="primary" className="w-full py-3.5 text-base rounded-2xl"><span className="inline-flex items-center gap-2"><SaveIcon className="w-5 h-5" /> {status === 'success' ? 'Успешно!' : saveButtonText}</span></Btn>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              </div>

              {/* FOOTER */}
              <div className="px-6 py-4 border-t border-slate-200/70 bg-white/70 flex items-center justify-between flex-shrink-0">
                <Btn onClick={onBack} variant="soft" className="px-5 py-3"><span className="inline-flex items-center gap-2"><ArrowLeftIcon className="w-4 h-4" /> Назад</span></Btn>
                <div className="flex items-center gap-2"><Btn onClick={onClose} variant="ghost" className="px-5 py-3">Закрыть</Btn></div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {isMapExpanded && (
        <div className="fixed inset-0 z-[10050] bg-white/80 backdrop-blur-md">
          <div className="absolute inset-0 pointer-events-none"><Glow /></div>
          <div className="relative h-full flex flex-col">
            <div className="px-6 py-4 bg-white/80 border-b border-slate-200 flex items-center justify-between"><div className="min-w-0"><div className="text-lg font-black text-slate-900">Уточнение координат</div><div className="text-xs text-slate-500 truncate max-w-[70vw]">{editedAddress}</div></div><Btn onClick={() => setIsMapExpanded(false)} variant="soft" className="px-5 py-3">Закрыть карту</Btn></div>
            <div className="flex-1 p-4"><Card className="h-full overflow-hidden"><SinglePointMap lat={displayLat} lon={displayLon} address={editedAddress} isSuccess={isMapSuccess} onCoordinatesChange={handleCoordinatesChange} theme={mapTheme} onToggleTheme={() => setMapTheme((p) => (p === 'dark' ? 'light' : 'dark'))} onCollapse={() => setIsMapExpanded(false)} isExpanded={true} /></Card></div>
            <div className="px-6 py-4 bg-white/80 border-t border-slate-200 flex items-center justify-between"><div className="text-xs text-slate-600 flex items-center gap-2"><InfoIcon className="w-4 h-4 text-indigo-600" />Перетащите маркер. Координаты обновятся автоматически.</div><Btn onClick={() => setIsMapExpanded(false)} variant="primary" className="px-8 py-3">Применить</Btn></div>
          </div>
        </div>
      )}
    </>
  );
};

export default AddressEditModal;