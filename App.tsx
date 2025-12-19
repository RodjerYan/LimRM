
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
    CloudLoadParams
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import { LoaderIcon } from './components/icons';
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

    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint) => {
        setAllActiveClients(prev => {
            const index = prev.findIndex(c => c.key === oldKey);
            if (index !== -1) {
                const updated = [...prev];
                updated[index] = newPoint;
                return updated;
            }
            return [...prev, newPoint];
        });

        setAllData(prev => prev.map(group => {
            const clientIndex = group.clients.findIndex(c => c.key === oldKey);
            if (clientIndex !== -1) {
                const updatedClients = [...group.clients];
                updatedClients[clientIndex] = newPoint;
                return { ...group, clients: updatedClients };
            }
            return group;
        }));

        setUnidentifiedRows(prev => prev.filter(row => normalizeAddress(findAddressInRow(row.rowData)) !== oldKey));
        addNotification('Данные обновлены', 'success');
    }, [addNotification]);

    const handleDeleteClient = useCallback((key: string) => {
        setAllActiveClients(prev => prev.filter(c => c.key !== key));
        setAllData(prev => prev.map(group => ({
            ...group,
            clients: group.clients.filter(c => c.key !== key)
        })));
        setEditingClient(null);
        addNotification('Запись удалена', 'info');
    }, [addNotification]);

    useEffect(() => {
        const restore = async () => {
            try {
                const saved = await loadAnalyticsState();
                if (saved) {
                    setAllData(saved.allData || []);
                    setUnidentifiedRows(saved.unidentifiedRows || []);
                    setOkbRegionCounts(saved.okbRegionCounts || null);
                    setOkbData(saved.okbData || []);
                    setOkbStatus(saved.okbStatus || null);
                    setDateRange(saved.dateRange);
                    setAllActiveClients((saved.allData || []).flatMap((row: any) => row.clients || []));
                    if (saved.allData?.length > 0) setActiveModule('amp');
                }
            } catch (e) {
                console.warn('Restore failed:', e);
            } finally {
                setIsRestoring(false);
            }
        };
        restore();
    }, []);

    const handleResultFinished = useCallback(async (versionHash?: string) => {
        const aggregated = [...aggregatedDataBuffer.current];
        const unidentified = [...unidentifiedBuffer.current];
        
        setAllData(aggregated);
        setAllActiveClients(aggregated.flatMap(row => row.clients || []));
        setUnidentifiedRows(unidentified);
        
        if (versionHash) {
            await saveAnalyticsState({
                allData: aggregated,
                unidentifiedRows: unidentified,
                okbRegionCounts,
                okbData,
                okbStatus,
                dateRange,
                versionHash
            });
            setLastSyncVersion(versionHash);
            localStorage.setItem('last_sync_version', versionHash);
        }

        setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Данные за год полностью загружены' }));
    }, [okbRegionCounts, okbData, okbStatus, dateRange]);

    const initWorker = useCallback(async (startMessage: string, fileNameForState: string) => {
        aggregatedDataBuffer.current = [];
        unidentifiedBuffer.current = [];
        setProcessingState({ isProcessing: true, progress: 0, message: startMessage, fileName: fileNameForState, backgroundMessage: null, startTime: Date.now() });

        let cacheData: CoordsCache = {};
        try {
            const response = await fetch(`/api/get-full-cache?t=${Date.now()}`);
            if (response.ok) cacheData = await response.json();
        } catch (error) {}

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
                    break;
                case 'result_chunk_aggregated':
                    aggregatedDataBuffer.current.push(...(msg.payload as AggregatedDataRow[]));
                    break;
                case 'result_chunk_unidentified':
                    unidentifiedBuffer.current.push(...(msg.payload as UnidentifiedRow[]));
                    break;
                case 'result_finished':
                    const currentVersion = localStorage.getItem('pending_version_hash') || undefined;
                    handleResultFinished(currentVersion);
                    localStorage.removeItem('pending_version_hash');
                    break;
            }
        };
        workerRef.current.postMessage({ type: 'INIT_STREAM', payload: { okbData, cacheData } });
    }, [okbData, handleResultFinished]);

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams, targetVersion?: string) => {
        const { year, month } = params;
        if (targetVersion) localStorage.setItem('pending_version_hash', targetVersion);
        
        await initWorker(`Инициализация года ${year}`, `Облачное хранилище`);

        try {
            // Если выбран год, проходим циклом по всем 12 месяцам
            const monthsToLoad = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
            
            for (const m of monthsToLoad) {
                const monthName = new Date(0, m - 1).toLocaleString('ru-RU', { month: 'long' });
                setProcessingState(prev => ({ ...prev, message: `Загрузка периода: ${monthName}` }));

                const listRes = await fetch(`/api/get-akb?year=${year}&month=${m}&mode=list`);
                if (!listRes.ok) continue;
                
                const files = await listRes.json();
                if (files.length === 0) continue;

                for (const file of files) {
                    let offset = 0, hasMore = true;
                    while (hasMore) {
                        const res = await fetch(`/api/get-akb?fileId=${file.id}&offset=${offset}&limit=5000`);
                        const result = await res.json();
                        
                        if (result.rows?.length > 0) {
                            workerRef.current?.postMessage({ 
                                type: 'PROCESS_CHUNK', 
                                payload: { rawData: result.rows, isFirstChunk: (offset === 0 && m === monthsToLoad[0]), fileName: file.name } 
                            });
                        }
                        hasMore = result.hasMore;
                        offset += 5000;
                    }
                }
            }
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        } catch (error) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка при загрузке года' }));
            addNotification('Ошибка облачной синхронизации', 'error');
        }
    }, [initWorker, addNotification]);

    const smartData = useMemo(() => {
        const okbCoordSet = new Set<string>();
        okbData.forEach(row => {
            if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                okbCoordSet.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`);
            }
        });
        return enrichDataWithSmartPlan(allData, okbRegionCounts, 15, okbCoordSet);
    }, [allData, okbRegionCounts, okbData]);

    useEffect(() => {
        setFilteredData(applyFilters(smartData, filters));
    }, [smartData, filters]);

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
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] uppercase font-bold tracking-widest transition-all ${isLiveConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                            {isLiveConnected ? 'Live: Синхронизировано' : 'Sync: Оффлайн'}
                        </div>
                        {isRestoring && <div className="text-indigo-400 text-[10px] font-bold animate-pulse">Восстановление сессии...</div>}
                    </div>
                    
                    <div className="flex items-center gap-3">
                         {allData.length > 0 && (
                            <div className="flex items-center gap-6 text-xs mr-6">
                                <div className="flex flex-col items-end">
                                    <span className="text-gray-500">Общий Факт (Год)</span>
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
                        />
                    )}
                    {activeModule === 'amp' && (
                        <div className="space-y-6">
                             <InteractiveRegionMap 
                                data={filteredData} 
                                selectedRegions={filters.region} 
                                potentialClients={potentialClients}
                                activeClients={allActiveClients}
                                flyToClientKey={flyToClientKey}
                                onEditClient={setEditingClient}
                            />
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-1">
                                    <Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({ rm: '', brand: [], packaging: [], region: [] })} disabled={allData.length === 0} />
                                </div>
                                <div className="lg:col-span-3">
                                    <PotentialChart data={filteredData} />
                                </div>
                            </div>
                            <ResultsTable data={filteredData} onRowClick={setSelectedDetailsRow} disabled={allData.length === 0} unidentifiedRowsCount={unidentifiedRows.length} onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} />
                        </div>
                    )}
                    {activeModule === 'dashboard' && (
                        <RMDashboard isOpen={true} onClose={() => setActiveModule('amp')} data={filteredData} okbRegionCounts={okbRegionCounts} okbData={okbData} mode="page" metrics={summaryMetrics} okbStatus={okbStatus} dateRange={dateRange} onEditClient={setEditingClient} />
                    )}
                </div>
            </main>

            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={setEditingClient} />}
            {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={setEditingClient} />}
            
            {editingClient && (
                <AddressEditModal 
                    isOpen={!!editingClient} 
                    onClose={() => setEditingClient(null)} 
                    onBack={() => setEditingClient(null)} 
                    data={editingClient} 
                    onDataUpdate={handleDataUpdate}
                    onStartPolling={() => {}} 
                    onDelete={handleDeleteClient}
                    globalTheme="dark"
                />
            )}
        </div>
    );
};

export default App;
