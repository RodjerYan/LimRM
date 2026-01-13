
import { useState, useRef, useCallback } from 'react';
import { 
    AggregatedDataRow, 
    UnidentifiedRow, 
    OkbDataRow, 
    OkbStatus, 
    FileProcessingState,
    CloudLoadParams,
    WorkerMessage,
    WorkerResultPayload,
    CoordsCache
} from '../types';
import { saveAnalyticsState, clearAnalyticsState } from '../utils/db';

interface UseCloudSyncProps {
    allDataRef: React.MutableRefObject<AggregatedDataRow[]>;
    unidentifiedRowsRef: React.MutableRefObject<UnidentifiedRow[]>;
    processedFileIdsRef: React.MutableRefObject<Set<string>>;
    totalRowsProcessedRef: React.MutableRefObject<number>;
    setAllData: React.Dispatch<React.SetStateAction<AggregatedDataRow[]>>;
    setUnidentifiedRows: React.Dispatch<React.SetStateAction<UnidentifiedRow[]>>;
    setOkbRegionCounts: React.Dispatch<React.SetStateAction<{ [key: string]: number } | null>>;
    setAllActiveClients: React.Dispatch<React.SetStateAction<any[]>>; // MapPoint[]
    setDbStatus: React.Dispatch<React.SetStateAction<'empty' | 'ready' | 'loading'>>;
    okbData: OkbDataRow[];
    lastSnapshotVersion: string | null;
    setLastSnapshotVersion: React.Dispatch<React.SetStateAction<string | null>>;
}

// Helper to slice data into 45k char chunks (safe for Google Sheets cells)
const prepareUploadPayload = (payload: any) => {
    const { aggregatedData, ...meta } = payload;
    const jsonString = JSON.stringify({ aggregatedData });
    const CHUNK_SIZE = 45000; 
    const chunks: string[] = [];
    let offset = 0;
    while (offset < jsonString.length) {
        chunks.push(jsonString.slice(offset, offset + CHUNK_SIZE));
        offset += CHUNK_SIZE;
    }
    return { chunks, meta };
};

