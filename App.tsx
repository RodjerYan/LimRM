import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    UnidentifiedRow,
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import { WarningIcon } from './components/icons';
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
    
    // Modal States
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isClientsModalOpen, setIsClientsModalOpen] = useState(false);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);

    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [conflictZones, setConflictZones] = useState<FeatureCollection | null>(null);
    
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], region: [] });
    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    
    const isDataLoaded = allData.length > 0;

    const filteredActiveClients = useMemo(() => {
        if (!isDataLoaded) return [];
        return allActiveClients.filter(client => {
            const rmMatch = !filters.rm || client.rm === filters.rm;
            const brandMatch = filters.brand.length === 0 || filters.brand.includes(client.brand);
            const regionMatch = filters.region.length === 0 || filters.region.includes(client.region);
            return rmMatch && brandMatch && regionMatch;
        });
    }, [allActiveClients, filters, isDataLoaded]);

    const summaryMetrics = useMemo<SummaryMetrics | null>(() => {
        if (!isDataLoaded) {
            return null;
        }
        const baseMetrics = calculateSummaryMetrics(filteredData);
        
        if (!baseMetrics) {
            return {
                totalFact: 0,
                totalPotential: 0,
                totalGrowth: 0,
                totalClients: 0,
                totalActiveClients: 0,
                averageGrowthPercentage: 0,
                topPerformingRM: { name: 'N/A', value: 0 },
            };
        }
        
        return {
            ...baseMetrics,
            totalActiveClients: filteredActiveClients.length
        };
    }, [filteredData, isDataLoaded, filteredActiveClients]);

    const potentialClients = useMemo(() => {
        if (!okbData.length) return [];
        const activeAddressesSet = new Set(allActiveClients.map(c => normalizeAddress(c.address)));
        return okbData.filter(okb => {
            const address = findAddressInRow(okb);
            const normalizedAddress = normalizeAddress(address);
            return !activeAddressesSet.has(normalizedAddress);
        });
    }, [okbData, allActiveClients]);
    
    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
        }, 5000);
    }, []);

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
            const timer = setTimeout(() => setFlyToClientKey(null), 500);
            return () => clearTimeout(timer);
        }
    }, [flyToClientKey]);

    const handleFileProcessed = useCallback((data: WorkerResultPayload) => {
        setAllData(data.aggregatedData);
        setAllActiveClients(data.plottableActiveClients);
        setUnidentifiedRows(data.unidentifiedRows);
        setFilters({ rm: '', brand: [], region: [] });
        addNotification(`Данные успешно загружены. Найдено ${data.aggregatedData.length} групп и ${data.plottableActiveClients.length} клиентов.`, 'success');
        if (data.unidentifiedRows.length > 0) {
            addNotification(`Обнаружено ${data.unidentifiedRows.length} строк с неопределенными адресами.`, 'info');
        }
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
        setSelectedDetailsRow(row);
        setIsDetailsModalOpen(true);
    }, []);
    
    const flyToClient = useCallback((client: MapPoint) => {
        setTimeout(() => {
            setFlyToClientKey(client.key);
        }, 100);
        
        const mapElement = document.getElementById('interactive-map-container');
        mapElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    const handleStartEdit = useCallback((data: MapPoint | UnidentifiedRow) => {
        // Close other modals before opening the edit one
        setIsClientsModalOpen(false);
        setIsDetailsModalOpen(false);
        setIsUnidentifiedModalOpen(false);
        setEditingClient(data);
        setIsEditModalOpen(true);
    }, []);

    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint) => {
        // This function handles both creating new points from unidentified rows
        // and updating existing points, without closing the modal.
        setAllActiveClients(prev => {
            const existingIndex = prev.findIndex(c => c.key === oldKey);
            if (existingIndex > -1) {
                const newClients = [...prev];
                newClients[existingIndex] = newPoint;
                return newClients;
            } else {
                return [...prev, newPoint];
            }
        });
    
        // If the edited item was an unidentified row, remove it from that list.
        setUnidentifiedRows(prev => prev.filter(row => {
            const originalAddress = findAddressInRow(row.rowData);
            return normalizeAddress(originalAddress) !== oldKey;
        }));
        
        addNotification('Данные успешно обновлены в фоновом режиме!', 'success');
    }, [addNotification]);
    
    const handleOkbStatusChange = (status: OkbStatus) => {
        setOkbStatus(status);
        if (status.status === 'ready' && status.message) addNotification(status.message, 'success');
        if (status.status === 'error' && status.message) addNotification(status.message, 'error');
    };
    
    const handleClientSelectFromModal = useCallback((client: MapPoint) => {
        setIsClientsModalOpen(false);
        flyToClient(client);
    }, [flyToClient]);
    
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
    const isAnyModalOpen = isDetailsModalOpen || isClientsModalOpen || isUnidentifiedModalOpen || isEditModalOpen;

    return (
        <div className="bg-primary-dark min-h-screen text-slate-200 font-sans">
            <main className={`max-w-screen-2xl mx-auto space-y-6 p-4 lg:p-6 transition-all duration-300 ${isAnyModalOpen ? 'blur-sm pointer-events-none' : ''}`}>
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Аналитическая панель "Потенциал Роста"</h1>
                        <p className="text-slate-400 mt-1">Инструмент для анализа и визуализации данных по продажам</p>
                    </div>
                     {unidentifiedRows.length > 0 && !isControlPanelLocked && (
                        <button
                            onClick={() => setIsUnidentifiedModalOpen(true)}
                            className="bg-danger/80 hover:bg-danger text-white font-bold py-2 px-4 rounded-lg transition duration-200 flex items-center gap-2 animate-pulse flex-shrink-0"
                            title="Нажмите, чтобы исправить адреса, которые не удалось распознать"
                        >
                            <WarningIcon/>
                            <span>Неопределенные адреса ({unidentifiedRows.length})</span>
                        </button>
                    )}
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
                            activeClients={filteredActiveClients}
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

            {/* FIX: Removed `onAddressUpdate` prop and ensured `onStartEdit` is correctly passed to handle the new editing flow. */}
            <DetailsModal 
                isOpen={isDetailsModalOpen} 
                onClose={() => setIsDetailsModalOpen(false)}
                data={selectedDetailsRow}
                okbStatus={okbStatus}
                onStartEdit={handleStartEdit}
            />
            {/* FIX: Removed `onAddressUpdate` prop and ensured `onStartEdit` is correctly passed. */}
            <ClientsListModal 
                isOpen={isClientsModalOpen} 
                onClose={() => setIsClientsModalOpen(false)}
                clients={filteredActiveClients}
                onClientSelect={handleClientSelectFromModal}
                onStartEdit={handleStartEdit}
            />
            {/* FIX: Corrected props for UnidentifiedRowsModal, passing `onStartEdit` instead of inline editing handlers. */}
            <UnidentifiedRowsModal
                isOpen={isUnidentifiedModalOpen}
                onClose={() => setIsUnidentifiedModalOpen(false)}
                rows={unidentifiedRows}
                onStartEdit={handleStartEdit}
            />
             <AddressEditModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                data={editingClient}
                onDataUpdate={handleDataUpdate}
            />
        </div>
    );
};

export default App;