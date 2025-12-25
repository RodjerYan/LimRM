
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
    WorkerMessage,
    CoordsCache,
    CloudLoadParams,
    WorkerResultPayload
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import { LoaderIcon, CheckIcon, ErrorIcon, DataIcon } from './components/icons';
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
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading' | 'cloud'>('empty');

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
    const pollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

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
        const currentVersion = vHash || lastSyncVersion || 'manual_' + Date.now();
        const stateToSave = {
            allData: updatedData,
            unidentifiedRows: updatedUnidentified,
            okbRegionCounts,
            okbData,
            okbStatus,
            dateRange,
            totalRowsProcessed: rawCount,
            versionHash: currentVersion
        };
        try {
            await saveAnalyticsState(stateToSave);
            localStorage.setItem('last_sync_version', currentVersion);
            
            // НОВОЕ: Дублируем снимок в облако (Google Drive) в фоновом режиме
            fetch(`/api/get-akb?mode=snapshot&year=2025`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(stateToSave)
            }).catch(() => {});

        } catch (e) { console.error("Sync Error", e); }
    }, [okbRegionCounts, okbData, okbStatus, dateRange, lastSyncVersion]);

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
            finalUnidentified = prev.filter(row => normalizeAddress(findAddressInRow(row.rowData)) !== oldKey);
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
                    if (cached.lat && cached.lon) {
                        handleDataUpdate(tempKey, { ...basePoint, lat: parseFloat(cached.lat), lon: parseFloat(cached.lon), isGeocoding: false });
                        addNotification(`Адрес определен: ${address}`, 'success');
                    }
                }
            } catch (e) {}
        }, 10000);
        pollingIntervals.current.set(tempKey, intervalId);
    }, [handleDataUpdate, addNotification]);

    const handleDeleteClient = useCallback(async (key: string) => {
        let fd: AggregatedDataRow[] = []; let fu: UnidentifiedRow[] = []; let fp: MapPoint[] = [];
        setAllActiveClients(prev => { fp = prev.filter(c => c.key !== key); return fp; });
        setAllData(prev => { fd = prev.map(g => ({ ...g, clients: g.clients.filter(c => c.key !== key) })); return fd; });
        setUnidentifiedRows(prev => { fu = prev.filter(r => normalizeAddress(findAddressInRow(r.rowData)) !== key); return fu; });
        setEditingClient(null);
        setTimeout(() => persistToDB(fd, fu, fp, processingState.totalRowsProcessed || 0), 50);
    }, [persistToDB, processingState.totalRowsProcessed]);

    useEffect(() => {
        const restore = async () => {
            try {
                setDbStatus('loading');
                let saved = await loadAnalyticsState();
                
                // Если локально пусто — пробуем тянуть из Cloud Snapshot
                if (!saved || !saved.allData?.length) {
                    const cloudRes = await fetch(`/api/get-akb?mode=snapshot&year=2025`);
                    if (cloudRes.ok) {
                        saved = await cloudRes.json();
                        setDbStatus('cloud');
                    }
                }

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
                    setAllActiveClients(Array.from(clientsMap.values()));
                    setProcessingState(prev => ({ ...prev, totalRowsProcessed: saved.totalRowsProcessed || 0 }));
                    if (dbStatus !== 'cloud') setDbStatus('ready');
                    setActiveModule('amp');
                } else {
                    setDbStatus('empty');
                }
            } catch (e) { setDbStatus('empty'); } finally { setIsRestoring(false); }
        };
        restore();
    }, []);

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams, targetVersion?: string) => {
        if (processingState.isProcessing) return;
        const { year, month } = params;
        const isUpdate = allData.length > 0;
        if (isUpdate) setActiveModule('amp');
        if (targetVersion) localStorage.setItem('pending_version_hash', targetVersion);
        
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 0, message: isUpdate ? 'Обновление данных...' : 'Синхронизация...', startTime: Date.now(), totalRowsProcessed: isUpdate ? prev.totalRowsProcessed : 0 }));

        let cacheData: CoordsCache = {};
        try { const res = await fetch(`/api/get-full-cache?t=${Date.now()}`); if (res.ok) cacheData = await res.json(); } catch (e) {}

        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message }));
            else if (msg.type === 'result_init' && !isUpdate) setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunk, totalProcessed } = msg.payload;
                if (!isUpdate) { setAllData(chunk); const clientsMap = new Map<string, MapPoint>(); chunk.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c))); setAllActiveClients(Array.from(clientsMap.values())); }
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
            }
            else if (msg.type === 'result_finished') {
                const p = msg.payload as WorkerResultPayload;
                setOkbRegionCounts(p.okbRegionCounts);
                setAllData(p.aggregatedData);
                const clientsMap = new Map<string, MapPoint>();
                p.aggregatedData.forEach(row => row.clients.forEach(c => clientsMap.set(c.key, c)));
                const unique = Array.from(clientsMap.values());
                setAllActiveClients(unique);
                setUnidentifiedRows(p.unidentifiedRows);
                setDbStatus('ready');
                const v = localStorage.getItem('pending_version_hash');
                if (v) { await persistToDB(p.aggregatedData, p.unidentifiedRows, unique, p.totalRowsProcessed, v); setLastSyncVersion(v); }
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Синхронизировано', totalRowsProcessed: p.totalRowsProcessed }));
                addNotification('Данные обновлены', 'success');
            }
        };

        workerRef.current.postMessage({ type: 'INIT_STREAM', payload: { okbData, cacheData } });

        try {
            const listRes = await fetch(`/api/get-akb?year=${year}${month ? `&month=${month}` : ''}&mode=list`);
            const files = listRes.ok ? await listRes.json() : [];
            for (const file of files) {
                let offset = 0, hasMore = true, isFirst = true;
                while (hasMore) {
                    const res = await fetch(`/api/get-akb?fileId=${file.id}&offset=${offset}&limit=5000`);
                    if (!res.ok) break;
                    const r = await res.json();
                    if (r.rows?.length > 0) {
                        workerRef.current?.postMessage({ type: 'PROCESS_CHUNK', payload: { rawData: r.rows, isFirstChunk: isFirst, fileName: file.name } });
                        isFirst = false;
                    } else hasMore = false;
                    hasMore = r.hasMore; offset += 5000;
                }
            }
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        } catch (e) { setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка связи' })); }
    }, [okbData, allData.length, addNotification, persistToDB, processingState.isProcessing]);

    const checkCloudChanges = useCallback(async () => {
        if (isRestoring || processingState.isProcessing || !okbStatus || okbStatus.status !== 'ready') return;
        try {
            const res = await fetch(`/api/get-akb?mode=metadata&year=2025`);
            if (res.ok) {
                const meta = await res.json();
                setIsLiveConnected(true);
                if (meta.versionHash && meta.versionHash !== lastSyncVersion) handleStartCloudProcessing({ year: '2025' }, meta.versionHash);
            }
        } catch (e) { setIsLiveConnected(false); }
    }, [isRestoring, processingState.isProcessing, okbStatus, lastSyncVersion, handleStartCloudProcessing]);

    useEffect(() => { const timer = setInterval(checkCloudChanges, 300000); checkCloudChanges(); return () => clearInterval(timer); }, [checkCloudChanges]);

    const smartData = useMemo(() => {
        const okbCoordSet = new Set<string>();
        okbData.forEach(row => { if (row.lat && row.lon) okbCoordSet.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`); });
        return enrichDataWithSmartPlan(allData, okbRegionCounts, 15, okbCoordSet);
    }, [allData, okbRegionCounts, okbData]);

    useEffect(() => { setFilteredData(applyFilters(smartData, filters)); }, [smartData, filters]);
    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => {
        const base = calculateSummaryMetrics(filteredData);
        return base ? { ...base, totalActiveClients: allActiveClients.length } : null;
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
                                <div className={`w-2 h-2 rounded-full ${dbStatus === 'ready' || dbStatus === 'cloud' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Storage</span>
                            </div>
                            <span className="text-xs font-bold text-white">
                                {dbStatus === 'ready' ? 'Local DB: OK' : dbStatus === 'cloud' ? 'Cloud Snapshot: OK' : 'Initializing...'}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-gray-800"></div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Cloud Sync</span>
                            </div>
                            <span className="text-xs font-bold text-white">{isLiveConnected ? 'Online' : 'Offline'}</span>
                        </div>
                        {processingState.isProcessing && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full animate-fade-in">
                                <LoaderIcon className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] uppercase font-bold text-indigo-300">
                                    Синхронизация: {Math.round(processingState.progress)}%
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
                            dbStatus={dbStatus === 'cloud' ? 'ready' : dbStatus}
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
