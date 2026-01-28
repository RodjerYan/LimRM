
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome';
import Presentation from './components/modules/Presentation'; 
import InteractiveRegionMap from './components/InteractiveRegionMap';
import Filters from './components/Filters';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import { RMDashboard } from './components/RMDashboard';
import Notification from './components/Notification';
import AddressEditModal from './components/AddressEditModal'; 
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import DataUpdateOverlay from './components/DataUpdateOverlay';
import TopBar from './components/TopBar'; // New Component
import { 
    AggregatedDataRow, FilterState, NotificationMessage, 
    OkbDataRow, MapPoint, UnidentifiedRow, FileProcessingState,
    CoordsCache, OkbStatus, UpdateJobStatus
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, normalizeAddress, findAddressInRow, findValueInRow } from './utils/dataUtils';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from './utils/db';
import { enrichWithAbcCategories } from './utils/analytics';
import { normalize } from './utils/normalization'; // New Util
import { useCloudSync } from './hooks/useCloudSync'; // New Hook

const DetailsModal = React.lazy(() => import('./components/DetailsModal'));
const UnidentifiedRowsModal = React.lazy(() => import('./components/UnidentifiedRowsModal'));

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== '';

// --- TYPES FOR POLLING ---
interface PendingGeocodingItem {
    rm: string;
    address: string;
    oldKey: string;
    basePoint: MapPoint;
    originalIndex?: number;
    attempts: number;
}

