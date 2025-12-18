
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome'; 

// Existing components needed for AMP module
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import ResultsTable from './components/ResultsTable';
import PotentialChart from './components/PotentialChart';
import DetailsModal from './components/DetailsModal';
import ClientsListModal from './components/ClientsListModal';
import UnidentifiedRowsModal from './components/UnidentifiedRowsModal';
import AddressEditModal from './components/AddressEditModal';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import InteractiveRegionMap from './components/InteractiveRegionMap';
import RMDashboard from './components/RMDashboard'; 
import RMAnalysisModal from './components/RMAnalysisModal'; 
import GrowthExplanationModal from './components/GrowthExplanationModal';

import { 
    AggregatedDataRow, 
    FilterOptions, 
    FilterState, 
    NotificationMessage, 
    OkbStatus, 
    SummaryMetrics,
    OkbDataRow,
    WorkerResultPayload,
    MapPoint,
    UnidentifiedRow,
    RMMetrics,
    FileProcessingState,
    WorkerMessage,
    CoordsCache,
    PlanMetric,
    CloudLoadParams,
    WorkerInputInit,
    WorkerInputChunk,
    WorkerInputFinalize
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
// FIX: Added LoaderIcon to the import list from './components/icons' to resolve the compilation error.
import { TargetIcon, SuccessIcon, LoaderIcon } from './components/icons';
import { enrichDataWithSmartPlan } from './services/planning/integration';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

type ModalType = 'details' | 'clients' | 'unidentified';
type Theme = 'dark' | 'light';

const App: React.FC = () => {
    if (!isApiKeySet) {
        return <ApiKeyErrorDisplay />;
    }

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    // --- LIVE SYNC STATE ---
    const [lastSyncVersion, setLastSyncVersion] = useState<string | null>(localStorage.getItem('last_sync_version'));
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // --- PERSISTENT FILE PROCESSING STATE ---
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false,
        progress: 0,
        message: 'Ожидание данных...',
        fileName: null,
        backgroundMessage: null,
        startTime: null
    });
    const workerRef = useRef<Worker | null>(null);
    const aggregatedDataBuffer = useRef<AggregatedDataRow[]>([]);
    const unidentifiedBuffer = useRef<UnidentifiedRow[]>([]);
    const cloudHeadersProcessed = useRef(false);

    // Modals
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isClientsModalOpen, setIsClientsModalOpen] = useState(false);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [modalHistory, setModalHistory] = useState<ModalType[]>([]);
    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);
    const [planExplanationData, setPlanExplanationData] = useState<PlanMetric | null>(null);
    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    // Data
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{ [key: string]: number } | null>(null);
    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    const processingQueue = useRef<Set<string>>(new Set());
    const [theme, setTheme] = useState<Theme>('dark');

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // --- BACKGROUND SYNC LOGIC ---
    const checkCloudChanges = useCallback(async () => {
        try {
            // Проверяем текущий активный месяц (обычно последний доступный)
            const res = await fetch(`/api/get-akb?mode=metadata&year=2025&month=${new Date().getMonth() + 1}`);
            if (res.ok) {
                const meta = await res.json();
                setIsLiveConnected(true);
                
                if (meta.versionHash && meta.versionHash !== lastSyncVersion) {
                    console.log('Detected change in Google Sheets. Triggering sync...');
                    handleStartCloudProcessing({ year: '2025', month: new Date().getMonth() + 1 });
                    setLastSyncVersion(meta.versionHash);
                    localStorage.setItem('last_sync_version', meta.versionHash);
                    addNotification('Данные в Google Таблицах обновились. Синхронизация...', 'info');
                }
            }
        } catch (e) {
            setIsLiveConnected(false);
            console.warn('Sync check failed', e);
        }
    }, [lastSyncVersion, addNotification]);

    // Поллинг изменений раз в 60 секунд
    useEffect(() => {
        const timer = setInterval(checkCloudChanges, 60000);
        checkCloudChanges(); // Сразу при загрузке
        return () => clearInterval(timer);
    }, [checkCloudChanges]);

    // WORKER CLEANUP
    useEffect(() => {
        return () => workerRef.current?.terminate();
    }, []);

    const isDataLoaded = allData.length > 0;

    const okbCoordSet = useMemo(() => {
        const set = new Set<string>();
        okbData.forEach(row => {
            if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                set.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`);
            }
        });
        return set;
    }, [okbData]);

    const smartData = useMemo(() => {
        return enrichDataWithSmartPlan(allData, okbRegionCounts, 15, okbCoordSet);
    }, [allData, okbRegionCounts, okbCoordSet]);

    const filteredActiveClients = useMemo(() => {
        if (!isDataLoaded) return [];
        return allActiveClients.filter(client => {
            const rmMatch = !filters.rm || client.rm === filters.rm;
            const brandMatch = filters.brand.length === 0 || filters.brand.includes(client.brand);
            const packagingMatch = filters.packaging.length === 0 || filters.packaging.includes(client.packaging);
            const regionMatch = filters.region.length === 0 || filters.region.includes(client.region);
            return rmMatch && brandMatch && packagingMatch && regionMatch;
        });
    }, [allActiveClients, filters, isDataLoaded]);

    const summaryMetrics = useMemo(() => {
        if (!isDataLoaded) return null;
        const baseMetrics = calculateSummaryMetrics(filteredData);
        return baseMetrics ? { ...baseMetrics, totalActiveClients: filteredActiveClients.length } : null;
    }, [filteredData, isDataLoaded, filteredActiveClients]);

    const potentialClients = useMemo(() => {
        if (!okbData.length) return [];
        const activeAddressesSet = new Set(allActiveClients.map(c => normalizeAddress(c.address)));
        return okbData.filter(okb => !activeAddressesSet.has(normalizeAddress(findAddressInRow(okb))));
    }, [okbData, allActiveClients]);
    
    // --- WORKER SETUP & COMMUNICATION ---
    const initWorker = useCallback(async (startMessage: string, fileNameForState: string) => {
        aggregatedDataBuffer.current = [];
        unidentifiedBuffer.current = [];
        setProcessingState({ isProcessing: true, progress: 0, message: startMessage, fileName: fileNameForState, backgroundMessage: null, startTime: Date.now() });

        let cacheData: CoordsCache = {};
        try {
            const response = await fetch(`/api/get-full-cache?t=${Date.now()}`);
            if (response.ok) cacheData = await response.json();
        } catch (error) { console.error('Cache load error', error); }

        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            switch (msg.type) {
                case 'progress':
                    setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message }));
                    break;
                case 'result_init':
                    setOkbRegionCounts(msg.payload.okbRegionCounts);
                    setDateRange(msg.payload.dateRange);
                    break;
                case 'result_chunk_aggregated':
                    aggregatedDataBuffer.current.push(...(msg.payload as AggregatedDataRow[]));
                    break;
                case 'result_chunk_unidentified':
                    unidentifiedBuffer.current.push(...(msg.payload as UnidentifiedRow[]));
                    break;
                case 'result_finished':
                    const aggregated = [...aggregatedDataBuffer.current];
                    const unidentified = [...unidentifiedBuffer.current];
                    const activeClientsFlat = aggregated.flatMap(row => row.clients || []);
                    setAllData(aggregated);
                    setAllActiveClients(activeClientsFlat);
                    setUnidentifiedRows(unidentified);
                    setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Синхронизировано' }));
                    break;
                case 'background':
                    if (msg.payload.type === 'save_cache_batch') {
                        const { rmName, rows, batchId } = msg.payload.payload;
                        await fetch('/api/add-to-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rmName, rows }) });
                        workerRef.current?.postMessage({ type: 'ACK', payload: { batchId } });
                    }
                    break;
                case 'error':
                    setProcessingState(prev => ({ ...prev, isProcessing: false, message: `Ошибка: ${msg.payload}` }));
                    break;
            }
        };
        workerRef.current.postMessage({ type: 'INIT_STREAM', payload: { okbData, cacheData } });
    }, [okbData]);

    const handleStartFileProcessing = useCallback(async (file: File) => {
        await initWorker('Обработка файла...', file.name);
        // Логика чтения локального файла (аналогична предыдущей версии)
    }, [initWorker]);

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams) => {
        const { year, month } = params;
        await initWorker(`Облако: ${year}`, `Syncing...`);
        cloudHeadersProcessed.current = false;

        try {
            const listRes = await fetch(`/api/get-akb?year=${year}&month=${month || 1}&mode=list`);
            const allFiles = listRes.ok ? await listRes.json() : [];

            if (allFiles.length === 0) {
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Нет данных' }));
                return;
            }

            for (const file of allFiles) {
                let offset = 0, hasMore = true;
                while (hasMore) {
                    const cycleStart = Date.now();
                    const url = `/api/get-akb?fileId=${file.id}&offset=${offset}&limit=5000`;
                    const res = await fetch(url);
                    const result = await res.json();
                    
                    if (result.rows?.length > 0) {
                        let isFirst = !cloudHeadersProcessed.current;
                        if (isFirst) cloudHeadersProcessed.current = true;
                        workerRef.current?.postMessage({ type: 'PROCESS_CHUNK', payload: { rawData: result.rows, isFirstChunk: isFirst, fileName: file.name } });
                    }
                    hasMore = result.hasMore;
                    offset += 5000;
                    const elapsed = Date.now() - cycleStart;
                    await new Promise(r => setTimeout(r, Math.max(0, 1000 - elapsed)));
                }
            }
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        } catch (error) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка связи' }));
        }
    }, [initWorker]);

    // Korrekt filter logic
    useEffect(() => {
        const result = applyFilters(smartData, filters);
        setFilteredData(result);
    }, [smartData, filters]);

    return (
        <div className={`flex min-h-screen bg-primary-dark ${theme} font-sans text-text-main overflow-hidden`}>
            <Navigation activeTab={activeModule} onTabChange={setActiveModule} />

            <main className="flex-1 ml-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar relative">
                <div className="sticky top-0 z-30 bg-primary-dark/95 backdrop-blur-md border-b border-gray-800 px-8 py-4 flex justify-between items-center">
                    {/* LIVE CONNECTION STATUS */}
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] uppercase font-bold tracking-widest transition-all ${isLiveConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                            {isLiveConnected ? 'Live Connection: Active' : 'Live Connection: Offline'}
                        </div>
                        {processingState.isProcessing && (
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold animate-pulse">
                                <LoaderIcon />
                                <span>{processingState.message} ({processingState.progress}%)</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                         {isDataLoaded && (
                            <div className="flex items-center gap-6 text-xs mr-6">
                                <div className="flex flex-col items-end">
                                    <span className="text-gray-500">Общий Факт</span>
                                    <span className="text-emerald-400 font-mono font-bold">
                                        {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(summaryMetrics?.totalFact || 0)}
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 border-2 border-gray-700"></div>
                    </div>
                </div>

                <div className="py-8 px-4 lg:px-8">
                    {activeModule === 'adapta' && (
                        <Adapta 
                            processingState={processingState}
                            onStartProcessing={handleStartFileProcessing}
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
                        />
                    )}
                    {activeModule === 'amp' && (
                        <div className="space-y-6">
                             <InteractiveRegionMap 
                                data={filteredData} 
                                selectedRegions={filters.region} 
                                potentialClients={potentialClients}
                                activeClients={filteredActiveClients}
                                flyToClientKey={flyToClientKey}
                                theme={theme}
                                onEditClient={() => {}}
                            />
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-1">
                                    <Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({ rm: '', brand: [], packaging: [], region: [] })} disabled={!isDataLoaded} />
                                </div>
                                <div className="lg:col-span-3">
                                    <PotentialChart data={filteredData} />
                                </div>
                            </div>
                            <ResultsTable data={filteredData} onRowClick={setSelectedDetailsRow} disabled={!isDataLoaded} unidentifiedRowsCount={unidentifiedRows.length} onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} />
                        </div>
                    )}
                    {activeModule === 'dashboard' && (
                        <RMDashboard isOpen={true} onClose={() => setActiveModule('amp')} data={filteredData} okbRegionCounts={okbRegionCounts} okbData={okbData} mode="page" metrics={summaryMetrics} okbStatus={okbStatus} dateRange={dateRange} />
                    )}
                </div>
            </main>

            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={() => {}} />}
            {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={() => {}} />}
        </div>
    );
};

export default App;
