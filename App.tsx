import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import ResultsTable from './components/ResultsTable';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import { RMDashboard } from './components/RMDashboard';
import AddressEditModal from './components/AddressEditModal';
import ClientsListModal from './components/ClientsListModal';
import UnidentifiedRowsModal from './components/UnidentifiedRowsModal';
import DetailsModal from './components/DetailsModal';

import { 
    AggregatedDataRow, 
    OkbDataRow, 
    OkbStatus, 
    FileProcessingState, 
    WorkerMessage,
    MapPoint,
    UnidentifiedRow,
    FilterState
} from './types';
import { calculateSummaryMetrics, applyFilters, getFilterOptions, findValueInRow } from './utils/dataUtils';

const App: React.FC = () => {
    // State
    const [activeTab, setActiveTab] = useState('adapta');
    const [apiKeyError, setApiKeyError] = useState(false);
    
    // Data State
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [aggregatedData, setAggregatedData] = useState<AggregatedDataRow[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [okbRegionCounts, setOkbRegionCounts] = useState<Record<string, number>>({});
    
    // UI State
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false,
        progress: 0,
        message: '',
        fileName: null,
        backgroundMessage: null,
        startTime: null
    });
    
    const [filters, setFilters] = useState<FilterState>({
        rm: '',
        brand: [],
        packaging: [],
        region: []
    });

    const [dateRange, setDateRange] = useState<{start: string, end: string}>({ start: '', end: '' });

    // Modals
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);
    const [unidentifiedModalOpen, setUnidentifiedModalOpen] = useState(false);
    const [detailsModalData, setDetailsModalData] = useState<AggregatedDataRow | null>(null);
    const [showClientsList, setShowClientsList] = useState(false);
    const [clientsListTitle, setClientsListTitle] = useState('');
    const [clientsListSource, setClientsListSource] = useState<MapPoint[]>([]);

    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        // Basic check for API Key availability (optional)
        if (import.meta.env.VITE_GEMINI_API_KEY !== 'key_is_set') {
             // setApiKeyError(true);
        }
        
        // Initialize Worker
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                setProcessingState(prev => ({
                    ...prev,
                    isProcessing: true,
                    progress: msg.payload.percentage,
                    message: msg.payload.message,
                    totalRowsProcessed: msg.payload.totalProcessed
                }));
            } else if (msg.type === 'result_init') {
                 setOkbRegionCounts(msg.payload.okbRegionCounts);
            } else if (msg.type === 'result_chunk_aggregated') {
                 setAggregatedData(msg.payload.data);
                 setProcessingState(prev => ({ ...prev, totalRowsProcessed: msg.payload.totalProcessed }));
            } else if (msg.type === 'result_finished') {
                 setAggregatedData(msg.payload.aggregatedData);
                 setUnidentifiedRows(msg.payload.unidentifiedRows);
                 setOkbRegionCounts(msg.payload.okbRegionCounts);
                 setProcessingState(prev => ({ 
                     ...prev, 
                     isProcessing: false, 
                     progress: 100, 
                     message: 'Обработка завершена',
                     totalRowsProcessed: msg.payload.totalRowsProcessed 
                 }));
            } else if (msg.type === 'error') {
                 setProcessingState(prev => ({ ...prev, isProcessing: false, message: `Ошибка: ${msg.payload}` }));
            }
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    // --- БЕЗОПАСНАЯ НОРМАЛИЗАЦИЯ И ВОССТАНОВЛЕНИЕ ДАННЫХ ---
    const normalize = useCallback((rows: any[]): AggregatedDataRow[] => {
        if (!Array.isArray(rows)) return [];
        const result: AggregatedDataRow[] = [];
        
        const safeFloat = (v: any) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') {
                const f = parseFloat(v.replace(',', '.'));
                return isNaN(f) ? undefined : f;
            }
            return undefined;
        };
        
        const isValidCoord = (n: any) => typeof n === 'number' && !isNaN(n) && n !== 0;

        rows.forEach((row, index) => {
            if (!row) return;
            const brandRaw = String(row.brand || '').trim();
            const hasMultipleBrands = brandRaw.length > 2 && /[,;|\r\n]/.test(brandRaw);

            const generateStableKey = (base: any, suffix: string | number) => {
                const baseStr = base.key || base.address || `idx_${index}`;
                return `${baseStr}_${suffix}`.replace(/\s+/g, '_');
            };

            // 1. Identify Client Source (Handle Flat vs Aggregated JSON)
            let clientSource = row.clients;
            if (!Array.isArray(clientSource) || clientSource.length === 0) {
                 clientSource = [row]; // Treat the row itself as the client if nested array missing
            }

            const normalizedClients = clientSource.map((c: any, cIdx: number) => {
                const clientObj = { ...c };
                const original = c.originalRow || {}; 

                // Coordinate Recovery
                if (c.lng !== undefined) clientObj.lon = safeFloat(c.lng);
                if (c.lat !== undefined) clientObj.lat = safeFloat(c.lat);

                if (!isValidCoord(clientObj.lat)) {
                    clientObj.lat = safeFloat(c.latitude) || safeFloat(c.geo_lat) || safeFloat(c.y) || safeFloat(original.lat);
                }
                if (!isValidCoord(clientObj.lon)) {
                    clientObj.lon = safeFloat(c.longitude) || safeFloat(c.geo_lon) || safeFloat(c.x) || safeFloat(original.lon);
                }
                
                if (!clientObj.key) {
                    clientObj.key = generateStableKey(row, `cli_${cIdx}`);
                }
                
                // Deep Field Recovery for Clients
                if (!clientObj.region || clientObj.region === '') clientObj.region = findValueInRow(clientObj, ['region', 'регион', 'область']) || findValueInRow(original, ['region', 'регион', 'область']);
                if (!clientObj.packaging || clientObj.packaging === '') clientObj.packaging = findValueInRow(clientObj, ['packaging', 'фасовка', 'упаковка']) || findValueInRow(original, ['packaging', 'фасовка', 'упаковка']);
                if (!clientObj.brand || clientObj.brand === '') clientObj.brand = findValueInRow(clientObj, ['brand', 'бренд', 'торговая марка']) || findValueInRow(original, ['brand', 'бренд']);
                if (!clientObj.name || clientObj.name === '') clientObj.name = findValueInRow(clientObj, ['name', 'наименование', 'клиент']) || findValueInRow(original, ['name', 'наименование']);

                return clientObj;
            });

            // Handle legacy flattened rows that might need splitting
            if (hasMultipleBrands && !Array.isArray(row.clients)) {
                const parts = brandRaw.split(/[,;|\r\n]+/).map(b => b.trim()).filter(b => b.length > 0);
                if (parts.length > 1) {
                    const splitFactor = 1 / parts.length;
                    parts.forEach((brandPart, idx) => {
                        result.push({
                            ...row,
                            key: generateStableKey(row, `spl_${idx}`),
                            brand: brandPart,
                            clientName: `${row.region || 'Регион'}: ${brandPart}`,
                            fact: (row.fact || 0) * splitFactor,
                            potential: (row.potential || 0) * splitFactor,
                            growthPotential: (row.growthPotential || 0) * splitFactor,
                            clients: [] 
                        });
                    });
                    return;
                }
            }

            // --- RECOVERY LOGIC FOR AGGREGATED ROW ---
            // Aggressively search for missing fields in top-level row first
            let region = row.region;
            if (!region || region === '') region = findValueInRow(row, ['region', 'регион', 'область']);
            
            let brand = row.brand;
            if (!brand || brand === '') brand = findValueInRow(row, ['brand', 'бренд', 'торговая марка']);
            
            let packaging = row.packaging;
            if (!packaging || packaging === '') packaging = findValueInRow(row, ['packaging', 'фасовка', 'упаковка']);

            let rm = row.rm;
            if (!rm || rm === '') rm = findValueInRow(row, ['rm', 'рм', 'менеджер']);

            // Client Name Strategy: Look for specific name keys if clientName is missing
            let clientName = row.clientName;
            if (!clientName || clientName === '') {
                clientName = findValueInRow(row, ['clientName', 'название группы', 'name', 'наименование', 'клиент']);
            }

            // Fallback: Peek at first client if top-level fields are still missing
            const firstClient = normalizedClients[0];
            if (firstClient) {
                if (!region) region = firstClient.region;
                if (!brand) brand = firstClient.brand;
                if (!rm) rm = firstClient.rm;
                if (!packaging) packaging = firstClient.packaging;
                if (!clientName) clientName = firstClient.name;
            }

            // Final Defaults
            region = (region && region.trim()) ? region : 'Нет данных';
            brand = (brand && brand.trim()) ? brand : 'Нет данных';
            packaging = (packaging && packaging.trim()) ? packaging : 'Нет данных';
            rm = (rm && rm.trim()) ? rm : 'Нет данных';

            // Construct clientName if still missing
            if (!clientName || clientName === 'undefined' || clientName.trim() === '') {
                if (brand !== 'Нет данных') {
                    clientName = `${region}: ${brand}`;
                } else {
                    clientName = 'Группа: Нет данных';
                }
            }

            result.push({
                ...row,
                region,
                brand,
                packaging,
                rm,
                clientName,
                key: row.key || generateStableKey(row, 'm'),
                clients: normalizedClients
            });
        });
        return result;
    }, []);

    // Derived Data
    const filteredData = useMemo(() => applyFilters(aggregatedData, filters), [aggregatedData, filters]);
    const filterOptions = useMemo(() => getFilterOptions(aggregatedData), [aggregatedData]);
    const metrics = useMemo(() => calculateSummaryMetrics(filteredData), [filteredData]);

    const activeClientsCount = useMemo(() => {
        const unique = new Set<string>();
        filteredData.forEach(r => r.clients.forEach(c => unique.add(c.key)));
        return unique.size;
    }, [filteredData]);

    // Handlers
    const handleForceUpdate = () => {
        // Logic to trigger worker update if needed.
    };

    if (apiKeyError) return <ApiKeyErrorDisplay />;

    return (
        <div className="flex h-screen bg-primary-dark text-text-main font-sans overflow-hidden">
            <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
            
            <main className="flex-1 overflow-y-auto custom-scrollbar relative p-6">
                {activeTab === 'adapta' && (
                    <Adapta 
                        processingState={processingState}
                        onForceUpdate={handleForceUpdate}
                        onFileProcessed={() => {}}
                        onProcessingStateChange={() => {}}
                        okbData={okbData}
                        okbStatus={okbStatus}
                        onOkbStatusChange={setOkbStatus}
                        onOkbDataChange={setOkbData}
                        disabled={processingState.isProcessing}
                        unidentifiedCount={unidentifiedRows.length}
                        onUnidentifiedClick={() => setUnidentifiedModalOpen(true)}
                        activeClientsCount={activeClientsCount}
                        uploadedData={aggregatedData}
                        dbStatus={aggregatedData.length > 0 ? 'ready' : 'empty'}
                        startDate={dateRange.start}
                        endDate={dateRange.end}
                        onStartDateChange={(d) => setDateRange(p => ({ ...p, start: d }))}
                        onEndDateChange={(d) => setDateRange(p => ({ ...p, end: d }))}
                        onStartEdit={(c) => setEditingClient(c)}
                    />
                )}

                {activeTab === 'amp' && (
                    <div className="space-y-6 animate-fade-in">
                        <MetricsSummary 
                            metrics={metrics} 
                            okbStatus={okbStatus} 
                            disabled={false} 
                            onActiveClientsClick={() => {
                                setClientsListTitle('Активные клиенты (фильтр)');
                                const allClients = filteredData.flatMap(r => r.clients);
                                setClientsListSource(allClients);
                                setShowClientsList(true);
                            }}
                        />
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-250px)]">
                            <div className="lg:col-span-1 h-full">
                                <Filters 
                                    options={filterOptions} 
                                    currentFilters={filters} 
                                    onFilterChange={setFilters} 
                                    onReset={() => setFilters({ rm: '', brand: [], packaging: [], region: [] })} 
                                    disabled={false} 
                                />
                            </div>
                            <div className="lg:col-span-3 h-full overflow-hidden flex flex-col">
                                <ResultsTable 
                                    data={filteredData} 
                                    onRowClick={setDetailsModalData} 
                                    onPlanClick={() => {}}
                                    disabled={false} 
                                    unidentifiedRowsCount={unidentifiedRows.length}
                                    onUnidentifiedClick={() => setUnidentifiedModalOpen(true)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'dashboard' && (
                    <RMDashboard 
                        isOpen={true} 
                        onClose={() => setActiveTab('adapta')} 
                        data={filteredData} 
                        okbRegionCounts={okbRegionCounts} 
                        okbData={okbData}
                        mode="page"
                        metrics={metrics}
                        okbStatus={okbStatus}
                        onActiveClientsClick={() => {
                             setClientsListTitle('Активные клиенты (Dashboard)');
                             const allClients = filteredData.flatMap(r => r.clients);
                             setClientsListSource(allClients);
                             setShowClientsList(true);
                        }}
                        onEditClient={(c) => setEditingClient(c)}
                    />
                )}

                {activeTab === 'prophet' && <Prophet data={filteredData} />}
                {activeTab === 'agile' && <AgileLearning data={filteredData} />}
                {activeTab === 'roi-genome' && <RoiGenome data={filteredData} />}
            </main>

            {/* Modals */}
            <AddressEditModal 
                isOpen={!!editingClient} 
                onClose={() => setEditingClient(null)} 
                onBack={() => setEditingClient(null)}
                data={editingClient} 
                onDataUpdate={() => {}}
                onStartPolling={() => {}}
                onDelete={() => {}}
                globalTheme="dark"
            />

            <UnidentifiedRowsModal 
                isOpen={unidentifiedModalOpen} 
                onClose={() => setUnidentifiedModalOpen(false)} 
                rows={unidentifiedRows}
                onStartEdit={(row) => {
                    setUnidentifiedModalOpen(false);
                    setEditingClient(row); 
                }} 
            />

            <DetailsModal 
                isOpen={!!detailsModalData} 
                onClose={() => setDetailsModalData(null)} 
                data={detailsModalData} 
                okbStatus={okbStatus}
                onStartEdit={(client) => {
                    setDetailsModalData(null);
                    setEditingClient(client);
                }}
            />

            <ClientsListModal 
                isOpen={showClientsList} 
                onClose={() => setShowClientsList(false)} 
                title={clientsListTitle} 
                clients={clientsListSource}
                onClientSelect={(c) => {
                    setShowClientsList(false);
                    setEditingClient(c);
                }}
                onStartEdit={(c) => {
                    setShowClientsList(false);
                    setEditingClient(c);
                }}
                showAbcLegend={true}
            />
        </div>
    );
};

export default App;