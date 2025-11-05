import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import ResultsTable from './components/ResultsTable';
import PotentialChart from './components/PotentialChart';
import DetailsModal from './components/DetailsModal';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import OKBManagement from './components/OKBManagement';
import FileUpload from './components/FileUpload';
import GlobalMapView from './components/GlobalMapView'; 
import { 
    AggregatedDataRow, 
    FilterOptions, 
    FilterState, 
    NotificationMessage, 
    OkbStatus, 
    SummaryMetrics,
    OkbDataRow,
    MapPoint,
    MapPointStatus
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics } from './utils/dataUtils';

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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRow, setSelectedRow] = useState<AggregatedDataRow | null>(null);

    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    
    // Derived state for the map
    const activeRegions = useMemo(() => new Set(allData.map(row => row.region)), [allData]);

    const potentialPoints = useMemo<MapPoint[]>(() => {
        if (okbData.length === 0) return [];
        
        const activeAddresses = new Set<string>();
        allData.forEach(group => {
            group.clients.forEach(clientAddress => {
                if (clientAddress) activeAddresses.add(clientAddress.trim());
            });
        });

        return okbData
            .filter(okbRow => {
                const address = okbRow['Юридический адрес']?.trim();
                // Is a potential client if it has coordinates AND is not in the active list
                return okbRow.lat && okbRow.lon && (!address || !activeAddresses.has(address));
            })
            .map(okbRow => ({
                key: `${okbRow.lat}-${okbRow.lon}-${okbRow['Наименование']}`,
                lat: okbRow.lat!,
                lon: okbRow.lon!,
                status: 'potential',
                name: okbRow['Наименование'] || 'Без названия',
                address: okbRow['Юридический адрес'] || 'Адрес не указан',
                type: okbRow['Вид деятельности'] || 'н/д'
            }));
    }, [allData, okbData]);


    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], region: [] });
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
        setFilters({ rm: '', brand: [], region: [] });
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
    }, []);
    
    const resetFilters = useCallback(() => {
        setFilters({ rm: '', brand: [], region: [] });
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

    useEffect(() => {
        setIsLoading(true);
        const timer = setTimeout(() => {
            const result = applyFilters(allData, filters);
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
                            disabled={!isDataLoaded || isLoading}
                        />
                    </aside>

                    <div className="lg:col-span-3 space-y-6">
                        <MetricsSummary metrics={summaryMetrics} okbStatus={okbStatus} disabled={!isDataLoaded || isLoading} />
                        
                        {okbStatus?.status === 'ready' && (
                             okbStatus.coordsCount !== undefined && okbStatus.coordsCount > 0 ? (
                                <GlobalMapView 
                                    activeRegions={activeRegions}
                                    potentialPoints={potentialPoints}
                                />
                            ) : (
                                <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
                                    <h2 className="text-xl font-bold mb-4 text-white">Карта торговых точек</h2>
                                    <div className="text-center py-10 text-gray-400">
                                        <p>В базе ОКБ не найдено точек с координатами.</p>
                                        <p className="text-sm mt-2">Убедитесь, что в вашей Google Таблице есть столбцы "Широта" и "Долгота", и они заполнены.</p>
                                    </div>
                                </div>
                            )
                        )}

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