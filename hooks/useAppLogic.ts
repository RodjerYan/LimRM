
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    AggregatedDataRow, FilterState, NotificationMessage, 
    OkbDataRow, MapPoint, UnidentifiedRow, FileProcessingState,
    WorkerResultPayload, CoordsCache, OkbStatus,
    UpdateJobStatus, ActionQueueItem, DeltaItem
} from '../types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findValueInRow, normalizeAddress, findAddressInRow } from '../utils/dataUtils';
import { enrichDataWithSmartPlan } from '../services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from '../utils/db';
import { enrichWithAbcCategories } from '../utils/analytics';

// Максимальный размер JSON-файла в байтах (850 КБ) - оставляем запас до лимита Vercel/Drive
const MAX_CHUNK_SIZE_BYTES = 850 * 1024; 

// Интервал авто-обновления (в миллисекундах)
const POLLING_INTERVAL_MS = 15000;
const GEOCODING_POLLING_INTERVAL_MS = 3000;
const MAX_GEOCODING_ATTEMPTS = 60;

// --- TYPES FOR POLLING ---
interface PendingGeocodingItem {
    rm: string;
    address: string;
    oldKey: string;
    basePoint: MapPoint;
    originalIndex?: number;
    attempts: number;
}

const normalize = (rows: any[]): AggregatedDataRow[] => {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({
        ...row,
        clients: Array.isArray(row.clients) ? row.clients : [],
        fact: typeof row.fact === 'number' ? row.fact : 0,
        potential: typeof row.potential === 'number' ? row.potential : 0,
        growthPotential: typeof row.growthPotential === 'number' ? row.growthPotential : 0,
        growthPercentage: typeof row.growthPercentage === 'number' ? row.growthPercentage : 0,
    }));
};