// Интервал авто-обновления (в миллисекундах)
const POLLING_INTERVAL_MS = 15000;
const GEOCODING_POLLING_INTERVAL_MS = 3000;
const MAX_GEOCODING_ATTEMPTS = 60;

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
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

    // --- HOOK: Cloud Sync Logic ---
    const { 
        saveSnapshotToCloud, 
        handleDownloadSnapshot, 
        handleForceUpdate, 
        isCloudSaving 
    } = useCloudSync({
        allDataRef,
        unidentifiedRowsRef,
        okbRegionCounts,
        totalRowsProcessedRef,
        setAllData,
        setUnidentifiedRows,
        setOkbRegionCounts,
        setProcessingState,
        addNotification,
        setDbStatus
    });

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
                        }, 2500); // Wait for user to see message
                    }
                }
            }, 3000);

        } catch (error) {
            setUpdateJobStatus({ status: 'error', message: 'Не удалось запустить обновление.', progress: 100 });
        }
    };


    // --- LIVE SYNC POLLING ---
    useEffect(() => {
        const syncData = async () => {
            // Only sync if we have data loaded
            if (allDataRef.current.length === 0 && unidentifiedRowsRef.current.length === 0) return;
            if (processingState.isProcessing) return; // Don't sync while heavy processing

            try {
                // 1. Fetch latest cache from server
                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                if (!res.ok) return;
                const cacheData: CoordsCache = await res.json();

                // 2. Flatten cache for O(1) lookup
                const cacheMap = new Map<string, { lat: number; lon: number; comment?: string }>();
                Object.values(cacheData).flat().forEach((item: any) => {
                    if (item.address && !item.isDeleted && item.lat && item.lon) {
                        cacheMap.set(normalizeAddress(item.address), { lat: item.lat, lon: item.lon, comment: item.comment });
                    }
                });

                let hasChanges = false;
                let updatedEditingClient: MapPoint | null = null;

                // 3. Update All Data (Active Clients)
                const newAllData = allDataRef.current.map(row => {
                    let rowChanged = false;
                    const newClients = row.clients.map(client => {
                        const normAddr = normalizeAddress(client.address);
                        
                        // RACE CONDITION FIX: Ignore cache if user updated this client recently (< 2 mins)
                        const lastManualUpdate = manualUpdateTimestamps.current.get(normAddr);
                        if (lastManualUpdate && (Date.now() - lastManualUpdate < 120000)) {
                            return client;
                        }

                        const cached = cacheMap.get(normAddr);
                        
                        // Check if we have new data that is different from current
                        if (cached) {
                            const latDiff = Math.abs((client.lat || 0) - cached.lat);
                            const lonDiff = Math.abs((client.lon || 0) - cached.lon);
                            const commentDiff = (client.comment || '') !== (cached.comment || '');
                            
                            // If significant change (> 0.0001 deg or comment changed)
                            if (latDiff > 0.0001 || lonDiff > 0.0001 || commentDiff) {
                                rowChanged = true;
                                hasChanges = true;
                                const updatedClient = { ...client, lat: cached.lat, lon: cached.lon, comment: cached.comment, isGeocoding: false, status: 'match' as const };
                                
                                // FIX: Update editing client if it matches
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
                    updatedPending.push({ ...item, attempts: item.attempts + 1 }); // Retry on network error
                }
            }
            
            // Update state in one go
            if (completedItems.length > 0) {
                handleBatchDataUpdate(completedItems);
            }
            setPendingGeocoding(updatedPending);
        };

        const intervalId = setInterval(poll, GEOCODING_POLLING_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [pendingGeocoding]);

    // --- INIT ---
    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            const local = await loadAnalyticsState();
            if (local?.allData?.length > 0) {
                const validatedLocal = normalize(local.allData);
                // FORCE RECALCULATION OF ABC ON INIT
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
    }, [handleDownloadSnapshot]);

    // --- DATA UPDATE HANDLER (DEBOUNCED) ---
    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        let newData = [...allDataRef.current]; 
        let newUnidentified = [...unidentifiedRowsRef.current];
        
        // RACE CONDITION PROTECTION: Mark this address as manually updated
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
                // IMPORTANT: Search for the specific client by key
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

        // FIX: Also update the editing client state if it's currently open
        if (editingClient && (editingClient as MapPoint).key === oldKey) {
            setEditingClient(prev => prev ? ({ ...prev, ...newPoint }) : null);
        }

        // RECALCULATE ABC ON UPDATE
        enrichWithAbcCategories(newData);

        setAllData(newData);
        setUnidentifiedRows(newUnidentified);
        
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveSnapshotToCloud(newData, newUnidentified).catch(err => {
                console.error("Auto-save failed:", err);
            });
        }, 2000);

    }, [okbRegionCounts, editingClient]); // Added editingClient to dependency

    // Batch update for performance when multiple polling results arrive
    const handleBatchDataUpdate = useCallback((completedItems: { oldKey: string, point: MapPoint, originalIndex?: number }[]) => {
        let currentAllData = allDataRef.current;
        let currentUnidentified = unidentifiedRowsRef.current;
        let updatedEditingClient: MapPoint | null = null;

        completedItems.forEach(item => {
            const { oldKey, point, originalIndex } = item;
            
            if (point.address) {
                manualUpdateTimestamps.current.set(normalizeAddress(point.address), Date.now());
            }

            // FIX: Check if this item is currently being edited
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

        // FIX: Update modal if needed
        if (updatedEditingClient) {
            setEditingClient(prev => prev ? ({ ...prev, ...updatedEditingClient }) : null);
        }

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => saveSnapshotToCloud(currentAllData, currentUnidentified), 2000);

    }, [editingClient]); // Added editingClient to dependency

    // New handler to start the polling process
    const handleStartPolling = useCallback((rm: string, address: string, oldKey: string, basePoint: MapPoint, originalIndex?: number) => {
        addNotification(`Адрес "${address.substring(0, 30)}..." отправлен на геокодинг`, 'info');
        // Optimistic update
        handleDataUpdate(oldKey, basePoint, originalIndex);
        // Add to polling queue
        setPendingGeocoding(prev => [...prev, { rm, address, oldKey, basePoint, originalIndex, attempts: 0 }]);
    }, [handleDataUpdate, addNotification]);


    // --- CLIENT DELETION HANDLER ---
    const handleDeleteClient = useCallback((rmName: string, address: string) => {
        const normAddress = normalizeAddress(address);
        let newData = [...allDataRef.current]; 
        let newUnidentified = [...unidentifiedRowsRef.current];
        let wasModified = false;

        // 1. Remove from Active Data (Aggregated Rows)
        newData = newData.map(group => {
            // Only search in groups belonging to this RM to narrow scope
            if (group.rm !== rmName) return group;

            const originalClientCount = group.clients.length;
            const newClients = group.clients.filter(c => normalizeAddress(c.address) !== normAddress);
            
            if (newClients.length !== originalClientCount) {
                wasModified = true;
                // Recalculate group totals
                const newFact = newClients.reduce((sum, c) => sum + (c.fact || 0), 0);
                
                // If group becomes empty, it will be filtered out later
                return {
                    ...group,
                    clients: newClients,
                    fact: newFact,
                    // Recalculate potential using simple heuristic if we lost clients
                    potential: newFact * 1.15,
                    growthPotential: 0, // Reset these as they need recalculation usually
                    growthPercentage: 0
                };
            }
            return group;
        }).filter(group => group.clients.length > 0); // Remove empty groups

        // 2. Remove from Unidentified Rows
        const initialUnidentifiedCount = newUnidentified.length;
        newUnidentified = newUnidentified.filter(row => {
            const rowAddr = findAddressInRow(row.rowData);
            return !(row.rm === rmName && normalizeAddress(rowAddr) === normAddress);
        });
        
        if (newUnidentified.length !== initialUnidentifiedCount) wasModified = true;

        if (wasModified) {
            // Re-run ABC classification
            enrichWithAbcCategories(newData);
            
            setAllData(newData);
            setUnidentifiedRows(newUnidentified);
            
            addNotification('Клиент удален из базы', 'info');

            // Trigger Cloud Save
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
                saveSnapshotToCloud(newData, newUnidentified).catch(err => {
                    console.error("Auto-save failed after delete:", err);
                });
            }, 1000);
        }
    }, []);

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

    // --- ACTIVE CLIENTS ---
    const allActiveClients = useMemo(() => {
        const clientsMap = new Map<string, MapPoint>();
        filtered.forEach(row => {
            if (row && Array.isArray(row.clients)) {
                row.clients.forEach(c => { if (c && c.key) clientsMap.set(c.key, c); });
            }
        });
        return Array.from(clientsMap.values());
    }, [filtered]);

    // --- DE-DUPLICATION LOGIC ---
    const activeClientAddressSet = useMemo(() => {
        const addressSet = new Set<string>();
        allActiveClients.forEach(client => {
            if (client.address) {
                addressSet.add(normalizeAddress(client.address));
            }
        });
        return addressSet;
    }, [allActiveClients]);

    // --- POTENTIAL CLIENTS (DE-DUPLICATED) ---
    const mapPotentialClients = useMemo(() => {
        if (!okbData || okbData.length === 0) return [];
        
        const coordsOnly = okbData.filter(r => {
            const lat = r.lat;
            const lon = r.lon;
            return lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon)) && Number(lat) !== 0;
        });

        // ** THE FIX **: Filter out potential clients that are already active.
        const potentialOnly = coordsOnly.filter(r => {
            const addr = findAddressInRow(r);
            if (!addr) return true; // Keep if no address to be safe, though unlikely
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

    return (
        <div className="flex min-h-screen bg-primary-dark font-sans text-text-main overflow-hidden">
            <Navigation activeTab={activeModule} onTabChange={setActiveModule} />
            
            <main className="flex-1 ml-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar relative">
                <TopBar 
                    dbStatus={dbStatus} 
                    isCloudSaving={isCloudSaving} 
                    processingState={processingState}
                    activeModule={activeModule}
                    handleStartDataUpdate={handleStartDataUpdate}
                    updateJobStatus={updateJobStatus}
                    activeClientsCount={allActiveClients.length}
                />

                <div className="py-8 px-4 lg:px-8">
                    {activeModule === 'adapta' && (
                        <Adapta 
                            processingState={processingState}
                            onForceUpdate={handleForceUpdate}
                            onFileProcessed={() => {}}
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
                        <div className="space-y-6">
                            <InteractiveRegionMap data={filtered} activeClients={allActiveClients} potentialClients={mapPotentialClients} onEditClient={setEditingClient} selectedRegions={filters.region} flyToClientKey={null} />
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-1">
                                    <Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({rm:'', brand:[], packaging:[], region:[]})} disabled={allData.length === 0} />
                                </div>
                                <div className="lg:col-span-3"><PotentialChart data={filtered} /></div>
                            </div>
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
                        <RMDashboard isOpen={true} onClose={() => setActiveModule('amp')} data={filtered} metrics={summaryMetrics} okbRegionCounts={okbRegionCounts} mode="page" okbData={okbData} okbStatus={okbStatus} onEditClient={setEditingClient} />
                    )}

                    {activeModule === 'prophet' && <Prophet data={filtered} />}
                    {activeModule === 'agile' && <AgileLearning data={filtered} />}
                    {activeModule === 'roi-genome' && <RoiGenome data={filtered} />}
                    
                    {/* Presentation Module */}
                    {activeModule === 'presentation' && <Presentation />}
                </div>
            </main>

            <DataUpdateOverlay jobStatus={updateJobStatus} />

            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            <Suspense fallback={null}>
                {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={setEditingClient} />}
                {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={setEditingClient} />}
            </Suspense>
            
            {editingClient && (
                <AddressEditModal 
                    isOpen={!!editingClient} 
                    onClose={() => setEditingClient(null)} 
                    onBack={() => setEditingClient(null)} 
                    data={editingClient} 
                    onDataUpdate={handleDataUpdate} 
                    onStartPolling={handleStartPolling} 
                    onDelete={handleDeleteClient} // Pass the delete handler here
                    globalTheme="dark" 
                />
            )}
        </div>
    );
};

export default App;
