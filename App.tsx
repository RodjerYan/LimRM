
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
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
    WorkerMessage, WorkerResultPayload, CloudLoadParams, CoordsCache, OkbStatus
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, normalizeAddress, findAddressInRow } from './utils/dataUtils';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from './utils/db';

const DetailsModal = React.lazy(() => import('./components/DetailsModal'));
const UnidentifiedRowsModal = React.lazy(() => import('./components/UnidentifiedRowsModal'));

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    
    // --- DATE FILTER STATE ---
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');

    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');
    
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
    const processedFileIdsRef = useRef<Set<string>>(new Set());
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const workerRef = useRef<Worker | null>(null);

    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);

    // Update refs when state changes
    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    // --- УНИВЕРСАЛЬНАЯ НОРМАЛИЗАЦИЯ (Защита от TypeError) ---
    // Гарантирует, что у каждой строки есть массив clients
    const normalize = useCallback((rows: any[]): AggregatedDataRow[] => {
        if (!Array.isArray(rows)) return [];
        return rows.map(row => {
            if (!row) return null;
            return {
                ...row,
                clients: Array.isArray(row.clients) && row.clients.length > 0 
                    ? row.clients 
                    : [{ ...row, key: row.key || row.address || `gen_${Math.random()}` }]
            };
        }).filter(Boolean) as AggregatedDataRow[];
    }, []);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // --- АВТОМАТИЧЕСКАЯ ЗАГРУЗКА OKB (Фикс для синих точек) ---
    useEffect(() => {
        const fetchOkb = async () => {
            if (okbData.length > 0 || okbStatus?.status === 'loading') return;
            
            try {
                setOkbStatus({ status: 'loading', message: 'Загрузка гео-базы...' });
                const response = await fetch(`/api/get-akb?mode=okb_data&t=${Date.now()}`);
                if (!response.ok) throw new Error('Failed to load OKB');
                
                const data: OkbDataRow[] = await response.json();
                setOkbData(data);
                
                // Calculate region counts for analytics
                const counts: {[key: string]: number} = {};
                data.forEach(row => {
                    const reg = row['Регион'] || row['region'] || 'Не определен';
                    counts[reg] = (counts[reg] || 0) + 1;
                });
                setOkbRegionCounts(counts);

                setOkbStatus({
                    status: 'ready',
                    message: `ОКБ Онлайн`,
                    timestamp: new Date().toISOString(),
                    rowCount: data.length,
                    coordsCount: data.filter(d => d.lat && d.lon).length,
                });
            } catch (e) {
                console.error("Auto-fetch OKB failed", e);
                setOkbStatus({ status: 'error', message: 'Ошибка загрузки базы' });
            }
        };
        fetchOkb();
    }, []); // Run once on mount

    // --- ЗАГРУЗКА СНИМКА (SNAPSHOT) ---
    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация...', progress: 0 }));
            
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            const fileList = await listRes.json();
            
            if (!Array.isArray(fileList) || fileList.length === 0) return false;

            let loadedCount = 0;
            const total = fileList.length;

            const chunks = await Promise.all(fileList.map(file => 
                fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`)
                    .then(res => res.text())
                    .then(text => {
                        loadedCount++;
                        setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
                        return text;
                    })
            ));

            const fullJson = chunks.join('');
            if (fullJson) {
                const data = JSON.parse(fullJson);
                const validated = normalize(data.aggregatedData || []);
                
                setAllData(validated);
                allDataRef.current = validated;
                
                setUnidentifiedRows(data.unidentifiedRows || []);
                setOkbRegionCounts(data.okbRegionCounts || {});
                totalRowsProcessedRef.current = data.totalRowsProcessed || 0;

                await saveAnalyticsState({
                    allData: validated,
                    unidentifiedRows: data.unidentifiedRows || [],
                    okbRegionCounts: data.okbRegionCounts || {},
                    totalRowsProcessed: data.totalRowsProcessed || 0,
                    versionHash: versionHash,
                    okbData: [], okbStatus: null
                });

                localStorage.setItem('last_snapshot_version', versionHash);
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Готово', progress: 100 }));
                return true;
            }
        } catch (e) { 
            console.error("Snapshot error:", e); 
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка снимка' }));
        }
        return false;
    }, [normalize]);

    // --- ОБРАБОТКА ОБЛАКА (WORKER) ---
    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams) => {
        if (processingState.isProcessing) return;
        
        let rowsProcessedSoFar = totalRowsProcessedRef.current;
        if (rowsProcessedSoFar === 0) {
             setAllData([]);
             setUnidentifiedRows([]);
             setOkbRegionCounts({});
             processedFileIdsRef.current.clear();
        }

        setProcessingState(prev => ({ 
            ...prev,
            isProcessing: true, progress: 0, 
            message: 'Синхронизация...', 
            startTime: Date.now(), totalRowsProcessed: rowsProcessedSoFar
        }));
        
        let cacheData: CoordsCache = {};
        try {
            const response = await fetch(`/api/get-full-cache?t=${Date.now()}`);
            if (response.ok) cacheData = await response.json();
        } catch (error) {}
        
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message, totalRowsProcessed: msg.payload.totalProcessed ?? prev.totalRowsProcessed }));
                if (msg.payload.totalProcessed) totalRowsProcessedRef.current = msg.payload.totalProcessed;
            }
            else if (msg.type === 'result_init') setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
                const validatedChunk = normalize(chunkData);
                setAllData(validatedChunk);
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
                totalRowsProcessedRef.current = totalProcessed;
            }
            else if (msg.type === 'CHECKPOINT') {
                const payload = msg.payload;
                const validated = normalize(payload.aggregatedData);
                setAllData(validated);
                setUnidentifiedRows(payload.unidentifiedRows);
            }
            else if (msg.type === 'result_finished') {
                const payload = msg.payload as WorkerResultPayload;
                const validated = normalize(payload.aggregatedData);
                setOkbRegionCounts(payload.okbRegionCounts);
                setAllData(validated);
                setUnidentifiedRows(payload.unidentifiedRows);
                setDbStatus('ready');
                
                const finalVersion = `processed_${Date.now()}`;
                await saveAnalyticsState({
                    allData: validated,
                    unidentifiedRows: payload.unidentifiedRows,
                    okbRegionCounts: payload.okbRegionCounts,
                    totalRowsProcessed: payload.totalRowsProcessed,
                    versionHash: finalVersion,
                    okbData: [], okbStatus: null
                });
                
                localStorage.setItem('last_snapshot_version', finalVersion);
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Завершено', totalRowsProcessed: payload.totalRowsProcessed }));
            }
        };
        
        workerRef.current.postMessage({ 
            type: 'INIT_STREAM', 
            payload: { okbData, cacheData, totalRowsProcessed: rowsProcessedSoFar, restoredData: allDataRef.current, restoredUnidentified: unidentifiedRowsRef.current } 
        });
        
        try {
            const listRes = await fetch(`/api/get-akb?year=${params.year}&mode=list`);
            const allFiles = listRes.ok ? await listRes.json() : [];
            for (const file of allFiles) {
                if (processedFileIdsRef.current.has(file.id)) continue;
                processedFileIdsRef.current.add(file.id);
            }
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        } catch (e) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сети' }));
        }
    }, [okbData, processingState.isProcessing, normalize]);

    // --- ОБРАБОТКА ФАЙЛА (ЛОКАЛЬНО) ---
    const handleStartLocalProcessing = useCallback(async (file: File) => {
        if (processingState.isProcessing) return;
        setActiveModule('adapta');
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 0, message: 'Чтение файла...', fileName: file.name, startTime: Date.now() }));
        
        setAllData([]); setUnidentifiedRows([]); totalRowsProcessedRef.current = 0;
        
        let cacheData: CoordsCache = {};
        try { const response = await fetch(`/api/get-full-cache?t=${Date.now()}`); if (response.ok) cacheData = await response.json(); } catch (error) {}
        
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') { 
                setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message, totalRowsProcessed: msg.payload.totalProcessed ?? prev.totalRowsProcessed }));
            }
            else if (msg.type === 'result_init') setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
                const validated = normalize(chunkData);
                setAllData(validated);
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
            }
            else if (msg.type === 'result_finished') {
                const payload = msg.payload as WorkerResultPayload;
                const validated = normalize(payload.aggregatedData);
                setOkbRegionCounts(payload.okbRegionCounts);
                setAllData(validated);
                setUnidentifiedRows(payload.unidentifiedRows);
                setDbStatus('ready');
                const finalVersion = `local_${Date.now()}`;
                await saveAnalyticsState({
                    allData: validated,
                    unidentifiedRows: payload.unidentifiedRows,
                    okbRegionCounts: payload.okbRegionCounts,
                    totalRowsProcessed: payload.totalRowsProcessed,
                    versionHash: finalVersion,
                    okbData: [], okbStatus: null
                });
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Готово', totalRowsProcessed: payload.totalRowsProcessed }));
                setActiveModule('amp');
            }
        };
        workerRef.current.postMessage({ type: 'INIT_STREAM', payload: { okbData, cacheData, totalRowsProcessed: 0 } });
        try { const buffer = await file.arrayBuffer(); workerRef.current.postMessage({ type: 'PROCESS_FILE', payload: { fileBuffer: buffer, fileName: file.name } }, [buffer]); } catch (e) { setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка чтения' })); }
    }, [processingState.isProcessing, okbData, normalize]);

    // --- ИНИЦИАЛИЗАЦИЯ ---
    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            const local = await loadAnalyticsState();
            if (local?.allData?.length > 0) {
                const validatedLocal = normalize(local.allData);
                setAllData(validatedLocal);
                setUnidentifiedRows(local.unidentifiedRows || []);
                setOkbRegionCounts(local.okbRegionCounts || {});
                setDbStatus('ready');
            } else {
                // If local empty, verify if specific snapshot is needed
                // ...
            }
            
            // Auto-check snapshot meta (optional)
            // ...
        };
        init();
    }, [handleDownloadSnapshot, normalize]);

    // --- DATA UPDATE HANDLER (For Edit Modal) ---
    const handleDataUpdate = useCallback(async (oldKey: string, newPoint: MapPoint) => {
        setAllData(prev => {
            return prev.map(group => {
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                if (clientIndex !== -1) {
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = newPoint;
                    return { ...group, clients: updatedClients };
                }
                return group;
            });
        });
    }, []);

    // --- 1. FILTERED DATA CALCULATION ---
    const filtered = useMemo(() => {
        let processedData = allData;

        if (filterStartDate || filterEndDate) {
            processedData = allData.map(row => {
                if (!row.monthlyFact || Object.keys(row.monthlyFact).length === 0) {
                    return row; 
                }

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

    // --- 2. ACTIVE CLIENTS (With Smart Coordinate Recovery) ---
    // Fix for missing green dots: if 'okbData' is loaded, cross-reference addresses to fill missing lat/lon
    const allActiveClients = useMemo(() => {
        const clientsMap = new Map<string, MapPoint>();
        
        // Create an optimized lookup map for OKB data by normalized address
        const okbAddressMap = new Map<string, {lat: number, lon: number}>();
        if (okbData.length > 0) {
            okbData.forEach(okb => {
                if (okb.lat && okb.lon) {
                    const rawAddr = findAddressInRow(okb);
                    if (rawAddr) {
                        okbAddressMap.set(normalizeAddress(rawAddr), { lat: okb.lat, lon: okb.lon });
                    }
                }
            });
        }

        filtered.forEach(row => {
            if (row && Array.isArray(row.clients)) {
                row.clients.forEach(c => { 
                    if (c && c.key) {
                        const existing = clientsMap.get(c.key);
                        if (!existing) {
                            // Smart Recovery: If lat/lon missing, try to find in OKB now
                            if ((!c.lat || !c.lon) && okbAddressMap.size > 0) {
                                const normAddr = normalizeAddress(c.address);
                                const recovered = okbAddressMap.get(normAddr);
                                if (recovered) {
                                    c.lat = recovered.lat;
                                    c.lon = recovered.lon;
                                    c.status = 'match'; // Upgrade status
                                }
                            }
                            clientsMap.set(c.key, c);
                        }
                    }
                });
            }
        });
        return Array.from(clientsMap.values());
    }, [filtered, okbData]); // Depend on okbData to trigger re-calculation when it loads

    // --- 3. UNCOVERED POTENTIAL (OKB minus ACTIVE) ---
    const uncoveredPotential = useMemo(() => {
        if (!okbData || okbData.length === 0) return [];
        
        const activeCoordHashes = new Set<string>();
        allActiveClients.forEach(c => {
            if (c.lat && c.lon) {
                activeCoordHashes.add(`${c.lat.toFixed(4)},${c.lon.toFixed(4)}`);
            }
        });

        return okbData.filter(row => {
            if (!row.lat || !row.lon) return false;
            const hash = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
            return !activeCoordHashes.has(hash);
        });
    }, [okbData, allActiveClients]);

    const filterOptions = useMemo(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => calculateSummaryMetrics(filtered), [filtered]);

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
                            <span className="text-xs font-bold text-white">{dbStatus === 'ready' ? 'Ready' : 'Syncing...'}</span>
                        </div>
                        {processingState.isProcessing && (
                            <div className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-bold text-indigo-300">
                                {processingState.message} {Math.round(processingState.progress)}%
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-500 uppercase font-bold">Активных ТТ</span>
                            <span className="text-emerald-400 font-mono font-bold text-base">{allActiveClients.length.toLocaleString()}</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white">L</div>
                    </div>
                </div>

                <div className="py-8 px-4 lg:px-8">
                    {activeModule === 'adapta' && (
                        <Adapta 
                            processingState={processingState}
                            onStartProcessing={handleStartLocalProcessing}
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
                            <InteractiveRegionMap 
                                data={filtered} 
                                activeClients={allActiveClients} 
                                potentialClients={uncoveredPotential} 
                                onEditClient={setEditingClient} 
                                selectedRegions={filters.region} 
                                flyToClientKey={null} 
                            />
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-1">
                                    <Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({rm:'', brand:[], packaging:[], region:[]})} disabled={allData.length === 0} />
                                </div>
                                <div className="lg:col-span-3"><PotentialChart data={filtered} /></div>
                            </div>
                            <ResultsTable data={filtered} onRowClick={setSelectedDetailsRow} unidentifiedRowsCount={unidentifiedRows.length} onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} disabled={allData.length === 0} />
                        </div>
                    )}
                    {activeModule === 'dashboard' && (
                        <RMDashboard isOpen={true} onClose={() => setActiveModule('amp')} data={filtered} metrics={summaryMetrics} okbRegionCounts={okbRegionCounts} mode="page" okbData={okbData} okbStatus={okbStatus} />
                    )}
                    {activeModule === 'prophet' && <Prophet data={filtered} />}
                    {activeModule === 'agile' && <AgileLearning data={filtered} />}
                    {activeModule === 'roi-genome' && <RoiGenome data={filtered} />}
                </div>
            </main>

            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            <Suspense fallback={null}>
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
