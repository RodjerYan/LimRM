
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    OkbDataRow, MapPoint, UnidentifiedRow,
    OkbStatus, UpdateJobStatus
} from '../types';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';
import { saveAnalyticsState, loadAnalyticsState } from '../utils/db';
import { enrichWithAbcCategories } from '../utils/analytics';

// Imported modular hooks
import { useDataSync } from './useDataSync';
import { useGeocoding } from './useGeocoding';
import { useAnalytics } from './useAnalytics';

export const useAppLogic = () => {
    const [activeModule, setActiveModule] = useState('adapta');
    const [updateJobStatus, setUpdateJobStatus] = useState<UpdateJobStatus | null>(null);
    const updatePollingInterval = useRef<number | null>(null);
    const [notifications, setNotifications] = useState<{id: number, message: string, type: 'success'|'error'|'info'|'warning'}[]>([]);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');

    // Shared State for Adapta
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    
    // UI State
    const [selectedDetailsRow, setSelectedDetailsRow] = useState<any | null>(null);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);

    // Performance optimization: Track last cache size to avoid redundant processing
    const lastCacheSizeRef = useRef<number>(0);

    // --- NOTIFICATIONS ---
    const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
    }, []);

    // --- 1. DATA SYNC HOOK ---
    const {
        allData, setAllData,
        unidentifiedRows, setUnidentifiedRows,
        okbRegionCounts, setOkbRegionCounts,
        isCloudSaving, 
        processingState, setProcessingState,
        totalRowsProcessedRef,
        manualUpdateTimestamps,
        saveDeltaToCloud,
        handleDownloadSnapshot,
        applyCacheToData
    } = useDataSync(addNotification);

    // --- INTERNAL DATA UPDATE LOGIC (Used by Geocoding & UI) ---
    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        let newData = [...allData]; 
        let newUnidentified = [...unidentifiedRows];
        
        // Block auto-overwriting for this address for 2 mins
        if (newPoint.address) {
            manualUpdateTimestamps.current.set(normalizeAddress(newPoint.address), Date.now());
        }
        
        // Case A: Moving from Unidentified -> Identified
        if (typeof originalIndex === 'number') {
            const rowIndex = newUnidentified.findIndex(r => r.originalIndex === originalIndex);
            if (rowIndex !== -1) newUnidentified.splice(rowIndex, 1);
            
            const groupKey = `${newPoint.region}-${newPoint.rm}-${newPoint.brand}-${newPoint.packaging}`.toLowerCase();
            const existingGroupIndex = newData.findIndex(g => g.key === groupKey);
            
            if (existingGroupIndex !== -1) {
                newData[existingGroupIndex] = {
                    ...newData[existingGroupIndex],
                    fact: newData[existingGroupIndex].fact + (newPoint.fact || 0),
                    clients: [...newData[existingGroupIndex].clients, newPoint]
                };
            } else {
                newData.push({
                    __rowId: `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    key: groupKey, rm: newPoint.rm, region: newPoint.region, city: newPoint.city, brand: newPoint.brand, packaging: newPoint.packaging,
                    clientName: `${newPoint.region}: ${newPoint.brand}`, fact: newPoint.fact || 0,
                    potential: (newPoint.fact || 0) * 1.15, growthPotential: 0, growthPercentage: 0, clients: [newPoint]
                });
            }
        } 
        // Case B: Updating Existing Client
        else {
            newData = newData.map(group => {
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                if (clientIndex !== -1) {
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = newPoint;
                    return { ...group, clients: updatedClients };
                }
                return group;
            });
        }

        // Update UI State if currently editing
        if (editingClient && (editingClient as MapPoint).key === oldKey) {
            setEditingClient(prev => prev ? ({ ...prev, ...newPoint }) : null);
        }

        enrichWithAbcCategories(newData);
        setAllData(newData);
        setUnidentifiedRows(newUnidentified);
        
        // SAVE DELTA (Skip transient geocoding states)
        if (!newPoint.isGeocoding) {
            saveDeltaToCloud({
                type: 'update',
                key: oldKey,
                rm: newPoint.rm,
                payload: newPoint,
                timestamp: Date.now()
            });
        }
    }, [allData, unidentifiedRows, editingClient, setAllData, setUnidentifiedRows, saveDeltaToCloud]);

    // --- INTERNAL DELETE LOGIC ---
    const handleDeleteClientLocal = useCallback((rmName: string, address: string) => {
        const normAddress = normalizeAddress(address);
        let newData = [...allData]; 
        let newUnidentified = [...unidentifiedRows];
        let wasModified = false;
        let deletedKey = '';

        newData = newData.map(group => {
            if (group.rm !== rmName) return group;
            const originalClientCount = group.clients.length;
            const newClients = group.clients.filter(c => {
                const isMatch = normalizeAddress(c.address) === normAddress;
                if (isMatch) deletedKey = c.key;
                return !isMatch;
            });
            
            if (newClients.length !== originalClientCount) {
                wasModified = true;
                const newFact = newClients.reduce((sum, c) => sum + (c.fact || 0), 0);
                return { ...group, clients: newClients, fact: newFact, potential: newFact * 1.15 };
            }
            return group;
        }).filter(group => group.clients.length > 0);

        const initialUnidentifiedCount = newUnidentified.length;
        newUnidentified = newUnidentified.filter(row => {
            const rowAddr = findAddressInRow(row.rowData);
            return !(row.rm === rmName && normalizeAddress(rowAddr) === normAddress);
        });
        if (newUnidentified.length !== initialUnidentifiedCount) wasModified = true;

        if (wasModified) {
            enrichWithAbcCategories(newData);
            setAllData(newData);
            setUnidentifiedRows(newUnidentified);
            
            saveDeltaToCloud({
                type: 'delete',
                key: deletedKey || normalizeAddress(address),
                rm: rmName,
                timestamp: Date.now()
            });
        }
    }, [allData, unidentifiedRows, setAllData, setUnidentifiedRows, saveDeltaToCloud]);

    // --- 2. GEOCODING HOOK ---
    const {
        pendingGeocoding,
        actionQueue,
        handleStartPolling,
        handleQueuedUpdate,
        handleQueuedDelete
    } = useGeocoding(addNotification, handleDataUpdate, handleDeleteClientLocal);

    // --- 3. ANALYTICS HOOK ---
    const {
        filters, setFilters,
        filterStartDate, setFilterStartDate,
        filterEndDate, setFilterEndDate,
        filtered,
        allActiveClients,
        mapPotentialClients,
        filterOptions,
        summaryMetrics
    } = useAnalytics(allData, okbData, okbRegionCounts);

    // --- LIVE SYNC POLLING (OPTIMIZED) ---
    useEffect(() => {
        const syncData = async () => {
            if (allData.length === 0 || processingState.isProcessing) return;
            try {
                // 1. Deltas Check (Very Fast)
                await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`);

                // 2. Legacy Cache Check (Heavier)
                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                if (!res.ok) return;
                
                const cacheData = await res.json();
                
                // OPTIMIZATION: Check size before applying
                const currentCacheSize = Object.keys(cacheData).length + Object.values(cacheData).flat().length;
                if (currentCacheSize === lastCacheSizeRef.current) {
                    return; // No changes inferred from size stability
                }
                lastCacheSizeRef.current = currentCacheSize;

                // If changed, apply expensive diff logic
                const freshData = applyCacheToData(allData, cacheData);
                
                // Compare Totals to decide if re-render needed
                const currentTotalFact = allData.reduce((sum, r) => sum + r.fact, 0);
                const freshTotalFact = freshData.reduce((sum, r) => sum + r.fact, 0);
                
                const isDifferent = 
                    freshData.length !== allData.length || 
                    Math.abs(currentTotalFact - freshTotalFact) > 0.01;

                if (isDifferent) {
                    enrichWithAbcCategories(freshData);
                    setAllData(freshData);
                }
            } catch (e) { console.error("Auto-sync failed", e); }
        };
        
        // Poll every 30s
        const intervalId = setInterval(syncData, 30000);
        return () => clearInterval(intervalId);
    }, [allData, processingState.isProcessing, applyCacheToData, setAllData]);

    // --- INIT ---
    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            const local = await loadAnalyticsState();
            
            if (local?.allData?.length > 0) {
                // Quick load from local DB
                let validatedLocal = local.allData; 
                enrichWithAbcCategories(validatedLocal);
                setAllData(validatedLocal);
                setUnidentifiedRows(local.unidentifiedRows || []);
                setOkbRegionCounts(local.okbRegionCounts || {});
                setDbStatus('ready');
            }
            
            // Check cloud for updates
            try {
                const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
                if (metaRes.ok) {
                    const serverMeta = await metaRes.json();
                    
                    // FIXED LOGIC: Force download if local is empty OR hashes mismatch
                    const hasLocalData = local?.allData?.length > 0;
                    const isNewVersion = serverMeta?.versionHash && serverMeta.versionHash !== local?.versionHash;
                    
                    if (serverMeta?.versionHash && (!hasLocalData || isNewVersion)) {
                        console.log("Starting cloud snapshot download...", { hasLocalData, isNewVersion, hash: serverMeta.versionHash });
                        await handleDownloadSnapshot(serverMeta.chunkCount, serverMeta.versionHash);
                    }
                    setDbStatus('ready');
                }
            } catch (e) {
                console.warn("Init fetch failed, using local only", e);
                setDbStatus('ready');
            }
        };
        init();
        
        return () => {
            if (updatePollingInterval.current) clearInterval(updatePollingInterval.current);
        };
    }, [handleDownloadSnapshot, setAllData, setUnidentifiedRows, setOkbRegionCounts]);

    // --- SERVER DATA UPDATE HANDLER ---
    const handleStartDataUpdate = async () => {
        if (updateJobStatus && updateJobStatus.status !== 'completed' && updateJobStatus.status !== 'error') return;
        try {
            const res = await fetch('/api/start-data-update', { method: 'POST' });
            const { jobId } = await res.json();
            
            setUpdateJobStatus({ status: 'pending', message: 'Задача поставлена в очередь...', progress: 5 });
            
            if (updatePollingInterval.current) clearInterval(updatePollingInterval.current);
            
            updatePollingInterval.current = window.setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/check-update-status?jobId=${jobId}`);
                    if (!statusRes.ok) {
                        if (updatePollingInterval.current) clearInterval(updatePollingInterval.current);
                        setUpdateJobStatus({ status: 'error', message: 'Ошибка связи с сервером.', progress: 100 });
                        return;
                    }
                    const statusData = await statusRes.json();
                    setUpdateJobStatus(statusData);
                    
                    if (statusData.status === 'completed' || statusData.status === 'error') {
                        if (updatePollingInterval.current) clearInterval(updatePollingInterval.current);
                        if (statusData.status === 'completed') {
                            setTimeout(() => window.location.reload(), 2500);
                        }
                    }
                } catch (e) {
                    // Ignore transient network errors during poll
                }
            }, 3000);
        } catch (error) {
            setUpdateJobStatus({ status: 'error', message: 'Не удалось запустить обновление.', progress: 100 });
        }
    };

    const handleForceUpdate = useCallback(async () => {
        if (processingState.isProcessing) return;
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 0, message: 'Проверка обновления...', startTime: Date.now() }));
        try {
            const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
            if (metaRes.ok) {
                const serverMeta = await metaRes.json();
                if (serverMeta?.versionHash) {
                    await handleDownloadSnapshot(serverMeta.chunkCount, serverMeta.versionHash);
                    setDbStatus('ready');
                } else {
                    setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Снимок не найден' }));
                }
            } else throw new Error("Meta fetch failed");
        } catch (e) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка соединения' }));
        }
    }, [processingState.isProcessing, handleDownloadSnapshot, setProcessingState]);

    // Combined Unidentified List for UI
    const combinedUnidentifiedRows = useMemo(() => {
        const parsingFailures = unidentifiedRows;
        // Also find "Active" clients that are technically unidentified (missing coords)
        const geocodingFailures = allData.flatMap(group => group.clients)
            .filter(c => (!c.lat || !c.lon) && !c.isGeocoding)
            .map(c => ({
                rm: c.rm,
                rowData: c.originalRow || {},
                originalIndex: typeof c.key === 'string' && c.key.startsWith('row_') ? -1 : 9999
            } as UnidentifiedRow));
            
        return [...parsingFailures, ...geocodingFailures];
    }, [unidentifiedRows, allData]);

    return {
        activeModule, setActiveModule,
        allData, setAllData,
        isCloudSaving,
        updateJobStatus,
        filterStartDate, setFilterStartDate,
        filterEndDate, setFilterEndDate,
        notifications,
        dbStatus,
        okbData, setOkbData,
        okbStatus, setOkbStatus,
        okbRegionCounts,
        unidentifiedRows: combinedUnidentifiedRows,
        filters, setFilters,
        processingState, setProcessingState,
        selectedDetailsRow, setSelectedDetailsRow,
        isUnidentifiedModalOpen, setIsUnidentifiedModalOpen,
        editingClient, setEditingClient,
        filtered,
        allActiveClients,
        mapPotentialClients,
        filterOptions,
        summaryMetrics,
        handleStartDataUpdate,
        handleForceUpdate,
        handleDataUpdate: handleQueuedUpdate, // Use the queued version
        handleDeleteClient: handleQueuedDelete, // Use the queued version
        handleStartPolling,
        addNotification,
        queueLength: actionQueue.length
    };
};
