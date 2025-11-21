import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import AuthPage from './components/Auth/AuthPage';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import type { FeatureCollection } from 'geojson';
import { SunIcon, MoonIcon, ArrowLeftIcon } from './components/icons';

delete (L.Icon.Default.prototype as any)._getIconUrl;

const LEAFLET_CDN_URL = 'https://aistudiocdn.com/leaflet@1.9.4/dist/images/';

L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${LEAFLET_CDN_URL}marker-icon-2x.png`,
    iconUrl: `${LEAFLET_CDN_URL}marker-icon.png`,
    shadowUrl: `${LEAFLET_CDN_URL}marker-shadow.png`,
});


const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

type ModalType = 'details' | 'clients' | 'unidentified';
type Theme = 'dark' | 'light';

// --- Main App Content Wrapper ---
const DashboardContent: React.FC = () => {
    const { user, logout } = useAuth();
    
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
    
    const processingQueue = useRef<Set<string>>(new Set());

    // Theme State
    const [theme, setTheme] = useState<Theme>('dark');

    useEffect(() => {
        if (theme === 'light') {
            document.documentElement.classList.add('light-mode');
        } else {
            document.documentElement.classList.remove('light-mode');
        }
    }, [theme]);

    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

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
        const activeAddressesSet = new Set(allActiveClients.map((c: MapPoint) => normalizeAddress(c.address)));
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
            setNotifications(prev => prev.filter((n: NotificationMessage) => n.id !== newNotification.id));
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
    }, [modalHistory]);

    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        setAllActiveClients(prev => {
            const exists = prev.some((c: MapPoint) => c.key === oldKey);
            if (exists) {
                return prev.map((c: MapPoint) => {
                    if (c.key === oldKey) {
                        return { ...newPoint, isGeocoding: newPoint.isGeocoding ?? c.isGeocoding };
                    }
                    return c;
                });
            } else {
                return [newPoint, ...prev];
            }
        });
    
        if (typeof originalIndex === 'number') {
            setUnidentifiedRows(prev => prev.filter(row => row.originalIndex !== originalIndex));
        }

        setAllData(prevData => {
            const newData = [...prevData];
            let wasUpdated = false;

            for (let i = 0; i < newData.length; i++) {
                const group = newData[i];
                const clientIndex = group.clients.findIndex((c: MapPoint) => c.key === oldKey || c.key === newPoint.key);
                
                if (clientIndex !== -1) {
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = { ...newPoint, isGeocoding: newPoint.isGeocoding };
                    
                    newData[i] = {
                        ...group,
                        clients: updatedClients,
                        fact: updatedClients.reduce((sum, c) => sum + (c.fact || 0), 0)
                    };
                    wasUpdated = true;
                    break; 
                }
            }

            if (!wasUpdated) {
                const targetGroupIndex = newData.findIndex(g => 
                    g.rm === newPoint.rm && 
                    g.brand === newPoint.brand && 
                    g.region === newPoint.region
                );

                if (targetGroupIndex !== -1) {
                    const group = newData[targetGroupIndex];
                    const updatedClients = [newPoint, ...group.clients];
                    newData[targetGroupIndex] = {
                        ...group,
                        clients: updatedClients,
                        fact: updatedClients.reduce((sum, c) => sum + (c.fact || 0), 0),
                        potential: group.potential + ((newPoint.fact || 0) * 1.2),
                    };
                } else {
                    const newGroup: AggregatedDataRow = {
                        key: `${newPoint.region}-${newPoint.brand}-${newPoint.rm}`.toLowerCase(),
                        rm: newPoint.rm,
                        brand: newPoint.brand,
                        region: newPoint.region,
                        city: newPoint.city,
                        clientName: `${newPoint.region} (${newPoint.brand})`,
                        fact: newPoint.fact || 0,
                        potential: (newPoint.fact || 0) * 1.2,
                        growthPotential: 0,
                        growthPercentage: 0,
                        clients: [newPoint],
                        potentialClients: []
                    };
                    newData.unshift(newGroup);
                }
            }
            return newData;
        });

        setEditingClient(prev => {
            if (!prev) return prev;
            if ((prev as MapPoint).key === oldKey) {
                 return { ...newPoint, isGeocoding: newPoint.isGeocoding };
            }
            if ((prev as UnidentifiedRow).originalIndex === originalIndex) {
                 return { ...newPoint, isGeocoding: newPoint.isGeocoding };
            }
            return prev;
        });

    }, []);

    const MAX_POLL_TIME = 48 * 60 * 60 * 1000; 

    const pollSheetForCoordinates = useCallback(async (rmName: string, address: string, tempKey: string, basePoint: MapPoint, originalIndex?: number) => {
        const processKey = `${rmName}-${address}`;
        if (processingQueue.current.has(processKey)) return;
        processingQueue.current.add(processKey);

        const startTime = Date.now();

        fetch(`/api/geocode?address=${encodeURIComponent(address)}`)
            .then(res => res.ok ? res.json() : null)
            .then(coords => {
                if (coords) {
                     fetch('/api/update-coords', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ rmName, updates: [{ address, lat: coords.lat, lon: coords.lon }] })
                    }).catch(console.error);
                }
            }).catch(console.error);


        const check = async () => {
            try {
                if (Date.now() - startTime > MAX_POLL_TIME) {
                    throw new Error('Timeout waiting for coordinates');
                }

                const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(address)}`);
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.lat && data.lon) {
                        const finalPoint = { 
                            ...basePoint, 
                            lat: data.lat, 
                            lon: data.lon, 
                            isGeocoding: false 
                        };
                        handleDataUpdate(tempKey, finalPoint, originalIndex);
                        addNotification(`Координаты получены из таблицы: ${address}`, 'success');
                        processingQueue.current.delete(processKey);
                        return;
                    }
                }
                
                setTimeout(check, 5000);

            } catch (e) {
                console.error("Polling stopped:", e);
                const failedPoint = { ...basePoint, isGeocoding: false };
                handleDataUpdate(tempKey, failedPoint, originalIndex);
                addNotification(`Время ожидания координат истекло: ${address}`, 'error');
                processingQueue.current.delete(processKey);
            }
        };

        check();

    }, [handleDataUpdate, addNotification]);


    const handleClientDelete = useCallback((keyToDelete: string) => {
        setAllActiveClients(prev => prev.filter((c: MapPoint) => c.key !== keyToDelete));
        setUnidentifiedRows(prev => prev.filter(row => {
            const originalAddress = findAddressInRow(row.rowData);
            return normalizeAddress(originalAddress) !== keyToDelete;
        }));
        setAllData(prevData => {
            return prevData.map(group => {
                const clientIndex = group.clients.findIndex((c: MapPoint) => c.key === keyToDelete);
                if (clientIndex !== -1) {
                    const clientFact = group.clients[clientIndex].fact || 0;
                    return {
                        ...group,
                        clients: group.clients.filter((c: MapPoint) => c.key !== keyToDelete),
                        fact: Math.max(0, group.fact - clientFact)
                    };
                }
                return group;
            }).filter(group => group.clients.length > 0);
        });
        
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
    const isAnyModalOpen = isDetailsModalOpen || isClientsModalOpen || isUnidentifiedModalOpen || isEditModalOpen;

    return (
        <div className="bg-primary-dark min-h-screen text-text-main font-sans transition-colors duration-300">
            <main className={`max-w-screen-2xl mx-auto space-y-6 p-4 lg:p-6 transition-all duration-300 ${isAnyModalOpen ? 'blur-sm pointer-events-none' : ''}`}>
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-text-main tracking-tight">Аналитическая панель "Потенциал Роста"</h1>
                        <p className="text-text-muted mt-1">Инструмент для анализа и визуализации данных по продажам</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold text-white">{user?.name}</p>
                            <p className="text-xs text-text-muted">{user?.email}</p>
                        </div>
                        <button 
                            onClick={logout}
                            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-gray-700"
                        >
                            Выйти
                        </button>
                    </div>
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
                            theme={theme}
                            onToggleTheme={toggleTheme}
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
                {notifications.map((n: NotificationMessage) => (
                    <Notification key={n.id} message={n.message} type={n.type} />
                ))}
            </div>

            <DetailsModal 
                isOpen={isDetailsModalOpen} 
                onClose={() => setIsDetailsModalOpen(false)}
                data={selectedDetailsRow}
                okbStatus={okbStatus}
                onStartEdit={(client: MapPoint) => handleStartEdit(client, 'details')}
            />
            <ClientsListModal 
                isOpen={isClientsModalOpen} 
                onClose={() => setIsClientsModalOpen(false)}
                clients={filteredActiveClients}
                onClientSelect={handleClientSelectFromModal}
                onStartEdit={(client: MapPoint) => handleStartEdit(client, 'clients')}
            />
            <UnidentifiedRowsModal
                isOpen={isUnidentifiedModalOpen}
                onClose={() => setIsUnidentifiedModalOpen(false)}
                rows={unidentifiedRows}
                onStartEdit={(row: UnidentifiedRow) => handleStartEdit(row, 'unidentified')}
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
                onStartPolling={pollSheetForCoordinates}
                onDelete={handleClientDelete}
                globalTheme={theme}
            />
        </div>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <AppContainer />
        </AuthProvider>
    );
}

const AppContainer: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-primary-dark flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-accent"></div>
            </div>
        );
    }

    if (!user) {
        return <AuthPage />;
    }

    return <DashboardContent />;
};

export default App;