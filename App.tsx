
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
import { LoaderIcon, CheckIcon, ErrorIcon, TrashIcon } from './components/icons';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState, clearAnalyticsState } from './utils/db';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    // Храним версию именно СНИМКА (Snapshot), а не исходного файла
    const [lastSnapshotVersion, setLastSnapshotVersion] = useState<string | null>(localStorage.getItem('last_snapshot_version'));
    
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isSavingToCloud, setIsSavingToCloud] = useState(false); 
    const [uploadProgress, setUploadProgress] = useState(0); // Progress for saving
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
    const processedFileIdsRef = useRef<Set<string>>(new Set()); // New Ref to track files in memory
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const workerRef = useRef<Worker | null>(null);
    const pollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    
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

    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    const performUpload = async (payload: any): Promise<string[]> => {
        try {
            console.log("Starting upload sequence to Sheets...");
            // Инициализация (очистка листа)
            const initRes = await fetch('/api/get-full-cache?action=init-snapshot', { method: 'POST' });
            if (!initRes.ok) throw new Error('Failed to init snapshot');

            const jsonString = JSON.stringify(payload);
            
            // ВАЖНО: 45 000 символов. Это лимит одной ячейки Google Sheets (50k safe limit).
            const CHUNK_SIZE = 45_000; 
            const totalChunks = Math.ceil(jsonString.length / CHUNK_SIZE);
            let offset = 0;
            let chunkIndex = 0;
            
            while (offset < jsonString.length) {
                setUploadProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
                
                const chunk = jsonString.slice(offset, offset + CHUNK_SIZE);
                
                const res = await fetch('/api/get-full-cache?action=append-snapshot', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chunk }) 
                });
                
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Upload failed: ${text.substring(0, 100)}`);
                }
                
                offset += CHUNK_SIZE;
                chunkIndex++;
            }
            console.log('Snapshot uploaded successfully to Sheets.');
            setUploadProgress(0);
            return []; // Мы не используем ID файлов, так как пишем в таблицу
        } catch (e) {
            console.error("Server upload failed:", e);
            setUploadProgress(0);
            throw e;
        }
    };

    const uploadToCloudServerSide = async (payload: any) => {
        if (!payload || !payload.aggregatedData || payload.aggregatedData.length === 0) return;

        if (isUploadingRef.current) {
            pendingUploadRef.current = payload;
            return;
        }
        
        isUploadingRef.current = true;
        setIsSavingToCloud(true); // START INDICATOR

        try {
            await performUpload(payload);
            
            // Если во время загрузки пришли новые данные, загружаем их
            while (pendingUploadRef.current) {
                const nextPayload = pendingUploadRef.current;
                pendingUploadRef.current = null;
                await performUpload(nextPayload);
                payload = nextPayload;
            }

            // --- SAVE META FILE (INTO SHEET CELL B1) ---
            console.log("Финализация: сохранение метаданных версии...");
            await fetch('/api/get-full-cache?action=save-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    versionHash: payload.versionHash,
                    totalRowsProcessed: payload.totalRowsProcessed,
                    processedFileIds: payload.processedFileIds, 
                    chunkFileIds: [] // Not used in Sheet strategy
                })
            });

        } catch (e) {
            console.error("Cloud sync error:", e);
        } finally {
            isUploadingRef.current = false;
            setIsSavingToCloud(false); // STOP INDICATOR
        }
    };

    const persistToDB = useCallback(async (
        updatedData: AggregatedDataRow[], 
        updatedUnidentified: UnidentifiedRow[],
        updatedActivePoints: MapPoint[],
        rawCount: number,
        vHash?: string
    ) => {
        const currentVersion = vHash || lastSnapshotVersion || `local_${Date.now()}`;
        totalRowsProcessedRef.current = rawCount;

        const stateToSave = {
            aggregatedData: updatedData, 
            unidentifiedRows: updatedUnidentified,
            okbRegionCounts,
            totalRowsProcessed: rawCount,
            processedFileIds: Array.from(processedFileIdsRef.current), // Persist processed files
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
        setTimeout(() => persistToDB(finalData, finalUnidentified, finalPoints, totalRowsProcessedRef.current || 0), 50);
    }, [persistToDB]);

    // ... (handleStartPolling, handleDeleteClient remain same, just update persist call if needed) ...
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

    const handleHardReset = useCallback(async () => {
        if (!window.confirm("Вы уверены? Это действие полностью удалит локальные данные и сбросит состояние приложения. Страница будет перезагружена.")) return;
        await clearAnalyticsState();
        localStorage.removeItem('last_snapshot_version');
        localStorage.removeItem('last_sync_version');
        processedFileIdsRef.current.clear();
        window.location.reload();
    }, []);

    const fetchWithRetry = async (url: string, retries = 5, backoff = 2000): Promise<Response> => {
        try {
            const res = await fetch(url);
            if (res.status === 429 || res.status >= 500) {
                if (retries > 0) {
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
        
        let effectiveTargetVersion = targetVersion;
        // Переменная для хранения списка файлов из метаданных (резервная копия)
        let fallbackProcessedFiles: string[] = [];

        // 1. Получаем метаданные (версию и список файлов)
        if (!effectiveTargetVersion) {
             try {
                 const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
                 if(metaRes.ok) {
                     const remoteMeta = await metaRes.json();
                     if (remoteMeta.versionHash) {
                         effectiveTargetVersion = remoteMeta.versionHash;
                     }
                     if (remoteMeta.processedFileIds && Array.isArray(remoteMeta.processedFileIds)) {
                         fallbackProcessedFiles = remoteMeta.processedFileIds;
                     }
                 }
             } catch(e) { console.error("Failed to check snapshot metadata", e); }
        }

        const currentLocalVersion = lastSnapshotVersion; 
        const isVersionMismatch = effectiveTargetVersion && effectiveTargetVersion !== currentLocalVersion;
        const isBackgroundUpdate = (allDataRef.current.length > 0);
        
        if (!isBackgroundUpdate) setActiveModule('amp');
        if (effectiveTargetVersion) {
            localStorage.setItem('pending_version_hash', effectiveTargetVersion);
        }
        
        console.log(`Cloud Sync. Local: ${currentLocalVersion}, Remote: ${effectiveTargetVersion}, Mismatch: ${isVersionMismatch}`);
        
        // Сброс данных при несовпадении версий
        if (isVersionMismatch) {
            console.log("!!! SNAPSHOT MISMATCH: WIPING LOCAL DB & STATE !!!");
            await clearAnalyticsState();
            setAllData([]);
            setUnidentifiedRows([]);
            setOkbRegionCounts(null);
            setAllActiveClients([]);
            setProcessingState(prev => ({ ...prev, progress: 0, message: 'Загрузка новой версии...', totalRowsProcessed: 0 }));
            
            totalRowsProcessedRef.current = 0;
            processedFileIdsRef.current.clear(); // Мы очищаем реф
            allDataRef.current = [];
            unidentifiedRowsRef.current = [];
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        let rowsProcessedSoFar = isVersionMismatch ? 0 : totalRowsProcessedRef.current;
        let restoredDataForWorker: AggregatedDataRow[] | undefined = isVersionMismatch ? undefined : allDataRef.current;
        let restoredUnidentifiedForWorker: UnidentifiedRow[] | undefined = isVersionMismatch ? undefined : unidentifiedRowsRef.current;

        setProcessingState(prev => ({ 
            ...prev,
            isProcessing: true, progress: 0, 
            message: 'Синхронизация...', 
            startTime: Date.now(), totalRowsProcessed: rowsProcessedSoFar
        }));
        
        // 2. ЗАГРУЗКА СНИМКА (SNAPSHOT)
        let snapshotLoaded = false;
        if (isVersionMismatch || allDataRef.current.length === 0) {
            try {
                const snapshotRes = await fetch(`/api/get-full-cache?action=get-snapshot&t=${Date.now()}`); 
                if (snapshotRes.ok) {
                    const snapshot = await snapshotRes.json();
                    
                    const data = snapshot.data || snapshot; 

                    if (data && data.aggregatedData && data.aggregatedData.length > 0) {
                        const { aggregatedData, unidentifiedRows, okbRegionCounts, totalRowsProcessed, processedFileIds } = data;
                        const snapshotHash = data.versionHash || effectiveTargetVersion; 
                        
                        setOkbRegionCounts(okbRegionCounts);
                        setAllData(aggregatedData);
                        const clientsMap = new Map<string, MapPoint>();
                        aggregatedData.forEach((row: AggregatedDataRow) => row.clients.forEach(c => clientsMap.set(c.key, c)));
                        setAllActiveClients(Array.from(clientsMap.values()));
                        setUnidentifiedRows(unidentifiedRows);
                        setDbStatus('ready');
                        
                        setLastSnapshotVersion(snapshotHash);
                        localStorage.setItem('last_snapshot_version', snapshotHash);
                        
                        rowsProcessedSoFar = totalRowsProcessed || 0;
                        totalRowsProcessedRef.current = rowsProcessedSoFar;
                        
                        if (processedFileIds) {
                            processedFileIdsRef.current = new Set(processedFileIds);
                            console.log(`Loaded ${processedFileIds.length} processed files from snapshot.`);
                        }
                        
                        restoredDataForWorker = aggregatedData;
                        restoredUnidentifiedForWorker = unidentifiedRows;
                        snapshotLoaded = true;
                    }
                }
            } catch (e) {
                console.warn("Snapshot fetch failed. Falling back to raw file processing.");
            }
        }

        // FALLBACK: Если снимок не загрузился, но у нас есть список файлов из метаданных
        if (!snapshotLoaded && fallbackProcessedFiles.length > 0) {
            console.log(`Restoring ${fallbackProcessedFiles.length} processed files from metadata fallback.`);
            processedFileIdsRef.current = new Set(fallbackProcessedFiles);
        }

        // Подготовка кэша и воркера
        let cacheData: CoordsCache = {};
        try {
            const response = await fetchWithRetry(`/api/get-full-cache?t=${Date.now()}`);
            if (response.ok) cacheData = await response.json();
        } catch (error) {}
        
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        // Обработчик сообщений от воркера (Checkpoint, Progress, Finish)
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message, totalRowsProcessed: msg.payload.totalProcessed ?? prev.totalRowsProcessed }));
                if (msg.payload.totalProcessed) totalRowsProcessedRef.current = msg.payload.totalProcessed;
            }
            else if (msg.type === 'result_init' && !isBackgroundUpdate) setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
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
                setAllActiveClients(prev => { const map = new Map(prev.map(c => [c.key, c])); payload.aggregatedData.forEach(r => r.clients.forEach(c => map.set(c.key, c))); return Array.from(map.values()); });
                setUnidentifiedRows(payload.unidentifiedRows);
                
                const version = localStorage.getItem('pending_version_hash') || `proc_${Date.now()}`;
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
                
                const finalVersion = effectiveTargetVersion || `processed_${Date.now()}`;
                await persistToDB(payload.aggregatedData, payload.unidentifiedRows, [], payload.totalRowsProcessed, finalVersion);
                
                setLastSnapshotVersion(finalVersion);
                localStorage.setItem('last_snapshot_version', finalVersion);
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Синхронизация завершена', totalRowsProcessed: payload.totalRowsProcessed }));
            }
        };
        
        workerRef.current.postMessage({ 
            type: 'INIT_STREAM', 
            payload: { okbData, cacheData, totalRowsProcessed: rowsProcessedSoFar, restoredData: restoredDataForWorker, restoredUnidentified: restoredUnidentifiedForWorker } 
        });
        
        // 3. СКАНИРОВАНИЕ ФАЙЛОВ (ПО ГОДАМ)
        try {
            const YEARS_TO_SCAN = ['2025', '2026'];

            for (const scanYear of YEARS_TO_SCAN) {
                setProcessingState(prev => ({ ...prev, message: `Поиск файлов за ${scanYear}...` }));
                
                const listRes = await fetchWithRetry(`/api/get-akb?year=${scanYear}&mode=list`);
                const allFiles = listRes.ok ? await listRes.json() : [];
                
                if (allFiles.length === 0) continue;

                for (const file of allFiles) {
                    if (processedFileIdsRef.current.has(file.id)) {
                        console.log(`Skipping already processed file: ${file.name}`);
                        continue;
                    }
                    
                    let offset = 0, hasMore = true, isFirstChunk = true;
                    
                    while (hasMore) {
                        const CHUNK_SIZE = 1000; 
                        const mimeTypeParam = file.mimeType ? `&mimeType=${encodeURIComponent(file.mimeType)}` : '';
                        
                        setProcessingState(prev => ({ 
                            ...prev, 
                            fileName: file.name,
                            message: `Обработка: ${file.name} (строки ${offset}-${offset + CHUNK_SIZE})` 
                        }));
                        
                        await new Promise(r => setTimeout(r, 200)); 
                        const res = await fetchWithRetry(`/api/get-akb?fileId=${file.id}&offset=${offset}&limit=${CHUNK_SIZE}${mimeTypeParam}`);
                        
                        if (!res.ok) {
                            if (offset > 0 && (res.status === 400 || res.status === 500)) {
                                 console.log(`File ${file.name} finished (limit reached).`);
                                 hasMore = false; 
                                 break; 
                            } else {
                                 console.error(`Failed to fetch chunk for ${file.name}, skipping file`);
                                 break;
                            }
                        } else {
                            const result = await res.json();
                            const chunkRows = result.rows || [];
                            
                            if (chunkRows.length > 0) {
                                workerRef.current?.postMessage({ 
                                    type: 'PROCESS_CHUNK', 
                                    payload: { rawData: chunkRows, isFirstChunk: isFirstChunk && offset === 0, fileName: file.name } 
                                });
                                isFirstChunk = false;
                            } else {
                                hasMore = false;
                            }
                            
                            if (chunkRows.length < CHUNK_SIZE) hasMore = false;
                            hasMore = result.hasMore && hasMore; 
                            offset += CHUNK_SIZE;
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
    }, [okbData, persistToDB, processingState.isProcessing, lastSnapshotVersion]);

    const checkCloudChanges = useCallback(async () => {
        if (isRestoring || processingState.isProcessing || !okbStatus || okbStatus.status !== 'ready') return;
        try {
            const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
            if (metaRes.ok) {
                const meta = await metaRes.json();
                setIsLiveConnected(true);
                if (meta.versionHash && meta.versionHash !== 'none' && meta.versionHash !== lastSnapshotVersion) {
                    console.log('Detected snapshot change:', meta.versionHash, 'vs local', lastSnapshotVersion);
                    handleStartCloudProcessing({ year: '2025' }, meta.versionHash);
                }
            }
        } catch (e) { setIsLiveConnected(false); }
    }, [isRestoring, processingState.isProcessing, okbStatus, lastSnapshotVersion, handleStartCloudProcessing]);

    useEffect(() => {
        const timer = setInterval(checkCloudChanges, 60000); 
        if (!isRestoring && dbStatus === 'ready') {
            checkCloudChanges();
        }
        return () => clearInterval(timer);
    }, [checkCloudChanges, isRestoring, dbStatus]);

    // 1. Инициализация: СТРОГАЯ синхронизация с сервером при входе
    useEffect(() => {
        const initializeApp = async () => {
            // Only runs once on mount
            setDbStatus('loading');
            setProcessingState(prev => ({ ...prev, message: 'Синхронизация с командой...' }));

            try {
                // ШАГ 1: Сначала загружаем то, что есть локально
                const localState = await loadAnalyticsState();
                let localVersion = null;

                if (localState && localState.allData?.length > 0) {
                    setAllData(localState.allData);
                    setUnidentifiedRows(localState.unidentifiedRows || []);
                    setOkbRegionCounts(localState.okbRegionCounts || null);
                    setOkbData(localState.okbData || []);
                    setOkbStatus(localState.okbStatus || null);
                    setDateRange(localState.dateRange);
                    
                    if (localState.processedFileIds) {
                        processedFileIdsRef.current = new Set(localState.processedFileIds);
                    }

                    if (localState.versionHash) {
                        localVersion = localState.versionHash;
                        setLastSnapshotVersion(localVersion);
                        localStorage.setItem('last_snapshot_version', localVersion);
                    }
                    
                    const clientsMap = new Map<string, MapPoint>();
                    localState.allData.forEach((row: AggregatedDataRow) => { row.clients.forEach(c => clientsMap.set(c.key, c)); });
                    setAllActiveClients(Array.from(clientsMap.values()));
                    
                    const restoredCount = localState.totalRowsProcessed || 0;
                    totalRowsProcessedRef.current = restoredCount;
                }

                // ШАГ 2: Спрашиваем у сервера актуальную версию (через мета-файл)
                const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
                
                if (metaRes.ok) {
                    const serverMeta = await metaRes.json();
                    
                    if (serverMeta.processedFileIds && Array.isArray(serverMeta.processedFileIds)) {
                        processedFileIdsRef.current = new Set(serverMeta.processedFileIds);
                    }
                    
                    // ВАРИАНТ А: На сервере версия НОВЕЕ -> Полная перезагрузка из снимка
                    if (serverMeta.versionHash && serverMeta.versionHash !== 'none' && serverMeta.versionHash !== localVersion) {
                        console.log(`Найден новый прогресс на сервере (${serverMeta.versionHash}). Обновляем...`);
                        await handleStartCloudProcessing({ year: '2025' }, serverMeta.versionHash);
                        setIsRestoring(false); 
                        return;
                    }
                }

                // ШАГ 3: Версии совпадают ИЛИ сервер недоступен.
                if (localState && localState.allData?.length > 0) {
                    setDbStatus('ready');
                    console.log("Снимок актуален. Проверяем наличие необработанных файлов...");
                    
                    await handleStartCloudProcessing({ year: '2025' }, localVersion || undefined);
                } else {
                    // Локально пусто -> начинаем с нуля
                    setDbStatus('empty');
                    handleStartCloudProcessing({ year: '2025' });
                }

            } catch (e) {
                console.error("Ошибка инициализации:", e);
                if (allDataRef.current.length > 0) setDbStatus('ready');
                else setDbStatus('empty');
            } finally {
                setIsRestoring(false);
            }
        };

        initializeApp();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Clean up workers on unmount
    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
            }
            pollingIntervals.current.forEach(clearInterval);
        };
    }, []);

    // Add saving on close/refresh
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Attempt to trigger a final save if needed, though unreliable
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

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
                                <div className={`w-2 h-2 rounded-full ${isSavingToCloud ? 'bg-cyan-400 animate-ping' : (isLiveConnected ? 'bg-emerald-500' : 'bg-red-500')}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Cloud Sync</span>
                            </div>
                            <span className="text-xs font-bold text-white">
                                {isSavingToCloud ? `Saving ${uploadProgress}%` : (isLiveConnected ? 'Live: 60s Polling' : 'Disconnected')}
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
                        {/* Manual Reset Button */}
                        <button 
                            onClick={handleHardReset} 
                            className="flex items-center gap-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 transition-all text-xs font-bold ml-4"
                            title="Сбросить все данные и перезагрузить (Factory Reset)"
                        >
                            <TrashIcon className="w-3 h-3" /> Сброс Кэша
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