export const useAppLogic = () => {
    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [isCloudSaving, setIsCloudSaving] = useState(false);
    const [updateJobStatus, setUpdateJobStatus] = useState<UpdateJobStatus | null>(null);
    const updatePollingInterval = useRef<number | null>(null);
    
    // --- DATE FILTER STATE ---
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');
    
    // --- BACKGROUND POLLING & QUEUE STATE ---
    const [pendingGeocoding, setPendingGeocoding] = useState<PendingGeocodingItem[]>([]);
    const [actionQueue, setActionQueue] = useState<ActionQueueItem[]>([]);
    const [isProcessingQueue, setIsProcessingQueue] = useState(false);

    // Shared State for Adapta
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{[key: string]: number}>({});
    
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
    
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false, progress: 0, message: 'Система готова', fileName: null, backgroundMessage: null, startTime: null, totalRowsProcessed: 0
    });

    const totalRowsProcessedRef = useRef<number>(0);
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const manualUpdateTimestamps = useRef<Map<string, number>>(new Map());
    const workerRef = useRef<Worker | null>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSavingRef = useRef(false);
    const saveQueuedRef = useRef(false);
    
    // SMART SAVE: Cache for the content of the last saved/loaded chunks
    const lastSavedChunksRef = useRef<Map<number, string>>(new Map());

    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);

    // Sync refs
    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    // Cleanup worker
    useEffect(() => {
        return () => {
            if (workerRef.current) workerRef.current.terminate();
            if (updatePollingInterval.current) clearInterval(updatePollingInterval.current);
        };
    }, []);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // --- HELPER: APPLY CACHE TO DATA ---
    const applyCacheToData = useCallback((rows: AggregatedDataRow[], cacheData: CoordsCache) => {
        const cacheMap = new Map<string, { lat: number; lon: number; comment?: string }>();
        const deletedSet = new Set<string>();

        Object.values(cacheData).flat().forEach((item: any) => {
            const norm = normalizeAddress(item.address);
            if (item.isDeleted) {
                deletedSet.add(norm);
            } else if (item.address && item.lat && item.lon) {
                cacheMap.set(norm, { lat: item.lat, lon: item.lon, comment: item.comment });
            }
        });

        // 1. Filter out deleted clients
        let cleanData = rows.map(group => {
            const originalCount = group.clients.length;
            const activeClients = group.clients.filter(c => !deletedSet.has(normalizeAddress(c.address)));
            
            if (activeClients.length !== originalCount) {
                // Re-calculate metrics if clients were removed
                const newFact = activeClients.reduce((sum, c) => sum + (c.fact || 0), 0);
                const newPotential = newFact * 1.15;
                return { 
                    ...group, 
                    clients: activeClients,
                    fact: newFact,
                    potential: newPotential,
                    growthPotential: newPotential - newFact,
                    growthPercentage: 15
                };
            }
            return group;
        }).filter(g => g.clients.length > 0);

        // 2. Apply updates
        cleanData = cleanData.map(group => {
            let modified = false;
            const updatedClients = group.clients.map(client => {
                const normAddr = normalizeAddress(client.address);
                const cached = cacheMap.get(normAddr);
                
                // Skip if manually updated recently in this session
                if (manualUpdateTimestamps.current.get(normAddr) && (Date.now() - manualUpdateTimestamps.current.get(normAddr)! < 120000)) {
                    return client;
                }

                if (cached) {
                    const latDiff = Math.abs((client.lat || 0) - cached.lat);
                    const lonDiff = Math.abs((client.lon || 0) - cached.lon);
                    const commentDiff = (client.comment || '') !== (cached.comment || '');
                    
                    if (latDiff > 0.0001 || lonDiff > 0.0001 || commentDiff) {
                        modified = true;
                        return { ...client, lat: cached.lat, lon: cached.lon, comment: cached.comment, isGeocoding: false, status: 'match' as const };
                    }
                }
                return client;
            });
            
            return modified ? { ...group, clients: updatedClients } : group;
        });

        return cleanData;
    }, []);

    // --- QUEUE PROCESSOR ---
    useEffect(() => {
        const processNextAction = async () => {
            if (actionQueue.length === 0 || isProcessingQueue) return;

            setIsProcessingQueue(true);
            const action = actionQueue[0];

            try {
                if (action.type === 'UPDATE_ADDRESS') {
                    const { rmName, oldAddress, newAddress, comment, lat, lon } = action.payload;
                    const res = await fetch('/api/update-address', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            rmName, 
                            oldAddress, 
                            newAddress, 
                            comment,
                            lat,
                            lon
                        }),
                    });
                    if (!res.ok) throw new Error('Failed to update address');
                    console.log(`[Queue] Successfully updated: ${newAddress}`);
                } else if (action.type === 'DELETE_ADDRESS') {
                    const { rmName, address } = action.payload;
                    const res = await fetch('/api/delete-address', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rmName, address }),
                    });
                    if (!res.ok) throw new Error('Failed to delete address');
                    console.log(`[Queue] Successfully deleted: ${address}`);
                }

                // Success: Remove from queue
                setActionQueue(prev => prev.slice(1));

            } catch (error) {
                console.error(`[Queue] Action failed (${action.type}):`, error);
                
                // Retry logic (simple)
                if (action.retryCount < 2) {
                    setActionQueue(prev => [
                        { ...action, retryCount: action.retryCount + 1 },
                        ...prev.slice(1)
                    ]);
                    // Wait a bit before retrying
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    // Give up on this action, move to next, notify user
                    addNotification(`Не удалось синхронизировать изменение: ${action.type}`, 'warning');
                    setActionQueue(prev => prev.slice(1));
                }
            } finally {
                setIsProcessingQueue(false);
            }
        };

        processNextAction();
    }, [actionQueue, isProcessingQueue, addNotification]);


    // --- QUEUED UPDATE HANDLERS ---
    
    // 1. Queue Update: Optimistically updates local state and pushes API call to queue
    const handleQueuedUpdate = useCallback((
        oldKey: string, 
        newPoint: MapPoint, 
        originalIndex?: number
    ) => {
        // 1. Update Local State Immediately
        handleDataUpdate(oldKey, newPoint, originalIndex);

        // 2. Prepare Payload for Server
        const originalRow = newPoint.originalRow || {};
        const oldAddress = findAddressInRow(originalRow) || newPoint.address; // Fallback to current if original missing
        
        // Push to Queue
        setActionQueue(prev => [...prev, {
            type: 'UPDATE_ADDRESS',
            id: Date.now().toString(),
            payload: {
                rmName: newPoint.rm,
                oldAddress: oldAddress, // Send "original" address to identify row
                newAddress: newPoint.address,
                comment: newPoint.comment,
                lat: newPoint.lat,
                lon: newPoint.lon
            },
            retryCount: 0
        }]);
        
        addNotification('Изменения сохранены в очередь', 'success');
    }, []); // Removed handleDataUpdate dependency to avoid circularity issues, assuming it's stable

    // 2. Queue Delete: Optimistically updates local state and pushes API call to queue
    const handleQueuedDelete = useCallback((rm: string, address: string) => {
        // 1. Update Local State Immediately
        handleDeleteClient(rm, address);

        // 2. Push to Queue
        setActionQueue(prev => [...prev, {
            type: 'DELETE_ADDRESS',
            id: Date.now().toString(),
            payload: {
                rmName: rm,
                address: address
            },
            retryCount: 0
        }]);
        
        addNotification('Удаление добавлено в очередь', 'info');
    }, []);


    // --- NEW REAL DATA UPDATE HANDLER ---
    const handleStartDataUpdate = async () => {
        if (updateJobStatus && updateJobStatus.status !== 'completed' && updateJobStatus.status !== 'error') return;

        try {
            const res = await fetch('/api/start-data-update', { method: 'POST' });
            const { jobId } = await res.json();
            
            setUpdateJobStatus({ status: 'pending', message: 'Задача поставлена в очередь...', progress: 5 });

            if (updatePollingInterval.current) clearInterval(updatePollingInterval.current);
            
            updatePollingInterval.current = window.setInterval(async () => {
                const statusRes = await fetch(`/api/check-update-status?jobId=${jobId}`);
                if (!statusRes.ok) {
                    clearInterval(updatePollingInterval.current!);
                    setUpdateJobStatus({ status: 'error', message: 'Ошибка связи с сервером.', progress: 100 });
                    return;
                }
                const statusData: UpdateJobStatus = await statusRes.json();
                setUpdateJobStatus(statusData);

                if (statusData.status === 'completed' || statusData.status === 'error') {
                    clearInterval(updatePollingInterval.current!);
                    if (statusData.status === 'completed') {
                        setTimeout(() => {
                            window.location.reload();
                        }, 2500);
                    }
                }
            }, 3000);

        } catch (error) {
            setUpdateJobStatus({ status: 'error', message: 'Не удалось запустить обновление.', progress: 100 });
        }
    };

    // --- DELTA SYSTEM: Save small incremental changes ---
    const saveDeltaToCloud = async (delta: DeltaItem) => {
        setIsCloudSaving(true);
        try {
            await fetch('/api/get-full-cache?action=save-delta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(delta)
            });
            console.log("Delta saved successfully");
        } catch (e) {
            console.error("Failed to save delta:", e);
            addNotification('Ошибка сохранения изменений в облако', 'warning');
        } finally {
            setIsCloudSaving(false);
        }
    };

    // --- DATA UPDATE HANDLER (DEBOUNCED) ---
    // This is the INTERNAL logic for updating local state.
    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        let newData = [...allDataRef.current]; 
        let newUnidentified = [...unidentifiedRowsRef.current];
        
        if (newPoint.address) {
            const normAddr = normalizeAddress(newPoint.address);
            manualUpdateTimestamps.current.set(normAddr, Date.now());
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
        } else {
            let found = false;
            newData = newData.map(group => {
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                if (clientIndex !== -1) {
                    found = true;
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = newPoint;
                    return { ...group, clients: updatedClients };
                }
                return group;
            });
            
            if (!found) {
                console.warn(`Could not find client with key: ${oldKey} to update.`);
            }
        }

        if (editingClient && (editingClient as MapPoint).key === oldKey) {
            setEditingClient(prev => prev ? ({ ...prev, ...newPoint }) : null);
        }

        enrichWithAbcCategories(newData);

        setAllData(newData);
        setUnidentifiedRows(newUnidentified);
        
        // --- DELTA SAVE: Instead of full snapshot ---
        if (!newPoint.isGeocoding) {
            saveDeltaToCloud({
                type: 'update',
                key: oldKey,
                rm: newPoint.rm,
                payload: newPoint,
                timestamp: Date.now()
            });
        }

    }, [editingClient]);

    const handleBatchDataUpdate = useCallback((completedItems: { oldKey: string, point: MapPoint, originalIndex?: number }[]) => {
        let currentAllData = allDataRef.current;
        let currentUnidentified = unidentifiedRowsRef.current;
        let updatedEditingClient: MapPoint | null = null;

        completedItems.forEach(item => {
            const { oldKey, point, originalIndex } = item;
            
            if (point.address) {
                manualUpdateTimestamps.current.set(normalizeAddress(point.address), Date.now());
            }

            if (editingClient && (editingClient as MapPoint).key === oldKey) {
                updatedEditingClient = point;
            }

            if (typeof originalIndex === 'number') {
                const rowIndex = currentUnidentified.findIndex(r => r.originalIndex === originalIndex);
                if (rowIndex !== -1) currentUnidentified.splice(rowIndex, 1);
                
                const groupKey = `${point.region}-${point.rm}-${point.brand}-${point.packaging}`.toLowerCase();
                const existingGroupIndex = currentAllData.findIndex(g => g.key === groupKey);
                
                if (existingGroupIndex !== -1) {
                    currentAllData[existingGroupIndex] = { ...currentAllData[existingGroupIndex], clients: [...currentAllData[existingGroupIndex].clients, point] };
                } else {
                    currentAllData.push({ __rowId: `row_${Date.now()}`, key: groupKey, rm: point.rm, region: point.region, city: point.city, brand: point.brand, packaging: point.packaging, clientName: `${point.region}: ${point.brand}`, fact: point.fact || 0, potential: (point.fact || 0) * 1.15, growthPotential: 0, growthPercentage: 0, clients: [point] });
                }
            } else {
                currentAllData = currentAllData.map(group => {
                    const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                    if (clientIndex !== -1) {
                        const updatedClients = [...group.clients];
                        updatedClients[clientIndex] = point;
                        return { ...group, clients: updatedClients };
                    }
                    return group;
                });
            }
            
            // DELTA SAVE for batch (handled individually to keep logic simple)
            saveDeltaToCloud({
                type: 'update',
                key: oldKey,
                rm: point.rm,
                payload: point,
                timestamp: Date.now()
            });
        });
        
        enrichWithAbcCategories(currentAllData);
        setAllData([...currentAllData]);
        setUnidentifiedRows([...currentUnidentified]);

        if (updatedEditingClient) {
            setEditingClient(prev => prev ? ({ ...prev, ...updatedEditingClient }) : null);
        }

    }, [editingClient]);

    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация JSON...', progress: 0 }));
            
            // 1. Load Chunks
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error('Failed to fetch snapshot list');
            
            let fileList = await listRes.json();
            if (!Array.isArray(fileList) || fileList.length === 0) return false;

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
            let loadedMeta: any = null;
            
            lastSavedChunksRef.current.clear();

            for (let i = 0; i < total; i++) {
                const file = fileList[i];
                const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`);
                if (!res.ok) throw new Error(`Failed to load chunk ${file.id}`);
                const text = await res.text();

                lastSavedChunksRef.current.set(i, text);

                if (text.length >= 1048576) {
                    addNotification('Снимок поврежден (лимит размера)', 'warning');
                    return false;
                }
                
                const chunkData = JSON.parse(text);
                let newRows: AggregatedDataRow[] = Array.isArray(chunkData.rows) ? chunkData.rows : (Array.isArray(chunkData.aggregatedData) ? chunkData.aggregatedData : []);
                
                const chunkIndex = parseInt(file.name.match(/\d+/)?.[0] || String(i), 10);
                newRows.forEach(row => row._chunkIndex = chunkIndex);

                if (newRows.length > 0) {
                    accumulatedRows.push(...normalize(newRows));
                }
                if (chunkData.meta) loadedMeta = chunkData.meta;
                
                loadedCount++;
                setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
            }

            if (accumulatedRows.length > 0 || loadedMeta) {
                // 2. BLOCKING CACHE SYNC: Apply legacy cache
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

                // 3. APPLY DELTAS (The new "Savepoints" system)
                try {
                    setProcessingState(prev => ({ ...prev, message: 'Применение правок (Delta)...' }));
                    const deltaRes = await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`);
                    if (deltaRes.ok) {
                        const deltas: DeltaItem[] = await deltaRes.json();
                        
                        // Sort by timestamp
                        deltas.sort((a, b) => a.timestamp - b.timestamp);
                        
                        // Apply changes
                        finalData = finalData.map(group => {
                            let wasModified = false;
                            let groupClients = [...group.clients];
                            
                            deltas.forEach(delta => {
                                if (delta.type === 'delete') {
                                    const initialLen = groupClients.length;
                                    groupClients = groupClients.filter(c => c.key !== delta.key);
                                    if (groupClients.length !== initialLen) wasModified = true;
                                } else if (delta.type === 'update') {
                                    const idx = groupClients.findIndex(c => c.key === delta.key);
                                    if (idx !== -1 && delta.payload) {
                                        groupClients[idx] = { ...groupClients[idx], ...delta.payload };
                                        wasModified = true;
                                    }
                                }
                            });
                            
                            if (wasModified) {
                                const newFact = groupClients.reduce((s, c) => s + (c.fact || 0), 0);
                                return { ...group, clients: groupClients, fact: newFact };
                            }
                            return group;
                        });
                        
                        console.log(`Applied ${deltas.length} delta updates.`);
                    }
                } catch (e) {
                    console.warn("Failed to load deltas", e);
                }

                enrichWithAbcCategories(finalData);
                
                setAllData(finalData);
                
                const safeMeta = loadedMeta || {};
                setUnidentifiedRows(safeMeta.unidentifiedRows || []);
                setOkbRegionCounts(safeMeta.okbRegionCounts || {});
                totalRowsProcessedRef.current = safeMeta.totalRowsProcessed || finalData.length;
                
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
        }
        return false;
    }, [addNotification, applyCacheToData]);

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
            } else {
               throw new Error("Meta fetch failed");
            }
        } catch (e) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка соединения' }));
        }
    }, [processingState.isProcessing, handleDownloadSnapshot]);

    const handleDeleteClient = useCallback((rmName: string, address: string) => {
        const normAddress = normalizeAddress(address);
        let newData = [...allDataRef.current]; 
        let newUnidentified = [...unidentifiedRowsRef.current];
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
                
                // Keep the chunk index of the group so it stays in the same file
                return {
                    ...group,
                    clients: newClients,
                    fact: newFact,
                    potential: newFact * 1.15,
                    growthPotential: 0,
                    growthPercentage: 0
                };
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
            addNotification('Клиент удален из базы', 'info');

            // DELTA SAVE: Save deletion record
            saveDeltaToCloud({
                type: 'delete',
                key: deletedKey || normalizeAddress(address),
                rm: rmName,
                timestamp: Date.now()
            });
        }
    }, []);

    // --- INIT ---
    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            const local = await loadAnalyticsState();
            
            // BLOCKING CACHE SYNC FOR LOCAL DATA: Apply cache *before* setting state
            if (local?.allData?.length > 0) {
                let validatedLocal = normalize(local.allData);
                
                try {
                    const cacheRes = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                    if (cacheRes.ok) {
                        const cacheData = await cacheRes.json();
                        validatedLocal = applyCacheToData(validatedLocal, cacheData);
                    }
                } catch (e) {
                    console.warn("Failed to sync cache on init, using stored data.");
                }

                enrichWithAbcCategories(validatedLocal);
                setAllData(validatedLocal);
                setUnidentifiedRows(local.unidentifiedRows || []);
                setOkbRegionCounts(local.okbRegionCounts || {});
                setDbStatus('ready');
            }
            
            const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
            if (metaRes.ok) {
                const serverMeta = await metaRes.json();
                if (serverMeta?.versionHash && serverMeta.versionHash !== local?.versionHash) {
                    await handleDownloadSnapshot(serverMeta.chunkCount, serverMeta.versionHash);
                    setDbStatus('ready');
                }
            }
        };
        init();
    }, [handleDownloadSnapshot, applyCacheToData]);

    const handleStartPolling = useCallback((rm: string, address: string, oldKey: string, basePoint: MapPoint, originalIndex?: number) => {
        setPendingGeocoding(prev => [...prev, { rm, address, oldKey, basePoint, originalIndex, attempts: 0 }]);
    }, []);

    // --- GEOCODING POLLING EFFECT ---
    useEffect(() => {
        if (pendingGeocoding.length === 0) return;

        const intervalId = setInterval(async () => {
            const nextPending: PendingGeocodingItem[] = [];
            let changed = false;

            for (const item of pendingGeocoding) {
                if (item.attempts >= MAX_GEOCODING_ATTEMPTS) {
                    addNotification(`Не удалось найти координаты (тайм-аут): ${item.address}`, 'error');
                    if (editingClient && (editingClient as MapPoint).key === item.oldKey) {
                        setEditingClient(prev => prev ? ({ ...prev, isGeocoding: false, geocodingError: 'Тайм-аут геокодирования' }) : null);
                    }
                    changed = true;
                    continue;
                }

                try {
                    const url = `/api/get-cached-address?rmName=${encodeURIComponent(item.rm)}&address=${encodeURIComponent(item.address)}`;
                    const res = await fetch(url);
                    let found = false;
                    if (res.ok) {
                        const data = await res.json();
                        if (data && typeof data.lat === 'number' && typeof data.lon === 'number') {
                            const updatedPoint = { ...item.basePoint, lat: data.lat, lon: data.lon, isGeocoding: false, status: 'match' as const };
                            handleDataUpdate(item.oldKey, updatedPoint, item.originalIndex);
                            addNotification(`Координаты найдены: ${item.address}`, 'success');
                            found = true;
                        }
                    }
                    if (found) {
                        changed = true;
                        continue;
                    }
                } catch (e) { /* ignore */ }

                nextPending.push({ ...item, attempts: item.attempts + 1 });
            }

            if (changed || nextPending.length !== pendingGeocoding.length) {
                setPendingGeocoding(nextPending);
            }
        }, GEOCODING_POLLING_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [pendingGeocoding, editingClient, handleDataUpdate, addNotification]);

    // --- FILTERED DATA ---
    const filtered = useMemo(() => {
        let processedData = allData;
        if (filterStartDate || filterEndDate) {
            processedData = allData.map(row => {
                if (!row.monthlyFact || Object.keys(row.monthlyFact).length === 0) return row; 
                let newRowFact = 0;
                Object.entries(row.monthlyFact).forEach(([dateKey, val]) => {
                    if (dateKey === 'unknown') return; 
                    if (filterStartDate && dateKey < filterStartDate) return;
                    if (filterEndDate && dateKey > filterEndDate) return;
                    newRowFact += val;
                });
                const activeClients = row.clients.map(client => {
                    if (!client.monthlyFact || Object.keys(client.monthlyFact).length === 0) return client; 
                    let clientSum = 0;
                    Object.entries(client.monthlyFact).forEach(([d, v]) => {
                        if (d === 'unknown') return;
                        if (filterStartDate && d < filterStartDate) return;
                        if (filterEndDate && d > filterEndDate) return;
                        clientSum += v;
                    });
                    return { ...client, fact: clientSum };
                }).filter(c => (c.fact || 0) > 0);
                return { ...row, fact: newRowFact, clients: activeClients };
            }).filter(r => r.fact > 0); 
        }
        const smart = enrichDataWithSmartPlan(processedData, okbRegionCounts, 15, new Set());
        return applyFilters(smart, filters);
    }, [allData, filters, okbRegionCounts, filterStartDate, filterEndDate]);

    const allActiveClients = useMemo(() => {
        const clientsMap = new Map<string, MapPoint>();
        filtered.forEach(row => {
            if (row && Array.isArray(row.clients)) {
                row.clients.forEach(c => { if (c && c.key) clientsMap.set(c.key, c); });
            }
        });
        return Array.from(clientsMap.values());
    }, [filtered]);

    // --- COMBINED UNIDENTIFIED LIST FOR UI ---
    // Merges parsing errors (unidentifiedRows) with geocoding failures (missing coords in valid rows)
    const combinedUnidentifiedRows = useMemo(() => {
        const parsingFailures = unidentifiedRows;
        
        // Find rows that were parsed successfully but have NO coordinates and are NOT pending geocoding
        const geocodingFailures = allData.flatMap(group => group.clients)
            .filter(c => (!c.lat || !c.lon) && !c.isGeocoding)
            .map(c => ({
                rm: c.rm,
                rowData: c.originalRow || {},
                originalIndex: typeof c.key === 'string' && c.key.startsWith('row_') ? -1 : 9999 // fallback index
            } as UnidentifiedRow));

        return [...parsingFailures, ...geocodingFailures];
    }, [unidentifiedRows, allData]);

    const activeClientAddressSet = useMemo(() => {
        const addressSet = new Set<string>();
        allActiveClients.forEach(client => {
            if (client.address) {
                addressSet.add(normalizeAddress(client.address));
            }
        });
        return addressSet;
    }, [allActiveClients]);

    const mapPotentialClients = useMemo(() => {
        if (!okbData || okbData.length === 0) return [];
        
        const coordsOnly = okbData.filter(r => {
            const lat = r.lat;
            const lon = r.lon;
            return lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon)) && Number(lat) !== 0;
        });

        const potentialOnly = coordsOnly.filter(r => {
            const addr = findAddressInRow(r);
            if (!addr) return true; 
            return !activeClientAddressSet.has(normalizeAddress(addr));
        });

        if (filters.region.length === 0) return potentialOnly;
        
        return potentialOnly.filter(row => {
            const rawRegion = findValueInRow(row, ['регион', 'субъект', 'область']);
            if (!rawRegion) return false;
            return filters.region.some(selectedReg => 
                rawRegion.toLowerCase().includes(selectedReg.toLowerCase()) || 
                selectedReg.toLowerCase().includes(rawRegion.toLowerCase())
            );
        });
    }, [okbData, filters.region, activeClientAddressSet]);

    const filterOptions = useMemo(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => calculateSummaryMetrics(filtered), [filtered]);

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
        unidentifiedRows: combinedUnidentifiedRows, // Pass combined list to UI
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
        handleDataUpdate: handleQueuedUpdate, // Expose Queued Handler
        handleDeleteClient: handleQueuedDelete, // Expose Queued Handler
        handleStartPolling,
        addNotification,
        queueLength: actionQueue.length // Expose for UI feedback
    };
};
