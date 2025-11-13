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
import InteractiveRegionMap from './components/InteractiveRegionMap';
import ActiveClientsTable from './components/ActiveClientsTable';
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
    GeoCache,
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics } from './utils/dataUtils';
import { loadGeoCache, saveGeoCache, clearGeoCache } from './utils/cache';
import { processGeocodingQueue } from './services/geocodingService';
import { parseRussianAddress } from './services/addressParser';
import { REGION_BY_CITY_WITH_INDEXES } from './utils/regionMap';
import { capitals } from './utils/capitals';
import type { FeatureCollection } from 'geojson';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const capitalCoordsByRegion = new Map<string, { lat: number; lon: number }>();
capitals.filter(c => c.type === 'capital' && c.region_name).forEach(c => {
    if(c.region_name) {
        capitalCoordsByRegion.set(c.region_name, { lat: c.lat, lon: c.lon });
    }
});


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
    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [conflictZones, setConflictZones] = useState<FeatureCollection | null>(null);
    const [geoCache, setGeoCache] = useState<GeoCache>(() => loadGeoCache());
    
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
        // Active clients are already derived from file, so OKB can be filtered against it
        const activeAddressesSet = new Set(allActiveClients.map(c => c.address.toLowerCase().trim()));
        return okbData.filter(okb => {
            const address = (okb['Юридический адрес'] || okb['Адрес ТТ LimKorm'] || okb['Адрес'] || '').toLowerCase().trim();
            return !activeAddressesSet.has(address);
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

    const handleFileProcessed = useCallback(async (data: WorkerResultPayload) => {
        setAllData(data.aggregatedData);
        setAllActiveClients(data.plottableActiveClients);
        setFilters({ rm: '', brand: [], region: [] });
        addNotification(`Данные успешно обработаны. Найдено ${data.aggregatedData.length} групп и ${data.plottableActiveClients.length} клиентов.`, 'success');
    
        const { addressesToGeocode } = data;
        if (addressesToGeocode && addressesToGeocode.length > 0) {
            setIsLoading(true);
            const { successes, failures } = await processGeocodingQueue(
                addressesToGeocode,
                (message) => setLoadingMessage(message)
            );
    
            let currentCache = { ...geoCache };
            let updatedClients = [...data.plottableActiveClients];
            
            // Update state for successful geocodes
            successes.forEach(success => {
                currentCache[success.address] = success.coords;
                updatedClients = updatedClients.map(client => 
                    client.address === success.address && !client.lat && !client.lon
                        ? { ...client, lat: success.coords.lat, lon: success.coords.lon, accuracy: 'geocoded' } 
                        : client
                );
            });

            // Apply fallback logic for failures
            failures.forEach(failedAddress => {
                updatedClients = updatedClients.map(client => {
                    if (client.address === failedAddress && !client.lat && !client.lon) {
                        const parsedAddr = parseRussianAddress(client.address);
                        if (parsedAddr.city && parsedAddr.city !== 'Город не определен') {
                            const cityData = REGION_BY_CITY_WITH_INDEXES[parsedAddr.city.toLowerCase()];
                            if (cityData && cityData.lat && cityData.lon) {
                               return { ...client, lat: cityData.lat, lon: cityData.lon, accuracy: 'approximate' };
                            }
                        }
                        if (parsedAddr.region && parsedAddr.region !== 'Регион не определен') {
                            const regionCoords = capitalCoordsByRegion.get(parsedAddr.region);
                            if (regionCoords) {
                                 return { ...client, lat: regionCoords.lat, lon: regionCoords.lon, accuracy: 'region' };
                            }
                        }
                    }
                    return client;
                });
            });
    
            setAllActiveClients(updatedClients);
            setGeoCache(currentCache);
            saveGeoCache(currentCache);
            addNotification(`Геокодирование завершено: ${successes.length} успешно, ${failures.length} не найдено.`, 'info');
            setIsLoading(false);
            setLoadingMessage('');
        }
    
    }, [addNotification, geoCache]);

    
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

    const flyToClient = useCallback((client: MapPoint) => {
        setTimeout(() => {
            setFlyToClientKey(client.key);
        }, 100);
        
        const mapElement = document.getElementById('interactive-map-container');
        mapElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);
    
    const handleClearGeoCache = useCallback(() => {
        clearGeoCache();
        setGeoCache({});
        addNotification('Кэш геокодирования очищен.', 'info');
    }, [addNotification]);

    useEffect(() => {
        const result = applyFilters(allData, filters);
        setFilteredData(result);
    }, [allData, filters]);
    
    const isControlPanelLocked = isLoading;

    return (
        <div className="bg-primary-dark min-h-screen text-slate-200 font-sans">
            <main className={`max-w-screen-2xl mx-auto space-y-6 p-4 lg:p-6 transition-all duration-300 ${isModalOpen ? 'blur-sm pointer-events-none' : ''}`}>
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
                            geoCacheSize={Object.keys(geoCache).length}
                            onClearGeoCache={handleClearGeoCache}
                        />
                        <FileUpload 
                            onFileProcessed={handleFileProcessed}
                            onProcessingStateChange={handleProcessingStateChange}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            disabled={isControlPanelLocked || !okbStatus || okbStatus.status !== 'ready'}
                            geoCache={geoCache}
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
                            disabled={!isDataLoaded}
                        />
                        
                        <InteractiveRegionMap 
                            data={filteredData} 
                            selectedRegions={filters.region} 
                            potentialClients={potentialClients}
                            activeClients={filteredActiveClients}
                            conflictZones={conflictZones}
                            flyToClientKey={flyToClientKey}
                        />
                        
                        <ActiveClientsTable clients={filteredActiveClients} onClientSelect={flyToClient} disabled={!isDataLoaded} />

                        <ResultsTable data={filteredData} onRowClick={handleRowClick} disabled={!isDataLoaded} />
                        {filteredData.length > 0 && <PotentialChart data={filteredData} />}
                    </div>
                </div>
            </main>
            <div className="fixed bottom-4 right-4 z-50 space-y-3 w-full max-w-sm">
                 {isLoading && loadingMessage && (
                    <div className="p-4 rounded-lg shadow-xl border border-yellow-500/30 bg-yellow-500/20 backdrop-blur-md text-white">
                        <div className="flex items-center">
                            <div className="border-4 border-gray-400 border-t-white rounded-full w-5 h-5 animate-spin mr-3"></div>
                            <span className="text-sm text-gray-200">{loadingMessage}</span>
                        </div>
                    </div>
                )}
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
        </div>
    );
};

export default App;