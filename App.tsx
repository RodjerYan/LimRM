
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import L from 'leaflet';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome'; 

// Existing components needed for AMP module
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
import InteractiveRegionMap from './components/InteractiveRegionMap';
import RMDashboard from './components/RMDashboard'; 
import RMAnalysisModal from './components/RMAnalysisModal'; 

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
    RMMetrics
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import { TargetIcon } from './components/icons';

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

const App: React.FC = () => {
    if (!isApiKeySet) {
        return <ApiKeyErrorDisplay />;
    }

    // --- GPS-Enterprise State ---
    const [activeModule, setActiveModule] = useState('adapta'); // adapta, amp, dashboard, prophet, agile, roi-genome

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
    // RMDashboard is now also a main view, but state kept for modal usage if needed or legacy
    const [isRMDashboardOpen, setIsRMDashboardOpen] = useState(false);
    const [modalHistory, setModalHistory] = useState<ModalType[]>([]);
    
    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);

    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{ [key: string]: number } | null>(null);
    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    
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
        if (flyToClientKey) {
            const timer = setTimeout(() => setFlyToClientKey(null), 500);
            return () => clearTimeout(timer);
        }
    }, [flyToClientKey]);

    const handleFileProcessed = useCallback((data: WorkerResultPayload) => {
        setAllData(data.aggregatedData);
        setAllActiveClients(data.plottableActiveClients);
        setUnidentifiedRows(data.unidentifiedRows);
        setOkbRegionCounts(data.okbRegionCounts);
        setFilters({ rm: '', brand: [], region: [] });
        addNotification(`Данные загружены. ${data.aggregatedData.length} групп, ${data.plottableActiveClients.length} активных точек.`, 'success');
        if (data.unidentifiedRows.length > 0) {
            addNotification(`${data.unidentifiedRows.length} неопознанных записей помечено в ADAPTA.`, 'info');
        }
        // Auto-switch to Analytics if data loaded
        setActiveModule('amp');
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

    // Improved data update handler
    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        setAllActiveClients(prev => {
            const exists = prev.some(c => c.key === oldKey);
            if (exists) {
                return prev.map(c => c.key === oldKey ? { ...newPoint, isGeocoding: newPoint.isGeocoding ?? c.isGeocoding } : c);
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
                const clientIndex = group.clients.findIndex(c => c.key === oldKey || c.key === newPoint.key);
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
                const targetGroupIndex = newData.findIndex(g => g.rm === newPoint.rm && g.brand === newPoint.brand && g.region === newPoint.region);
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
            if ((prev as MapPoint).key === oldKey || (prev as UnidentifiedRow).originalIndex === originalIndex) {
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
                if (Date.now() - startTime > MAX_POLL_TIME) throw new Error('Timeout waiting for coordinates');
                const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(address)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.lat && data.lon) {
                        const finalPoint = { ...basePoint, lat: data.lat, lon: data.lon, isGeocoding: false };
                        handleDataUpdate(tempKey, finalPoint, originalIndex);
                        addNotification(`Coordinates resolved: ${address}`, 'success');
                        processingQueue.current.delete(processKey);
                        return;
                    }
                }
                setTimeout(check, 5000);
            } catch (e) {
                console.error("Polling stopped:", e);
                const failedPoint = { ...basePoint, isGeocoding: false };
                handleDataUpdate(tempKey, failedPoint, originalIndex);
                addNotification(`Geocoding timeout: ${address}`, 'error');
                processingQueue.current.delete(processKey);
            }
        };
        check();
    }, [handleDataUpdate, addNotification]);

    const handleClientDelete = useCallback((keyToDelete: string) => {
        setAllActiveClients(prev => prev.filter(c => c.key !== keyToDelete));
        setUnidentifiedRows(prev => prev.filter(row => {
            const originalAddress = findAddressInRow(row.rowData);
            return normalizeAddress(originalAddress) !== keyToDelete;
        }));
        setAllData(prevData => {
            return prevData.map(group => {
                const clientIndex = group.clients.findIndex(c => c.key === keyToDelete);
                if (clientIndex !== -1) {
                    const clientFact = group.clients[clientIndex].fact || 0;
                    return {
                        ...group,
                        clients: group.clients.filter(c => c.key !== keyToDelete),
                        fact: Math.max(0, group.fact - clientFact)
                    };
                }
                return group;
            }).filter(group => group.clients.length > 0);
        });
        setIsEditModalOpen(false);
        setModalHistory([]);
        addNotification('Record deleted.', 'success');
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

    // --- RENDER CONTENT BASED ON ACTIVE TAB ---
    const renderContent = () => {
        switch (activeModule) {
            case 'adapta':
                return (
                    <Adapta 
                        onFileProcessed={handleFileProcessed}
                        onProcessingStateChange={handleProcessingStateChange}
                        okbData={okbData}
                        okbStatus={okbStatus}
                        onOkbStatusChange={handleOkbStatusChange}
                        onOkbDataChange={setOkbData}
                        disabled={isControlPanelLocked}
                        unidentifiedCount={unidentifiedRows.length}
                        activeClientsCount={allActiveClients.length}
                        uploadedData={allData} 
                    />
                );
            case 'dashboard':
                return (
                    <RMDashboard 
                        isOpen={true} // Always open when in this view
                        onClose={() => setActiveModule('amp')} 
                        data={filteredData}
                        okbRegionCounts={okbRegionCounts}
                        okbData={okbData}
                        mode="page"
                        metrics={summaryMetrics}
                        okbStatus={okbStatus}
                        onActiveClientsClick={() => setIsClientsModalOpen(true)}
                        onEditClient={(client) => handleStartEdit(client, 'clients')}
                    />
                );
            case 'prophet':
                return <Prophet summaryMetrics={summaryMetrics} />;
            case 'agile':
                return <AgileLearning data={allData} />;
            case 'roi-genome':
                return <RoiGenome data={allData} />;
            case 'amp':
            default:
                return (
                    <div className="grid grid-cols-1 gap-6 items-start animate-fade-in">
                        <div className="col-span-1 space-y-6">
                            <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">AMP <span className="text-gray-500 font-normal text-lg">/ Аналитика</span></h2>
                                    <p className="text-gray-400 text-sm mt-1">Построение многомерных моделей, выявление драйверов роста. Holistic (целостное) моделирование.</p>
                                </div>
                            </div>

                            {/* Changed order: Map first, then Filters */}
                            
                            <InteractiveRegionMap 
                                data={filteredData} 
                                selectedRegions={filters.region} 
                                potentialClients={potentialClients}
                                activeClients={filteredActiveClients}
                                flyToClientKey={flyToClientKey}
                                theme={theme}
                                onToggleTheme={toggleTheme}
                                onEditClient={(client) => handleStartEdit(client, 'clients')}
                            />

                            <Filters
                                options={filterOptions}
                                currentFilters={filters}
                                onFilterChange={handleFilterChange}
                                onReset={resetFilters}
                                disabled={!isDataLoaded || isLoading}
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
                );
        }
    };

    return (
        <div className="bg-primary-dark min-h-screen text-text-main font-sans transition-colors duration-300 flex">
            {/* SIDEBAR NAVIGATION */}
            <Navigation activeTab={activeModule} onTabChange={setActiveModule} />

            {/* MAIN CONTENT AREA - Shifted right due to fixed sidebar */}
            <main className={`flex-1 ml-0 lg:ml-64 p-4 lg:p-8 transition-all duration-300 ${isAnyModalOpen ? 'blur-sm pointer-events-none' : ''}`}>
                {renderContent()}
            </main>

            <div className="fixed bottom-4 right-4 z-[100] space-y-3 w-full max-w-sm pointer-events-none">
                <div className="pointer-events-auto space-y-3">
                    {notifications.map(n => (
                        <Notification key={n.id} message={n.message} type={n.type} />
                    ))}
                </div>
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
                onStartPolling={pollSheetForCoordinates}
                onDelete={handleClientDelete}
                globalTheme={theme}
            />
            
            {/* Retain Modal version if needed, but main access is via sidebar now */}
            <RMDashboard 
                isOpen={isRMDashboardOpen} 
                onClose={() => setIsRMDashboardOpen(false)} 
                data={filteredData}
                okbRegionCounts={okbRegionCounts}
                okbData={okbData}
                mode="modal" 
            />
        </div>
    );
};

export default App;