export const useCloudSync = ({
    allDataRef,
    unidentifiedRowsRef,
    processedFileIdsRef,
    totalRowsProcessedRef,
    setAllData,
    setUnidentifiedRows,
    setOkbRegionCounts,
    setAllActiveClients,
    setDbStatus,
    okbData,
    lastSnapshotVersion,
    setLastSnapshotVersion
}: UseCloudSyncProps) => {
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isSavingToCloud, setIsSavingToCloud] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false,
        progress: 0,
        message: 'Система готова',
        fileName: null,
        backgroundMessage: null,
        startTime: null,
        totalRowsProcessed: 0
    });

    const workerRef = useRef<Worker | null>(null);
    const isUploadingRef = useRef(false);
    const pendingUploadRef = useRef<any>(null);
    const uploadStartTimeRef = useRef<number>(0);

    const uploadToCloudServerSide = async (payload: any) => {
        if (!payload || !payload.aggregatedData || payload.aggregatedData.length === 0) return;

        if (isUploadingRef.current) {
            pendingUploadRef.current = payload;
            return;
        }
        
        isUploadingRef.current = true;
        setIsSavingToCloud(true);
        uploadStartTimeRef.current = Date.now();

        try {
            // Process pending immediately if it exists (skip intermediate states)
            if (pendingUploadRef.current) {
                payload = pendingUploadRef.current;
                pendingUploadRef.current = null;
            }

            console.log("Preparing snapshot for Sheets...");
            const { chunks, meta } = prepareUploadPayload(payload);
            
            setUploadProgress(10); // Indicate start

            const res = await fetch('/api/get-full-cache?action=upload-full-snapshot', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': import.meta.env.VITE_API_SECRET_KEY || ''
                },
                body: JSON.stringify({ chunks, meta })
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Upload failed: ${errorText}`);
            }

            setUploadProgress(100);
            console.log("Snapshot saved successfully to Google Sheets!");

            if (meta.versionHash) {
                setLastSnapshotVersion(meta.versionHash);
                localStorage.setItem('last_snapshot_version', meta.versionHash);
            }

        } catch (e) {
            console.error("Cloud sync error:", e);
        } finally {
            isUploadingRef.current = false;
            setIsSavingToCloud(false);
            setUploadProgress(0);
        }
    };

    const persistToDB = useCallback(async (
        updatedData: AggregatedDataRow[], 
        updatedUnidentified: UnidentifiedRow[],
        rawCount: number,
        vHash?: string
    ) => {
        const currentVersion = vHash || lastSnapshotVersion || `local_${Date.now()}`;
        totalRowsProcessedRef.current = rawCount;

        const stateToSave = {
            aggregatedData: updatedData, 
            unidentifiedRows: updatedUnidentified,
            totalRowsProcessed: rawCount,
            processedFileIds: Array.from(processedFileIdsRef.current),
            versionHash: currentVersion,
        };
        try {
            await saveAnalyticsState({ 
                allData: updatedData, 
                unidentifiedRows: updatedUnidentified, 
                okbRegionCounts: null, 
                okbData: [], 
                okbStatus: null,
                totalRowsProcessed: rawCount, 
                processedFileIds: Array.from(processedFileIdsRef.current),
                versionHash: currentVersion 
            });
            
            localStorage.setItem('last_snapshot_version', currentVersion);
            setLastSnapshotVersion(currentVersion);

            uploadToCloudServerSide(stateToSave);
        } catch (e) {}
    }, [lastSnapshotVersion, setLastSnapshotVersion, processedFileIdsRef, totalRowsProcessedRef]);

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams, targetVersion?: string) => {
        if (processingState.isProcessing) return;
        
        let effectiveTargetVersion = targetVersion;
        let fallbackProcessedFiles: string[] = [];

        if (!effectiveTargetVersion) {
             try {
                 const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
                 if(metaRes.ok) {
                     const remoteMeta = await metaRes.json();
                     if (remoteMeta.versionHash) effectiveTargetVersion = remoteMeta.versionHash;
                     if (remoteMeta.processedFileIds) fallbackProcessedFiles = remoteMeta.processedFileIds;
                 }
             } catch(e) { console.error("Failed to check snapshot metadata", e); }
        }

        const currentLocalVersion = lastSnapshotVersion; 
        const isVersionMismatch = effectiveTargetVersion && effectiveTargetVersion !== currentLocalVersion;
        const isBackgroundUpdate = (allDataRef.current.length > 0);
        
        if (effectiveTargetVersion) localStorage.setItem('pending_version_hash', effectiveTargetVersion);
        
        if (isVersionMismatch) {
            await clearAnalyticsState();
            setAllData([]);
            setUnidentifiedRows([]);
            setOkbRegionCounts(null);
            setAllActiveClients([]);
            setProcessingState(prev => ({ ...prev, progress: 0, message: 'Загрузка новой версии...', totalRowsProcessed: 0 }));
            
            totalRowsProcessedRef.current = 0;
            processedFileIdsRef.current.clear();
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
        
        // Snapshot loading logic
        let snapshotLoaded = false;
        if (isVersionMismatch || allDataRef.current.length === 0) {
            try {
                // Use new snapshot action
                const snapshotRes = await fetch(`/api/get-full-cache?action=get-snapshot&t=${Date.now()}`); 
                if (snapshotRes.ok) {
                    const snapshot = await snapshotRes.json();
                    const data = snapshot.data || snapshot; 

                    if (data && data.aggregatedData && data.aggregatedData.length > 0) {
                        const { aggregatedData, unidentifiedRows, okbRegionCounts, totalRowsProcessed, processedFileIds } = data;
                        const snapshotHash = data.versionHash || effectiveTargetVersion; 
                        
                        setOkbRegionCounts(okbRegionCounts);
                        setAllData(aggregatedData);
                        const clientsMap = new Map<string, any>();
                        aggregatedData.forEach((row: AggregatedDataRow) => row.clients.forEach(c => clientsMap.set(c.key, c)));
                        setAllActiveClients(Array.from(clientsMap.values()));
                        setUnidentifiedRows(unidentifiedRows);
                        setDbStatus('ready');
                        
                        setLastSnapshotVersion(snapshotHash);
                        localStorage.setItem('last_snapshot_version', snapshotHash);
                        
                        rowsProcessedSoFar = totalRowsProcessed || 0;
                        totalRowsProcessedRef.current = rowsProcessedSoFar;
                        
                        if (processedFileIds) processedFileIdsRef.current = new Set(processedFileIds);
                        
                        restoredDataForWorker = aggregatedData;
                        restoredUnidentifiedForWorker = unidentifiedRows;
                        snapshotLoaded = true;
                    }
                }
            } catch (e) { console.warn("Snapshot fetch failed"); }
        }

        if (!snapshotLoaded && fallbackProcessedFiles.length > 0) {
            processedFileIdsRef.current = new Set(fallbackProcessedFiles);
        }

        let cacheData: CoordsCache = {};
        try {
            const response = await fetch(`/api/get-full-cache?t=${Date.now()}`);
            if (response.ok) cacheData = await response.json();
        } catch (error) {}
        
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('../services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message, totalRowsProcessed: msg.payload.totalProcessed ?? prev.totalRowsProcessed }));
                if (msg.payload.totalProcessed) totalRowsProcessedRef.current = msg.payload.totalProcessed;
            }
            else if (msg.type === 'result_init' && !isBackgroundUpdate) {
                setOkbRegionCounts(msg.payload.okbRegionCounts);
            }
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
                if (!isBackgroundUpdate) {
                    setAllData(chunkData);
                    const clientsMap = new Map<string, any>();
                    chunkData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                    setAllActiveClients(Array.from(clientsMap.values()));
                }
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
                totalRowsProcessedRef.current = totalProcessed;
            }
            else if (msg.type === 'CHECKPOINT') {
                const payload = msg.payload;
                setAllData(payload.aggregatedData);
                setAllActiveClients(prev => { 
                    const map = new Map(prev.map(c => [c.key, c])); 
                    payload.aggregatedData.forEach(r => r.clients.forEach(c => map.set(c.key, c))); 
                    return Array.from(map.values()); 
                });
                setUnidentifiedRows(payload.unidentifiedRows);
                
                const version = localStorage.getItem('pending_version_hash') || `proc_${Date.now()}`;
                await persistToDB(payload.aggregatedData, payload.unidentifiedRows, payload.totalRowsProcessed, version);
            }
            else if (msg.type === 'result_finished') {
                const payload = msg.payload as WorkerResultPayload;
                setOkbRegionCounts(payload.okbRegionCounts);
                setAllData(payload.aggregatedData);
                const clientsMap = new Map<string, any>();
                payload.aggregatedData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                setAllActiveClients(Array.from(clientsMap.values()));
                setUnidentifiedRows(payload.unidentifiedRows);
                setDbStatus('ready');
                
                const finalVersion = effectiveTargetVersion || `processed_${Date.now()}`;
                await persistToDB(payload.aggregatedData, payload.unidentifiedRows, payload.totalRowsProcessed, finalVersion);
                
                setLastSnapshotVersion(finalVersion);
                localStorage.setItem('last_snapshot_version', finalVersion);
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Синхронизация завершена', totalRowsProcessed: payload.totalRowsProcessed }));
            }
        };
        
        workerRef.current.postMessage({ 
            type: 'INIT_STREAM', 
            payload: { okbData, cacheData, totalRowsProcessed: rowsProcessedSoFar, restoredData: restoredDataForWorker, restoredUnidentified: restoredUnidentifiedForWorker } 
        });
        
        try {
            const YEARS_TO_SCAN = ['2025', '2026'];
            for (const scanYear of YEARS_TO_SCAN) {
                setProcessingState(prev => ({ ...prev, message: `Поиск файлов за ${scanYear}...` }));
                const listRes = await fetch(`/api/get-akb?year=${scanYear}&mode=list`);
                const allFiles = listRes.ok ? await listRes.json() : [];
                
                for (const file of allFiles) {
                    if (processedFileIdsRef.current.has(file.id)) continue;
                    
                    let offset = 0, hasMore = true, isFirstChunk = true;
                    while (hasMore) {
                        const CHUNK_SIZE = 1000; 
                        setProcessingState(prev => ({ ...prev, fileName: file.name, message: `Обработка: ${file.name} (строки ${offset}-${offset + CHUNK_SIZE})` }));
                        await new Promise(r => setTimeout(r, 200)); 
                        const res = await fetch(`/api/get-akb?fileId=${file.id}&offset=${offset}&limit=${CHUNK_SIZE}${file.mimeType ? `&mimeType=${encodeURIComponent(file.mimeType)}` : ''}`);
                        
                        if (!res.ok) { hasMore = false; break; } 
                        const result = await res.json();
                        const chunkRows = result.rows || [];
                        
                        if (chunkRows.length > 0) {
                            workerRef.current?.postMessage({ 
                                type: 'PROCESS_CHUNK', 
                                payload: { rawData: chunkRows, isFirstChunk: isFirstChunk && offset === 0, fileName: file.name } 
                            });
                            isFirstChunk = false;
                        } else { hasMore = false; }
                        
                        if (chunkRows.length < CHUNK_SIZE) hasMore = false;
                        hasMore = result.hasMore && hasMore; 
                        offset += CHUNK_SIZE;
                    }
                    processedFileIdsRef.current.add(file.id);
                }
            }
        } catch (error) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка связи' }));
        } finally {
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        }
    }, [okbData, persistToDB, processingState.isProcessing, lastSnapshotVersion, setAllData, setOkbRegionCounts, setUnidentifiedRows, setAllActiveClients, setDbStatus, setLastSnapshotVersion, processedFileIdsRef]);

    const checkCloudChanges = useCallback(async () => {
        if (processingState.isProcessing) return;
        try {
            const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
            if (metaRes.ok) {
                const meta = await metaRes.json();
                setIsLiveConnected(true);
                if (meta.versionHash && meta.versionHash !== 'none' && meta.versionHash !== lastSnapshotVersion) {
                    console.log('Detected change:', meta.versionHash);
                    handleStartCloudProcessing({ year: '2025' }, meta.versionHash);
                }
            }
        } catch (e) { setIsLiveConnected(false); }
    }, [processingState.isProcessing, lastSnapshotVersion, handleStartCloudProcessing]);

    return {
        isLiveConnected,
        setIsLiveConnected,
        isSavingToCloud,
        uploadProgress,
        processingState,
        setProcessingState,
        handleStartCloudProcessing,
        checkCloudChanges,
        persistToDB,
        workerRef,
        uploadStartTimeRef
    };
};
