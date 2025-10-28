

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DataControl from './components/DataControl';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import ResultsTable from './components/ResultsTable';
import PotentialChart from './components/PotentialChart';
import DetailsModal from './components/DetailsModal';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import { 
    AggregatedDataRow, 
    FilterOptions, 
    FilterState, 
    NotificationMessage, 
    OkbStatus, 
    SummaryMetrics 
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics } from './utils/dataUtils';

// This check determines if the application is properly configured for Vercel deployment.
const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    // If the special key is not set during the build, show an error message.
    if (!isApiKeySet) {
        return <ApiKeyErrorDisplay />;
    }

    // Main data state
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    
    // UI State
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRow, setSelectedRow] = useState<AggregatedDataRow | null>(null);

    // OKB Data State
    const [okbData, setOkbData] = useState<any[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);

    // Filters State
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], city: [] });
    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    
    // Derived Data
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
        setFilters({ rm: '', brand: [], city: [] }); // Reset filters on new data
        addNotification(`Данные успешно загружены. Найдено ${data.length} уникальных групп.`, 'success');
    }, [addNotification]);
    
    const handleProcessingStateChange = useCallback((loading: boolean, message: string) => {
        setIsLoading(loading);
        setLoadingMessage(message);
        if (!loading && message.startsWith('Ошибка')) {
            addNotification(message, 'error');
        } else if (!loading) {
            addNotification(message, 'info');
        }
    }, [addNotification]);

    const handleFilterChange = useCallback((newFilters: FilterState) => {
        setFilters(newFilters);
    }, []);
    
    const resetFilters = useCallback(() => {
        setFilters({ rm: '', brand: [], city: [] });
    }, []);

    const handleRowClick = useCallback((row: AggregatedDataRow) => {
        setSelectedRow(row);
        setIsModalOpen(true);
    }, []);

    const handleOkbStatusChange = (status: OkbStatus) => {
        setOkbStatus(status);
        if (status.status === 'ready' && status.message) addNotification(status.message, 'success');
        if (status.status === 'error' && status.message) addNotification(status.message, 'error');
    };

    const handleOkbDataChange = (data: any[]) => {
        setOkbData(data);
    };

    // Effect to apply filters when data or filters change
    useEffect(() => {
        setIsLoading(true);
        setLoadingMessage('Применение фильтров...');
        // Use a timeout to prevent blocking the UI on large datasets
        const timer = setTimeout(() => {
            const result = applyFilters(allData, filters);
            setFilteredData(result);
            setIsLoading(false);
            setLoadingMessage('');
        }, 100);
        return () => clearTimeout(timer);
    }, [allData, filters]);

    const isDataLoaded = allData.length > 0;
    const isControlPanelLocked = isLoading || (isDataLoaded && !okbStatus);

    return (
        <div className="bg-primary-dark min-h-screen text-slate-200 font-sans p-4 lg:p-6">
            <main className="max-w-screen-2xl mx-auto space-y-6">
                <header>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Аналитическая панель "Потенциал Роста"</h1>
                    <p className="text-slate-400 mt-1">Инструмент для анализа и визуализации данных по продажам</p>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    {/* Left Sidebar */}
                    <aside className="lg:col-span-1 space-y-6 lg:sticky lg:top-6">
                        <DataControl
                            onDataLoaded={handleFileProcessed}
                            onLoadingStateChange={handleProcessingStateChange}
                            onOkbStatusChange={handleOkbStatusChange}
                            onOkbDataChange={handleOkbDataChange}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            disabled={isControlPanelLocked}
                        />
                        <Filters
                            options={filterOptions}
                            currentFilters={filters}
                            onFilterChange={handleFilterChange}
                            onReset={resetFilters}
                            disabled={!isDataLoaded || isLoading}
                        />
                    </aside>

                    {/* Main Content */}
                    <div className="lg:col-span-3 space-y-6">
                        <MetricsSummary metrics={summaryMetrics} okbStatus={okbStatus} disabled={!isDataLoaded || isLoading} />
                        <ResultsTable data={filteredData} onRowClick={handleRowClick} disabled={!isDataLoaded || isLoading} />
                        <PotentialChart data={filteredData} />
                    </div>
                </div>

                {/* Notifications container */}
                <div className="fixed bottom-4 right-4 z-50 space-y-3 w-full max-w-sm">
                    {notifications.map(n => (
                        <Notification key={n.id} message={n.message} type={n.type} />
                    ))}
                </div>

                {/* Details Modal */}
                <DetailsModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)}
                    data={selectedRow}
                    okbData={okbData}
                />
            </main>
        </div>
    );
};

export default App;