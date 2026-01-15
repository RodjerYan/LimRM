
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome'; 
import InteractiveRegionMap from './components/InteractiveRegionMap';
import Filters from './components/Filters';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import { RMDashboard } from './components/RMDashboard';
import Notification from './components/Notification';
import AddressEditModal from './components/AddressEditModal'; 
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import MergeOverlay from './components/MergeOverlay';

import { 
    AggregatedDataRow, 
    FilterOptions, 
    FilterState, 
    NotificationMessage, 
    OkbStatus, 
    SummaryMetrics,
    OkbDataRow,
    MapPoint,
    UnidentifiedRow,
    FileProcessingState,
    WorkerMessage,
    CoordsCache,
    CloudLoadParams,
    WorkerResultPayload
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import { LoaderIcon, CheckIcon, ErrorIcon, TrashIcon } from './components/icons';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState, clearAnalyticsState } from './utils/db';

// Lazy Load Heavy Modals
const DetailsModal = React.lazy(() => import('./components/DetailsModal'));
const UnidentifiedRowsModal = React.lazy(() => import('./components/UnidentifiedRowsModal'));

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);
    
    // --- DATE FILTER STATE ---
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');

    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    const [lastSnapshotVersion, setLastSnapshotVersion] = useState<string | null>(localStorage.getItem('last_snapshot_version'));
    
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isSavingToCloud, setIsSavingToCloud] = useState(false); 
    const [uploadProgress, setUploadProgress] = useState(0); 
    const [isRestoring, setIsRestoring] = useState(true);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');

    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false,
        progress: 0,
        message: 'Система готова',
        fileName: null,
        backgroundMessage: null,
        startTime: null,
        totalRowsProcessed: 0
    });
    
    const totalRowsProcessedRef = useRef<number>(0);
    const processedFileIdsRef = useRef<Set<string>>(new Set());
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const workerRef = useRef<Worker | null>(null);
    const pollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    
    const isUploadingRef = useRef(false);
    const pendingUploadRef = useRef<any>(null);
    const uploadStartTimeRef = useRef<number>(0);

    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{ [key: string]: number } | null>(null);
    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
    
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null); 
    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    const [mergeModalData, setMergeModalData] = useState<{
        initialCount: number;
        finalCount: number;
        newClients: MapPoint[];
        newAllData: AggregatedDataRow[];
    } | null>(null);

    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    const duplicatesCount = useMemo(() => {
        if (allActiveClients.length === 0) return 0;
        const uniqueKeys = new Set<string>();
        let duplicates = 0;
        allActiveClients.forEach(client => {
            const normAddr = normalizeAddress(client.address);
            const key = `${normAddr}_${client.type || 'common'}`;
            if (uniqueKeys.has(key)) {
                duplicates++;
            } else {
                uniqueKeys.add(key);
            }
        });
        return duplicates;
    }, [allActiveClients]);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // --- ФУНКЦИЯ БЫСТРОЙ ЗАГРУЗКИ СНИМКА (ЧАНКОВ) ---
    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string): Promise<boolean> => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Загрузка базы из облака...', progress: 0 }));
            let fullJson = '';
            
            // 1. Получаем список ID чанков
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            const fileList = await listRes.json();

            if (!Array.isArray(fileList) || fileList.length === 0) return false;

            // 2. Скачиваем каждый чанк последовательно
            for (let i = 0; i < fileList.length; i++) {
                const pct = Math.round(((i + 1) / fileList.length) * 100);
                setProcessingState(prev => ({ ...prev, progress: pct, message: `Загрузка части ${i+1} из ${fileList.length}...` }));
                const chunkRes = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${fileList[i].id}`);
                fullJson += await chunkRes.text();
            }

            // 3. Собираем и восстанавливаем
            if (fullJson) {
                const data = JSON.parse(fullJson);
                if (data.aggregatedData) {
                    setAllData(data.aggregatedData);
                    const clientsMap = new Map<string, MapPoint>();
                    data.aggregatedData.forEach((row: any) => row.clients.forEach((c: any) => clientsMap.set(c.key, c)));
                    setAllActiveClients(Array.from(clientsMap.values()));
                    setOkbRegionCounts(data.okbRegionCounts || null);
                    totalRowsProcessedRef.current = data.totalRowsProcessed || 0;

                    await saveAnalyticsState({
                        allData: data.aggregatedData,
                        unidentifiedRows: data.unidentifiedRows || [],
                        okbRegionCounts: data.okbRegionCounts || null,
                        okbData: [],
                        okbStatus: null,
                        totalRowsProcessed: data.totalRowsProcessed,
                        versionHash: versionHash
                    });
                    
                    setLastSnapshotVersion(versionHash);
                    localStorage.setItem('last_snapshot_version', versionHash);
                    setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Синхронизация завершена', progress: 100 }));
                    return true;
                }
            }
        } catch (e) { console.error("Сбой загрузки снимка:", e); }
        return false;
    }, []);

    // --- LEGACY: Used only if snapshot fails or is missing ---
    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams) => {
        if (processingState.isProcessing) return;
        
        let rowsProcessedSoFar = totalRowsProcessedRef.current;
        
        if (rowsProcessedSoFar === 0) {
             setAllData([]);
             setUnidentifiedRows([]);
             setOkbRegionCounts(null);
             setAllActiveClients([]);
             processedFileIdsRef.current.clear();
        }

        setProcessingState(prev => ({ 
            ...prev,
            isProcessing: true, progress: 0, 
            message: 'Синхронизация (Построчное чтение)...', 
            startTime: Date.now(), totalRowsProcessed: rowsProcessedSoFar
        }));
        
        let cacheData: CoordsCache = {};
        try {
            const response = await fetch(`/api/get-full-cache?t=${Date.now()}`);
            if (response.ok) cacheData = await response.json();
        } catch (error) {}
        
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message, totalRowsProcessed: msg.payload.totalProcessed ?? prev.totalRowsProcessed }));
                if (msg.payload.totalProcessed) totalRowsProcessedRef.current = msg.payload.totalProcessed;
            }
            else if (msg.type === 'result_init') setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
                setAllData(chunkData);
                const clientsMap = new Map<string, MapPoint>();
                chunkData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                setAllActiveClients(Array.from(clientsMap.values()));
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
                totalRowsProcessedRef.current = totalProcessed;
            }
            else if (msg.type === 'CHECKPOINT') {
                const payload = msg.payload;
                setAllData(payload.aggregatedData);
                setAllActiveClients(prev => { const map = new Map(prev.map(c => [c.key, c])); payload.aggregatedData.forEach(r => r.clients.forEach(c => map.set(c.key, c))); return Array.from(map.values()); });
                setUnidentifiedRows(payload.unidentifiedRows);
                const version = `proc_${Date.now()}`;
                await persistToDB(payload.aggregatedData, payload.unidentifiedRows, [], payload.totalRowsProcessed, version);
            }
            else if (msg.type === 'result_finished') {
                const payload = msg.payload as WorkerResultPayload;
                setOkbRegionCounts(payload.okbRegionCounts);
                setAllData(payload.aggregatedData);
                const clientsMap = new Map<string, MapPoint>();
                payload.aggregatedData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                setAllActiveClients(Array.from(clientsMap.values()));
                setUnidentifiedRows(payload.unidentifiedRows);
                setDbStatus('ready');
                
                const finalVersion = `processed_${Date.now()}`;
                await persistToDB(payload.aggregatedData, payload.unidentifiedRows, [], payload.totalRowsProcessed, finalVersion);
                
                setLastSnapshotVersion(finalVersion);
                localStorage.setItem('last_snapshot_version', finalVersion);
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Синхронизация завершена', totalRowsProcessed: payload.totalRowsProcessed }));
            }
        };
        
        workerRef.current.postMessage({ 
            type: 'INIT_STREAM', 
            payload: { okbData, cacheData, totalRowsProcessed: rowsProcessedSoFar, restoredData: allDataRef.current, restoredUnidentified: unidentifiedRowsRef.current } 
        });
        
        try {
            const YEARS_TO_SCAN = ['2025', '2026'];
            for (const scanYear of YEARS_TO_SCAN) {
                setProcessingState(prev => ({ ...prev, message: `Поиск файлов за ${scanYear}...` }));
                const listRes = await fetch(`/api/get-akb?year=${scanYear}&mode=list`);
                const allFiles = listRes.ok ? await listRes.json() : [];
                if (allFiles.length === 0) continue;

                for (const file of allFiles) {
                    if (processedFileIdsRef.current.has(file.id)) continue;
                    let offset = 0, hasMore = true, isFirstChunk = true;
                    while (hasMore) {
                        const CHUNK_SIZE = 1000; 
                        const mimeTypeParam = file.mimeType ? `&mimeType=${encodeURIComponent(file.mimeType)}` : '';
                        setProcessingState(prev => ({ ...prev, fileName: file.name, message: `Обработка: ${file.name} (строки ${offset}-${offset + CHUNK_SIZE})` }));
                        await new Promise(r => setTimeout(r, 200)); 
                        const res = await fetch(`/api/get-akb?fileId=${file.id}&offset=${offset}&limit=${CHUNK_SIZE}${mimeTypeParam}`);
                        if (!res.ok) { hasMore = false; break; } 
                        else {
                            const result = await res.json();
                            const chunkRows = result.rows || [];
                            if (chunkRows.length > 0) {
                                workerRef.current?.postMessage({ type: 'PROCESS_CHUNK', payload: { rawData: chunkRows, isFirstChunk: isFirstChunk && offset === 0, fileName: file.name } });
                                isFirstChunk = false;
                            } else { hasMore = false; }
                            if (chunkRows.length < CHUNK_SIZE) hasMore = false;
                            hasMore = result.hasMore && hasMore; offset += CHUNK_SIZE;
                        }
                    }
                    processedFileIdsRef.current.add(file.id);
                }
            }
        } catch (error) {
            console.error(error);
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка связи или лимит квот' }));
        } finally {
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        }
    }, [okbData, processingState.isProcessing]);

    const performUpload = async (payload: any): Promise<string[]> => {
        try {
            console.log("Начало нарезки снимка на чанки...");
            const jsonString = JSON.stringify(payload);
            const CHUNK_SIZE = 2 * 1024 * 1024;
            const totalChunks = Math.ceil(jsonString.length / CHUNK_SIZE);
            if (totalChunks > 30) console.warn("Ошибка: Слишком много данных для 30 файлов.");

            for (let i = 0; i < totalChunks; i++) {
                if (i >= 30) break;
                setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
                const chunk = jsonString.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const res = await fetch(`/api/get-full-cache?action=save-chunk&chunkIndex=${i}`, { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chunk }) 
                });
                if (!res.ok) throw new Error(`Ошибка загрузки чанка ${i}`);
                await new Promise(r => setTimeout(r, 100));
            }

            await fetch('/api/get-full-cache?action=save-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    versionHash: payload.versionHash,
                    totalRowsProcessed: payload.totalRowsProcessed,
                    processedFileIds: payload.processedFileIds,
                    chunkCount: totalChunks,
                    savedAt: new Date().toISOString()
                })
            });
            console.log('Снимок успешно разбит и сохранен в облако!');
            setUploadProgress(0);
            return [];
        } catch (e) {
            console.error("Server upload failed:", e);
            setUploadProgress(0);
            throw e;
        }
    };

    const uploadToCloudServerSide = async (payload: any) => {
        if (!payload || !payload.aggregatedData || payload.aggregatedData.length === 0) return;
        if (isUploadingRef.current) { pendingUploadRef.current = payload; return; }
        isUploadingRef.current = true;
        setIsSavingToCloud(true);
        uploadStartTimeRef.current = Date.now();
        try {
            await performUpload(payload);
            while (pendingUploadRef.current) {
                const nextPayload = pendingUploadRef.current;
                pendingUploadRef.current = null;
                uploadStartTimeRef.current = Date.now();
                await performUpload(nextPayload);
                payload = nextPayload;
            }
        } catch (e) { console.error("Cloud sync error:", e); } 
        finally { isUploadingRef.current = false; setIsSavingToCloud(false); }
    };

    const persistToDB = useCallback(async (updatedData: AggregatedDataRow[], updatedUnidentified: UnidentifiedRow[], updatedActivePoints: MapPoint[], rawCount: number, vHash?: string) => {
        const currentVersion = vHash || lastSnapshotVersion || `local_${Date.now()}`;
        totalRowsProcessedRef.current = rawCount;
        const stateToSave = {
            aggregatedData: updatedData, 
            unidentifiedRows: updatedUnidentified,
            okbRegionCounts,
            totalRowsProcessed: rawCount,
            processedFileIds: Array.from(processedFileIdsRef.current),
            versionHash: currentVersion,
        };
        try {
            await saveAnalyticsState({ 
                allData: updatedData, 
                unidentifiedRows: updatedUnidentified, 
                okbRegionCounts, 
                okbData: [], 
                okbStatus: null,
                dateRange, 
                totalRowsProcessed: rawCount, 
                processedFileIds: Array.from(processedFileIdsRef.current),
                versionHash: currentVersion 
            });
            localStorage.setItem('last_snapshot_version', currentVersion);
            setLastSnapshotVersion(currentVersion);
            uploadToCloudServerSide(stateToSave);
        } catch (e) {}
    }, [okbRegionCounts, dateRange, lastSnapshotVersion]);

    const handleDataUpdate = useCallback(async (oldKey: string, newPoint: MapPoint) => {
        if (pollingIntervals.current.has(oldKey) && !newPoint.isGeocoding) {
            clearInterval(pollingIntervals.current.get(oldKey));
            pollingIntervals.current.delete(oldKey);
        }
        setEditingClient(prev => (prev && 'key' in prev && (prev as MapPoint).key === oldKey ? newPoint : prev));
        let finalData: AggregatedDataRow[] = [];
        let finalUnidentified: UnidentifiedRow[] = [];
        let finalPoints: MapPoint[] = [];
        setAllActiveClients(prev => {
            const index = prev.findIndex(c => c.key === oldKey);
            const updated = index !== -1 ? [...prev] : [...prev, newPoint];
            if (index !== -1) updated[index] = newPoint;
            finalPoints = updated;
            return updated;
        });
        setAllData(prev => {
            finalData = prev.map(group => {
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                if (clientIndex !== -1) {
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = newPoint;
                    return { ...group, clients: updatedClients };
                }
                return group;
            });
            return finalData;
        });
        setUnidentifiedRows(prev => {
            finalUnidentified = prev.filter(row => {
                const rowAddr = normalizeAddress(findAddressInRow(row.rowData));
                return rowAddr !== oldKey && rowAddr !== newPoint.key;
            });
            return finalUnidentified;
        });
        try {
            fetch('/api/get-full-cache?action=update-address', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: newPoint.rm || 'Unknown', oldAddress: oldKey, newAddress: newPoint.address, comment: newPoint.comment, lat: newPoint.lat, lon: newPoint.lon })
            });
        } catch (e) { console.error("Network error saving edit:", e); }
        setTimeout(() => persistToDB(finalData, finalUnidentified, finalPoints, totalRowsProcessedRef.current || 0), 50);
    }, [persistToDB]);

    const handleStartPolling = useCallback((rmName: string, address: string, tempKey: string, basePoint: MapPoint) => {
        if (pollingIntervals.current.has(tempKey)) clearInterval(pollingIntervals.current.get(tempKey));
        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(address)}&t=${Date.now()}`);
                if (res.ok) {
                    const cached = await res.json();
                    if (cached.isInvalid) {
                        handleDataUpdate(tempKey, { ...basePoint, isGeocoding: false, geocodingError: 'Геокодер не смог найти этот адрес.', lastUpdated: Date.now() });
                        addNotification(`Адрес не распознан: ${address}`, 'error');
                        return;
                    }
                    if (cached.lat && cached.lon && !isNaN(cached.lat)) {
                        handleDataUpdate(tempKey, { ...basePoint, lat: parseFloat(cached.lat), lon: parseFloat(cached.lon), isGeocoding: false, geocodingError: undefined, lastUpdated: Date.now() });
                        addNotification(`Координаты определены: ${address}`, 'success');
                    }
                }
            } catch (e) {}
        }, 10000);
        pollingIntervals.current.set(tempKey, intervalId);
    }, [handleDataUpdate, addNotification]);

    const handleDeleteClient = useCallback(async (key: string) => {
        let finalData: AggregatedDataRow[] = [];
        let finalUnidentified: UnidentifiedRow[] = [];
        let finalPoints: MapPoint[] = [];
        setAllActiveClients(prev => { finalPoints = prev.filter(c => c.key !== key); return finalPoints; });
        setAllData(prev => { finalData = prev.map(group => ({ ...group, clients: group.clients.filter(c => c.key !== key) })); return finalData; });
        setUnidentifiedRows(prev => { finalUnidentified = prev.filter(row => normalizeAddress(findAddressInRow(row.rowData)) !== key); return finalUnidentified; });
        if (pollingIntervals.current.has(key)) { clearInterval(pollingIntervals.current.get(key)); pollingIntervals.current.delete(key); }
        setEditingClient(null);
        setTimeout(() => persistToDB(finalData, finalUnidentified, finalPoints, totalRowsProcessedRef.current || 0), 50);
    }, [persistToDB]);

    const handleDeduplicate = useCallback(() => {
        if (duplicatesCount === 0) { addNotification('Дубликатов не найдено. База оптимизирована.', 'info'); return; }
        const uniqueMap = new Map<string, MapPoint>();
        allActiveClients.forEach(client => {
            const normAddr = normalizeAddress(client.address);
            const key = `${normAddr}_${client.type || 'common'}`;
            if (uniqueMap.has(key)) {
                const existing = uniqueMap.get(key)!;
                existing.fact = (existing.fact || 0) + (client.fact || 0);
                if (client.brand && existing.brand && !existing.brand.includes(client.brand)) { existing.brand += `, ${client.brand}`; }
                existing.potential = Math.max(existing.potential || 0, client.potential || 0);
                if (!existing.lat && client.lat) { existing.lat = client.lat; existing.lon = client.lon; }
            } else { uniqueMap.set(key, { ...client }); }
        });
        const newClients = Array.from(uniqueMap.values());
        const clientLookup = new Map<string, MapPoint>();
        newClients.forEach(c => { const normAddr = normalizeAddress(c.address); const key = `${normAddr}_${c.type || 'common'}`; clientLookup.set(key, c); });
        const newAllData = allData.map(row => {
            const uniqueGroupClients = new Map<string, MapPoint>();
            row.clients.forEach(c => { const normAddr = normalizeAddress(c.address); const key = `${normAddr}_${c.type || 'common'}`; const mergedClient = clientLookup.get(key); if (mergedClient) { uniqueGroupClients.set(key, mergedClient); } });
            return { ...row, clients: Array.from(uniqueGroupClients.values()) };
        });
        setMergeModalData({ initialCount: allActiveClients.length, finalCount: newClients.length, newClients: newClients, newAllData: newAllData });
    }, [allActiveClients, allData, addNotification, duplicatesCount]);

    const handleMergeComplete = useCallback(async () => {
        if (!mergeModalData) return;
        setAllActiveClients(mergeModalData.newClients);
        setAllData(mergeModalData.newAllData);
        await persistToDB(mergeModalData.newAllData, unidentifiedRows, mergeModalData.newClients, totalRowsProcessedRef.current || 0);
        setMergeModalData(null);
        addNotification(`База оптимизирована. Удалено ${mergeModalData.initialCount - mergeModalData.finalCount} дублей.`, 'success');
    }, [mergeModalData, unidentifiedRows, persistToDB, addNotification]);

    const handleStartLocalProcessing = useCallback(async (file: File) => {
        if (processingState.isProcessing) return;
        setActiveModule('adapta');
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 0, message: 'Чтение файла...', fileName: file.name, startTime: Date.now() }));
        setAllData([]); setUnidentifiedRows([]); setAllActiveClients([]); totalRowsProcessedRef.current = 0;
        let cacheData: CoordsCache = {};
        try { const response = await fetch(`/api/get-full-cache?t=${Date.now()}`); if (response.ok) cacheData = await response.json(); } catch (error) {}
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') { setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message, totalRowsProcessed: msg.payload.totalProcessed ?? prev.totalRowsProcessed })); if (msg.payload.totalProcessed) totalRowsProcessedRef.current = msg.payload.totalProcessed; }
            else if (msg.type === 'result_init') setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
                setAllData(chunkData);
                const clientsMap = new Map<string, MapPoint>();
                chunkData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                setAllActiveClients(Array.from(clientsMap.values()));
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
                totalRowsProcessedRef.current = totalProcessed;
            }
            else if (msg.type === 'result_finished') {
                const payload = msg.payload as WorkerResultPayload;
                setOkbRegionCounts(payload.okbRegionCounts);
                setAllData(payload.aggregatedData);
                const clientsMap = new Map<string, MapPoint>();
                payload.aggregatedData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                setAllActiveClients(Array.from(clientsMap.values()));
                setUnidentifiedRows(payload.unidentifiedRows);
                setDbStatus('ready');
                const finalVersion = `local_file_${Date.now()}`;
                await persistToDB(payload.aggregatedData, payload.unidentifiedRows, [], payload.totalRowsProcessed, finalVersion);
                setLastSnapshotVersion(finalVersion);
                localStorage.setItem('last_snapshot_version', finalVersion);
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Обработка завершена', totalRowsProcessed: payload.totalRowsProcessed }));
                setActiveModule('amp');
            }
        };
        workerRef.current.postMessage({ type: 'INIT_STREAM', payload: { okbData, cacheData, totalRowsProcessed: 0 } });
        try { const buffer = await file.arrayBuffer(); workerRef.current.postMessage({ type: 'PROCESS_FILE', payload: { fileBuffer: buffer, fileName: file.name } }, [buffer]); } catch (e) { console.error(e); setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка чтения файла.' })); }
    }, [processingState.isProcessing, okbData, persistToDB]);

    // --- ИНИЦИАЛИЗАЦИЯ ПРИ ЗАПУСКЕ ---
    useEffect(() => {
        const initializeApp = async () => {
            setDbStatus('loading');
            setProcessingState(prev => ({ ...prev, message: 'Синхронизация с командой...' }));
            
            try {
                const localState = await loadAnalyticsState();
                const localVersion = localState?.versionHash || 'none';

                // 1. Сразу показываем то, что есть в браузере
                if (localState?.allData?.length > 0) {
                    setAllData(localState.allData);
                    const clientsMap = new Map<string, MapPoint>();
                    localState.allData.forEach((row: any) => row.clients?.forEach((c: any) => clientsMap.set(c.key, c)));
                    setAllActiveClients(Array.from(clientsMap.values()));
                    setOkbRegionCounts(localState.okbRegionCounts || null);
                    totalRowsProcessedRef.current = localState.totalRowsProcessed || 0;
                    setDbStatus('ready');
                }

                // 2. Проверяем облако (важнейший этап)
                const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
                if (metaRes.ok) {
                    const serverMeta = await metaRes.json();
                    
                    if (serverMeta && serverMeta.chunkCount > 0 && serverMeta.versionHash !== localVersion) {
                        console.log("Обнаружен новый снимок в облаке! Начинаю загрузку...");
                        const success = await handleDownloadSnapshot(serverMeta.chunkCount, serverMeta.versionHash);
                        if (success) {
                            setDbStatus('ready');
                            setIsRestoring(false);
                            return; // МГНОВЕННЫЙ ВЫХОД - победа!
                        }
                    }
                }

                // 3. План Б - если в облаке ничего нет
                if (!localState || localState.allData?.length === 0) {
                    setDbStatus('empty');
                    handleStartCloudProcessing({ year: '2025' });
                }
            } catch (e) { console.error(e); }
            finally { setIsRestoring(false); }
        };
        initializeApp();
    }, [handleDownloadSnapshot, handleStartCloudProcessing]);

    const dateFilteredData = useMemo(() => {
        if (!filterStartDate && !filterEndDate) return allData;
        return allData.map(row => {
            if (!row.monthlyFact) return row;
            let newFact = 0;
            Object.entries(row.monthlyFact).forEach(([monthKey, val]) => {
                if (monthKey >= filterStartDate && monthKey <= filterEndDate) { newFact += (val as number); }
            });
            return { ...row, fact: newFact };
        }).filter(row => row.fact > 0);
    }, [allData, filterStartDate, filterEndDate]);

    const smartData = useMemo(() => {
        const okbCoordSet = new Set<string>();
        okbData.forEach(row => { if (row.lat && row.lon) okbCoordSet.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`); });
        return enrichDataWithSmartPlan(dateFilteredData, okbRegionCounts, 15, okbCoordSet);
    }, [dateFilteredData, okbRegionCounts, okbData]);

    useEffect(() => { setFilteredData(applyFilters(smartData, filters)); }, [smartData, filters]);

    const filterOptions = useMemo(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => calculateSummaryMetrics(filteredData), [filteredData]);
    const potentialClients = useMemo(() => { if (!okbData.length) return []; const activeAddressesSet = new Set(allActiveClients.map(c => normalizeAddress(c.address))); return okbData.filter(okb => !activeAddressesSet.has(normalizeAddress(findAddressInRow(okb)))); }, [okbData, allActiveClients]);

    const uploadETR = useMemo(() => {
        if (!isSavingToCloud || uploadProgress <= 0 || !uploadStartTimeRef.current) return '';
        const elapsed = (Date.now() - uploadStartTimeRef.current) / 1000;
        if (elapsed < 2) return ''; 
        const rate = uploadProgress / elapsed; 
        if (rate <= 0) return '';
        const remainingPercent = 100 - uploadProgress;
        const secondsLeft = remainingPercent / rate;
        if (!isFinite(secondsLeft) || secondsLeft < 0) return '';
        const m = Math.floor(secondsLeft / 60);
        const s = Math.floor(secondsLeft % 60);
        return ` (~${m}м ${s.toString().padStart(2, '0')}с)`;
    }, [isSavingToCloud, uploadProgress]);

    const handleResetFilters = () => {
        setFilters({ rm: '', brand: [], packaging: [], region: [] });
        setFilterStartDate('');
        setFilterEndDate('');
    };

    return (
        <div className="flex min-h-screen bg-primary-dark font-sans text-text-main overflow-hidden">
            <Navigation activeTab={activeModule} onTabChange={setActiveModule} />
            <main className="flex-1 ml-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar relative">
                <div className="sticky top-0 z-30 bg-primary-dark/95 backdrop-blur-md border-b border-gray-800 px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${dbStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Local DB</span>
                            </div>
                            <span className="text-xs font-bold text-white">{dbStatus === 'ready' ? 'Offline: Ready' : 'Initializing...'}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-800"></div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isSavingToCloud ? 'bg-cyan-400 animate-ping' : (isLiveConnected ? 'bg-emerald-500' : 'bg-red-500')}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Cloud Sync</span>
                            </div>
                            <span className="text-xs font-bold text-white">
                                {isSavingToCloud ? `Saving ${uploadProgress}%${uploadETR}` : (isLiveConnected ? 'Live: 15s Polling' : 'Disconnected')}
                            </span>
                        </div>
                        {processingState.isProcessing && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full animate-fade-in">
                                <LoaderIcon className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-tighter">
                                    {processingState.message || (allData.length > 0 ? 'Синхронизация' : 'Загрузка')}: {Math.round(processingState.progress)}%
                                </span>
                            </div>
                        )}
                        <button 
                            onClick={handleDeduplicate} 
                            disabled={duplicatesCount === 0}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold ml-2 ${
                                duplicatesCount > 0 
                                    ? 'bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 border-blue-500/20 cursor-pointer' 
                                    : 'bg-gray-800/20 text-gray-500 border-gray-700/20 cursor-not-allowed opacity-50'
                            }`}
                            title={duplicatesCount > 0 ? "Найти одинаковые адреса и сложить их показатели" : "Дубликатов не найдено"}
                        >
                            {duplicatesCount > 0 ? (
                                <><CheckIcon className="w-3 h-3" /> Объединить ({duplicatesCount})</>
                            ) : (
                                <><CheckIcon className="w-3 h-3" /> Дублей нет</>
                            )}
                        </button>
                    </div>
                    <div className="flex items-center gap-6">
                         {allActiveClients.length > 0 && (
                            <div className="flex items-center gap-6 text-xs text-right">
                                <div className="flex flex-col">
                                    <span className="text-gray-500 text-[10px] uppercase font-bold">Уникальных ТТ</span>
                                    <span className="text-emerald-400 font-mono font-bold text-base">{allActiveClients.length.toLocaleString('ru-RU')}</span>
                                </div>
                            </div>
                        )}
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/10 flex items-center justify-center text-white shadow-lg">
                            <span className="font-bold">L</span>
                        </div>
                    </div>
                </div>

                <div className="py-8 px-4 lg:px-8">
                    {activeModule === 'adapta' && (
                        <Adapta 
                            processingState={processingState}
                            onStartProcessing={handleStartLocalProcessing}
                            onStartCloudProcessing={handleStartCloudProcessing}
                            onFileProcessed={() => {}}
                            onProcessingStateChange={() => {}}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            onOkbStatusChange={setOkbStatus}
                            onOkbDataChange={setOkbData}
                            disabled={processingState.isProcessing}
                            unidentifiedCount={unidentifiedRows.length}
                            activeClientsCount={allActiveClients.length}
                            uploadedData={allData}
                            dbStatus={dbStatus}
                            onStartEdit={(client) => setEditingClient(client)}
                            startDate={filterStartDate} 
                            endDate={filterEndDate}     
                            onStartDateChange={setFilterStartDate} 
                            onEndDateChange={setFilterEndDate}     
                        />
                    )}
                    {activeModule === 'amp' && (
                        <div className="space-y-6">
                             <InteractiveRegionMap data={filteredData} selectedRegions={filters.region} potentialClients={potentialClients} activeClients={allActiveClients} flyToClientKey={flyToClientKey} onEditClient={setEditingClient} />
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-1"><Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={handleResetFilters} disabled={allData.length === 0} /></div>
                                <div className="lg:col-span-3"><PotentialChart data={filteredData} /></div>
                            </div>
                            <ResultsTable data={filteredData} onRowClick={setSelectedDetailsRow} disabled={allData.length === 0} unidentifiedRowsCount={unidentifiedRows.length} onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} />
                        </div>
                    )}
                    {activeModule === 'dashboard' && (
                        <RMDashboard 
                            isOpen={true} 
                            onClose={() => setActiveModule('amp')} 
                            data={filteredData} 
                            okbRegionCounts={okbRegionCounts} 
                            okbData={okbData} 
                            mode="page" 
                            metrics={summaryMetrics} 
                            okbStatus={okbStatus} 
                            dateRange={dateRange} 
                            onEditClient={setEditingClient} 
                        />
                    )}
                    {activeModule === 'prophet' && (
                        <Prophet data={filteredData} />
                    )}
                    {activeModule === 'agile' && (
                        <AgileLearning data={filteredData} />
                    )}
                    {activeModule === 'roi-genome' && (
                        <RoiGenome data={filteredData} />
                    )}
                </div>
            </main>
            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">{notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}</div>
            <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white">Загрузка окна...</div>}>
                {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={(client) => { setSelectedDetailsRow(null); setTimeout(() => setEditingClient(client), 100); }} />}
            </Suspense>
            <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white">Загрузка окна...</div>}>
                {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={(row) => { setIsUnidentifiedModalOpen(false); setTimeout(() => setEditingClient(row), 100); }} />}
            </Suspense>
            {editingClient && (
                <AddressEditModal 
                    isOpen={!!editingClient} 
                    onClose={() => setEditingClient(null)} 
                    onBack={() => setEditingClient(null)} 
                    data={editingClient} 
                    onDataUpdate={handleDataUpdate}
                    onStartPolling={handleStartPolling} 
                    onDelete={handleDeleteClient}
                    globalTheme="dark"
                />
            )}
            
            {mergeModalData && (
                <MergeOverlay 
                    isOpen={!!mergeModalData}
                    initialCount={mergeModalData.initialCount}
                    finalCount={mergeModalData.finalCount}
                    onComplete={handleMergeComplete}
                    onCancel={() => setMergeModalData(null)}
                />
            )}
        </div>
    );
};

export default App;
