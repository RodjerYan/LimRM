
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    AggregatedDataRow, FilterState, NotificationMessage, 
    OkbDataRow, MapPoint, UnidentifiedRow, FileProcessingState,
    WorkerResultPayload, CoordsCache, OkbStatus,
    UpdateJobStatus
} from '../types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findValueInRow, normalizeAddress, findAddressInRow } from '../utils/dataUtils';
import { enrichDataWithSmartPlan } from '../services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from '../utils/db';
import { enrichWithAbcCategories } from '../utils/analytics';

// Максимальный размер JSON-файла в байтах (850 КБ)
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
    
    // --- BACKGROUND POLLING STATE ---
    const [pendingGeocoding, setPendingGeocoding] = useState<PendingGeocodingItem[]>([]);

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

    // --- СОХРАНЕНИЕ В ОБЛАКО (С ЧАНКАМИ И DIFF-ПРОВЕРКОЙ) ---
    const saveSnapshotToCloud = async (currentData: AggregatedDataRow[], currentUnidentified: UnidentifiedRow[]) => {
        if (isSavingRef.current) {
            console.log("%c[Save] Save in progress. Queuing next run.", "color: orange");
            saveQueuedRef.current = true;
            return;
        }
        
        isSavingRef.current = true;
        setIsCloudSaving(true);

        console.groupCollapsed(`%c[Cloud Save] Started at ${new Date().toLocaleTimeString()}`, 'color: #818cf8; font-weight: bold;');

        try {
            console.time('fetch-slots');
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            let availableSlots: { id: string, name: string }[] = [];
            if (listRes.ok) {
                availableSlots = await listRes.json();
            }
            console.timeEnd('fetch-slots');

            const newVersionHash = `edit_${Date.now()}`;
            const encoder = new TextEncoder();
            const getByteSize = (str: string) => encoder.encode(str).length;
            
            console.time('chunk-generation');
            const chunks: string[] = [];
            let currentChunkObj: any = {
                chunkIndex: 0,
                rows: [],
            };
            
            let currentSize = getByteSize(JSON.stringify(currentChunkObj));
            
            for (const row of currentData) {
                const rowStr = JSON.stringify(row);
                const rowSize = getByteSize(rowStr) + 2; 
                
                if (currentSize + rowSize > MAX_CHUNK_SIZE_BYTES) {
                    chunks.push(JSON.stringify(currentChunkObj)); 
                    currentChunkObj = {
                        chunkIndex: chunks.length,
                        rows: []
                    };
                    currentSize = getByteSize(JSON.stringify(currentChunkObj));
                }
                currentChunkObj.rows.push(row);
                currentSize += rowSize;
            }
            chunks.push(JSON.stringify(currentChunkObj));
            console.timeEnd('chunk-generation');
            console.info(`Generated ${chunks.length} chunks from ${currentData.length} rows.`);
            
            const chunksToUpload: { index: number; content: string; targetFileId: string }[] = [];
            
            chunks.forEach((chunkContent, idx) => {
                const prevContent = lastSavedChunksRef.current.get(idx);
                if (prevContent !== chunkContent) {
                    const targetFileId = availableSlots[idx] ? availableSlots[idx].id : '';
                    if (targetFileId) {
                        chunksToUpload.push({ index: idx, content: chunkContent, targetFileId });
                    } else {
                        chunksToUpload.push({ index: idx, content: chunkContent, targetFileId: '' });
                    }
                }
            });

            if (chunksToUpload.length === 0) {
                console.log("%c[Cloud Save] No data chunks changed. Skipping large upload.", "color: #10b981");
                chunks.forEach((content, idx) => {
                    lastSavedChunksRef.current.set(idx, content);
                });
            } else {
                console.log(`%c[Cloud Save] Changes detected. Uploading ${chunksToUpload.length} chunk(s)...`, "color: #f59e0b");
                
                const CONCURRENCY = 4;
                for (let i = 0; i < chunksToUpload.length; i += CONCURRENCY) {
                    const batch = chunksToUpload.slice(i, i + CONCURRENCY).map((item) => {
                        const queryParams = item.targetFileId 
                            ? `action=save-chunk&targetFileId=${item.targetFileId}` 
                            : `action=save-chunk&chunkIndex=${item.index}`;

                        console.time(`upload-chunk-${item.index}`);
                        return fetch(`/api/get-full-cache?${queryParams}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chunk: item.content }) 
                        }).then(async res => {
                            console.timeEnd(`upload-chunk-${item.index}`);
                            if (!res.ok) {
                                const txt = await res.text();
                                throw new Error(`Upload failed for chunk ${item.index}: ${txt}`);
                            }
                            console.info(`✅ Chunk ${item.index} saved.`);
                            lastSavedChunksRef.current.set(item.index, item.content);
                        });
                    });
                    
                    await Promise.all(batch);
                }
            }
            
            console.time('save-meta');
            await fetch('/api/get-full-cache?action=save-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidentifiedRows: currentUnidentified,
                    okbRegionCounts: okbRegionCounts,
                    totalRowsProcessed: totalRowsProcessedRef.current,
                    versionHash: newVersionHash,
                    chunkCount: chunks.length,
                    totalRows: totalRowsProcessedRef.current,
                    timestamp: Date.now()
                })
            });
            console.timeEnd('save-meta');
            
            addNotification('Изменения сохранены', 'success');
        } catch (e) {
            console.error("Cloud Save Error:", e);
            addNotification('Ошибка сохранения в облако', 'warning');
            saveQueuedRef.current = true;
        } finally {
            console.groupEnd();
            isSavingRef.current = false;
            
            if (saveQueuedRef.current) {
                console.log("%c[Queue] Executing queued save...", "color: cyan");
                saveQueuedRef.current = false;
                saveSnapshotToCloud(allDataRef.current, unidentifiedRowsRef.current);
            } else {
                setIsCloudSaving(false); 
            }
        }
    };

    // --- DATA UPDATE HANDLER (DEBOUNCED) ---
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
        
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveSnapshotToCloud(newData, newUnidentified).catch(err => {
                console.error("Auto-save failed:", err);
            });
        }, 2000);

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
        });
        
        enrichWithAbcCategories(currentAllData);
        setAllData([...currentAllData]);
        setUnidentifiedRows([...currentUnidentified]);

        if (updatedEditingClient) {
            setEditingClient(prev => prev ? ({ ...prev, ...updatedEditingClient }) : null);
        }

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => saveSnapshotToCloud(currentAllData, currentUnidentified), 2000);

    }, [editingClient]);

    // --- LIVE SYNC POLLING ---
    useEffect(() => {
        const syncData = async () => {
            if (allDataRef.current.length === 0 && unidentifiedRowsRef.current.length === 0) return;
            if (processingState.isProcessing) return;

            try {
                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                if (!res.ok) return;
                const cacheData: CoordsCache = await res.json();

                const cacheMap = new Map<string, { lat: number; lon: number; comment?: string }>();
                Object.values(cacheData).flat().forEach((item: any) => {
                    if (item.address && !item.isDeleted && item.lat && item.lon) {
                        cacheMap.set(normalizeAddress(item.address), { lat: item.lat, lon: item.lon, comment: item.comment });
                    }
                });

                let hasChanges = false;
                let updatedEditingClient: MapPoint | null = null;

                const newAllData = allDataRef.current.map(row => {
                    let rowChanged = false;
                    const newClients = row.clients.map(client => {
                        const normAddr = normalizeAddress(client.address);
                        
                        const lastManualUpdate = manualUpdateTimestamps.current.get(normAddr);
                        if (lastManualUpdate && (Date.now() - lastManualUpdate < 120000)) {
                            return client;
                        }

                        const cached = cacheMap.get(normAddr);
                        
                        if (cached) {
                            const latDiff = Math.abs((client.lat || 0) - cached.lat);
                            const lonDiff = Math.abs((client.lon || 0) - cached.lon);
                            const commentDiff = (client.comment || '') !== (cached.comment || '');
                            
                            if (latDiff > 0.0001 || lonDiff > 0.0001 || commentDiff) {
                                rowChanged = true;
                                hasChanges = true;
                                const updatedClient = { ...client, lat: cached.lat, lon: cached.lon, comment: cached.comment, isGeocoding: false, status: 'match' as const };
                                
                                if (editingClient && (editingClient as MapPoint).key === client.key) {
                                    updatedEditingClient = updatedClient;
                                }
                                return updatedClient;
                            }
                        }
                        return client;
                    });
                    
                    if (rowChanged) return { ...row, clients: newClients };
                    return row;
                });

                if (hasChanges) {
                    setAllData(newAllData);
                    if (updatedEditingClient) {
                        setEditingClient(prev => prev ? ({ ...prev, ...updatedEditingClient }) : null);
                        addNotification('Данные открытого клиента обновлены', 'info');
                    }
                }

            } catch (e) {
                console.error("Auto-sync failed", e);
            }
        };

        const intervalId = setInterval(syncData, POLLING_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [processingState.isProcessing, editingClient]);

    // --- BACKGROUND GEOCODING POLLING ---
    useEffect(() => {
        const poll = async () => {
            if (pendingGeocoding.length === 0) return;

            const updatedPending: PendingGeocodingItem[] = [];
            const completedItems: { oldKey: string, point: MapPoint, originalIndex?: number }[] = [];

            for (const item of pendingGeocoding) {
                if (item.attempts >= MAX_GEOCODING_ATTEMPTS) {
                    addNotification(`Тайм-аут геокодинга для: ${item.address}`, 'warning');
                    const errorPoint = { ...item.basePoint, isGeocoding: false, geocodingError: 'Превышено время ожидания.' };
                    completedItems.push({ oldKey: item.oldKey, point: errorPoint, originalIndex: item.originalIndex });
                    continue;
                }

                try {
                    const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(item.rm)}&address=${encodeURIComponent(item.address)}&_t=${Date.now()}`, {
                        headers: { 'Cache-Control': 'no-cache' }
                    });

                    if (res.ok) {
                        const result = await res.json();
                        const hasCoords = typeof result.lat === 'number' && typeof result.lon === 'number' && result.lat !== 0 && result.lon !== 0;

                        if (hasCoords) {
                            const successPoint = { ...item.basePoint, lat: result.lat, lon: result.lon, isGeocoding: false, comment: result.comment || item.basePoint.comment };
                            completedItems.push({ oldKey: item.oldKey, point: successPoint, originalIndex: item.originalIndex });
                            addNotification(`Координаты для "${item.address.substring(0, 30)}..." найдены`, 'success');
                        } else {
                            updatedPending.push({ ...item, attempts: item.attempts + 1 });
                        }
                    } else {
                        updatedPending.push({ ...item, attempts: item.attempts + 1 });
                    }
                } catch (e) {
                    updatedPending.push({ ...item, attempts: item.attempts + 1 });
                }
            }
            
            if (completedItems.length > 0) {
                handleBatchDataUpdate(completedItems);
            }
            setPendingGeocoding(updatedPending);
        };

        const intervalId = setInterval(poll, GEOCODING_POLLING_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [pendingGeocoding]);

    // --- NORMALIZE HELPER ---
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
                key: row.key || generateStableKey(row, 'm'),
                clientName: finalClientName,
                clients: normalizedClients
            });
        });
        return result;
    }, []);

    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация JSON...', progress: 0 }));
            
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
                let newRows: any[] = Array.isArray(chunkData.rows) ? chunkData.rows : (Array.isArray(chunkData.aggregatedData) ? chunkData.aggregatedData : []);
                
                if (newRows.length > 0) {
                    accumulatedRows.push(...normalize(newRows));
                }
                if (chunkData.meta) loadedMeta = chunkData.meta;
                
                loadedCount++;
                setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
            }

            if (accumulatedRows.length > 0 || loadedMeta) {
                enrichWithAbcCategories(accumulatedRows);
                
                setAllData(accumulatedRows);
                
                const safeMeta = loadedMeta || {};
                setUnidentifiedRows(safeMeta.unidentifiedRows || []);
                setOkbRegionCounts(safeMeta.okbRegionCounts || {});
                totalRowsProcessedRef.current = safeMeta.totalRowsProcessed || accumulatedRows.length;
                
                await saveAnalyticsState({
                    allData: accumulatedRows,
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
    }, [normalize, addNotification]);

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

    const handleStartPolling = useCallback((rm: string, address: string, oldKey: string, basePoint: MapPoint, originalIndex?: number) => {
        addNotification(`Адрес "${address.substring(0, 30)}..." отправлен на геокодинг`, 'info');
        handleDataUpdate(oldKey, basePoint, originalIndex);
        setPendingGeocoding(prev => [...prev, { rm, address, oldKey, basePoint, originalIndex, attempts: 0 }]);
    }, [handleDataUpdate, addNotification]);

    const handleDeleteClient = useCallback((rmName: string, address: string) => {
        const normAddress = normalizeAddress(address);
        let newData = [...allDataRef.current]; 
        let newUnidentified = [...unidentifiedRowsRef.current];
        let wasModified = false;

        newData = newData.map(group => {
            if (group.rm !== rmName) return group;

            const originalClientCount = group.clients.length;
            const newClients = group.clients.filter(c => normalizeAddress(c.address) !== normAddress);
            
            if (newClients.length !== originalClientCount) {
                wasModified = true;
                const newFact = newClients.reduce((sum, c) => sum + (c.fact || 0), 0);
                
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

            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
                saveSnapshotToCloud(newData, newUnidentified).catch(err => {
                    console.error("Auto-save failed after delete:", err);
                });
            }, 1000);
        }
    }, []);

    // --- INIT ---
    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            const local = await loadAnalyticsState();
            if (local?.allData?.length > 0) {
                const validatedLocal = normalize(local.allData);
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
    }, [handleDownloadSnapshot, normalize]);

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
        unidentifiedRows,
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
        handleDataUpdate,
        handleDeleteClient,
        handleStartPolling,
        addNotification
    };
};
