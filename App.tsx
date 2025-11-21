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
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress, findValueInRow } from './utils/dataUtils';
import type { FeatureCollection } from 'geojson';

delete (L.Icon.Default.prototype as any)._getIconUrl;

const LEAFLET_CDN_URL = 'https://aistudiocdn.com/leaflet@1.9.4/dist/images/';

L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${LEAFLET_CDN_URL}marker-icon-2x.png`,
    iconUrl: `${LEAFLET_CDN_URL}marker-icon.png`,
    shadowUrl: `${LEAFLET_CDN_URL}marker-shadow.png`,
});


const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

type ModalType = 'details' | 'clients' | 'unidentified';

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

    // Update filteredData whenever allData or filters change
    useEffect(() => {
        setFilteredData(applyFilters(allData, filters));
    }, [allData, filters]);

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

    // --- FULL SYNCHRONIZATION LOGIC ---
    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        
        // 1. Update the flat list of active clients (used for Map and List Modal)
        setAllActiveClients(prev => {
            const exists = prev.some(c => c.key === oldKey);
            if (exists) {
                return prev.map(c => {
                    // Replace the old client object entirely with the new one
                    if (c.key === oldKey) {
                        return { ...newPoint, isGeocoding: newPoint.isGeocoding ?? c.isGeocoding };
                    }
                    return c;
                });
            } else {
                // It's a new client (e.g., from Unidentified list)
                return [newPoint, ...prev];
            }
        });
    
        // 2. Remove from Unidentified Rows if applicable
        if (typeof originalIndex === 'number') {
            setUnidentifiedRows(prev => prev.filter(row => row.originalIndex !== originalIndex));
        }

        // 3. Update Aggregated Data (Grouped Rows in Main Table)
        setAllData(prevData => {
            const nextData = [...prevData];
            
            // Step A: Find the client in ANY existing group and remove it.
            // We need to search all groups because changing address might change the grouping key.
            // Also, we need to find which group was modified to update the UI.
            let oldGroupIndex = -1;
            let oldGroupRef: AggregatedDataRow | null = null;

            for (let i = 0; i < nextData.length; i++) {
                const group = nextData[i];
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                
                if (clientIndex !== -1) {
                    oldGroupIndex = i;
                    oldGroupRef = group;
                    
                    const clientFact = group.clients[clientIndex].fact || 0;
                    const newClientsList = [...group.clients];
                    newClientsList.splice(clientIndex, 1); // Remove
                    
                    if (newClientsList.length === 0) {
                        // Mark group for deletion
                        nextData[i] = null as any;
                    } else {
                        // Update metrics for the old group
                        const newFact = Math.max(0, group.fact - clientFact);
                        const newGrowth = Math.max(0, group.potential - newFact);
                        
                        nextData[i] = {
                            ...group,
                            clients: newClientsList,
                            fact: newFact,
                            growthPotential: newGrowth,
                            growthPercentage: group.potential > 0 ? (newGrowth / group.potential) * 100 : 0
                        };
                    }
                    break; // Found the client, stop searching
                }
            }

            // Clean up deleted groups
            const cleanedData = nextData.filter(Boolean);

            // Step B: Determine where the client SHOULD go (New Grouping Key)
            // The key depends on Region, Brand, RM. If any changed, it moves groups.
            const targetKey = `${newPoint.region}-${newPoint.brand}-${newPoint.rm}`.toLowerCase();
            const targetGroupIndex = cleanedData.findIndex(g => g.key === targetKey);

            let updatedGroupRef: AggregatedDataRow;

            if (targetGroupIndex !== -1) {
                // Add to existing group
                const group = cleanedData[targetGroupIndex];
                const updatedClients = [newPoint, ...group.clients]; // Prepend new/updated client
                
                // Recalculate metrics
                const newFact = group.fact + (newPoint.fact || 0);
                const newGrowth = Math.max(0, group.potential - newFact);
                
                // --- DYNAMIC RENAMING ---
                // If this group has only 1 client (the one we just edited/added),
                // update the group name to match that client.
                // This ensures the Table Row Name updates when the address updates.
                let newClientName = group.clientName;
                if (updatedClients.length === 1) {
                    newClientName = (newPoint.name && newPoint.name !== 'Без названия') ? newPoint.name : newPoint.address;
                }

                updatedGroupRef = {
                    ...group,
                    clientName: newClientName,
                    city: newPoint.city !== 'Город не определен' ? newPoint.city : group.city, // Update city if better
                    clients: updatedClients,
                    fact: newFact,
                    growthPotential: newGrowth,
                    growthPercentage: group.potential > 0 ? (newGrowth / group.potential) * 100 : 0
                };
                
                cleanedData[targetGroupIndex] = updatedGroupRef;

            } else {
                // Create a NEW Group
                const displayName = (newPoint.name && newPoint.name !== 'Без названия') ? newPoint.name : newPoint.address;
                const newPotential = (newPoint.fact || 0) * 1.15;
                const newGrowth = Math.max(0, newPotential - (newPoint.fact || 0));

                updatedGroupRef = {
                    key: targetKey,
                    rm: newPoint.rm,
                    brand: newPoint.brand,
                    region: newPoint.region,
                    city: newPoint.city,
                    clientName: displayName,
                    fact: newPoint.fact || 0,
                    potential: newPotential,
                    growthPotential: newGrowth,
                    growthPercentage: newPotential > 0 ? (newGrowth / newPotential) * 100 : 0,
                    clients: [newPoint],
                    potentialClients: []
                };
                cleanedData.unshift(updatedGroupRef);
            }

            // Step C: Synchronize the Open Details Modal
            // If the user has a modal open, we must update its data source.
            if (selectedDetailsRow) {
                // 1. If we are editing the client that belongs to the CURRENTLY OPEN group
                // We need to replace selectedDetailsRow with the updated version of that group.
                
                // Did the client move INTO the group we are looking at?
                if (selectedDetailsRow.key === targetKey) {
                    setSelectedDetailsRow(updatedGroupRef);
                }
                // Did the client move OUT OF the group we are looking at?
                else if (oldGroupRef && selectedDetailsRow.key === oldGroupRef.key) {
                    // Find the updated version of the old group in cleanedData
                    const oldGroupUpdated = cleanedData.find(g => g.key === oldGroupRef!.key);
                    if (oldGroupUpdated) {
                        setSelectedDetailsRow(oldGroupUpdated);
                    } else {
                        // Group was deleted (became empty). Show the NEW group instead, so the user isn't lost.
                        setSelectedDetailsRow(updatedGroupRef);
                    }
                }
            }

            return cleanedData;
        });

        // 4. Sync the editingClient state itself (so the modal reflects changes if kept open)
        setEditingClient(prev => {
            if (!prev) return prev;
            // Preserve the object type (MapPoint vs UnidentifiedRow) but update fields
            return { 
                ...prev, 
                ...newPoint, 
                key: newPoint.key // Ensure key is updated
            };
        });

    }, [selectedDetailsRow]); // Dependency needed to access current modal state

    const MAX_POLL_TIME = 48 * 60 * 60 * 1000; 

    const pollSheetForCoordinates = useCallback(async (rmName: string, address: string, tempKey: string, basePoint: MapPoint, originalIndex?: number) => {
        const processKey = `${rmName}-${address}`;
        if (processingQueue.current.has(processKey)) return;
        processingQueue.current.add(processKey);

        const startTime = Date.now();

        // Initiate backend geocoding via Nominatim (server-side proxy)
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
                        // Success!
                        const finalPoint = { 
                            ...basePoint, // Includes lastUpdated from initial save
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
                
                // Not found yet, continue polling
                setTimeout(check, 5000); // Check every 5 seconds

            } catch (e) {
                console.error("Polling error", e);
                processingQueue.current.delete(processKey);
            }
        };

        check();
    }, [handleDataUpdate, addNotification]);

    const handleDeleteAddress = useCallback((keyToDelete: string) => {
        // 1. Remove from Active Clients
        setAllActiveClients(prev => prev.filter(c => c.key !== keyToDelete));
        
        // 2. Remove from Aggregated Data
        setAllData(prevData => {
            const nextData = [...prevData];
            let found = false;
            for (let i = 0; i < nextData.length; i++) {
                const group = nextData[i];
                const clientIndex = group.clients.findIndex(c => c.key === keyToDelete);
                if (clientIndex !== -1) {
                    const removedFact = group.clients[clientIndex].fact || 0;
                    const newClients = [...group.clients];
                    newClients.splice(clientIndex, 1);
                    
                    if (newClients.length === 0) {
                        nextData[i] = null as any;
                    } else {
                        nextData[i] = {
                            ...group,
                            clients: newClients,
                            fact: Math.max(0, group.fact - removedFact),
                            growthPotential: Math.max(0, group.potential - (group.fact - removedFact))
                        };
                    }
                    found = true;
                    break;
                }
            }
            const cleaned = nextData.filter(Boolean);
            
            // If we deleted the client from the currently open details modal
            if (found && selectedDetailsRow) {
                const updatedGroup = cleaned.find(g => g.key === selectedDetailsRow.key);
                if (updatedGroup) {
                    setSelectedDetailsRow(updatedGroup);
                } else {
                    setIsDetailsModalOpen(false);
                }
            }
            return cleaned;
        });

        // 3. Close edit modal
        setIsEditModalOpen(false);
        
        // 4. Restore previous modal
        const lastModal = modalHistory[modalHistory.length - 1];
        setModalHistory(prev => prev.slice(0, -1));
        if (lastModal === 'details' && isDetailsModalOpen) setIsDetailsModalOpen(true); 
        if (lastModal === 'clients') setIsClientsModalOpen(true);
        if (lastModal === 'unidentified') setIsUnidentifiedModalOpen(true);

        addNotification('Адрес успешно удален.', 'info');
    }, [modalHistory, isDetailsModalOpen, selectedDetailsRow, addNotification]);


    return (
        <div className="min-h-screen bg-primary-dark text-white font-sans overflow-x-hidden">
            
            {/* Background Overlay */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px]"></div>
            </div>

            <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
                
                {/* Header */}
                <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-3 rounded-xl shadow-lg shadow-indigo-500/20">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"></path></svg>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Гео-Анализ Рынка</h1>
                            <p className="text-sm text-gray-400">Инструмент планирования продаж Limkorm</p>
                        </div>
                    </div>
                    
                    {/* Notification Container */}
                    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
                        {notifications.map(n => (
                            <Notification key={n.id} message={n.message} type={n.type} />
                        ))}
                    </div>
                </header>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* Left Sidebar: Controls */}
                    <div className="lg:col-span-3 space-y-8">
                        <DataControl 
                            onDataLoaded={handleFileProcessed}
                            onLoadingStateChange={handleProcessingStateChange}
                            onOkbStatusChange={setOkbStatus}
                            onOkbDataChange={setOkbData}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            disabled={isLoading}
                        />
                        <Filters 
                            options={filterOptions}
                            currentFilters={filters}
                            onFilterChange={handleFilterChange}
                            onReset={resetFilters}
                            disabled={!isDataLoaded}
                        />
                    </div>

                    {/* Right Content: Visualization & Data */}
                    <div className="lg:col-span-9 space-y-8">
                        <MetricsSummary 
                            metrics={summaryMetrics}
                            okbStatus={okbStatus}
                            disabled={!isDataLoaded}
                            onActiveClientsClick={() => setIsClientsModalOpen(true)}
                        />
                        
                        {/* Interactive Map */}
                        <InteractiveRegionMap
                            data={filteredData}
                            selectedRegions={filters.region}
                            potentialClients={potentialClients}
                            activeClients={filteredActiveClients}
                            conflictZones={conflictZones}
                            flyToClientKey={flyToClientKey}
                        />

                        <PotentialChart data={filteredData} />
                        
                        <ResultsTable 
                            data={filteredData}
                            onRowClick={handleRowClick}
                            disabled={!isDataLoaded}
                            unidentifiedRowsCount={unidentifiedRows.length}
                            onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)}
                        />
                    </div>
                </div>
            </div>

            {/* Modals */}
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
                onClientSelect={(client) => {
                    setIsClientsModalOpen(false);
                    flyToClient(client);
                }}
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
                onDelete={handleDeleteAddress}
            />

        </div>
    );
};

// Small wrapper component to fix the import issue in the original file structure
const DataControl: React.FC<{
    onDataLoaded: (data: WorkerResultPayload) => void;
    onLoadingStateChange: (isLoading: boolean, message: string) => void;
    onOkbStatusChange: (status: OkbStatus) => void;
    onOkbDataChange: (data: OkbDataRow[]) => void;
    okbData: OkbDataRow[];
    okbStatus: OkbStatus | null;
    disabled: boolean;
}> = (props) => {
    return (
        <div className="space-y-6">
            <OKBManagement 
                onStatusChange={props.onOkbStatusChange}
                onDataChange={props.onOkbDataChange}
                status={props.okbStatus}
                disabled={props.disabled}
            />
            <FileUpload 
                onFileProcessed={props.onDataLoaded}
                onProcessingStateChange={props.onLoadingStateChange}
                okbData={props.okbData}
                okbStatus={props.okbStatus}
                disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'}
            />
        </div>
    );
};

export default App;