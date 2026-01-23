import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, Dispatch, SetStateAction } from 'react';
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
import {
    AggregatedDataRow, FilterState, NotificationMessage,
    OkbDataRow, MapPoint, UnidentifiedRow, FileProcessingState,
    WorkerMessage, WorkerResultPayload, CoordsCache, OkbStatus
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findValueInRow, normalizeAddress } from './utils/dataUtils';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from './utils/db';

const DetailsModal = React.lazy(() => import('./components/DetailsModal'));
const UnidentifiedRowsModal = React.lazy(() => import('./components/UnidentifiedRowsModal'));

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== '';
const ROWS_PER_CHUNK = 500;
const POLLING_INTERVAL_MS = 15000;

// --- Helper for Deterministic Serialization ---
const sortKeys = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj).sort().reduce((res: any, key) => {
        if (obj[key] === undefined) return res;
        res[key] = sortKeys(obj[key]);
        return res;
    }, {});
};

// --- Helper: Sanitize Row for Save (Strip Volatile UI State AND Keys) ---
const sanitizeRowForSave = (row: AggregatedDataRow): any => {
    return {
        ...row,
        key: undefined, // Runtime key
        clients: row.clients.map((client) => {
            const { key, isGeocoding, coordStatus, lastUpdated, ...persistentData } = client;
            return persistentData;
        })
    };
};

