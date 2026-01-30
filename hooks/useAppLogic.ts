
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    OkbDataRow, MapPoint, UnidentifiedRow,
    OkbStatus, UpdateJobStatus, AggregatedDataRow
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
    // Cache for content of last saved chunks (used in useDataSync but ref managed here if needed locally, though useDataSync has its own)
    const lastSavedChunksRef = useRef<Map<number, string>>(new Map());

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
        // handleDownloadSnapshot, // We use LOCAL version below to keep custom normalization logic
        applyCacheToData
    } = useDataSync(addNotification);

    // --- NORMALIZE HELPER (Preserved from original useAppLogic) ---
    const normalize = useCallback((rows: any[]): AggregatedDataRow[] => {
        if (!Array.isArray(rows)) return [];
        const result: AggregatedDataRow[] = [];
        
        const safeFloat = (v: any) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') {
                const f = parseFloat(v.replace(',', '.'));
                return isNaN(f) ? undefined : f;
            }
            return undefined;
        };
        
        const isValidCoord = (n: any) => typeof n === 'number' && !isNaN(n) && n !== 0;

        rows.forEach((row, index) => {
            if (!row) return;
            const brandRaw = String(row.brand || '').trim();
            const hasMultipleBrands = brandRaw.length > 2 && /[,;|\r\n]/.test(brandRaw);

            const generateStableKey = (base: any, suffix: string | number) => {
                const baseStr = base.key || base.address || `idx_${index}`;
                return `${baseStr}_${suffix}`.replace(/\s+/g, '_');
            };

            const normalizeClient = (c: any, cIdx: number) => {
                const clientObj = { ...c };
                const original = c.originalRow || {}; 

                if (c.lng !== undefined) clientObj.lon = safeFloat(c.lng);
                if (c.lat !== undefined) clientObj.lat = safeFloat(c.lat);

                if (!isValidCoord(clientObj.lat)) {
                    clientObj.lat = safeFloat(c.latitude) || safeFloat(c.geo_lat) || safeFloat(c.y) || safeFloat(c.Lat) ||
                                    safeFloat(original.lat) || safeFloat(original.latitude) || safeFloat(original.geo_lat) || safeFloat(original.y);
                }
                if (!isValidCoord(clientObj.lon)) {
                    clientObj.lon = safeFloat(c.longitude) || safeFloat(c.geo_lon) || safeFloat(c.x) || safeFloat(c.Lng) || safeFloat(c.Lon) ||
                                    safeFloat(original.lon) || safeFloat(original.lng) || safeFloat(original.longitude) || safeFloat(original.geo_lon) || safeFloat(original.x);
                }
                
                if (!clientObj.key) {
                    clientObj.key = generateStableKey(row, `cli_${cIdx}`);
                }
                return clientObj;
            };

            if (hasMultipleBrands) {
                const parts = brandRaw.split(/[,;|\r\n]+/).map(b => b.trim()).filter(b => b.length > 0);
                if (parts.length > 1) {
                    const splitFactor = 1 / parts.length;
                    parts.forEach((brandPart, idx) => {
                        const regionName = row.region || 'Неизвестный регион';
                        result.push({
                            ...row,
                            _chunkIndex: row._chunkIndex,
                            key: generateStableKey(row, `spl_${idx}`),
                            brand: brandPart,
                            clientName: `${regionName}: ${brandPart}`,
                            fact: (row.fact || 0) * splitFactor,
                            potential: (row.potential || 0) * splitFactor,
                            growthPotential: (row.growthPotential || 0) * splitFactor,
                            clients: Array.isArray(row.clients) ? row.clients.map(normalizeClient) : []
                        });
                    });
                    return;
                }
            }
            
            let clientSource = row.clients;
            if (!Array.isArray(clientSource) || clientSource.length === 0) {
                 clientSource = [row];
            }

            const normalizedClients = clientSource.map(normalizeClient);
            const regionName = row.region || 'Неизвестный регион';
            const brandName = row.brand || 'Без бренда';
            const finalClientName = row.clientName || `${regionName}: ${brandName}`;

            result.push({
                ...row,
                _chunkIndex: row._chunkIndex,
                key: row.key || generateStableKey(row, 'm'),
                clientName: finalClientName,
                clients: normalizedClients
            });
        });
        return result;
    }, []);

    // --- LOCAL ROBUST SNAPSHOT DOWNLOADER ---
    const handleDownloadSnapshot = useCallback(async (serverMeta: any) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация JSON...', progress: 0 }));
            
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error('Failed to fetch snapshot list');
            
            let fileList = await listRes.json();
            if (!Array.isArray(fileList)) fileList = [];

            fileList.sort((a: any, b: any) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                const numA = parseInt(nameA.match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt(nameB.match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });

            let loadedCount = 0;
            const total = fileList.length;
            let accumulatedRows: AggregatedDataRow[] = [];
            let loadedMeta: any = serverMeta || null;
            
            lastSavedChunksRef.current.clear();

            for (let i = 0; i < total; i++) {
                const file = fileList[i];
                try {
                    const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`);
                    if (!res.ok) {
                        console.warn(`[Snapshot] Skipping failed chunk ${file.name} (${file.id})`);
                        continue;
                    }
                    const text = await res.text();

                    // SKIP EMPTY FILES GRACEFULLY
                    if (!text || text.trim().length === 0) {
                        console.warn(`[Snapshot] Skipping empty chunk ${file.name}`);
                        continue;
                    }

                    lastSavedChunksRef.current.set(i, text);
                    
                    const chunkData = JSON.parse(text);
                    let newRows: AggregatedDataRow[] = Array.isArray(chunkData.rows) ? chunkData.rows : (Array.isArray(chunkData.aggregatedData) ? chunkData.aggregatedData : []);
                    
                    const chunkIndex = parseInt(file.name.match(/\d+/)?.[0] || String(i), 10);
                    newRows.forEach(row => row._chunkIndex = chunkIndex);

                    if (newRows.length > 0) {
                        accumulatedRows.push(...normalize(newRows));
                    }
                    if (chunkData.meta && !loadedMeta) loadedMeta = chunkData.meta;
                } catch (chunkError) {
                    console.warn(`[Snapshot] Error processing chunk ${file.name}:`, chunkError);
                    // Continue to next chunk instead of failing
                }
                
                loadedCount++;
                setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
            }

            // SUCCESS CRITERIA: Metadata exists OR we loaded some rows OR file list was iterated
            if (loadedMeta || accumulatedRows.length > 0 || total > 0) {
                setProcessingState(prev => ({ ...prev, message: 'Проверка удаленных записей...' }));
                
                let finalData = accumulatedRows;
                try {
                    const cacheRes = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                    if (cacheRes.ok) {
                        const cacheData = await cacheRes.json();
                        finalData = applyCacheToData(accumulatedRows, cacheData);
                    }
                } catch (e) {
                    console.error("Failed to fetch cache during load, using snapshot data only:", e);
                }

                enrichWithAbcCategories(finalData);
                setAllData(finalData);
                
                const safeMeta = loadedMeta || {};
                setUnidentifiedRows(safeMeta.unidentifiedRows || []);
                setOkbRegionCounts(safeMeta.okbRegionCounts || {});
                totalRowsProcessedRef.current = safeMeta.totalRowsProcessed || finalData.length;
                
                const versionHash = serverMeta?.versionHash || 'unknown';

                await saveAnalyticsState({
                    allData: finalData,
                    unidentifiedRows: safeMeta.unidentifiedRows || [],
                    okbRegionCounts: safeMeta.okbRegionCounts || {},
                    totalRowsProcessed: totalRowsProcessedRef.current,
                    versionHash: versionHash,
                    okbData: [], okbStatus: null
                });
                
                localStorage.setItem('last_snapshot_version', versionHash);
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Готово', progress: 100 }));
                return true;
            }
            return false;
        } catch (e) { 
            console.error("Snapshot error:", e); 
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сети' }));
            return false;
        }
    }, [normalize, addNotification, applyCacheToData]);

    // --- INTERNAL DATA UPDATE LOGIC ---
    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        let newData = [...allData]; 
        let newUnidentified = [...unidentifiedRows];
        
        if (newPoint.address) {
            manualUpdateTimestamps.current.set(normalizeAddress(newPoint.address), Date.now());
        }
        
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

        if (editingClient && (editingClient as MapPoint).key === oldKey) {
            setEditingClient(prev => prev ? ({ ...prev, ...newPoint }) : null);
        }

        enrichWithAbcCategories(newData);
        setAllData(newData);
        setUnidentifiedRows(newUnidentified);
        
        if (newPoint.isGeocoding) return;

        if (!newPoint.lat || !newPoint.lon) return;

        console.group('LimRM_save points_data');
        console.log('Action: Save Chunk (Delta)');
        console.log('Payload:', newPoint);
        console.groupEnd();

        saveDeltaToCloud({
            type: 'update',
            key: oldKey,
            rm: newPoint.rm,
            payload: newPoint,
            timestamp: Date.now()
        });

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

    // --- LIVE SYNC POLLING ---
    useEffect(() => {
        const syncData = async () => {
            if (allData.length === 0 || processingState.isProcessing) return;
            try {
                await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`);
                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                if (!res.ok) return;
                
                const cacheData = await res.json();
                
                const currentCacheSize = Object.keys(cacheData).length + Object.values(cacheData).flat().length;
                if (currentCacheSize === lastCacheSizeRef.current) return;
                lastCacheSizeRef.current = currentCacheSize;

                const freshData = applyCacheToData(allData, cacheData);
                
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
        
        const intervalId = setInterval(syncData, 30000);
        return () => clearInterval(intervalId);
    }, [allData, processingState.isProcessing, applyCacheToData, setAllData]);

    // --- INIT ---
    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            const local = await loadAnalyticsState();
            
            if (local?.allData?.length > 0) {
                let validatedLocal = normalize(local.allData); 
                enrichWithAbcCategories(validatedLocal);
                setAllData(validatedLocal);
                setUnidentifiedRows(local.unidentifiedRows || []);
                setOkbRegionCounts(local.okbRegionCounts || {});
                setDbStatus('ready');
            }
            
            try {
                const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
                if (metaRes.ok) {
                    const serverMeta = await metaRes.json();
                    
                    const hasLocalData = local?.allData?.length > 0;
                    const isNewVersion = serverMeta?.versionHash && serverMeta.versionHash !== local?.versionHash;
                    
                    if (serverMeta?.versionHash && (!hasLocalData || isNewVersion)) {
                        console.log("Starting cloud snapshot download...", { hasLocalData, isNewVersion, hash: serverMeta.versionHash });
                        await handleDownloadSnapshot(serverMeta);
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
    }, [handleDownloadSnapshot, normalize, setAllData, setUnidentifiedRows, setOkbRegionCounts]);

    // --- MANUAL FORCE UPDATE ---
    const handleForceUpdate = useCallback(async () => {
        if (processingState.isProcessing) return;
        
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 5, message: 'Проверка облачного снимка...' }));

        try {
            const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
            
            if (metaRes.ok) {
                const serverMeta = await metaRes.json();
                
                // ROBUST CHECK: Accept empty snapshot.json (no hash) as empty init
                if (serverMeta) {
                    console.log("Snapshot meta found, downloading...", serverMeta);
                    setProcessingState(prev => ({ ...prev, message: 'Загрузка снимка (JSON)...' }));
                    
                    // PASS FULL META OBJECT
                    const success = await handleDownloadSnapshot(serverMeta);
                    
                    if (success) {
                        setDbStatus('ready');
                        return;
                    }
                }
            }

            console.error("Snapshot not found or invalid.");
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Снимок не найден' }));
            addNotification("Снимок данных (snapshot.json) не найден. Загрузка отменена.", "error");

        } catch (e) {
            console.error("Force Update Failed:", e);
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка обновления' }));
            addNotification('Не удалось обновить данные с сервера', 'error');
        }
    }, [processingState.isProcessing, handleDownloadSnapshot, addNotification, setProcessingState]);

    const handleStartDataUpdate = async () => {
        handleForceUpdate();
    };

    const combinedUnidentifiedRows = useMemo(() => {
        const parsingFailures = unidentifiedRows;
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
        handleDataUpdate: handleQueuedUpdate, 
        handleDeleteClient: handleQueuedDelete,
        handleStartPolling,
        addNotification,
        queueLength: actionQueue.length
    };
};
