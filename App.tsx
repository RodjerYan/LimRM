import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import ResultsTable from './components/ResultsTable';
import PotentialChart from './components/PotentialChart';
import DetailsModal from './components/DetailsModal';
import ClientsListModal from './components/ClientsListModal';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import OKBManagement from './components/OKBManagement';
import FileUpload from './components/FileUpload';
import InteractiveRegionMap from './components/InteractiveRegionMap'; 
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
} from './types';
// FIX: Use findAddressInRow and the new normalizeAddress for consistency
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import type { FeatureCollection } from 'geojson';

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
    const [isClientsModalOpen, setIsClientsModalOpen] = useState(false);
    const [selectedRow, setSelectedRow] = useState<AggregatedDataRow | null>(null);
    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [plottableActiveClients, setPlottableActiveClients] = useState<MapPoint[]>([]);
    const [conflictZones, setConflictZones] = useState<FeatureCollection | null>(null);
    
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], region: [] });
    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    
    const isDataLoaded = allData.length > 0;

    const filteredActiveClients = useMemo(() => {
        if (!isDataLoaded) return [];
        return plottableActiveClients.filter(client => {
            const rmMatch = !filters.rm || client.rm === filters.rm;
            const brandMatch = filters.brand.length === 0 || filters.brand.includes(client.brand);
            const regionMatch = filters.region.length === 0 || filters.region.includes(client.region);
            return rmMatch && brandMatch && regionMatch;
        });
    }, [plottableActiveClients, filters, isDataLoaded]);

    const summaryMetrics = useMemo<SummaryMetrics | null>(() => {
        if (!isDataLoaded) {
            return null;
        }

        const baseMetrics = calculateSummaryMetrics(filteredData);
        
        const defaultMetrics = {
            totalFact: 0,
            totalPotential: 0,
            totalGrowth: 0,
            totalClients: 0,
            totalActiveClients: 0,
            averageGrowthPercentage: 0,
            topPerformingRM: { name: 'N/A', value: 0 },
        };
        
        return {
            ...(baseMetrics || defaultMetrics),
            totalActiveClients: filteredActiveClients.length,
        };
    }, [filteredData, filteredActiveClients, isDataLoaded]);

    const potentialClients = useMemo(() => {
        if (!okbData.length) return []; // Return empty array instead of original data
        const activeAddressesSet = new Set(plottableActiveClients.map(c => normalizeAddress(c.address)));
        return okbData.filter(okb => {
            const address = findAddressInRow(okb);
            const normalizedAddress = normalizeAddress(address);
            return !activeAddressesSet.has(normalizedAddress);
        });
    }, [okbData, plottableActiveClients]);
    
    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
        }, 5000);
    }, []);

    // Fetch conflict zones on initial load
    useEffect(() => {
        const fetchConflictZones = async () => {
            try {
                const response = await fetch('/api/get-conflict-zones');
                if (!response.ok) {
                    throw new Error('Не удалось загрузить данные о зонах конфликта.');
                }
                const data: FeatureCollection = await response.json();
                setConflictZones(data);
                addNotification('Слой с зонами повышенной опасности успешно загружен.', 'info');
            } catch (error) {
                console.error(error);
                addNotification((error as Error).message, 'error');
            }
        };

        fetchConflictZones();
    }, [addNotification]);
    
    useEffect(() => {
        if (flyToClientKey) {
            // Reset the key after a moment so the user can click the same client again.
            const timer = setTimeout(() => setFlyToClientKey(null), 500);
            return () => clearTimeout(timer);
        }
    }, [flyToClientKey]);

    const handleFileProcessed = useCallback((data: WorkerResultPayload) => {
        setAllData(data.aggregatedData);
        setPlottableActiveClients(data.plottableActiveClients);
        setFilters({ rm: '', brand: [], region: [] });
        addNotification(`Данные успешно загружены. Найдено ${data.aggregatedData.length} уникальных групп.`, 'success');
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

    const handleClientSelectOnMap = (client: MapPoint) => {
        setIsClientsModalOpen(false);
        // Use a short delay to allow the modal to close before the map starts moving.
        setTimeout(() => {
            setFlyToClientKey(client.key);
        }, 300);
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

    const isControlPanelLocked = isLoading;

    return (
        <div className="bg-primary-dark min-h-screen text-slate-200 font-sans">
            <main className={`max-w-screen-2xl mx-auto space-y-6 p-4 lg:p-6 transition-all duration-300 ${isModalOpen || isClientsModalOpen ? 'blur-sm pointer-events-none' : ''}`}>
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
                        <MetricsSummary 
                            metrics={summaryMetrics} 
                            okbStatus={okbStatus} 
                            disabled={!isDataLoaded || isLoading}
                            onActiveClientsClick={() => setIsClientsModalOpen(true)}
                        />
                        
                        <InteractiveRegionMap 
                            data={filteredData} 
                            selectedRegions={filters.region} 
                            potentialClients={potentialClients}
                            activeClients={plottableActiveClients}
                            conflictZones={conflictZones}
                            flyToClientKey={flyToClientKey}
                        />

                        <ResultsTable data={filteredData} onRowClick={handleRowClick} disabled={!isDataLoaded || isLoading} />
                        {filteredData.length > 0 && <PotentialChart data={filteredData} />}
                    </div>
                </div>
            </main>
            <div className="fixed bottom-4 right-4 z-50 space-y-3 w-full max-w-sm">
                {notifications.map(n => (
                    <Notification key={n.id} message={n.message} type={n.type} />
                ))}
            </div>

            <DetailsModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)}
                data={selectedRow}
                okbStatus={okbStatus}
            />
            <ClientsListModal 
                isOpen={isClientsModalOpen} 
                onClose={() => setIsClientsModalOpen(false)}
                clients={filteredActiveClients}
                onClientSelect={handleClientSelectOnMap}
            />
        </div>
    );
};

export default App;