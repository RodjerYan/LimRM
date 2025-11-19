import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import UnidentifiedAddressesTable from './components/UnidentifiedAddressesTable';
import EditAddressModal from './components/EditAddressModal';
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
    
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isClientsModalOpen, setIsClientsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const [selectedRow, setSelectedRow] = useState<AggregatedDataRow | null>(null);
    const [editingRow, setEditingRow] = useState<AggregatedDataRow | null>(null);
    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [conflictZones, setConflictZones] = useState<FeatureCollection | null>(null);

    const [loadedFile, setLoadedFile] = useState<File | null>(null);
    const okbManagementRef = useRef<{ fetchData: () => Promise<void> }>(null);
    const fileUploadRef = useRef<{ processFile: (file: File) => void }>(null);
    
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], region: [] });
    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    
    const isDataLoaded = allData.length > 0;

    const mainFilteredData = useMemo(() => filteredData.filter(d => d.region !== "Неопределенные адреса"), [filteredData]);
    const unidentifiedData = useMemo(() => allData.filter(d => d.region === "Неопределенные адреса"), [allData]);

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
        const baseMetrics = calculateSummaryMetrics(mainFilteredData);
        if (!baseMetrics) return null;
        return { ...baseMetrics, totalActiveClients: filteredActiveClients.length };
    }, [mainFilteredData, isDataLoaded, filteredActiveClients]);

    const potentialClients = useMemo(() => {
        if (!okbData.length) return [];
        const activeAddressesSet = new Set(allActiveClients.map(c => normalizeAddress(c.address)));
        return okbData.filter(okb => {
            const address = findAddressInRow(okb);
            return !activeAddressesSet.has(normalizeAddress(address));
        });
    }, [okbData, allActiveClients]);
    
    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    useEffect(() => {
        const fetchConflictZones = async () => {
            try {
                const response = await fetch('/api/get-conflict-zones');
                if (response.ok) {
                    setConflictZones(await response.json());
                    addNotification('Слой с зонами повышенной опасности успешно загружен.', 'info');
                } else throw new Error('Не удалось загрузить данные о зонах конфликта.');
            } catch (error) {
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

    // FIX: Add the 'file' parameter to match the expected signature from the FileUpload component.
    const handleFileProcessed = useCallback((data: WorkerResultPayload, file: File) => {
        setAllData(data.aggregatedData);
        setAllActiveClients(data.plottableActiveClients);
        setLoadedFile(file);
        setFilters({ rm: '', brand: [], region: [] });
        addNotification(`Данные успешно загружены. Найдено ${data.aggregatedData.length} групп и ${data.plottableActiveClients.length} клиентов.`, 'success');
    }, [addNotification]);
    
    const handleProcessingStateChange = useCallback((loading: boolean, message: string) => {
        setIsLoading(loading);
        setLoadingMessage(message);
        if (!loading && message.startsWith('Ошибка')) addNotification(message, 'error');
    }, [addNotification]);

    const handleFilterChange = useCallback((newFilters: FilterState) => setFilters(newFilters), []);
    const resetFilters = useCallback(() => setFilters({ rm: '', brand: [], region: [] }), []);
    const handleRowClick = useCallback((row: AggregatedDataRow) => { setSelectedRow(row); setIsDetailsModalOpen(true); }, []);
    const handleEditRow = useCallback((row: AggregatedDataRow) => { setEditingRow(row); setIsEditModalOpen(true); }, []);

    const handleSaveEditedRow = useCallback(async (originalAggRow: AggregatedDataRow, newAddress: string) => {
        if (!originalAggRow.originalRows || originalAggRow.originalRows.length === 0) {
            addNotification("Ошибка: не найдены исходные данные для этой строки.", 'error');
            return;
        }
        
        setIsEditModalOpen(false);
        setIsLoading(true);
        setLoadingMessage('Сохранение изменений в Google Sheets...');

        try {
            const rawRowToUpdate = { ...originalAggRow.originalRows[0] };
            const addressKey = Object.keys(rawRowToUpdate).find(k => k.toLowerCase().trim().includes('адрес'));
            if (addressKey) {
                rawRowToUpdate[addressKey] = newAddress;
            } else {
                rawRowToUpdate['Юридический адрес'] = newAddress;
            }
            
            const response = await fetch('/api/update-okb-row', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rowData: rawRowToUpdate }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Не удалось обновить строку в Google Sheets.');
            }

            addNotification('Адрес успешно обновлен в ОКБ. Перезапускаю анализ...', 'success');
            
            setLoadingMessage('Обновление локальной ОКБ...');
            await okbManagementRef.current?.fetchData();

            if (loadedFile && fileUploadRef.current) {
                setLoadingMessage('Повторная обработка файла с обновленными данными...');
                fileUploadRef.current.processFile(loadedFile);
            } else {
                setIsLoading(false);
            }

        } catch (error) {
            addNotification((error as Error).message, 'error');
            setIsLoading(false);
        }

    }, [addNotification, loadedFile]);


    const handleOkbStatusChange = (status: OkbStatus) => {
        setOkbStatus(status);
        if (status.status === 'ready' && status.message) addNotification(status.message, 'success');
        if (status.status === 'error' && status.message) addNotification(status.message, 'error');
    };

    const flyToClient = useCallback((client: MapPoint) => {
        setTimeout(() => setFlyToClientKey(client.key), 100);
        document.getElementById('interactive-map-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);
    
    const handleClientSelectFromModal = useCallback((client: MapPoint) => {
        setIsClientsModalOpen(false);
        flyToClient(client);
    }, [flyToClient]);
    
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilteredData(applyFilters(allData, filters));
        }, 100);
        return () => clearTimeout(timer);
    }, [allData, filters]);

    const isControlPanelLocked = isLoading;
    const isAnyModalOpen = isDetailsModalOpen || isClientsModalOpen || isEditModalOpen;

    return (
        <div className="bg-primary-dark min-h-screen text-slate-200 font-sans">
            <main className={`max-w-screen-2xl mx-auto space-y-6 p-4 lg:p-6 transition-all duration-300 ${isAnyModalOpen ? 'blur-sm pointer-events-none' : ''}`}>
                <header>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Аналитическая панель "Потенциал Роста"</h1>
                    <p className="text-slate-400 mt-1">Инструмент для анализа и визуализации данных по продажам</p>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    <aside className="lg:col-span-1 space-y-6 lg:sticky lg:top-6">
                        <OKBManagement 
                            ref={okbManagementRef}
                            onStatusChange={handleOkbStatusChange}
                            onDataChange={setOkbData}
                            status={okbStatus}
                            disabled={isControlPanelLocked}
                        />
                        <FileUpload 
                            ref={fileUploadRef}
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
                            data={mainFilteredData} 
                            selectedRegions={filters.region} 
                            potentialClients={potentialClients}
                            activeClients={filteredActiveClients}
                            conflictZones={conflictZones}
                            flyToClientKey={flyToClientKey}
                        />

                        <ResultsTable data={mainFilteredData} onRowClick={handleRowClick} disabled={!isDataLoaded || isLoading} />
                        
                        {unidentifiedData.length > 0 && (
                            <UnidentifiedAddressesTable data={unidentifiedData} onEditRow={handleEditRow} />
                        )}

                        {mainFilteredData.length > 0 && <PotentialChart data={mainFilteredData} />}
                    </div>
                </div>
            </main>
            <div className="fixed bottom-4 right-4 z-50 space-y-3 w-full max-w-sm">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            <DetailsModal 
                isOpen={isDetailsModalOpen} 
                onClose={() => setIsDetailsModalOpen(false)}
                data={selectedRow}
                okbStatus={okbStatus}
            />
            <ClientsListModal 
                isOpen={isClientsModalOpen} 
                onClose={() => setIsClientsModalOpen(false)}
                clients={filteredActiveClients}
                onClientSelect={handleClientSelectFromModal}
            />
            <EditAddressModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                rowData={editingRow}
                onSave={handleSaveEditedRow}
            />
        </div>
    );
};

export default App;