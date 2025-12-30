
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
    CoordsCache,
    CloudLoadParams
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import { LoaderIcon, CheckIcon, ErrorIcon } from './components/icons';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from './utils/db';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    const [lastSyncVersion, setLastSyncVersion] = useState<string | null>(localStorage.getItem('last_sync_version'));
    const [isLiveConnected, setIsLiveConnected] = useState(false);
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
    
    const pollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const isUploadingRef = useRef(false);

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

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    const persistToDB = useCallback(async (
        updatedData: AggregatedDataRow[], 
        updatedUnidentified: UnidentifiedRow[],
        updatedActivePoints: MapPoint[],
        rawCount: number,
        vHash?: string
    ) => {
        const currentVersion = vHash || lastSyncVersion || 'manual_patch_' + Date.now();
        try {
            await saveAnalyticsState({ 
                allData: updatedData, 
                unidentifiedRows: updatedUnidentified, 
                okbRegionCounts, 
                okbData: [], 
                okbStatus: null,
                dateRange, 
                totalRowsProcessed: rawCount, 
                versionHash: currentVersion 
            });
            localStorage.setItem('last_sync_version', currentVersion);
        } catch (e) {
            console.error("Local DB Sync: Failed", e);
        }
    }, [okbRegionCounts, dateRange, lastSyncVersion]);

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

        setTimeout(() => persistToDB(finalData, finalUnidentified, finalPoints, processingState.totalRowsProcessed || 0), 50);
    }, [persistToDB, processingState.totalRowsProcessed]);

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
        setTimeout(() => { if (pollingIntervals.current.has(tempKey)) { clearInterval(pollingIntervals.current.get(tempKey)); pollingIntervals.current.delete(tempKey); } }, 3600000);
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
        setTimeout(() => persistToDB(finalData, finalUnidentified, finalPoints, processingState.totalRowsProcessed || 0), 50);
        addNotification('Запись удалена', 'info');
    }, [addNotification, persistToDB, processingState.totalRowsProcessed]);

    useEffect(() => {
        const restore = async () => {
            try {
                setDbStatus('loading');
                const saved = await loadAnalyticsState();
                if (saved && saved.allData?.length > 0) {
                    setAllData(saved.allData);
                    setUnidentifiedRows(saved.unidentifiedRows || []);
                    setOkbRegionCounts(saved.okbRegionCounts || null);
                    setOkbData(saved.okbData || []);
                    setOkbStatus(saved.okbStatus || null);
                    setDateRange(saved.dateRange);
                    
                    if (saved.versionHash) {
                        setLastSyncVersion(saved.versionHash);
                        localStorage.setItem('last_sync_version', saved.versionHash);
                    }
                    
                    const clientsMap = new Map<string, MapPoint>();
                    saved.allData.forEach((row: AggregatedDataRow) => { row.clients.forEach(c => clientsMap.set(c.key, c)); });
                    const uniqueClients = Array.from(clientsMap.values());
                    setAllActiveClients(uniqueClients);
                    
                    setProcessingState(prev => ({
                        ...prev,
                        totalRowsProcessed: saved.totalRowsProcessed || 0,
                        message: `Восстановлено: ${saved.totalRowsProcessed} строк`
                    }));

                    setDbStatus('ready');
                    setActiveModule('amp');
                } else {
                    setDbStatus('empty');
                }
            } catch (e) {
                setDbStatus('empty');
            } finally {
                setIsRestoring(false);
            }
        };
        restore();
    }, []);

    const pollJobStatus = async () => {
        try {
            const res = await fetch('/api/process?action=status');
            const status = await res.json();
            
            if (status.status === 'processing') {
                setProcessingState(prev => ({
                    ...prev,
                    isProcessing: true,
                    progress: 50, // Indeterminate mostly
                    message: status.message || `Фоновая обработка: ${status.processedRows} строк...`
                }));
                setTimeout(pollJobStatus, 3000);
            } else if (status.status === 'completed') {
                // Job done, reload snapshot
                await handleLoadSnapshot();
            } else if (status.status === 'error') {
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сервера' }));
                addNotification(status.error || 'Ошибка обработки', 'error');
            }
        } catch (e) {
            console.error(e);
            setTimeout(pollJobStatus, 5000);
        }
    };

    const handleLoadSnapshot = async () => {
        setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Загрузка результатов...', progress: 90 }));
        try {
            const snapshotRes = await fetch('/api/snapshot');
            if (snapshotRes.ok) {
                const snapshot = await snapshotRes.json();
                if (snapshot && snapshot.data && snapshot.data.aggregatedData) {
                    const { aggregatedData, unidentifiedRows, okbRegionCounts, totalRowsProcessed } = snapshot.data;
                    setOkbRegionCounts(okbRegionCounts);
                    setAllData(aggregatedData);
                    const clientsMap = new Map<string, MapPoint>();
                    aggregatedData.forEach((row: AggregatedDataRow) => row.clients.forEach(c => clientsMap.set(c.key, c)));
                    const uniqueClients = Array.from(clientsMap.values());
                    setAllActiveClients(uniqueClients);
                    setUnidentifiedRows(unidentifiedRows);
                    setDbStatus('ready');
                    
                    const newVersion = snapshot.versionHash || 'server_' + Date.now();
                    await persistToDB(aggregatedData, unidentifiedRows, uniqueClients, totalRowsProcessed, newVersion);
                    setLastSyncVersion(newVersion);
                    
                    setProcessingState(prev => ({ 
                        ...prev, 
                        isProcessing: false, 
                        progress: 100, 
                        message: 'Готово', 
                        totalRowsProcessed 
                    }));
                    addNotification('Данные успешно загружены', 'success');
                }
            }
        } catch (e) {
            console.error(e);
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка загрузки' }));
        }
    };

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams, targetVersion?: string) => {
        if (processingState.isProcessing) return;
        
        // 1. Try to load existing snapshot first (Fast Path)
        // If we have a target version and it matches local, skip.
        // If not, try fetching snapshot.
        
        setProcessingState(prev => ({ 
            ...prev,
            isProcessing: true, 
            progress: 0, 
            message: 'Инициализация...', 
            startTime: Date.now()
        }));

        try {
            // Check if a job is already running
            const statusRes = await fetch('/api/process?action=status');
            const status = await statusRes.json();
            
            if (status.status === 'processing') {
                addNotification('Присоединение к активной задаче...', 'info');
                pollJobStatus();
                return;
            }

            // Start new job
            const startRes = await fetch('/api/process?action=start');
            if (startRes.ok) {
                addNotification('Задача запущена на сервере. Можете закрыть вкладку.', 'success');
                pollJobStatus();
            } else {
                throw new Error('Failed to start job');
            }

        } catch (error) {
            console.error("Processing error:", error);
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка связи' }));
        }
    }, [processingState.isProcessing, addNotification]);

    const checkCloudChanges = useCallback(async () => {
        if (isRestoring || processingState.isProcessing || !okbStatus || okbStatus.status !== 'ready') return;
        try {
            const res = await fetch(`/api/get-akb?mode=metadata&year=2025&t=${Date.now()}`);
            if (res.ok) {
                const meta = await res.json();
                setIsLiveConnected(true);
                // Auto-sync logic if needed
            }
        } catch (e) { setIsLiveConnected(false); }
    }, [isRestoring, processingState.isProcessing, okbStatus]);

    useEffect(() => {
        const timer = setInterval(checkCloudChanges, 30000); 
        checkCloudChanges();
        return () => clearInterval(timer);
    }, [checkCloudChanges]);

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
                                <div className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Cloud Link</span>
                            </div>
                            <span className="text-xs font-bold text-white">{isLiveConnected ? 'Live: 30s Polling' : 'Disconnected'}</span>
                        </div>
                        {processingState.isProcessing && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full animate-fade-in">
                                <LoaderIcon className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-tighter">
                                    {processingState.message}
                                </span>
                            </div>
                        )}
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