// --- Helper for Unique IDs (Only for CREATION) ---
const generateRowId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{ [key: string]: number }>({});
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false, progress: 0, message: 'Система готова', fileName: null, backgroundMessage: null, startTime: null, totalRowsProcessed: 0
    });

    const totalRowsProcessedRef = useRef(0);
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const manualUpdateTimestamps = useRef<Map<string, number>>(new Map());
    const workerRef = useRef<Worker | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isSavingRef = useRef(false);

    const lastSavedChunksRef = useRef<Map<number, string>>(new Map());
    const rowIdToChunkIndexMap = useRef<Map<string, number>>(new Map());
    const dirtyChunkIndexesRef = useRef<Set<number>>(new Set());

    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);

    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    useEffect(() => {
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);
    
    useEffect(() => {
        const syncData = async () => {
            if (allDataRef.current.length === 0 && unidentifiedRowsRef.current.length === 0) return;
            if (processingState.isProcessing || isSavingRef.current) return;
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
                                if (row.__rowId) {
                                    const chunkIndex = rowIdToChunkIndexMap.current.get(row.__rowId);
                                    if (typeof chunkIndex === 'number') {
                                        dirtyChunkIndexesRef.current.add(chunkIndex);
                                    }
                                }
                                return { ...client, lat: cached.lat, lon: cached.lon, comment: cached.comment, isGeocoding: false, status: 'match' as const };
                            }
                        }
                        return client;
                    });
                    if (rowChanged) return { ...row, clients: newClients };
                    return row;
                });
                if (hasChanges) {
                    setAllData(newAllData);
                    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                    saveTimeoutRef.current = setTimeout(() => saveSnapshotToCloud(), 2000);
                }
            } catch (e) {
                console.error("Auto-sync failed", e);
            }
        };
        const intervalId = setInterval(syncData, POLLING_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [processingState.isProcessing]);


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
            if (!row.__rowId) {
                row.__rowId = `emergency_${index}`;
            }
            const stableRowId = row.__rowId;
            const brandRaw = String(row.brand || '').trim();
            const hasMultipleBrands = brandRaw.length > 2 && /[;,|\r\n]/.test(brandRaw);
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
                const parts = brandRaw.split(/[;,|\r\n]+/).map(b => b.trim()).filter(b => b.length > 0);
                if (parts.length > 1) {
                    const splitFactor = 1 / parts.length;
                    parts.forEach((brandPart, idx) => {
                        const safeBrandSuffix = brandPart.toLowerCase().replace(/[^a-zа-я0-9]/g, '_');
                        result.push({
                            ...row,
                            __rowId: `${stableRowId}_split_${safeBrandSuffix}`,
                            key: generateStableKey(row, `spl_${idx}`),
                            brand: brandPart,
                            clientName: `${row.region}: ${brandPart}`,
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
            result.push({
                ...row,
                __rowId: stableRowId,
                key: row.key || generateStableKey(row, 'm'),
                clients: normalizedClients
            });
        });
        return result;
    }, []);

    const cacheBaselineChunks = useCallback((data: AggregatedDataRow[]) => {
        lastSavedChunksRef.current.clear();
        rowIdToChunkIndexMap.current.clear();

        const allRowsByChunk = new Map<number, AggregatedDataRow[]>();
        let maxChunkIndex = 0;

        for (let i = 0; i < data.length; i++) {
            const chunkIndex = Math.floor(i / ROWS_PER_CHUNK);
            const row = data[i];

            if (!allRowsByChunk.has(chunkIndex)) {
                allRowsByChunk.set(chunkIndex, []);
            }
            allRowsByChunk.get(chunkIndex)!.push(row);
            
            if (row.__rowId) {
                rowIdToChunkIndexMap.current.set(row.__rowId, chunkIndex);
            }
            if (chunkIndex > maxChunkIndex) {
                maxChunkIndex = chunkIndex;
            }
        }

        allRowsByChunk.forEach((rows, chunkIndex) => {
            rows.sort((a, b) => (a.__rowId || '').localeCompare(b.__rowId || ''));
            const chunkObject = {
                chunkIndex,
                rows: rows.map(row => sortKeys(sanitizeRowForSave(row))),
            };
            lastSavedChunksRef.current.set(chunkIndex, JSON.stringify(sortKeys(chunkObject)));
        });

        console.log(`Baseline cached for ${lastSavedChunksRef.current.size} chunks.`);
    }, []);

    const saveSnapshotToCloud = useCallback(async () => {
        if (isSavingRef.current) {
            console.warn("Save in progress. Skipping.");
            return;
        }
        if (dirtyChunkIndexesRef.current.size === 0) {
            console.log("Smart Save: No dirty chunks to save.");
            return;
        }
        isSavingRef.current = true;
        
        try {
            console.log(`Начало умного сохранения... Грязных чанков: ${dirtyChunkIndexesRef.current.size}`, dirtyChunkIndexesRef.current);

            const allRowsByChunk = new Map<number, AggregatedDataRow[]>();
            allDataRef.current.forEach(row => {
                if (!row.__rowId) return;
                const chunkIndex = rowIdToChunkIndexMap.current.get(row.__rowId);
                if (typeof chunkIndex === 'number') {
                    if (!allRowsByChunk.has(chunkIndex)) {
                        allRowsByChunk.set(chunkIndex, []);
                    }
                    allRowsByChunk.get(chunkIndex)!.push(row);
                }
            });

            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            const availableSlots: { id: string, name: string }[] = listRes.ok ? await listRes.json() : [];

            const chunksToUpload: { index: number; content: string; targetFileId: string }[] = [];
            for (const chunkIndex of dirtyChunkIndexesRef.current) {
                const rowsForThisChunk = allRowsByChunk.get(chunkIndex) || [];
                rowsForThisChunk.sort((a, b) => (a.__rowId || '').localeCompare(b.__rowId || ''));

                const chunkObject = {
                    chunkIndex,
                    rows: rowsForThisChunk.map(row => sortKeys(sanitizeRowForSave(row)))
                };
                const newChunkContent = JSON.stringify(sortKeys(chunkObject));
                const oldChunkContent = lastSavedChunksRef.current.get(chunkIndex);

                if (newChunkContent !== oldChunkContent) {
                    const targetFileId = availableSlots[chunkIndex]?.id || '';
                    chunksToUpload.push({ index: chunkIndex, content: newChunkContent, targetFileId });
                }
            }

            if (chunksToUpload.length > 0) {
                console.log(`Smart Save: Uploading ${chunksToUpload.length} dirty chunk(s)...`);
                const CONCURRENCY = 4;
                for (let i = 0; i < chunksToUpload.length; i += CONCURRENCY) {
                    const batch = chunksToUpload.slice(i, i + CONCURRENCY).map((item) => {
                        const queryParams = item.targetFileId ? `action=save-chunk&targetFileId=${item.targetFileId}` : `action=save-chunk&chunkIndex=${item.index}`;
                        return fetch(`/api/get-full-cache?${queryParams}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chunk: item.content })
                        }).then(async res => {
                            if (!res.ok) throw new Error(`Upload failed for chunk ${item.index}`);
                            lastSavedChunksRef.current.set(item.index, item.content);
                        });
                    });
                    await Promise.all(batch);
                }
            } else {
                console.log("Smart Save: Dirty chunks were detected, but after rebuild they are identical to cache. No upload needed.");
            }

            const totalChunks = Math.max(availableSlots.length, ...Array.from(allRowsByChunk.keys())) + 1;
            await fetch('/api/get-full-cache?action=save-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidentifiedRows: unidentifiedRowsRef.current,
                    okbRegionCounts: okbRegionCounts,
                    totalRowsProcessed: totalRowsProcessedRef.current,
                    versionHash: `edit_${Date.now()}`,
                    chunkCount: totalChunks,
                    totalRows: allDataRef.current.length,
                    timestamp: Date.now()
                })
            });

            if (totalChunks < availableSlots.length) {
                console.log(`Cleaning up ${availableSlots.length - totalChunks} old chunks...`);
                await fetch(`/api/get-full-cache?action=cleanup-chunks&keepCount=${totalChunks}`, { method: 'POST' });
            }

            dirtyChunkIndexesRef.current.clear();
            addNotification('Изменения сохранены', 'success');

        } catch (e) {
            console.error("Cloud Save Error:", e);
            addNotification('Ошибка сохранения в облако', 'warning');
        } finally {
            isSavingRef.current = false;
        }
    }, [okbRegionCounts]);


    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация JSON...', progress: 0 }));
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error('Failed to fetch snapshot list');
            
            let fileList = await listRes.json();
            if (!Array.isArray(fileList) || fileList.length === 0) return false;
            fileList.sort((a: any, b: any) => {
                const numA = parseInt((a.name || '').match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt((b.name || '').match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });
            
            let accumulatedRows: AggregatedDataRow[] = [];
            let loadedMeta: any = null;
            const total = Math.min(fileList.length, chunkCount);

            lastSavedChunksRef.current.clear();
            rowIdToChunkIndexMap.current.clear();
            dirtyChunkIndexesRef.current.clear();

            for (let i = 0; i < total; i++) {
                const file = fileList[i];
                const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`);
                if (!res.ok) throw new Error(`Failed to load chunk ${file.id}`);
                const text = await res.text();
                
                const chunkData = JSON.parse(text);
                const chunkIndex = typeof chunkData.chunkIndex === 'number' ? chunkData.chunkIndex : i;
                
                lastSavedChunksRef.current.set(chunkIndex, text);

                let rawRowsInChunk: any[] = chunkData.rows || chunkData.aggregatedData || [];
                const migratedChunkRows = rawRowsInChunk.map((r, idx) => {
                    if (r.__rowId) return r;
                    const paddedChunk = String(chunkIndex).padStart(5, '0');
                    const paddedIdx = String(idx).padStart(5, '0');
                    return { ...r, __rowId: `legacy_${paddedChunk}_${paddedIdx}` };
                });

                const normalizedChunkRows = normalize(migratedChunkRows);
                
                normalizedChunkRows.forEach(row => {
                    if (row.__rowId) {
                        rowIdToChunkIndexMap.current.set(row.__rowId, chunkIndex);
                    }
                });

                accumulatedRows.push(...normalizedChunkRows);
                if (chunkData.meta) loadedMeta = chunkData.meta;
                setProcessingState(prev => ({ ...prev, progress: Math.round(((i + 1) / total) * 100) }));
            }

            if (accumulatedRows.length > 0 || loadedMeta) {
                setAllData(accumulatedRows);
                const safeMeta = loadedMeta || {};
                setUnidentifiedRows(safeMeta.unidentifiedRows || []);
                setOkbRegionCounts(safeMeta.okbRegionCounts || {});
                totalRowsProcessedRef.current = safeMeta.totalRowsProcessed || accumulatedRows.length;
                
                // ИСПРАВЛЕНО: Заполняем объект для saveAnalyticsState
                await saveAnalyticsState({
                    allData: accumulatedRows,
                    unidentifiedRows: safeMeta.unidentifiedRows || [],
                    okbRegionCounts: safeMeta.okbRegionCounts || {},
                    totalRowsProcessed: totalRowsProcessedRef.current,
                    versionHash: versionHash,
                    okbData: [], 
                    okbStatus: null,
                    filters: filters,
                    lastSync: Date.now()
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
    }, [normalize, addNotification, filters]);

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
    
    const handleFileProcessed = useCallback((payload: WorkerResultPayload) => {
        const { aggregatedData, unidentifiedRows, totalRowsProcessed } = payload;
        const normalizedData = normalize(aggregatedData);
        
        cacheBaselineChunks(normalizedData);

        setAllData(normalizedData);
        setUnidentifiedRows(unidentifiedRows);
        setOkbRegionCounts(payload.okbRegionCounts);
        totalRowsProcessedRef.current = totalRowsProcessed;

        for (const chunkIndex of rowIdToChunkIndexMap.current.values()) {
            dirtyChunkIndexesRef.current.add(chunkIndex);
        }
        saveSnapshotToCloud();
        
        setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Обработка завершена', progress: 100 }));
        setDbStatus('ready');
    }, [normalize, cacheBaselineChunks, saveSnapshotToCloud]);

    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            const local = await loadAnalyticsState();
            if (local?.allData?.length > 0) {
                const readyRows = local.allData.map((r: any, idx: number) => {
                    if (r.__rowId) return r;
                    return { ...r, __rowId: `legacy_local_${String(idx).padStart(5, '0')}` };
                });
                const validatedLocal = normalize(readyRows);
                
                cacheBaselineChunks(validatedLocal);
                
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
    }, [handleDownloadSnapshot, normalize, cacheBaselineChunks]);

    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        let newData = [...allDataRef.current];
        let newUnidentified = [...unidentifiedRowsRef.current];
        
        if (newPoint.address) {
            manualUpdateTimestamps.current.set(normalizeAddress(newPoint.address), Date.now());
        }

        if (typeof originalIndex === 'number') {
            // ... (здесь твоя логика для добавления новых строк, она должна тоже помечать чанки грязными)
        } else {
            let found = false;
            newData = newData.map(group => {
                if (found) return group;
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                if (clientIndex !== -1) {
                    found = true;
                    const chunkIndex = rowIdToChunkIndexMap.current.get(group.__rowId!);
                    if (typeof chunkIndex === 'number') {
                        dirtyChunkIndexesRef.current.add(chunkIndex);
                        console.log(`Marking chunk ${chunkIndex} as dirty due to update.`);
                    }
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = newPoint;
                    return { ...group, clients: updatedClients };
                }
                return group;
            });
            if (!found) console.warn(`Could not find client with key: ${oldKey} to update.`);
        }

        setAllData(newData);
        setUnidentifiedRows(newUnidentified);
        
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveSnapshotToCloud().catch(err => console.error("Auto-save failed:", err));
        }, 2000);
    }, [okbRegionCounts, saveSnapshotToCloud]);

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

    const mapPotentialClients = useMemo(() => {
        if (!okbData || okbData.length === 0) return [];
        const coordsOnly = okbData.filter(r => {
            const lat = r.lat, lon = r.lon;
            return lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon)) && Number(lat) !== 0;
        });
        if (filters.region.length === 0) return coordsOnly;
        return coordsOnly.filter(row => {
            const rawRegion = findValueInRow(row, ['регион', 'субъект', 'область']);
            if (!rawRegion) return false;
            return filters.region.some(selectedReg =>
                rawRegion.toLowerCase().includes(selectedReg.toLowerCase()) ||
                selectedReg.toLowerCase().includes(rawRegion.toLowerCase())
            );
        });
    }, [okbData, filters.region]);

    const filterOptions = useMemo(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => calculateSummaryMetrics(filtered), [filtered]);

    return (
        <div className="h-screen w-screen bg-gray-900 text-white flex flex-col overflow-hidden">
            <Navigation 
                onModuleChange={setActiveModule}
                // TODO: TypeScript ругается, что проп 'activeModule' не существует в твоем компоненте Navigation.
                // Возможно, он называется по-другому (например, 'module'?). Раскомментируй и исправь имя пропа.
                // activeModule={activeModule}
            />
            <main className="flex-grow flex overflow-hidden">
                <div className="flex-grow flex flex-col">
                    <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                        {/* Status bar & other top controls will go here */}
                    </div>
                    <div className="flex-grow overflow-y-auto p-4">
                        {activeModule === 'adapta' && (
                            <Adapta
                                processingState={processingState}
                                onForceUpdate={handleForceUpdate}
                                onFileProcessed={handleFileProcessed}
                                onProcessingStateChange={() => {}}
                                okbData={okbData}
                                okbStatus={okbStatus}
                                onOkbStatusChange={setOkbStatus}
                                onOkbDataChange={setOkbData}
                                disabled={processingState.isProcessing}
                                unidentifiedCount={unidentifiedRows.length}
                                onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)}
                                activeClientsCount={allActiveClients.length}
                                uploadedData={filtered}
                                dbStatus={dbStatus}
                                onStartEdit={setEditingClient}
                                startDate={filterStartDate}
                                endDate={filterEndDate}    
                                onStartDateChange={setFilterStartDate}
                                onEndDateChange={setFilterEndDate}    
                            />
                        )}
                        {activeModule === 'amp' && (
                            <div className="space-y-4">
                                <Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({rm:'', brand:[], packaging:[], region:[]})} disabled={allData.length === 0} />
                                <ResultsTable
                                    data={filtered}
                                    onRowClick={setSelectedDetailsRow}
                                    unidentifiedRowsCount={unidentifiedRows.length}
                                    onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)}
                                    disabled={allData.length === 0}
                                />
                            </div>
                        )}
                        {activeModule === 'dashboard' && (
                            <RMDashboard isOpen={true} onClose={() => setActiveModule('amp')} data={filtered} metrics={summaryMetrics} okbRegionCounts={okbRegionCounts} mode="page" okbData={okbData} okbStatus={okbStatus} />
                        )}
                        {activeModule === 'prophet' && null}
                        {activeModule === 'agile' && null}
                        {activeModule === 'roi-genome' && null}
                    </div>
                </div>
                <div className="w-1/3 min-w-[400px] max-w-[600px] border-l border-gray-700 h-full overflow-hidden flex flex-col">
                    <InteractiveRegionMap 
                        activeClients={allActiveClients} 
                        potentialClients={mapPotentialClients} 
                        // TODO: TypeScript ругается, что проп 'onSelectClient' не существует в твоем компоненте InteractiveRegionMap.
                        // Возможно, он называется по-другому (например, 'onClientSelect'?). Раскомментируй и исправь имя пропа.
                        // onSelectClient={setEditingClient}
                    />
                </div>
            </main>
            <div className="fixed bottom-4 right-4 space-y-2">
                {notifications.map(n => (
                    <Notification key={n.id} message={n.message} type={n.type} />
                ))}
            </div>
            <Suspense fallback={<div>Loading...</div>}>
                {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={setEditingClient} />}
                {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={setEditingClient} />}
            </Suspense>
            {editingClient && (
                <AddressEditModal isOpen={!!editingClient} onClose={() => setEditingClient(null)} onBack={() => setEditingClient(null)} data={editingClient} onDataUpdate={handleDataUpdate} onStartPolling={() => {}} onDelete={() => {}} globalTheme="dark" />
            )}
        </div>
    );
};
export default App;
