import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import ResultsTable from './components/ResultsTable';
import PotentialChart from './components/PotentialChart';
import DetailsModal from './components/DetailsModal';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import FileUpload from './components/FileUpload';
import InteractiveRegionMap from './components/InteractiveRegionMap';
import ActiveClientsTable from './components/ActiveClientsTable';
import { 
    AggregatedDataRow, 
    FilterOptions, 
    FilterState, 
    NotificationMessage, 
    SummaryMetrics,
    OkbDataRow,
    MapPoint,
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow } from './utils/dataUtils';
import { parseRussianAddress } from './services/addressParser';
import type { FeatureCollection } from 'geojson';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_POLLING_ATTEMPTS = 3;

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

    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [conflictZones, setConflictZones] = useState<FeatureCollection | null>(null);
    
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], region: [] });
    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    const isDataLoaded = allData.length > 0;

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
        }, 5000);
    }, []);
    
    const processApiData = useCallback((data: OkbDataRow[]) => {
        const aggregated: { [key: string]: AggregatedDataRow & { clientsSet: Set<string> } } = {};
        const plottableClients: MapPoint[] = [];

        data.forEach((row, index) => {
            const address = findAddressInRow(row) || `unique-id-${index}`;
            const rm = row['РМ'] || 'Н/Д';
            const brand = row['Торговая марка'] || 'Н/Д';
            const parsedAddress = parseRussianAddress(address);
            const region = parsedAddress.region;
            
            if (row.lat && row.lon) {
                plottableClients.push({
                    key: `${address}-${index}`,
                    lat: row.lat,
                    lon: row.lon,
                    accuracy: 'exact',
                    name: row['Уникальное наименование товара'] || 'Без названия',
                    address: address,
                    city: parsedAddress.city,
                    region: region,
                    rm: rm,
                    brand: brand,
                    type: row['Канал продаж'] || 'Н/Д',
                });
            }

            const key = `${region}-${brand}-${rm}`.toLowerCase();
            if (!aggregated[key]) {
                aggregated[key] = {
                    key,
                    rm,
                    brand,
                    region,
                    city: parsedAddress.city,
                    clientName: `${region} (${brand})`,
                    fact: 0,
                    potential: 0,
                    growthPotential: 0,
                    growthPercentage: 0,
                    clients: [],
                    clientsSet: new Set(),
                };
            }
            
            const weight = parseFloat(String(row['Вес, кг'] || '0').replace(',', '.'));
            if (!isNaN(weight)) {
                aggregated[key].fact += weight;
            }
            aggregated[key].clientsSet.add(address);
        });

        const finalAggregated = Object.values(aggregated).map(group => {
            const potential = group.fact * 1.15; // Placeholder logic
            const growthPotential = Math.max(0, potential - group.fact);
            const growthPercentage = potential > 0 ? (growthPotential / potential) * 100 : 0;
            return {
                ...group,
                clients: Array.from(group.clientsSet),
                potential,
                growthPotential,
                growthPercentage,
            };
        });
        
        setAllData(finalAggregated);
        setAllActiveClients(plottableClients);

        return { plottableCount: plottableClients.length };
    }, []);

    const pollForCoordinates = useCallback((rmSheets: string[], attempt: number) => {
        if (attempt > MAX_POLLING_ATTEMPTS) {
            addNotification('Завершено. Не все координаты были найдены.', 'info');
            setIsLoading(false);
            setLoadingMessage('');
            return;
        }

        pollingRef.current = setTimeout(async () => {
            try {
                const res = await fetch('/api/poll-coordinates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rmSheets }),
                });

                if (!res.ok) throw new Error('Ошибка при опросе данных.');
                
                const { allData: freshData } = await res.json();
                const { plottableCount } = processApiData(freshData);
                
                addNotification(`Попытка ${attempt}/${MAX_POLLING_ATTEMPTS}: Найдено ${plottableCount} ТТ с координатами.`, 'info');
                
                pollForCoordinates(rmSheets, attempt + 1);

            } catch (error) {
                addNotification((error as Error).message, 'error');
                setIsLoading(false);
                setLoadingMessage('');
            }
        }, POLLING_INTERVAL);
    }, [addNotification, processApiData]);

    const handleFileProcessed = useCallback(async (responseData: any) => {
        const { rmSheets, initialData } = responseData;
        
        if (pollingRef.current) {
            clearTimeout(pollingRef.current);
        }
        
        const { plottableCount } = processApiData(initialData);
        addNotification(`Файл обработан. Найдено ${initialData.length} строк. Начальный поиск координат...`, 'success');
        addNotification(`Найдено ${plottableCount} ТТ с координатами.`, 'info');
        
        setFilters({ rm: '', brand: [], region: [] });
        
        setIsLoading(true);
        setLoadingMessage('Ожидание обновления координат из Google Sheets...');
        pollForCoordinates(rmSheets, 1);

    }, [addNotification, processApiData, pollForCoordinates]);
    
    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearTimeout(pollingRef.current);
            }
        };
    }, []);
    
    const handleProcessingStateChange = useCallback((loading: boolean, message: string) => {
        setIsLoading(loading);
        setLoadingMessage(message);
        if (!loading && message.startsWith('Ошибка')) {
            addNotification(message, 'error');
        }
    }, [addNotification]);
    
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
        if (!isDataLoaded) return null;
        const baseMetrics = calculateSummaryMetrics(filteredData);
        if (!baseMetrics) return null;
        
        return {
            ...baseMetrics,
            totalActiveClients: filteredActiveClients.length
        };
    }, [filteredData, isDataLoaded, filteredActiveClients]);
    
    const handleFilterChange = useCallback((newFilters: FilterState) => { setFilters(newFilters); }, []);
    const resetFilters = useCallback(() => { setFilters({ rm: '', brand: [], region: [] }); }, []);
    const handleRowClick = useCallback((row: AggregatedDataRow) => { setSelectedRow(row); setIsModalOpen(true); }, []);
    
    const flyToClient = useCallback((client: MapPoint) => {
        setTimeout(() => { setFlyToClientKey(client.key); }, 100);
        const mapElement = document.getElementById('interactive-map-container');
        mapElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    useEffect(() => {
        setFilteredData(applyFilters(allData, filters));
    }, [allData, filters]);

    return (
        <div className="bg-primary-dark min-h-screen text-slate-200 font-sans">
            <main className={`max-w-screen-2xl mx-auto space-y-6 p-4 lg:p-6 transition-all duration-300 ${isModalOpen ? 'blur-sm pointer-events-none' : ''}`}>
                <header>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Аналитическая панель "Потенциал Роста"</h1>
                    <p className="text-slate-400 mt-1">Инструмент для анализа и визуализации данных по продажам</p>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    <aside className="lg:col-span-1 space-y-6 lg:sticky lg:top-6">
                        <FileUpload 
                            onFileProcessed={handleFileProcessed}
                            onProcessingStateChange={handleProcessingStateChange}
                            disabled={isLoading}
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
                            okbStatus={null} 
                            disabled={!isDataLoaded}
                        />
                        
                        <InteractiveRegionMap 
                            data={filteredData} 
                            selectedRegions={filters.region} 
                            potentialClients={[]}
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
                okbStatus={null}
            />
        </div>
    );
};

export default App;
