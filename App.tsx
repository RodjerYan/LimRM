
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import DetailsModal from './components/DetailsModal';
import UnidentifiedRowsModal from './components/UnidentifiedRowsModal';
import AddressEditModal from './components/AddressEditModal'; 
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';

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
import { LoaderIcon, CheckIcon, ErrorIcon } from './components/icons';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from './utils/db';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    const [lastSyncVersion, setLastSyncVersion] = useState<string | null>(localStorage.getItem('last_sync_version'));
    const [isLiveConnected, setIsLiveConnected] = useState(false);
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
    
    // REF for reliable row counting across closures
    const totalRowsProcessedRef = useRef<number>(0);
    // REF for data to avoid closure staleness during async operations
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    
    const workerRef = useRef<Worker | null>(null);
    const pollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    
    // Upload Queue Management
    const isUploadingRef = useRef(false);
    const pendingUploadRef = useRef<any>(null);

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

    // Keep Refs synced with state
    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // Internal function to perform the actual upload logic
    const performUpload = async (payload: any) => {
        try {
            // 1. Initialize snapshot (clears the Sheet)
            const initRes = await fetch('/api/get-full-cache?action=init-snapshot', { method: 'POST' });
            if (!initRes.ok) throw new Error('Failed to init snapshot');

            // 2. Chunk and append
            const jsonString = JSON.stringify(payload);
            const CHUNK_SIZE = 1_000_000; // 1MB chunks
            let offset = 0;
            
            while (offset < jsonString.length) {
                const chunk = jsonString.slice(offset, offset + CHUNK_SIZE);
                const res = await fetch('/api/get-full-cache?action=append-snapshot', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chunk }) 
                });
                
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.details || `Upload chunk failed at offset ${offset}`);
                }
                
                offset += CHUNK_SIZE;
            }
            
            console.log('Snapshot uploaded successfully.');
        } catch (e) {
            console.error("Server upload failed:", e);
        }
    };

    // Queued upload handler to prevent race conditions and dropping updates
    const uploadToCloudServerSide = async (payload: any) => {
        if (!payload || !payload.aggregatedData || payload.aggregatedData.length === 0) return;

        if (isUploadingRef.current) {
            // If busy, queue this payload as the latest pending one
            pendingUploadRef.current = payload;
            return;
        }
        
        isUploadingRef.current = true;
        
        try {
            // Process current request
            await performUpload(payload);
            
            // Process any queued request that arrived while we were busy
            while (pendingUploadRef.current) {
                const nextPayload = pendingUploadRef.current;
                pendingUploadRef.current = null; // Clear queue before processing
                await performUpload(nextPayload);
            }
        } finally {
            isUploadingRef.current = false;
        }
    };

    const persistToDB = useCallback(async (
        updatedData: AggregatedDataRow[], 
        updatedUnidentified: UnidentifiedRow[],
        updatedActivePoints: MapPoint[],
        rawCount: number,
        vHash?: string
    ) => {
        const currentVersion = vHash || lastSyncVersion || 'manual_patch_' + Date.now();
        
        // Sync Ref
        totalRowsProcessedRef.current = rawCount;

        const stateToSave = {
            aggregatedData: updatedData, 
            unidentifiedRows: updatedUnidentified,
            okbRegionCounts,
            totalRowsProcessed: rawCount,
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
                versionHash: currentVersion 
            });
            localStorage.setItem('last_sync_version', currentVersion);
            // Trigger background upload
            uploadToCloudServerSide(stateToSave).catch(() => {});
        } catch (e) {}
    }, [okbRegionCounts, dateRange, lastSyncVersion]);

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
        if (pollingIntervals.current.has(key)) {
            clearInterval(pollingIntervals.current.get(key));
            pollingIntervals.current.delete(key);
        }
        setEditingClient(null);
        setTimeout(() => persistToDB(finalData, finalUnidentified, finalPoints, totalRowsProcessedRef.current || 0), 50);
    }, [persistToDB]);

    useEffect(() => {
        const restore = async () => {
            try {
                setDbStatus('loading');
                const saved = await loadAnalyticsState();
                if (saved && saved.allData?.length > 0) {
                    setAllData(saved.allData);
                    setUnidentifiedRows(saved.unidentifiedRows || []);
                    setOkbRegionCounts(saved.okbRegionCounts || null);
                    setOkbData(saved.okbData || []);
                    setOkbStatus(saved.okbStatus || null);
                    setDateRange(saved.dateRange);
                    if (saved.versionHash) {
                        setLastSyncVersion(saved.versionHash);
                        localStorage.setItem('last_sync_version', saved.versionHash);
                    }
                    const clientsMap = new Map<string, MapPoint>();
                    saved.allData.forEach((row: AggregatedDataRow) => { row.clients.forEach(c => clientsMap.set(c.key, c)); });
                    const uniqueClients = Array.from(clientsMap.values());
                    setAllActiveClients(uniqueClients);
                    
                    const restoredCount = saved.totalRowsProcessed || 0;
                    totalRowsProcessedRef.current = restoredCount;
                    
                    setProcessingState(prev => ({
                        ...prev,
                        totalRowsProcessed: restoredCount,
                        message: 'Данные восстановлены из локальной базы'
                    }));
                    setDbStatus('ready');
                } else {
                    setDbStatus('empty');
                }
            } catch (e) {
                setDbStatus('empty');
            } finally {
                setIsRestoring(false);
            }
        };
        restore();
    }, []);

    // FETCH HELPER WITH RETRY LOGIC TO PREVENT QUOTA EXHAUSTION
    const fetchWithRetry = async (url: string, retries = 3, backoff = 2000): Promise<Response> => {
        try {
            const res = await fetch(url);
            if (res.status === 429 || res.status >= 500) {
                if (retries > 0) {
                    // API Quota hit or Server Error. Wait and retry.
                    await new Promise(r => setTimeout(r, backoff));
                    return fetchWithRetry(url, retries - 1, backoff * 2);
                }
            }
            return res;
        } catch (e) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, backoff));
                return fetchWithRetry(url, retries - 1, backoff * 2);
            }
            throw e;
        }
    };

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams, targetVersion?: string) => {
        if (processingState.isProcessing) return;
        const { year, month } = params;
        
        // VERSION GUARD: If targetVersion (Cloud) is different from local state, FORCE RESET.
        // This handles the case where user replaced the file (e.g. 60k -> 15k rows) and we must not resume.
        const currentLocalVersion = lastSyncVersion; // Loaded from state/localStorage
        const isVersionMismatch = targetVersion && targetVersion !== currentLocalVersion;
        
        const isBackgroundUpdate = !isVersionMismatch && !!targetVersion && allDataRef.current.length > 0;
        
        if (!isBackgroundUpdate) setActiveModule('amp');
        if (targetVersion) localStorage.setItem('pending_version_hash', targetVersion);
        
        console.log(`Starting processing. Mode: ${isBackgroundUpdate ? 'Resume/Append' : 'Fresh Start'}. Version Mismatch: ${isVersionMismatch}`);
        
        // Prepare State for Processing
        if (isVersionMismatch) {
            // FORCE RESET if versions don't match
            setAllData([]);
            setUnidentifiedRows([]);
            setOkbRegionCounts(null);
            setAllActiveClients([]);
            totalRowsProcessedRef.current = 0;
            allDataRef.current = []; // Clear Ref immediately
            console.log("State reset due to version mismatch.");
        }

        // Data to restore worker state if we are resuming (and not resetting)
        let rowsProcessedSoFar = isVersionMismatch ? 0 : totalRowsProcessedRef.current;
        let restoredDataForWorker: AggregatedDataRow[] | undefined = isVersionMismatch ? undefined : allDataRef.current;
        let restoredUnidentifiedForWorker: UnidentifiedRow[] | undefined = isVersionMismatch ? undefined : unidentifiedRowsRef.current;

        setProcessingState(prev => ({ 
            ...prev,
            isProcessing: true, progress: 0, message: isBackgroundUpdate ? 'Фоновое обновление...' : 'Подключение к облаку...', 
            fileName: isBackgroundUpdate ? 'Синхронизация' : 'Подключение к облаку', 
            startTime: Date.now(), totalRowsProcessed: rowsProcessedSoFar
        }));

        // Try to load snapshot ONLY if versions match OR we don't have a target version constraint
        // If isVersionMismatch is true, we ONLY accept a snapshot if its hash matches the NEW targetVersion.
        if (!isBackgroundUpdate || targetVersion) {
            try {
                const snapshotRes = await fetch('/api/snapshot');
                if (snapshotRes.ok) {
                    const snapshot = await snapshotRes.json();
                    
                    // Critical: Validate snapshot version against target
                    const snapshotValid = !targetVersion || snapshot.versionHash === targetVersion;
                    
                    if (snapshotValid && snapshot && snapshot.data && snapshot.data.aggregatedData && snapshot.data.aggregatedData.length > 0) {
                        const { aggregatedData, unidentifiedRows, okbRegionCounts, totalRowsProcessed } = snapshot.data;
                        const snapshotHash = snapshot.versionHash;
                        
                        // Load data from snapshot
                        setOkbRegionCounts(okbRegionCounts);
                        setAllData(aggregatedData);
                        const clientsMap = new Map<string, MapPoint>();
                        aggregatedData.forEach((row: AggregatedDataRow) => row.clients.forEach(c => clientsMap.set(c.key, c)));
                        const uniqueClients = Array.from(clientsMap.values());
                        setAllActiveClients(uniqueClients);
                        setUnidentifiedRows(unidentifiedRows);
                        setDbStatus('ready');
                        
                        const newVersion = snapshotHash || targetVersion || 'snapshot_' + Date.now();
                        setLastSyncVersion(newVersion);
                        
                        // Set the offset for the fetcher logic
                        rowsProcessedSoFar = totalRowsProcessed || 0;
                        totalRowsProcessedRef.current = rowsProcessedSoFar;
                        
                        // Since we loaded a snapshot matching the target, we don't need to fetch files from 0.
                        // We continue from where snapshot left off.
                        restoredDataForWorker = aggregatedData;
                        restoredUnidentifiedForWorker = unidentifiedRows;
                        
                        setProcessingState(prev => ({ 
                            ...prev, 
                            message: `Загружен снимок (${rowsProcessedSoFar} строк). Синхронизация...`, 
                            totalRowsProcessed: rowsProcessedSoFar 
                        }));
                    } else if (!snapshotValid) {
                        console.log("Snapshot version mismatch. Ignoring snapshot and starting fresh.");
                    }
                } else if (snapshotRes.status === 404 && !isVersionMismatch && allDataRef.current.length > 0) {
                    // FALLBACK: Snapshot missing, but we have local data AND versions match!
                    console.log("Snapshot 404, resuming from local data...");
                    
                    rowsProcessedSoFar = totalRowsProcessedRef.current || 0;
                    restoredDataForWorker = allDataRef.current;
                    restoredUnidentifiedForWorker = unidentifiedRowsRef.current;
                    
                    setProcessingState(prev => ({ 
                        ...prev, 
                        message: `Восстановление из локальной базы (${rowsProcessedSoFar} строк)...`, 
                        totalRowsProcessed: rowsProcessedSoFar 
                    }));
                }
            } catch (e) {
                console.warn("Snapshot fetch failed or 404, attempting fallback or full process.");
            }
        }

        let cacheData: CoordsCache = {};
        try {
            const response = await fetchWithRetry(`/api/get-full-cache?t=${Date.now()}`);
            if (response.ok) cacheData = await response.json();
        } catch (error) {}
        
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                setProcessingState(prev => ({ 
                    ...prev, 
                    progress: msg.payload.percentage, 
                    message: msg.payload.message,
                    // IMPORTANT: Update row count from worker progress even if no chunk emitted yet
                    totalRowsProcessed: msg.payload.totalProcessed !== undefined ? msg.payload.totalProcessed : prev.totalRowsProcessed 
                }));
                if (msg.payload.totalProcessed) totalRowsProcessedRef.current = msg.payload.totalProcessed;
            }
            else if (msg.type === 'result_init' && !isBackgroundUpdate) setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
                // ALLOW DATA UPDATE if we are in resume mode (not background update)
                if (!isBackgroundUpdate) {
                    setAllData(chunkData);
                    const clientsMap = new Map<string, MapPoint>();
                    chunkData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                    setAllActiveClients(Array.from(clientsMap.values()));
                }
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
                totalRowsProcessedRef.current = totalProcessed;
            }
            else if (msg.type === 'CHECKPOINT') {
                const payload = msg.payload;
                setAllData(payload.aggregatedData);
                const clientsMap = new Map<string, MapPoint>();
                payload.aggregatedData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                const uniqueClients = Array.from(clientsMap.values());
                setAllActiveClients(uniqueClients);
                setUnidentifiedRows(payload.unidentifiedRows);
                const version = localStorage.getItem('pending_version_hash') || 'checkpoint_' + Date.now();
                await persistToDB(payload.aggregatedData, payload.unidentifiedRows, uniqueClients, payload.totalRowsProcessed, version);
                uploadToCloudServerSide(payload).catch(() => {});
            }
            else if (msg.type === 'result_finished') {
                const payload = msg.payload as WorkerResultPayload;
                // Even if empty, we might have reset the data, so we must update state to empty
                setOkbRegionCounts(payload.okbRegionCounts);
                setAllData(payload.aggregatedData);
                const clientsMap = new Map<string, MapPoint>();
                payload.aggregatedData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                const uniqueClients = Array.from(clientsMap.values());
                setAllActiveClients(uniqueClients);
                setUnidentifiedRows(payload.unidentifiedRows);
                setDbStatus('ready');
                const version = localStorage.getItem('pending_version_hash') || 'processed_' + Date.now();
                await persistToDB(payload.aggregatedData, payload.unidentifiedRows, uniqueClients, payload.totalRowsProcessed, version);
                setLastSyncVersion(version);
                localStorage.setItem('last_sync_version', version);
                uploadToCloudServerSide(payload).finally(() => {
                    setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Синхронизировано', totalRowsProcessed: payload.totalRowsProcessed }));
                });
            }
        };
        
        // Pass the already processed count AND RESTORED DATA to the worker so it knows where to resume counting and aggregating
        workerRef.current.postMessage({ 
            type: 'INIT_STREAM', 
            payload: { 
                okbData, 
                cacheData, 
                totalRowsProcessed: rowsProcessedSoFar,
                restoredData: restoredDataForWorker,
                restoredUnidentified: restoredUnidentifiedForWorker
            } 
        });
        
        try {
            const listRes = await fetchWithRetry(`/api/get-akb?year=${year}${month ? `&month=${month}` : ''}&mode=list`);
            const allFiles = listRes.ok ? await listRes.json() : [];
            
            if (allFiles.length === 0) {
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Файлы не найдены в облаке' }));
                return;
            }

            // DYNAMIC CHUNK SIZE TO AVOID QUOTA LIMITS WHEN SKIPPING
            let currentStreamRowCounter = 0;

            for (const file of allFiles) {
                let offset = 0, hasMore = true, isFirstChunk = true;
                
                while (hasMore) {
                    // DYNAMIC CHUNK SIZE LOGIC:
                    const remainingToSkip = Math.max(0, rowsProcessedSoFar - currentStreamRowCounter);
                    const CHUNK_SIZE = remainingToSkip > 2000 ? 2500 : 1000;

                    const mimeTypeParam = file.mimeType ? `&mimeType=${encodeURIComponent(file.mimeType)}` : '';
                    
                    const res = await fetchWithRetry(`/api/get-akb?fileId=${file.id}&offset=${offset}&limit=${CHUNK_SIZE}${mimeTypeParam}`);
                    if (!res.ok) break;
                    
                    const result = await res.json();
                    const chunkRows = result.rows || [];
                    const fetchedChunkSize = chunkRows.length;

                    if (fetchedChunkSize > 0) {
                        // Fast Forward Logic
                        if (currentStreamRowCounter + fetchedChunkSize <= rowsProcessedSoFar) {
                            // UPDATE UI: Increment totalRowsProcessed VISUALLY so user sees progress
                            const visualCount = Math.min(rowsProcessedSoFar, currentStreamRowCounter + fetchedChunkSize);
                            setProcessingState(prev => ({ 
                                ...prev, 
                                message: `Сверка данных...`,
                                totalRowsProcessed: visualCount, // <--- IMPORTANT: Show counter climbing
                                progress: (visualCount / (rowsProcessedSoFar || 1)) * 100 
                            }));
                        } else {
                            // Send partial or full chunk
                            let rowsToSend = chunkRows;
                            if (currentStreamRowCounter < rowsProcessedSoFar) {
                                // If we are at the boundary, update UI to show we are crossing over
                                setProcessingState(prev => ({ 
                                    ...prev, 
                                    message: `Обработка новых данных...`
                                }));
                                const rowsToSkipInChunk = rowsProcessedSoFar - currentStreamRowCounter;
                                rowsToSend = chunkRows.slice(rowsToSkipInChunk);
                            }
                            
                            if (rowsToSend.length > 0) {
                                workerRef.current?.postMessage({ 
                                    type: 'PROCESS_CHUNK', 
                                    payload: { rawData: rowsToSend, isFirstChunk: isFirstChunk && offset === 0, fileName: file.name } 
                                });
                            }
                        }
                        
                        currentStreamRowCounter += fetchedChunkSize;
                        isFirstChunk = false;
                        
                        if (remainingToSkip > 0) {
                             await new Promise(r => setTimeout(r, 50)); 
                        }
                    } else {
                        hasMore = false;
                    }
                    
                    hasMore = result.hasMore;
                    offset += CHUNK_SIZE;
                }
            }
        } catch (error) {
            console.error(error);
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка связи или лимит квот' }));
        } finally {
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        }
    }, [okbData, persistToDB, processingState.isProcessing, processingState.totalRowsProcessed, lastSyncVersion]);

    const checkCloudChanges = useCallback(async () => {
        if (isRestoring || processingState.isProcessing || !okbStatus || okbStatus.status !== 'ready') return;
        try {
            const res = await fetch(`/api/get-akb?mode=metadata&year=2025&t=${Date.now()}`);
            if (res.ok) {
                const meta = await res.json();
                setIsLiveConnected(true);
                // Only trigger update if versionHash exists AND is different AND is NOT "none"
                if (meta.versionHash && meta.versionHash !== 'none' && meta.versionHash !== lastSyncVersion) {
                    console.log('Detected cloud change:', meta.versionHash);
                    handleStartCloudProcessing({ year: '2025' }, meta.versionHash);
                }
            }
        } catch (e) { setIsLiveConnected(false); }
    }, [isRestoring, processingState.isProcessing, okbStatus, lastSyncVersion, handleStartCloudProcessing]);

    useEffect(() => {
        const timer = setInterval(checkCloudChanges, 60000); 
        checkCloudChanges();
        return () => clearInterval(timer);
    }, [checkCloudChanges]);

    const smartData = useMemo(() => {
        const okbCoordSet = new Set<string>();
        okbData.forEach(row => { if (row.lat && row.lon) okbCoordSet.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`); });
        return enrichDataWithSmartPlan(allData, okbRegionCounts, 15, okbCoordSet);
    }, [allData, okbRegionCounts, okbData]);

    useEffect(() => { setFilteredData(applyFilters(smartData, filters)); }, [smartData, filters]);

    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => {
        const baseMetrics = calculateSummaryMetrics(filteredData);
        return baseMetrics ? { ...baseMetrics, totalActiveClients: allActiveClients.length } : null;
    }, [filteredData, allActiveClients.length]);

    const potentialClients = useMemo(() => {
        if (!okbData.length) return [];
        const activeAddressesSet = new Set(allActiveClients.map(c => normalizeAddress(c.address)));
        return okbData.filter(okb => !activeAddressesSet.has(normalizeAddress(findAddressInRow(okb))));
    }, [okbData, allActiveClients]);

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
                                <div className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Cloud Link</span>
                            </div>
                            <span className="text-xs font-bold text-white">{isLiveConnected ? 'Live: 60s Polling' : 'Disconnected'}</span>
                        </div>
                        {processingState.isProcessing && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full animate-fade-in">
                                <LoaderIcon className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-tighter">
                                    {processingState.message || (allData.length > 0 ? 'Синхронизация' : 'Загрузка')}: {Math.round(processingState.progress)}%
                                </span>
                            </div>
                        )}
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
                            onStartProcessing={() => {}}
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
                            onStartEdit={setEditingClient}
                        />
                    )}
                    {activeModule === 'amp' && (
                        <div className="space-y-6">
                             <InteractiveRegionMap data={filteredData} selectedRegions={filters.region} potentialClients={potentialClients} activeClients={allActiveClients} flyToClientKey={flyToClientKey} onEditClient={setEditingClient} />
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-1"><Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({ rm: '', brand: [], packaging: [], region: [] })} disabled={allData.length === 0} /></div>
                                <div className="lg:col-span-3"><PotentialChart data={filteredData} /></div>
                            </div>
                            <ResultsTable data={filteredData} onRowClick={setSelectedDetailsRow} disabled={allData.length === 0} unidentifiedRowsCount={unidentifiedRows.length} onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} />
                        </div>
                    )}
                    {activeModule === 'dashboard' && (
                        <RMDashboard isOpen={true} onClose={() => setActiveModule('amp')} data={filteredData} okbRegionCounts={okbRegionCounts} okbData={okbData} mode="page" metrics={summaryMetrics} okbStatus={okbStatus} dateRange={dateRange} onEditClient={setEditingClient} />
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
            {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={setEditingClient} />}
            {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={setEditingClient} />}
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
        </div>
    );
};

export default App;
