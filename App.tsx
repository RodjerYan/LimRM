import React, { useState, useEffect, useMemo, useRef } from 'react';
import FileUpload from './components/FileUpload';
import Filters from './components/Filters';
import ResultsTable from './components/ResultsTable';
import MetricsSummary from './components/MetricsSummary';
import DetailsModal from './components/DetailsModal';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import PlanningModule from './components/PlanningModule';
import {
    LoadingState,
    FilterOptions,
    FilterState,
    AggregatedDataRow,
    ProcessedData,
    WorkerMessage,
    NotificationMessage
} from './types';
import { applyFilters, exportToCSV } from './utils/dataUtils';
import { formatETR } from './utils/timeUtils';
// FIX: Import ExportIcon component to be used in the export button.
import { ExportIcon } from './components/icons';

// --- Проверка переменных окружения ---
const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const VITE_GEMINI_PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL;
const VITE_OSM_PROXY_URL = import.meta.env.VITE_OSM_PROXY_URL;

const checkEnvVariables = () => {
    if (!VITE_GEMINI_API_KEY || !VITE_GEMINI_PROXY_URL || !VITE_OSM_PROXY_URL) {
        return 'missing';
    }
    if (VITE_GEMINI_API_KEY.startsWith('AIza')) {
        return 'swapped';
    }
    return 'ok';
};

const initialFilterState: FilterState = { rm: '', brand: [], city: [] };

type ActiveTab = 'table' | 'planning';

const App: React.FC = () => {
    const envStatus = checkEnvVariables();

    const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle', progress: 0, text: '' });
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({ rms: [], brands: [], cities: [] });
    const [filters, setFilters] = useState<FilterState>(initialFilterState);
    const [selectedRow, setSelectedRow] = useState<AggregatedDataRow | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [activeTab, setActiveTab] = useState<ActiveTab>('table');
    
    const processingStartTime = useRef<number>(0);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        // Инициализация и очистка воркера
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (event: MessageEvent<WorkerMessage>) => {
            const { type, payload } = event.data;
            if (type === 'progress') {
                 const elapsed = (Date.now() - processingStartTime.current) / 1000;
                 const etr = payload.progress > 0 ? elapsed / (payload.progress / 100) - elapsed : Infinity;
                 setLoadingState({ ...payload, etr: formatETR(etr) });
            } else if (type === 'result') {
                const { aggregatedData, filterOptions: newFilterOptions }: ProcessedData = payload;
                setAllData(aggregatedData);
                setFilterOptions(newFilterOptions);
                setLoadingState({ status: 'done', progress: 100, text: 'Анализ завершен!' });
                addNotification('Анализ данных успешно завершен!', 'success');
                setActiveTab('planning'); // Автоматически переключаемся на планирование после анализа
            } else if (type === 'error') {
                setLoadingState({ status: 'error', progress: 0, text: `Ошибка: ${payload.message}` });
                addNotification(`Ошибка обработки: ${payload.message}`, 'error');
            }
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    const addNotification = (message: string, type: NotificationMessage['type']) => {
        const id = crypto.randomUUID();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const handleFileSelect = (file: File) => {
        setAllData([]);
        setFilters(initialFilterState);
        setFilterOptions({ rms: [], brands: [], cities: [] });
        setLoadingState({ status: 'reading', progress: 0, text: `Загрузка файла: ${file.name}` });
        processingStartTime.current = Date.now();
        setActiveTab('table');
        workerRef.current?.postMessage({ file });
    };

    const handleRowClick = (rowData: AggregatedDataRow) => {
        setSelectedRow(rowData);
        setIsModalOpen(true);
    };
    
    const handleFilterChange = (newFilters: FilterState) => {
        setFilters(newFilters);
    };

    const handleResetFilters = () => {
        setFilters(initialFilterState);
    };

    const filteredData = useMemo(() => applyFilters(allData, filters), [allData, filters]);
    
    const summaryMetrics = useMemo(() => ({
        totalFact: filteredData.reduce((sum, item) => sum + item.fact, 0),
        totalPotential: filteredData.reduce((sum, item) => sum + item.potential, 0),
        filteredCount: filteredData.length,
        totalCount: allData.length
    }), [filteredData, allData.length]);


    if (envStatus !== 'ok') {
        return <ApiKeyErrorDisplay errorType={envStatus} />;
    }

    const isDataReady = allData.length > 0;
    const isProcessing = loadingState.status !== 'idle' && loadingState.status !== 'done' && loadingState.status !== 'error';
    
    const TabButton: React.FC<{ tabId: ActiveTab; children: React.ReactNode }> = ({ tabId, children }) => (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                activeTab === tabId
                    ? 'bg-accent text-white shadow'
                    : 'text-gray-400 hover:bg-white/10'
            }`}
            disabled={!isDataReady}
        >
            {children}
        </button>
    );

    return (
        <div className="bg-primary-dark text-slate-200 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-screen-2xl mx-auto">
                <header className="mb-6 text-center">
                    <h1 className="text-4xl font-extrabold text-white">
                        Аналитический модуль <span className="text-accent">Limkorm</span>
                    </h1>
                    <p className="text-slate-400 mt-2">Инструмент для анализа и планирования продаж</p>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <aside className="lg:col-span-1 flex flex-col gap-6">
                        <FileUpload onFileSelect={handleFileSelect} loadingState={loadingState} />
                        <Filters options={filterOptions} currentFilters={filters} onFilterChange={handleFilterChange} onReset={handleResetFilters} disabled={!isDataReady || isProcessing} />
                    </aside>

                    <div className="lg:col-span-3 flex flex-col gap-6 min-h-0">
                       <MetricsSummary {...summaryMetrics} />
                       
                        <div className="bg-card-bg/70 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-indigo-500/10 flex-grow flex flex-col">
                            <div className="flex items-center justify-between mb-4 border-b border-gray-700 pb-3">
                                <div className="flex space-x-2 p-1 bg-gray-900/50 rounded-lg">
                                    <TabButton tabId="table">Детальная таблица</TabButton>
                                    <TabButton tabId="planning">Планирование по РМ</TabButton>
                                </div>
                                {activeTab === 'table' && (
                                     <button onClick={() => exportToCSV(filteredData)} disabled={!isDataReady || filteredData.length === 0} className="flex items-center gap-2 bg-transparent hover:bg-indigo-500/20 text-gray-300 border border-gray-600 font-bold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                        <ExportIcon />
                                        <span>Экспорт</span>
                                    </button>
                                )}
                            </div>

                           <div className="flex-grow min-h-0">
                             {activeTab === 'table' ? (
                                <ResultsTable data={filteredData} onRowClick={handleRowClick} />
                             ) : (
                                <PlanningModule data={filteredData} />
                             )}
                           </div>
                        </div>
                    </div>
                </main>
            </div>

            <DetailsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} data={selectedRow} />
            
            <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm space-y-3">
                {notifications.map(n => (
                    <Notification key={n.id} message={n.message} type={n.type} />
                ))}
            </div>
        </div>
    );
};

export default App;