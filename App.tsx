
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
import { saveAnalyticsState, loadAnalyticsState, clearAnalyticsState } from './utils/db';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    const [lastSyncVersion, setLastSyncVersion] = useState<string | null>(localStorage.getItem('last_sync_version'));
    const [isRestoring, setIsRestoring] = useState(true);

    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false,
        progress: 0,
        message: 'Ожидание выбора периода...',
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

    // Восстановление данных из локального хранилища без авто-загрузки из облака
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
                    // Мы НЕ переключаем вкладку автоматически, оставляем пользователя в "Adapta"
                }
            } catch (e) {
                console.warn('Restore failed:', e);
            } finally {
                setIsRestoring(false);
            }
        };
        restore();
    }, []);

    const handleClearData = async () => {
        await clearAnalyticsState();
        setAllData([]);
        setAllActiveClients([]);
        setUnidentifiedRows([]);
        setDateRange(undefined);
        addNotification('Локальные данные очищены', 'info');
    };

    const handleResultFinished = useCallback(async (versionHash?: string) => {
        const aggregated = [...aggregatedDataBuffer.current];
        const unidentified = [...unidentifiedBuffer.current];
        
        setAllData(aggregated);
        setAllActiveClients(aggregated.flatMap(row => row.clients || []));
        setUnidentifiedRows(unidentified);
        
        const finalVersion = versionHash || `sync-${Date.now()}`;
        
        await saveAnalyticsState({
            allData: aggregated,
            unidentifiedRows: unidentified,
            okbRegionCounts,
            okbData,
            okbStatus,
            dateRange,
            versionHash: finalVersion
        });
        
        setLastSyncVersion(finalVersion);
        setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Загрузка завершена. Данные сохранены локально.' }));
        addNotification('Данные успешно загружены и сохранены локально', 'success');
    }, [okbRegionCounts, okbData, okbStatus, dateRange, addNotification]);

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
                    handleResultFinished();
                    break;
            }
        };
        workerRef.current.postMessage({ type: 'INIT_STREAM', payload: { okbData, cacheData } });
    }, [okbData, handleResultFinished]);

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams) => {
        const { year, month, quarter } = params;
        
        let label = `${year} год`;
        let monthsToLoad: number[] = [];

        if (month) {
            monthsToLoad = [month];
            label = new Date(0, month - 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
        } else if (quarter) {
            monthsToLoad = [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];
            label = `Q${quarter} ${year}`;
        } else {
            monthsToLoad = Array.from({ length: 12 }, (_, i) => i + 1);
            label = `Весь ${year} год`;
        }

        setDateRange(label);
        await initWorker(`Начало загрузки: ${label}`, `Облако: ${label}`);

        try {
            let monthsProcessed = 0;
            for (const m of monthsToLoad) {
                const monthName = new Date(0, m - 1).toLocaleString('ru-RU', { month: 'long' });
                setProcessingState(prev => ({ 
                    ...prev, 
                    message: `Загрузка: ${monthName} (${monthsProcessed + 1}/${monthsToLoad.length})`,
                    progress: (monthsProcessed / monthsToLoad.length) * 100
                }));

                const listRes = await fetch(`/api/get-akb?year=${year}&month=${m}&mode=list`);
                if (!listRes.ok) continue;
                
                const files = await listRes.json();
                for (const file of files) {
                    let offset = 0, hasMore = true;
                    while (hasMore) {
                        const res = await fetch(`/api/get-akb?fileId=${file.id}&offset=${offset}&limit=5000`);
                        const result = await res.json();
                        if (result.rows?.length > 0) {
                            workerRef.current?.postMessage({ 
                                type: 'PROCESS_CHUNK', 
                                payload: { rawData: result.rows, isFirstChunk: (monthsProcessed === 0 && offset === 0), fileName: file.name } 
                            });
                        }
                        hasMore = result.hasMore;
                        offset += 5000;
                    }
                }
                monthsProcessed++;
            }
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        } catch (error) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка связи с Google Drive' }));
            addNotification('Ошибка при загрузке данных за период', 'error');
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
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] uppercase font-bold tracking-widest bg-emerald-500/10 border-emerald-500/30 text-emerald-400`}>
                            <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500`}></div>
                            {allData.length > 0 ? `Локальная база: ${dateRange || 'загружена'}` : 'Ожидание данных'}
                        </div>
                        {isRestoring && <div className="text-indigo-400 text-[10px] font-bold animate-pulse">Восстановление сессии...</div>}
                    </div>
                    
                    <div className="flex items-center gap-6">
                         {allData.length > 0 && (
                            <button onClick={handleClearData} className="text-[10px] uppercase font-bold text-gray-500 hover:text-red-400 transition-colors">
                                Сбросить всё
                            </button>
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
                    onDataUpdate={() => {}}
                    onStartPolling={() => {}} 
                    onDelete={() => {}}
                    globalTheme="dark"
                />
            )}
        </div>
    );
};

export default App;
