import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    OkbDataRow, MapPoint, UnidentifiedRow,
    OkbStatus, UpdateJobStatus, AggregatedDataRow, InterestDelta
} from '../types';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../utils/dataUtils';
import { saveAnalyticsState, loadAnalyticsState } from '../utils/db';
import { enrichWithAbcCategories } from '../utils/analytics';
import { useAuth } from '../components/auth/AuthContext';

// Imported modular hooks
import { useDataSync } from './useDataSync';
import { useGeocoding } from './useGeocoding';
import { useAnalytics } from './useAnalytics';

const parseNum = (v: any) => {
    if (v == null) return NaN;
    const s = String(v).replace(/[\s\u00A0]/g, '').replace(',', '.');
    return parseFloat(s);
};

const hasValidCoordsRow = (row: any) => {
    const latRaw = findValueInRow(row, ['широта', 'lat', 'ldt', 'latitude', 'geo_lat', 'y']);
    const lonRaw = findValueInRow(row, ['долгота', 'lon', 'lng', 'longitude', 'geo_lon', 'x']);
    
    const lat = parseNum(latRaw);
    const lon = parseNum(lonRaw);
    
    return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;
};

const isStrictErrorStatus = (row: any): boolean => {
    if (hasValidCoordsRow(row)) return false;

    const latRaw = findValueInRow(row, ['широта', 'lat', 'latitude', 'geo_lat', 'y', 'ldt']);
    const lonRaw = findValueInRow(row, ['долгота', 'lon', 'lng', 'longitude', 'geo_lon', 'x']);

    const check = (v: string) => {
        const s = String(v || '').toLowerCase().trim();
        return s.includes('не определен') || s.includes('не определён') || s.includes('некорректный');
    };
    
    return check(latRaw) || check(lonRaw);
};

const getUniqueKeyForBluePoint = (row: OkbDataRow) => {
    const addr = normalizeAddress(findAddressInRow(row));
    const name = (row['наименование'] || row['клиент'] || row['name'] || '').toString().toLowerCase().replace(/[^a-zа-я0-9]/g, '');
    return `${addr}#${name}`;
};

