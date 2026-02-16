
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    OkbDataRow, MapPoint, UnidentifiedRow,
    OkbStatus, UpdateJobStatus, AggregatedDataRow
} from '../types';
import { normalizeAddress, findAddressInRow, findValueInRow } from '../utils/dataUtils';
import { saveAnalyticsState, loadAnalyticsState } from '../utils/db';
import { enrichWithAbcCategories } from '../utils/analytics';
import { useAuth } from '../components/auth/AuthContext';

// Imported modular hooks
import { useDataSync } from './useDataSync';
import { useGeocoding } from './useGeocoding';
import { useAnalytics } from './useAnalytics';

// Helper for strict error filtering
const isStrictErrorStatus = (row: any): boolean => {
    const lat = findValueInRow(row, ['широта', 'lat', 'latitude', 'geo_lat']);
    const lon = findValueInRow(row, ['долгота', 'lon', 'longitude', 'geo_lon']);
    
    const check = (v: string) => {
        const s = String(v || '').toLowerCase().trim();
        return s.includes('не определен') || s.includes('не определён') || s.includes('некорректный');
    };
    
    return check(lat) || check(lon);
};

export const useAppLogic = () => {
    // --- AUTH INTEGRATION ---
    const { user } = useAuth();
    
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
        isCloudSaving, 
        processingState, setProcessingState,
        totalRowsProcessedRef,
        manualUpdateTimestamps,
        saveDeltaToCloud,
        applyCacheToData,
        applyDeltasToData,
        handleDownloadSnapshot: originalDownloadSnapshot
    } = useDataSync(addNotification);

    // --- DATA VISIBILITY FILTERING ---
    const normalize = (v: any) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

    const visibleData = useMemo(() => {
        if (!user) return [];
        if (user.role === 'admin') return allData;
        
        const userSurname = normalize(user.lastName);
        
        // Filter rows where RM matches User's Surname
        return allData.filter(row => {
            const rmName = normalize(row.rm);
            return rmName.includes(userSurname);
        });
    }, [allData, user]);

    // Wrapper to pass current date state
    const handleDownloadSnapshot = useCallback((serverMeta: any) => {
        return originalDownloadSnapshot(serverMeta, loadStartDate, loadEndDate);
    }, [originalDownloadSnapshot, loadStartDate, loadEndDate]);

    // --- 3. ANALYTICS HOOK (Must use visibleData!) ---
    const { filters, setFilters, filterStartDate, setFilterStartDate, filterEndDate, setFilterEndDate, filtered, allActiveClients, mapPotentialClients, filterOptions, summaryMetrics } = useAnalytics(visibleData, okbData, okbRegionCounts);

    // --- SYNC FILTER DATES WITH LOAD DATES ---
    useEffect(() => {
        setFilterStartDate(loadStartDate);
        setFilterEndDate(loadEndDate);
    }, [loadStartDate, loadEndDate, setFilterStartDate, setFilterEndDate]);

    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        // We update `allData` (global state) so updates persist even if filtering changes.
        // `visibleData` will recompute automatically.
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
        
        if (!newPoint.isGeocoding && newPoint.lat && newPoint.lon) {
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

    // --- 2. GEOCODING HOOK ---
    const { pendingGeocoding, actionQueue, handleStartPolling, handleQueuedUpdate, handleQueuedDelete } = useGeocoding(addNotification, handleDataUpdate, handleDeleteClientLocal);

    // --- LIVE SYNC ---
    useEffect(() => {
        const syncData = async () => {
            if (allData.length === 0 || processingState.isProcessing || isSyncingRef.current) return;
            isSyncingRef.current = true;
            try {
                const deltasRes = await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`);
                const deltas = deltasRes.ok ? await deltasRes.json() : [];

                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`);
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
    }, [allData, processingState.isProcessing, applyCacheToData, applyDeltasToData, setAllData, addNotification]);

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
        const parsingFailures = unidentifiedRows.filter(r => isStrictErrorStatus(r.rowData));
        
        // Use visibleData here so users only see their own errors
        const geocodingFailures = visibleData.flatMap(group => group.clients) 
            .filter(c => (!c.lat || !c.lon) && !c.isGeocoding)
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
        // Return visibleData as allData so the UI only sees what is allowed
        allData: visibleData, 
        isCloudSaving,
        updateJobStatus,
        filterStartDate, setFilterStartDate,
        filterEndDate, setFilterEndDate,
        notifications,
        dbStatus,
        okbData, setOkbData,
        okbStatus, setOkbStatus,
        okbRegionCounts,
        unidentifiedRows: filteredUnidentifiedRows,
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
        queueLength: actionQueue.length,
        loadStartDate, setLoadStartDate,
        loadEndDate, setLoadEndDate
    };
};
