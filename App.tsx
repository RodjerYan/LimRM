import React, { useState, useEffect, useCallback, useMemo } from 'react';
import L from 'leaflet';
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
import RMDashboard from './components/RMDashboard';
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
import { WarningIcon, ChartBarIcon } from './components/icons';
import type { FeatureCollection } from 'geojson';

// FIX: Manually set the paths for Leaflet's default icons to point to the correct CDN URL.
// This resolves the "broken image" issue for markers across the application.
delete (L.Icon.Default.prototype as any)._getIconUrl;

const LEAFLET_CDN_URL = 'https://aistudiocdn.com/leaflet@1.9.4/dist/images/';

L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${LEAFLET_CDN_URL}marker-icon-2x.png`,
    iconUrl: `${LEAFLET_CDN_URL}marker-icon.png`,
    shadowUrl: `${LEAFLET_CDN_URL}marker-shadow.png`,
});


const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

type ModalType = 'details' | 'clients' | 'unidentified' | 'rm_dashboard';

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
    const [isRMDashboardOpen, setIsRMDashboardOpen] = useState(false);
    const [modalHistory, setModalHistory] = useState<ModalType[]>([]);
    
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

    const handleStartEdit = useCallback((data: MapPoint | UnidentifiedRow, source: ModalType) => {
        setModalHistory(prev => [...prev, source]);
        
        if (source === 'details') setIsDetailsModalOpen(false);
        if (source === 'clients') setIsClientsModalOpen(false);
        if (source === 'unidentified') setIsUnidentifiedModalOpen(false);
        if (source === 'rm_dashboard') setIsRMDashboardOpen(false);
        
        setEditingClient(data);
        setIsEditModalOpen(true);
    }, []);

    const handleGoBackFromEdit = useCallback(() => {
        const lastModal = modalHistory[modalHistory.length - 1];
        setModalHistory(prev => prev.slice(0, -1));
        setIsEditModalOpen(false);
    
        if (lastModal === 'details') setIsDetailsModalOpen(true);
        if (lastModal === 'clients') setIsClientsModalOpen(true);
        if (lastModal === 'unidentified') setIsUnidentifiedModalOpen(true);
        if (lastModal === 'rm_dashboard') setIsRMDashboardOpen(true);
    }, [modalHistory]);

    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint) => {
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
    
        setUnidentifiedRows(prev => prev.filter(row => {
            const originalAddress = findAddressInRow(row.rowData);
            return normalizeAddress(originalAddress) !== oldKey;
        }));
        
        addNotification('Данные успешно обновлены в фоновом режиме!', 'success');
    }, [addNotification]);

    const handleClientDelete = useCallback((keyToDelete: string) => {
        setAllActiveClients(prev => prev.filter(c => c.key !== keyToDelete));
        
        setUnidentifiedRows(prev => prev.filter(row => {
            const originalAddress = findAddressInRow(row.rowData);
            return normalizeAddress(originalAddress) !== keyToDelete;
        }));
        
        setIsEditModalOpen(false);
        setModalHistory([]);
        addNotification('Строка успешно удалена.', 'success');
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
    const isAnyModalOpen = isDetailsModalOpen || isClientsModalOpen || isUnidentifiedModalOpen || isEditModalOpen || isRMDashboardOpen;

    return (
        <div className="bg-primary-dark min-h-screen text-slate-200 font-sans">
            <main className={`max-w-screen-2xl mx-auto space-y-6 p-4 lg:p-6 transition-all duration-300 ${isAnyModalOpen ? 'blur-sm pointer-events-none' : ''}`}>
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Аналитическая панель "Потенциал Роста"</h1>
                        <p className="text-slate-400 mt-1">Инструмент для анализа и визуализации данных по продажам</p>
                    </div>
                    {isDataLoaded && (
                        <button
                            onClick={() => setIsRMDashboardOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200 flex items-center gap-2 shadow-lg border border-indigo-500/30"
                        >
                            <ChartBarIcon />
                            Рейтинг РМ
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

                        <ResultsTable 
                            data={filteredData} 
                            onRowClick={handleRowClick} 
                            disabled={!isDataLoaded || isLoading}
                            unidentifiedRowsCount={unidentifiedRows.length}
                            onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)}
                        />
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
                isOpen={isDetailsModalOpen} 
                onClose={() => setIsDetailsModalOpen(false)}
                data={selectedDetailsRow}
                okbStatus={okbStatus}
                onStartEdit={(client) => handleStartEdit(client, 'details')}
            />
            <ClientsListModal 
                isOpen={isClientsModalOpen} 
                onClose={() => setIsClientsModalOpen(false)}
                clients={filteredActiveClients}
                onClientSelect={handleClientSelectFromModal}
                onStartEdit={(client) => handleStartEdit(client, 'clients')}
            />
            <UnidentifiedRowsModal
                isOpen={isUnidentifiedModalOpen}
                onClose={() => setIsUnidentifiedModalOpen(false)}
                rows={unidentifiedRows}
                onStartEdit={(row) => handleStartEdit(row, 'unidentified')}
            />
             <AddressEditModal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setModalHistory([]);
                }}
                onBack={handleGoBackFromEdit}
                data={editingClient}
                onDataUpdate={handleDataUpdate}
                onDelete={handleClientDelete}
            />
            <RMDashboard 
                isOpen={isRMDashboardOpen}
                onClose={() => setIsRMDashboardOpen(false)}
                data={filteredData}
            />
        </div>
    );
};

export default App;