export const useAppLogic = () => {
    // --- AUTH INTEGRATION ---
    const { user, token } = useAuth();
    
    const [activeModule, setActiveModule] = useState('adapta');
    const [updateJobStatus, setUpdateJobStatus] = useState<UpdateJobStatus | null>(null);
    const updatePollingInterval = useRef<number | null>(null);
    const [notifications, setNotifications] = useState<{id: number, message: string, type: 'success'|'error'|'info'|'warning'}[]>([]);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');

    // Shared State for Adapta
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    
    // Data Loading Filters (Sync Scope)
    const [loadStartDate, setLoadStartDate] = useState<string>('');
    const [loadEndDate, setLoadEndDate] = useState<string>('');
    
    // UI State
    const [selectedDetailsRow, setSelectedDetailsRow] = useState<any | null>(null);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);
    // NEW: State for editing Potential Clients (Blue Points)
    const [editingPotentialClient, setEditingPotentialClient] = useState<MapPoint | null>(null);

    const lastCacheSizeRef = useRef<number>(0);
    const lastDeltaTsRef = useRef<number>(0);
    const isSyncingRef = useRef(false);

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
        interestDeltas, // Consuming interest deltas
        isCloudSaving, 
        processingState, setProcessingState,
        totalRowsProcessedRef,
        manualUpdateTimestamps,
        saveDeltaToCloud,
        saveInterestDelta, // Function to save interest delta
        applyCacheToData,
        applyDeltasToData,
        handleDownloadSnapshot: originalDownloadSnapshot
    } = useDataSync(addNotification);

    // --- DATA VISIBILITY FILTERING ---
    // IMPORTANT:
    // - RM should see only rows that belong to their RM name (group.rm)
    // - DM should see rows that belong to their DM name (often stored per-client, not on the aggregated group)
    // - In many snapshots the DM column is coded as "BR" (per your screenshot), so we treat BR as a DM source too
    const normalize = (v: any) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

    // More robust name normalization: handles "Ё/Е", punctuation, double spaces, etc.
    const normalizeName = (v: any) =>
        String(v ?? "")
            .toLowerCase()
            .replace(/ё/g, "е")
            .replace(/[^a-zа-я0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const extractDmFromClient = (client: any): string => {
        if (!client) return "";

        // 1) Prefer normalized fields if your worker already mapped them
        const direct =
            client.dm ??
            client.divisionalManager ??
            client.divisional_manager ??
            client["ДМ"] ??
            client["DM"] ??
            client.BR; // <-- in your dataset BR can be DM
        if (direct) return String(direct);

        // 2) Fallback: try to pull DM from the original row, if preserved
        const orig = client.originalRow ?? client.originalRowData ?? client.rowData ?? client.rawRow;
        if (orig) {
            // NOTE: include 'BR' here because in your files BR is the DM column code
            const dmVal = findValueInRow(orig, [
                "BR",
                "ДМ",
                "DM",
                "дм",
                "дивизиональный менеджер",
                "директор дивизиона",
                "divisional manager",
                "divisional_manager",
            ]);
            if (dmVal) return String(dmVal);
        }

        return "";
    };

    const visibleData = useMemo(() => {
        if (!user) return [];
        if (user.role === 'admin') return allData;

        const userSurname = normalizeName(user.lastName);

        return allData.filter((group: any) => {
            // 1) RM visibility (existing behavior)
            const rmName = normalizeName(group.rm);
            if (rmName && rmName.includes(userSurname)) return true;

            // 2) DM visibility
            // DM is often not stored at the aggregated group level; it sits on each client row.
            // We therefore check:
            //   - group.dm / group.BR / group.manager (if present)
            //   - any client.dm / client.BR / originalRow[BR/DM/...]
            const groupDm =
                group.dm ??
                group.divisionalManager ??
                group.divisional_manager ??
                group["ДМ"] ??
                group["DM"] ??
                group.BR ??
                group.manager;

            if (groupDm && normalizeName(groupDm).includes(userSurname)) return true;

            const clients = Array.isArray(group.clients) ? group.clients : [];
            if (clients.length) {
                return clients.some((c: any) => {
                    const dm = extractDmFromClient(c);
                    return dm && normalizeName(dm).includes(userSurname);
                });
            }

            return false;
        });
    }, [allData, user]);

    // --- FILTER OKB DATA BASED ON INTEREST DELTAS (Deleted Blue Points) ---
    const filteredOkbData = useMemo(() => {
        if (!okbData || okbData.length === 0) return [];

        // Create a set of deleted keys & comments map
        const deletedKeys = new Set<string>();
        const commentsMap = new Map<string, any[]>();
        const deletedComments = new Set<number>();

        if (interestDeltas && interestDeltas.length > 0) {
            // First pass: identify deleted comments
            interestDeltas.forEach(d => {
                if (d.type === 'delete_comment' && d.originalTimestamp) {
                    deletedComments.add(d.originalTimestamp);
                }
            });

            // Second pass: process updates
            interestDeltas.forEach(d => {
                if (d.type === 'delete') {
                    deletedKeys.add(d.key);
                } else if (d.type === 'comment' && d.comment) {
                    // Skip if this comment was deleted
                    if (deletedComments.has(d.timestamp)) return;

                    if (!commentsMap.has(d.key)) commentsMap.set(d.key, []);
                    commentsMap.get(d.key)!.push({
                        user: d.user,
                        date: new Date(d.timestamp).toLocaleDateString(),
                        text: d.comment,
                        timestamp: d.timestamp
                    });
                }
            });
        }

        // Filter and Enrich
        // IMPORTANT: We inject the 'key' here so downstream components (Map) 
        // can use it to identify the row consistently.
        return okbData.filter(row => {
            const key = getUniqueKeyForBluePoint(row);
            return !deletedKeys.has(key);
        }).map(row => {
            const key = getUniqueKeyForBluePoint(row);
            // Inject key into the row object
            const newRow = { ...row, key }; 
            
            if (commentsMap.has(key)) {
                return { ...newRow, changeHistory: commentsMap.get(key) };
            }
            return newRow;
        });

    }, [okbData, interestDeltas]);

    // Wrapper to pass current date state
    const handleDownloadSnapshot = useCallback((serverMeta: any) => {
        return originalDownloadSnapshot(serverMeta, loadStartDate, loadEndDate);
    }, [originalDownloadSnapshot, loadStartDate, loadEndDate]);

    // --- 3. ANALYTICS HOOK (Must use visibleData and filteredOkbData!) ---
    // Pass filteredOkbData instead of raw okbData to ensure deleted points don't show up in metrics/map
    const { filters, setFilters, filterStartDate, setFilterStartDate, filterEndDate, setFilterEndDate, filtered, allActiveClients, mapPotentialClients, filterOptions, summaryMetrics } = useAnalytics(visibleData, filteredOkbData, okbRegionCounts);

    useEffect(() => {
        setFilterStartDate(loadStartDate);
        setFilterEndDate(loadEndDate);
    }, [loadStartDate, loadEndDate, setFilterStartDate, setFilterEndDate]);

    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        let newData = [...allData]; 
        let newUnidentified = [...unidentifiedRows];
        if (newPoint.address) { manualUpdateTimestamps.current.set(normalizeAddress(newPoint.address), Date.now()); }
        
        let itemFoundAndUpdated = false;

        newData = newData.map(group => {
            const clientIndex = group.clients.findIndex(c => c.key === oldKey);
            if (clientIndex !== -1) { 
                itemFoundAndUpdated = true;
                const oldClient = group.clients[clientIndex];
                const mergedClient = { 
                    ...newPoint, 
                    monthlyFact: newPoint.monthlyFact || oldClient.monthlyFact, 
                    dailyFact: newPoint.dailyFact || oldClient.dailyFact,
                    fact: newPoint.fact || oldClient.fact 
                };
                const updatedClients = [...group.clients]; 
                updatedClients[clientIndex] = mergedClient; 
                return { ...group, clients: updatedClients }; 
            }
            return group;
        });

        if (!itemFoundAndUpdated && typeof originalIndex === 'number') {
            const rowIndex = newUnidentified.findIndex(r => r.originalIndex === originalIndex);
            if (rowIndex !== -1) {
                newUnidentified.splice(rowIndex, 1);
            }
            
            const groupKey = `${newPoint.region}-${newPoint.rm}-${newPoint.brand}-${newPoint.packaging}`.toLowerCase();
            const existingGroupIndex = newData.findIndex(g => g.key === groupKey);
            
            if (existingGroupIndex !== -1) {
                const updatedClients = [...newData[existingGroupIndex].clients, newPoint];
                newData[existingGroupIndex] = { ...newData[existingGroupIndex], clients: updatedClients };
            } else {
                newData.push({ 
                    __rowId: `row_${Date.now()}`, 
                    key: groupKey, 
                    rm: newPoint.rm, 
                    region: newPoint.region, 
                    city: newPoint.city, 
                    brand: newPoint.brand, 
                    packaging: newPoint.packaging, 
                    clientName: `${newPoint.region}: ${newPoint.brand}`, 
                    fact: 0, potential: 0, growthPotential: 0, growthPercentage: 0, 
                    clients: [newPoint] 
                } as any);
            }
        }

        if (editingClient && (editingClient as MapPoint).key === oldKey) { 
            setEditingClient(prev => prev ? ({ ...prev, ...newPoint }) : null); 
        }
        
        setAllData(newData); 
        setUnidentifiedRows(newUnidentified);
        
        if (!newPoint.isGeocoding && newPoint.lat != null && newPoint.lon != null && newPoint.lat !== 0 && newPoint.lon !== 0) {
            saveDeltaToCloud({ type: 'update', key: oldKey, rm: newPoint.rm, payload: newPoint, timestamp: Date.now() });
        }
    }, [allData, unidentifiedRows, editingClient, setAllData, setUnidentifiedRows, saveDeltaToCloud]);

    const handleDeleteClientLocal = useCallback((rmName: string, address: string) => {
        const normAddress = normalizeAddress(address);
        let newData = [...allData]; let newUnidentified = [...unidentifiedRows];
        let wasModified = false; let deletedKey = '';
        newData = newData.map(group => {
            if (group.rm !== rmName) return group;
            const originalClientCount = group.clients.length;
            const newClients = group.clients.filter(c => { const isMatch = normalizeAddress(c.address) === normAddress; if (isMatch) deletedKey = c.key; return !isMatch; });
            if (newClients.length !== originalClientCount) { wasModified = true; return { ...group, clients: newClients }; }
            return group;
        }).filter(group => group.clients.length > 0);
        const initialUnidentifiedCount = newUnidentified.length;
        newUnidentified = newUnidentified.filter(row => !(row.rm === rmName && normalizeAddress(findAddressInRow(row.rowData)) === normAddress));
        if (newUnidentified.length !== initialUnidentifiedCount) wasModified = true;
        if (wasModified) {
            setAllData(newData); 
            setUnidentifiedRows(newUnidentified);
            saveDeltaToCloud({ type: 'delete', key: deletedKey || normalizeAddress(address), rm: rmName, timestamp: Date.now() });
        }
    }, [allData, unidentifiedRows, setAllData, setUnidentifiedRows, saveDeltaToCloud]);

    // NEW: Handle update for Potential (Blue) Client
    const handlePotentialClientUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number, options?: { skipHistory?: boolean, reason?: string, type?: 'delete' | 'comment' | 'delete_comment', originalTimestamp?: number }) => {
        
        if (!user) return; // Should be authenticated
        
        // 1. Identify Action Type
        // If we are "deleting" (marked via option or logic), create delete delta
        if (options?.type === 'delete') {
            if (!options.reason) {
                addNotification("Необходимо указать причину удаления", "error");
                return;
            }
            
            const delta: InterestDelta = {
                key: oldKey, // The unique key generated for blue point
                type: 'delete',
                user: `${user.lastName} ${user.firstName}`,
                timestamp: Date.now(),
                reason: options.reason
            };
            
            saveInterestDelta(delta);
            addNotification("Точка удалена из базы потенциальных клиентов", "success");
            setEditingPotentialClient(null); // Close modal
            return;
        }

        if (options?.type === 'delete_comment') {
            if (!options.originalTimestamp) {
                console.error("Missing originalTimestamp for delete_comment");
                return;
            }
            const delta: InterestDelta = {
                key: oldKey,
                type: 'delete_comment',
                user: `${user.lastName} ${user.firstName}`,
                timestamp: Date.now(),
                originalTimestamp: options.originalTimestamp
            };
            saveInterestDelta(delta);
            addNotification("Комментарий удален", "success");
            return;
        }

        // 2. Handle Commenting / Editing
        if (newPoint.comment) {
             const delta: InterestDelta = {
                key: oldKey,
                type: 'comment',
                user: `${user.lastName} ${user.firstName}`,
                timestamp: Date.now(),
                comment: newPoint.comment
            };
            saveInterestDelta(delta);
            addNotification("Комментарий сохранен", "success");
        }

    }, [user, saveInterestDelta, addNotification]);

    // --- 2. GEOCODING HOOK ---
    const { actionQueue, handleStartPolling, handleQueuedUpdate, handleQueuedDelete } = useGeocoding(addNotification, handleDataUpdate, handleDeleteClientLocal);

    // --- LIVE SYNC ---
    useEffect(() => {
        const syncData = async () => {
            if (allData.length === 0 || processingState.isProcessing || isSyncingRef.current) return;
            isSyncingRef.current = true;
            try {
                const headers: HeadersInit = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const deltasRes = await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`, { headers });
                const deltas = deltasRes.ok ? await deltasRes.json() : [];

                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`, { headers });
                if (!res.ok) return;
                const cacheData = await res.json();
                
                const currentCacheSize = Object.keys(cacheData).length + Object.values(cacheData).flat().length;
                const newestTs = Array.isArray(deltas) && deltas.length > 0 ? Math.max(...deltas.map((d: any) => Number(d.timestamp) || 0)) : 0;
                
                const hasNewDeltas = newestTs > lastDeltaTsRef.current;
                const hasCacheChanges = currentCacheSize !== lastCacheSizeRef.current;
                
                if (hasNewDeltas || hasCacheChanges) {
                    if (hasNewDeltas) lastDeltaTsRef.current = newestTs;
                    lastCacheSizeRef.current = currentCacheSize;
                    let freshData = applyCacheToData(allData, cacheData);
                    freshData = applyDeltasToData(freshData, deltas);
                    setAllData(freshData); 
                    addNotification("Данные обновлены из облака", "info");
                }
            } catch (e) { console.error("Auto-sync failed", e); } finally { isSyncingRef.current = false; }
        };
        const intervalId = setInterval(syncData, 45000);
        return () => clearInterval(intervalId);
    }, [allData, processingState.isProcessing, applyCacheToData, applyDeltasToData, setAllData, addNotification, token]);

    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            setDbStatus('ready');
        };
        init();
        return () => { if (updatePollingInterval.current) clearInterval(updatePollingInterval.current); };
    }, []);

    const handleForceUpdate = useCallback(async () => {
        if (processingState.isProcessing) return;
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 5, message: 'Проверка облачного снимка...' }));
        try {
            const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
            if (metaRes.ok) {
                const serverMeta = await metaRes.json();
                if (serverMeta) { await handleDownloadSnapshot(serverMeta); setDbStatus('ready'); return; }
            }
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Снимок не найден' }));
        } catch (e) { setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка обновления' })); }
    }, [processingState.isProcessing, handleDownloadSnapshot, setProcessingState]);

    const handleStartDataUpdate = async () => { handleForceUpdate(); };

    // --- FILTERED UNIDENTIFIED ROWS ---
    const combinedUnidentifiedRows = useMemo(() => {
        const parsingFailures = unidentifiedRows
            .filter(r => !hasValidCoordsRow(r.rowData)) 
            .filter(r => isStrictErrorStatus(r.rowData));
        
        const geocodingFailures = visibleData.flatMap(group => group.clients) 
            .filter(c => (c.lat == null || c.lon == null) && !c.isGeocoding)
            .filter(c => !hasValidCoordsRow(c.originalRow)) 
            .filter(c => isStrictErrorStatus(c.originalRow))
            .map(c => ({
                rm: c.rm,
                rowData: c.originalRow || {},
                originalIndex: typeof c.key === 'string' && c.key.startsWith('row_') ? -1 : 9999
            } as UnidentifiedRow));
            
        return [...parsingFailures, ...geocodingFailures];
    }, [unidentifiedRows, visibleData]);

    const filteredUnidentifiedRows = useMemo(() => {
        if (!filters.rm) return combinedUnidentifiedRows;
        const targetRm = filters.rm.toLowerCase();
        return combinedUnidentifiedRows.filter(row => (row.rm || '').toLowerCase().includes(targetRm));
    }, [combinedUnidentifiedRows, filters.rm]);

    return {
        activeModule, setActiveModule,
        allData: visibleData, 
        isCloudSaving,
        updateJobStatus,
        filterStartDate, setFilterStartDate,
        filterEndDate, setFilterEndDate,
        notifications,
        dbStatus,
        okbData: filteredOkbData, // Exposed filtered OKB
        setOkbData,
        okbStatus, setOkbStatus,
        okbRegionCounts,
        unidentifiedRows: filteredUnidentifiedRows,
        filters, setFilters,
        processingState, setProcessingState,
        selectedDetailsRow, setSelectedDetailsRow,
        isUnidentifiedModalOpen, setIsUnidentifiedModalOpen,
        editingClient, setEditingClient,
        editingPotentialClient, setEditingPotentialClient, // Exposed
        handlePotentialClientUpdate, // Exposed
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
        queueLength: actionQueue.length,
        loadStartDate, setLoadStartDate,
        loadEndDate, setLoadEndDate
    };
};