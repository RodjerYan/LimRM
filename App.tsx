import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import ResultsTable from './components/ResultsTable';
import PotentialChart from './components/PotentialChart';
import DetailsModal from './components/DetailsModal';
import PMAnalysisModal from './components/PMAnalysisModal'; // Импорт нового модального окна
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import OKBManagement from './components/OKBManagement';
import FileUpload from './components/FileUpload';
import { 
    AggregatedDataRow, 
    FilterOptions, 
    FilterState, 
    NotificationMessage, 
    OkbStatus, 
    SummaryMetrics,
    OkbDataRow
} from './types';
import { getFilterOptions, calculateSummaryMetrics } from './utils/dataUtils';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) {
        return <ApiKeyErrorDisplay />;
    }

    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    // Состояние для старого модального окна (детали по строке)
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [selectedRowForDetails, setSelectedRowForDetails] = useState<AggregatedDataRow | null>(null);

    // Состояние для нового модального окна (анализ РМ)
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [selectedRmForAnalysis, setSelectedRmForAnalysis] = useState<AggregatedDataRow | null>(null);


    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);

    const [filters, setFilters] = useState<FilterState>({ rm: '' });
    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    
    const summaryMetrics = useMemo<SummaryMetrics | null>(() => {
        return filteredData.length > 0 ? calculateSummaryMetrics(filteredData) : null;
    }, [filteredData]);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
        }, 5000);
    }, []);

    const handleFileProcessed = useCallback((data: AggregatedDataRow[]) => {
        setAllData(data);
        setFilters({ rm: '' });
        addNotification(`Данные успешно загружены. Найдено ${data.length} уникальных групп.`, 'success');
    }, [addNotification]);
    
    const handleProcessingStateChange = useCallback((loading: boolean, message: string) => {
        setIsLoading(loading);
        setLoadingMessage(message);
        if (!loading && message.startsWith('Ошибка')) {
            addNotification(message, 'error');
        }
    }, [addNotification]);

    const handleFilterChange = useCallback((newFilters: FilterState) => {
        setFilters(newFilters);
        if (newFilters.rm) {
            const selectedRMData = allData.find(d => d.rm === newFilters.rm);
            setSelectedRmForAnalysis(selectedRMData || null);
        } else {
            setSelectedRmForAnalysis(null);
        }
    }, [allData]);
    
    const resetFilters = useCallback(() => {
        setFilters({ rm: '' });
        setSelectedRmForAnalysis(null);
    }, []);

    const handleRowClick = useCallback((row: AggregatedDataRow) => {
        setSelectedRowForDetails(row);
        setIsDetailsModalOpen(true);
    }, []);

    const handleOpenAnalysisModal = useCallback(() => {
        if (selectedRmForAnalysis) {
            setIsAnalysisModalOpen(true);
        } else {
            addNotification('Сначала выберите РМ для анализа.', 'info');
        }
    }, [selectedRmForAnalysis, addNotification]);

    const handleOkbStatusChange = (status: OkbStatus) => {
        setOkbStatus(status);
        if (status.status === 'ready' && status.message) addNotification(status.message, 'success');
        if (status.status === 'error' && status.message) addNotification(status.message, 'error');
    };

    useEffect(() => {
        setIsLoading(true);
        const timer = setTimeout(() => {
            const result = allData.filter(row => {
                // Фильтрация на главной странице теперь только по РМ
                return filters.rm ? row.rm === filters.rm : true;
            });
            setFilteredData(result);
            setIsLoading(false);
        }, 100);
        return () => clearTimeout(timer);
    }, [allData, filters]);

    const isDataLoaded = allData.length > 0;
    const isControlPanelLocked = isLoading;

    return (
        <div className="bg-primary-dark min-h-screen text-slate-200 font-sans p-4 lg:p-6">
            <main className="max-w-screen-2xl mx-auto space-y-6">
                <header>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Аналитическая панель "Потенциал Роста"</h1>
                    <p className="text-slate-400 mt-1">Инструмент для анализа и визуализации данных по продажам</p>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    <aside className="lg:col-span-1 space-y-6 lg:sticky lg:top-6">
                        <OKBManagement 
                            onStatusChange={handleOkbStatusChange}
                            onDataChange={setOkbData}
                            status={okbStatus}
                            disabled={isControlPanelLocked}
                        />
                        <FileUpload 
                            onFileProcessed={handleFileProcessed}
                            onProcessingStateChange={handleProcessingStateChange}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            disabled={isControlPanelLocked || !okbStatus || okbStatus.status !== 'ready'}
                        />
                        <Filters
                            options={filterOptions}
                            currentFilters={filters}
                            onFilterChange={handleFilterChange}
                            onReset={resetFilters}
                            onOpenAnalysisModal={handleOpenAnalysisModal}
                            disabled={!isDataLoaded || isLoading}
                        />
                    </aside>

                    <div className="lg:col-span-3 space-y-6">
                        <MetricsSummary metrics={summaryMetrics} okbStatus={okbStatus} disabled={!isDataLoaded || isLoading} />
                        <ResultsTable data={filteredData} onRowClick={handleRowClick} disabled={!isDataLoaded || isLoading} />
                        {filteredData.length > 0 && <PotentialChart data={filteredData} />}
                    </div>
                </div>

                <div className="fixed bottom-4 right-4 z-50 space-y-3 w-full max-w-sm">
                    {notifications.map(n => (
                        <Notification key={n.id} message={n.message} type={n.type} />
                    ))}
                </div>
                
                <DetailsModal 
                    isOpen={isDetailsModalOpen} 
                    onClose={() => setIsDetailsModalOpen(false)}
                    data={selectedRowForDetails}
                />

                <PMAnalysisModal
                    isOpen={isAnalysisModalOpen}
                    onClose={() => setIsAnalysisModalOpen(false)}
                    data={selectedRmForAnalysis}
                />

            </main>
        </div>
    );
};

export default App;