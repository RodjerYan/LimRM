import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
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
import AddressEditModal from './components/AddressEditModal'; 
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import MergeOverlay from './components/MergeOverlay';
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
import { LoaderIcon, CheckIcon, ErrorIcon, TrashIcon } from './components/icons';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState, clearAnalyticsState } from './utils/db';

// Lazy Load Heavy Modals
const DetailsModal = React.lazy(() => import('./components/DetailsModal'));
const UnidentifiedRowsModal = React.lazy(() => import('./components/UnidentifiedRowsModal'));

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    // --- STATE ---
    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [lastSnapshotVersion, setLastSnapshotVersion] = useState<string | null>(localStorage.getItem('last_snapshot_version'));
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isSavingToCloud, setIsSavingToCloud] = useState(false); 
    const [uploadProgress, setUploadProgress] = useState(0); 
    const [isRestoring, setIsRestoring] = useState(true);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false, progress: 0, message: 'Система готова', fileName: null, backgroundMessage: null, startTime: null, totalRowsProcessed: 0
    });

    const totalRowsProcessedRef = useRef<number>(0);
    const processedFileIdsRef = useRef<Set<string>>(new Set());
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const workerRef = useRef<Worker | null>(null);
    const pollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const isUploadingRef = useRef(false);
    const pendingUploadRef = useRef<any>(null);
    const uploadStartTimeRef = useRef<number>(0);

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
    const [mergeModalData, setMergeModalData] = useState<any>(null);

    // Sync Refs
    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // ==========================================
    // 1. СИСТЕМА ЧАНКОВОЙ ЗАГРУЗКИ (CLOUD DRIVE)
    // ==========================================

    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string): Promise<boolean> => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Загрузка базы из облака...', progress: 0 }));
            let fullJson = '';
            
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error("Failed to get list");
            const fileList = await listRes.json();

            if (!Array.isArray(fileList) || fileList.length === 0) return false;

            for (let i = 0; i < fileList.length; i++) {
                const pct = Math.round(((i + 1) / fileList.length) * 100);
                setProcessingState(prev => ({ ...prev, progress: pct, message: `Загрузка: часть ${i+1} из ${fileList.length}...` }));
                const chunkRes = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${fileList[i].id}`);
                fullJson += await chunkRes.text();
            }

            if (fullJson) {
                const data = JSON.parse(fullJson);
                if (data.aggregatedData) {
                    setAllData(data.aggregatedData);
                    const clientsMap = new Map<string, MapPoint>();
                    data.aggregatedData.forEach((row: any) => row.clients?.forEach((c: any) => clientsMap.set(c.key, c)));
                    setAllActiveClients(Array.from(clientsMap.values()));
                    setOkbRegionCounts(data.okbRegionCounts || null);
                    totalRowsProcessedRef.current = data.totalRowsProcessed || 0;
                    if (data.unidentifiedRows) setUnidentifiedRows(data.unidentifiedRows);

                    await saveAnalyticsState({
                        allData: data.aggregatedData,
                        unidentifiedRows: data.unidentifiedRows || [],
                        okbRegionCounts: data.okbRegionCounts || null,
                        totalRowsProcessed: data.totalRowsProcessed,
                        versionHash: versionHash,
                        okbData: [], okbStatus: null
                    });
                    
                    setLastSnapshotVersion(versionHash);
                    localStorage.setItem('last_snapshot_version', versionHash);
                    setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Синхронизация завершена', progress: 100 }));
                    return true;
                }
            }
        } catch (e) { console.error("Snapshot error:", e); }
        return false;
    }, []);

    // ==========================================
    // 2. СИСТЕМА СОХРАНЕНИЯ В ОБЛАКО (UPLOAD)
    // ==========================================

    const performUpload = async (payload: any): Promise<string[]> => {
        try {
            console.log("Начало нарезки снимка на чанки...");
            const jsonString = JSON.stringify(payload);
            const CHUNK_SIZE = 2 * 1024 * 1024; 
            const totalChunks = Math.ceil(jsonString.length / CHUNK_SIZE);

            for (let i = 0; i < totalChunks; i++) {
                if (i >= 30) break;
                setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
                const chunk = jsonString.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const res = await fetch(`/api/get-full-cache?action=save-chunk&chunkIndex=${i}`, { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chunk }) 
                });
                if (!res.ok) throw new Error(`Ошибка загрузки чанка ${i}`);
                await new Promise(r => setTimeout(r, 100));
            }

            await fetch('/api/get-full-cache?action=save-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    versionHash: payload.versionHash,
                    totalRowsProcessed: payload.totalRowsProcessed,
                    chunkCount: totalChunks,
                    savedAt: new Date().toISOString()
                })
            });
            console.log('Снимок успешно сохранен в облако!');
            setUploadProgress(0);
            return [];
        } catch (e) {
            console.error("Server upload failed:", e);
            setUploadProgress(0);
            throw e;
        }
    };

    const uploadToCloudServerSide = async (payload: any) => {
        if (!payload || !payload.aggregatedData || payload.aggregatedData.length === 0) return;
        if (isUploadingRef.current) { pendingUploadRef.current = payload; return; }
        isUploadingRef.current = true;
        setIsSavingToCloud(true);
        uploadStartTimeRef.current = Date.now();
        try {
            await performUpload(payload);
            while (pendingUploadRef.current) {
                const nextPayload = pendingUploadRef.current;
                pendingUploadRef.current = null;
                await performUpload(nextPayload);
            }
        } catch (e) { console.error("Cloud sync error:", e); } 
        finally { isUploadingRef.current = false; setIsSavingToCloud(false); }
    };

    const persistToDB = useCallback(async (updatedData: AggregatedDataRow[], updatedUnidentified: UnidentifiedRow[], updatedActivePoints: MapPoint[], rawCount: number, vHash?: string) => {
        const currentVersion = vHash || lastSnapshotVersion || `local_${Date.now()}`;
        totalRowsProcessedRef.current = rawCount;
        try {
            await saveAnalyticsState({ 
                allData: updatedData, unidentifiedRows: updatedUnidentified, 
                okbRegionCounts, okbData: [], okbStatus: null,
                totalRowsProcessed: rawCount, versionHash: currentVersion 
            });
            localStorage.setItem('last_snapshot_version', currentVersion);
            setLastSnapshotVersion(currentVersion);
            uploadToCloudServerSide({ aggregatedData: updatedData, unidentifiedRows: updatedUnidentified, totalRowsProcessed: rawCount, versionHash: currentVersion });
        } catch (e) {}
    }, [okbRegionCounts, lastSnapshotVersion]);

    // ==========================================
    // 3. ОБРАБОТКА ДАННЫХ (LEGACY & WORKER)
    // ==========================================

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams) => {
        if (processingState.isProcessing) return;
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 0, message: 'Поиск файлов...' }));
        
        try {
            const listRes = await fetch(`/api/get-akb?year=${params.year}&mode=list&t=${Date.now()}`);
            const allFiles = await listRes.json();
            
            if (workerRef.current) workerRef.current.terminate();
            workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });

            workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
                const msg = e.data;
                if (msg.type === 'progress') {
                    setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message }));
                } else if (msg.type === 'result_finished') {
                    const payload = msg.payload as WorkerResultPayload;
                    setAllData(payload.aggregatedData);
                    setOkbRegionCounts(payload.okbRegionCounts);
                    setUnidentifiedRows(payload.unidentifiedRows);
                    setDbStatus('ready');
                    setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Синхронизация завершена' }));
                    persistToDB(payload.aggregatedData, payload.unidentifiedRows, [], payload.totalRowsProcessed);
                }
            };

            workerRef.current.postMessage({ type: 'INIT_STREAM', payload: { okbData: [], cacheData: {} } });
            
            for (const file of allFiles) {
                const res = await fetch(`/api/get-akb?fileId=${file.id}&offset=0&limit=100000&mimeType=${file.mimeType}`);
                const data = await res.json();
                workerRef.current.postMessage({ type: 'PROCESS_CHUNK', payload: { rawData: data.rows, isFirstChunk: false, fileName: file.name } });
            }
            workerRef.current.postMessage({ type: 'FINALIZE_STREAM' });

        } catch (e) { console.error(e); setProcessingState(prev => ({ ...prev, isProcessing: false })); }
    }, [processingState.isProcessing, persistToDB]);

    // ==========================================
    // 4. ИНИЦИАЛИЗАЦИЯ И СИНХРОНИЗАЦИЯ ПРАВОК
    // ==========================================

    useEffect(() => {
        const initializeApp = async () => {
            setDbStatus('loading');
            try {
                const localState = await loadAnalyticsState();
                const localVersion = localState?.versionHash || 'none';

                if (localState?.allData?.length > 0) {
                    setAllData(localState.allData);
                    const clientsMap = new Map<string, MapPoint>();
                    localState.allData.forEach((row: any) => row.clients?.forEach((c: any) => clientsMap.set(c.key, c)));
                    setAllActiveClients(Array.from(clientsMap.values()));
                    setOkbRegionCounts(localState.okbRegionCounts || null);
                    setUnidentifiedRows(localState.unidentifiedRows || []);
                    totalRowsProcessedRef.current = localState.totalRowsProcessed || 0;
                    setDbStatus('ready');
                }

                const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
                if (metaRes.ok) {
                    const serverMeta = await metaRes.json();
                    if (serverMeta && serverMeta.chunkCount > 0 && serverMeta.versionHash !== localVersion) {
                        console.log("Найден новый снимок в облаке! Загружаю...");
                        const success = await handleDownloadSnapshot(serverMeta.chunkCount, serverMeta.versionHash);
                        if (success) {
                            setDbStatus('ready');
                            setIsRestoring(false);
                            return; 
                        }
                    }
                }

                if (!localState || localState.allData?.length === 0) {
                    handleStartCloudProcessing({ year: '2025' });
                }
            } catch (e) { console.error(e); }
            finally { setIsRestoring(false); }
        };
        initializeApp();
    }, [handleDownloadSnapshot, handleStartCloudProcessing]);

    // Live sync of edits (30s)
    useEffect(() => {
        const syncEdits = async () => {
            if (dbStatus !== 'ready') return;
            try {
                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                if (!res.ok) return;
                const rawCache = await res.json();
                const flatCache = new Map();
                Object.values(rawCache).flat().forEach((entry: any) => { if (entry.address) flatCache.set(normalizeAddress(entry.address), entry); });

                setAllActiveClients(prev => {
                    let hasChanges = false;
                    const updated = prev.map(client => {
                        const serverEntry = flatCache.get(normalizeAddress(client.address));
                        if (serverEntry && (serverEntry.lat !== client.lat || serverEntry.lon !== client.lon || serverEntry.comment !== client.comment)) {
                            hasChanges = true;
                            return { ...client, lat: serverEntry.lat, lon: serverEntry.lon, comment: serverEntry.comment };
                        }
                        return client;
                    });
                    return hasChanges ? updated : prev;
                });
            } catch (e) { console.error("Sync error:", e); }
        };
        const timer = setInterval(syncEdits, 30000);
        return () => clearInterval(timer);
    }, [dbStatus]);

    // ==========================================
    // 5. UI ACTIONS (MODALS, FILTERS)
    // ==========================================

    const handleDataUpdate = useCallback(async (oldKey: string, newPoint: MapPoint) => {
        setAllActiveClients(prev => prev.map(c => c.key === oldKey ? newPoint : c));
        setAllData(prev => prev.map(group => {
            const idx = group.clients.findIndex(c => c.key === oldKey);
            if (idx !== -1) {
                const updatedClients = [...group.clients];
                updatedClients[idx] = newPoint;
                return { ...group, clients: updatedClients };
            }
            return group;
        }));
        try {
            fetch('/api/get-full-cache?action=update-address', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: newPoint.rm || 'Unknown', oldAddress: oldKey, newAddress: newPoint.address, comment: newPoint.comment, lat: newPoint.lat, lon: newPoint.lon })
            });
        } catch (e) {}
        setTimeout(() => persistToDB(allDataRef.current, unidentifiedRowsRef.current, [], totalRowsProcessedRef.current), 50);
    }, [persistToDB]);

    const handleResetFilters = () => {
        setFilters({ rm: '', brand: [], packaging: [], region: [] });
        setFilterStartDate(''); setFilterEndDate('');
    };

    const dateFilteredData = useMemo(() => {
        if (!filterStartDate && !filterEndDate) return allData;
        return allData.map(row => {
            if (!row.monthlyFact) return row;
            let newFact = 0;
            Object.entries(row.monthlyFact).forEach(([monthKey, val]) => {
                if (monthKey >= filterStartDate && monthKey <= filterEndDate) newFact += (val as number);
            });
            return { ...row, fact: newFact };
        }).filter(row => row.fact > 0);
    }, [allData, filterStartDate, filterEndDate]);

    const smartData = useMemo(() => {
        return enrichDataWithSmartPlan(dateFilteredData, okbRegionCounts, 15, new Set());
    }, [dateFilteredData, okbRegionCounts]);

    useEffect(() => { setFilteredData(applyFilters(smartData, filters)); }, [smartData, filters]);

    const summaryMetrics = useMemo(() => calculateSummaryMetrics(filteredData), [filteredData]);

    // ==========================================
    // 6. RENDER
    // ==========================================

    return (
        <div className="flex min-h-screen bg-primary-dark font-sans text-text-main overflow-hidden">
            <Navigation activeTab={activeModule} onTabChange={setActiveModule} />
            <main className="flex-1 ml-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar relative">
                {/* Header со статусами */}
                <div className="sticky top-0 z-30 bg-primary-dark/95 backdrop-blur-md border-b border-gray-800 px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${dbStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Local DB</span>
                            </div>
                            <span className="text-xs font-bold text-white">{dbStatus === 'ready' ? 'Offline: Ready' : 'Syncing...'}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-800"></div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isSavingToCloud ? 'bg-cyan-400 animate-ping' : (isLiveConnected ? 'bg-emerald-500' : 'bg-red-500')}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Cloud Sync</span>
                            </div>
                            <span className="text-xs font-bold text-white">
                                {isSavingToCloud ? `Saving ${uploadProgress}%` : (isLiveConnected ? 'Live: 15s Polling' : 'Disconnected')}
                            </span>
                        </div>
                        {processingState.isProcessing && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full animate-fade-in">
                                <LoaderIcon className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] uppercase font-bold text-indigo-300">
                                    {processingState.message}: {Math.round(processingState.progress)}%
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                         <div className="text-right">
                            <p className="text-[10px] uppercase font-bold text-gray-500">Записей в системе</p>
                            <p className="text-sm font-mono font-bold text-emerald-400">{totalRowsProcessedRef.current.toLocaleString('ru-RU')}</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/10 flex items-center justify-center text-white shadow-lg">
                            <span className="font-bold">L</span>
                        </div>
                    </div>
                </div>

                <div className="py-8 px-4 lg:px-8">
                    {activeModule === 'adapta' && (
                        <Adapta uploadedData={allData} processingState={processingState} okbData={okbData} okbStatus={okbStatus} onStartEdit={setEditingClient} 
                            startDate={filterStartDate} endDate={filterEndDate} onStartDateChange={setFilterStartDate} onEndDateChange={setFilterEndDate} />
                    )}
                    
                    {activeModule === 'amp' && (
                        <div className="space-y-6">
                             <InteractiveRegionMap data={filteredData} selectedRegions={filters.region} potentialClients={[]} activeClients={allActiveClients} flyToClientKey={null} onEditClient={setEditingClient} />
                             <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <Filters options={getFilterOptions(allData)} currentFilters={filters} onFilterChange={setFilters} onReset={handleResetFilters} disabled={allData.length === 0} />
                                <PotentialChart data={filteredData} />
                             </div>
                             <ResultsTable data={filteredData} onRowClick={setSelectedDetailsRow} disabled={allData.length === 0} unidentifiedRowsCount={unidentifiedRows.length} onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} />
                        </div>
                    )}

                    {activeModule === 'dashboard' && <RMDashboard data={filteredData} okbData={okbData} metrics={summaryMetrics} okbStatus={okbStatus} onEditClient={setEditingClient} />}
                    {activeModule === 'prophet' && <Prophet data={filteredData} />}
                    {activeModule === 'agile' && <AgileLearning data={filteredData} />}
                    {activeModule === 'roi-genome' && <RoiGenome data={filteredData} />}
                </div>
            </main>

            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">{notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}</div>
            
            <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white">Загрузка...</div>}>
                {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={setEditingClient} />}
                {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={setEditingClient} />}
            </Suspense>

            {editingClient && <AddressEditModal isOpen={!!editingClient} onClose={() => setEditingClient(null)} data={editingClient} onDataUpdate={handleDataUpdate} />}
            {mergeModalData && <MergeOverlay isOpen={!!mergeModalData} initialCount={mergeModalData.initialCount} finalCount={mergeModalData.finalCount} onComplete={handleMergeComplete} />}
        </div>
    );
};

export default App;
