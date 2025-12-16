
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
import GrowthExplanationModal from './components/GrowthExplanationModal';

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
    RMMetrics,
    FileProcessingState,
    WorkerMessage,
    CoordsCache,
    PlanMetric
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import { TargetIcon } from './components/icons';
import { enrichDataWithSmartPlan } from './services/planning/integration';

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
    const [dateRange, setDateRange] = useState<string | undefined>(undefined); // New state for date range
    
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    // --- PERSISTENT FILE PROCESSING STATE ---
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false,
        progress: 0,
        message: 'Загрузите файл с данными',
        fileName: null,
        backgroundMessage: null,
        startTime: null
    });
    const workerRef = useRef<Worker | null>(null);

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
    
    // State for individual plan explanation modal in AMP view
    const [planExplanationData, setPlanExplanationData] = useState<PlanMetric | null>(null);

    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{ [key: string]: number } | null>(null);
    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
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

    // --- SMART DATA INTEGRATION ---
    // Prepare a set of OKB coordinates for exact matching, mimicking Dashboard logic.
    // This ensures that coverage calculations (and thus growth plans) are consistent across views.
    const okbCoordSet = useMemo(() => {
        const set = new Set<string>();
        if (okbData && okbData.length > 0) {
            okbData.forEach(row => {
                if (row.lat && row.lon && !isNaN(row.lat) && !isNaN(row.lon)) {
                    const hash = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
                    set.add(hash);
                }
            });
        }
        return set;
    }, [okbData]);

    // Enrich the raw data with the Planning Engine logic so AMP matches the Dashboard.
    // Using default base rate of 15% for general analytics view.
    const smartData = useMemo(() => {
        return enrichDataWithSmartPlan(allData, okbRegionCounts, 15, okbCoordSet);
    }, [allData, okbRegionCounts, okbCoordSet]);

    const filteredActiveClients = useMemo(() => {
        if (!isDataLoaded) return [];
        return allActiveClients.filter(client => {
            const rmMatch = !filters.rm || client.rm === filters.rm;
            const brandMatch = filters.brand.length === 0 || filters.brand.includes(client.brand);
            const packagingMatch = filters.packaging.length === 0 || filters.packaging.includes(client.packaging);
            const regionMatch = filters.region.length === 0 || filters.region.includes(client.region);
            return rmMatch && brandMatch && packagingMatch && regionMatch;
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

    // --- FILE PROCESSING LOGIC (Moved from FileUpload.tsx) ---
    
    const handleFileProcessed = useCallback((data: WorkerResultPayload) => {
        setAllData(data.aggregatedData);
        setAllActiveClients(data.plottableActiveClients);
        setUnidentifiedRows(data.unidentifiedRows);
        setOkbRegionCounts(data.okbRegionCounts);
        setDateRange(data.dateRange); // Store date range
        setFilters({ rm: '', brand: [], packaging: [], region: [] });
        addNotification(`Данные загружены. ${data.aggregatedData.length} групп, ${data.plottableActiveClients.length} активных точек.`, 'success');
        if (data.dateRange) {
            addNotification(`Определен период данных: ${data.dateRange}`, 'info');
        }
        if (data.unidentifiedRows.length > 0) {
            addNotification(`${data.unidentifiedRows.length} неопознанных записей помечено в ADAPTA.`, 'info');
        }
        
        // Auto-switch to Analytics if data loaded, but give a small delay so user sees 100% progress
        setTimeout(() => setActiveModule('amp'), 1000);
    }, [addNotification]);

    // --- WORKER SETUP & COMMUNICATION ---
    
    // Initialize Worker logic (abstracted to be reused by both file and cloud flow)
    const initWorker = useCallback(async (
        payload: { file?: File, rawSheetData?: any[][] },
        messageStart: string, 
        fileNameForState: string
    ) => {
        // Reset State
        setProcessingState({
            isProcessing: true,
            progress: 0,
            message: messageStart,
            fileName: fileNameForState,
            backgroundMessage: null,
            startTime: Date.now()
        });

        // Pre-load cache
        let cacheData: CoordsCache = {};
        try {
            const response = await fetch(`/api/get-full-cache?t=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                cacheData = await response.json();
                setProcessingState(prev => ({ ...prev, message: 'Кэш загружен, инициализация...' }));
            } else {
                console.warn('Не удалось загрузить кэш координат.');
                setProcessingState(prev => ({ ...prev, message: 'Не удалось загрузить кэш, инициализация...' }));
            }
        } catch (error) {
            console.error('Ошибка при загрузке кэша координат:', error);
            setProcessingState(prev => ({ ...prev, message: 'Ошибка кэша, инициализация...' }));
        }

        if (workerRef.current) {
            workerRef.current.terminate();
        }

        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
            const { type, payload } = e.data;
            switch (type) {
                case 'progress':
                    if (payload.isBackground) {
                        if (payload.percentage === 100 || payload.message.toLowerCase().includes('завершен')) {
                            setProcessingState(prev => ({ ...prev, backgroundMessage: null }));
                        } else {
                            setProcessingState(prev => ({ ...prev, backgroundMessage: payload.message }));
                        }
                    } else {
                        setProcessingState(prev => ({ 
                            ...prev, 
                            progress: payload.percentage, 
                            message: payload.message 
                        }));
                    }
                    break;
                case 'result':
                    handleFileProcessed(payload);
                    setProcessingState(prev => ({ 
                        ...prev, 
                        isProcessing: false, // Keep file name but stop processing flag
                        progress: 100, 
                        message: 'Обработка завершена!' 
                    }));
                    break;
                case 'error':
                    setProcessingState(prev => ({ 
                        ...prev, 
                        isProcessing: false, 
                        message: `Ошибка: ${payload}`,
                        backgroundMessage: null
                    }));
                    addNotification(`Ошибка при обработке файла: ${payload}`, 'error');
                    break;
                default:
                    break;
            }
        };

        workerRef.current.onerror = (e) => {
            console.error('Worker error:', e);
            setProcessingState(prev => ({ 
                ...prev, 
                isProcessing: false, 
                message: `Критическая ошибка: ${e.message}` 
            }));
            addNotification(`Критическая ошибка воркера: ${e.message}`, 'error');
        };
        
        // Start Worker
        workerRef.current.postMessage({ ...payload, okbData, cacheData });

    }, [okbData, handleFileProcessed, addNotification]);


    const handleStartFileProcessing = useCallback((file: File) => {
        initWorker({ file }, 'Загрузка кэша координат...', file.name);
    }, [initWorker]);

    // Updated to split load into 12 requests (Months) to avoid timeouts
    const handleStartCloudProcessing = useCallback(async (year: string = '2025') => {
        setProcessingState({
            isProcessing: true,
            progress: 2,
            message: `Инициализация помесячной загрузки (${year})...`,
            fileName: `Cloud: AKB Sheet ${year}`,
            backgroundMessage: null,
            startTime: Date.now()
        });

        try {
            // Initiate sequential requests for each month (1-12) to heavily reduce load per request
            const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            
            const fetchMonth = async (m: number) => {
                try {
                    const response = await fetch(`/api/get-akb?year=${year}&month=${m}`);
                    if (!response.ok) {
                        let errorMsg = `Month ${m} fetch failed (${response.status})`;
                        try {
                            const text = await response.text();
                            // Try to parse JSON, if fails, use text
                            try {
                                const errorData = JSON.parse(text);
                                if (errorData.details) errorMsg = errorData.details;
                                else if (errorData.error) errorMsg = errorData.error;
                            } catch {
                                if (text.length < 200) errorMsg += `: ${text}`;
                                else errorMsg += `: Server Error (Check logs)`;
                            }
                        } catch (e) { /* ignore */ }
                        throw new Error(errorMsg);
                    }
                    const data = await response.json();
                    return { m, data };
                } catch (error) {
                    console.error(`Failed to fetch Month ${m}:`, error);
                    // Critical error if it's a network issue, but we might want to continue if it's just a missing month?
                    // For now, throw to stop processing and alert user.
                    throw error;
                }
            };

            const results = [];
            // SEQUENTIAL EXECUTION (Fix for Rate Limits/Timeouts)
            for (const m of months) {
                const monthName = new Date(0, m - 1).toLocaleString('ru-RU', { month: 'long' });
                setProcessingState(prev => ({ 
                    ...prev, 
                    progress: Math.round((m / 12) * 90), // Scale progress from 0 to 90%
                    message: `Загрузка: ${monthName} (${m}/12)...` 
                }));
                
                try {
                    const res = await fetchMonth(m);
                    results.push(res);
                } catch (e) {
                    console.warn(`Error fetching month ${m}, skipping.`, e);
                    // Optional: decide if one failed month breaks everything. 
                    // Currently, we let it fail loudly via the catch block below if needed, 
                    // OR we could continue. Let's continue but log it.
                }
            }
            
            // Merge results
            let mergedData: any[] = [];
            // Preserve headers from the first successful chunk
            let headers: any[] | null = null;

            results.forEach(({ m, data }) => {
                if (Array.isArray(data) && data.length > 0) {
                    if (!headers) {
                        headers = data[0];
                        mergedData.push(headers); // Add header row once
                        mergedData.push(...data.slice(1));
                    } else {
                        // Skip header row for subsequent chunks
                        mergedData.push(...data.slice(1));
                    }
                }
            });

            if (mergedData.length <= 1) { 
                console.warn('No data found for any month.');
                setProcessingState(prev => ({ ...prev, message: 'Данные за выбранный год не найдены.' }));
                addNotification('Данные за выбранный год не найдены.', 'info');
                // Proceed anyway, worker will handle empty logic gracefully or throw if totally empty
            }

            // Hand over to worker
            initWorker({ rawSheetData: mergedData }, 'Сборка данных завершена, запуск обработки...', `Cloud: AKB Sheet ${year}`);

        } catch (error) {
            console.error("Cloud load error:", error);
            const msg = (error as Error).message;
            setProcessingState(prev => ({ 
                ...prev, 
                isProcessing: false, 
                message: `Ошибка: ${msg}` 
            }));
            addNotification(`Ошибка загрузки: ${msg}`, 'error');
        }
    }, [initWorker, addNotification]);


    // Cleanup worker on unmount of App (page close)
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
        }
    }, []);


    // --- Legacy / Shared Handlers ---
    
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
        setFilters({ rm: '', brand: [], packaging: [], region: [] });
    }, []);

    const handleRowClick = useCallback((row: AggregatedDataRow) => {
        setSelectedDetailsRow(row);
        setIsDetailsModalOpen(true);
    }, []);
    
    const handleOpenPlan = useCallback((row: AggregatedDataRow) => {
        if (row.planMetric) {
            setPlanExplanationData(row.planMetric);
        } else {
            addNotification('Детали плана недоступны для этой строки.', 'info');
        }
    }, [addNotification]);
    
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
                        packaging: newPoint.packaging,
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
            // Apply filters to the SMART (enriched) data, not the raw data
            const result = applyFilters(smartData, filters);
            setFilteredData(result);
            setIsLoading(false);
        }, 100);
        return () => clearTimeout(timer);
    }, [smartData, filters]);

    const isControlPanelLocked = isLoading;
    const isAnyModalOpen = isDetailsModalOpen || isClientsModalOpen || isUnidentifiedModalOpen || isEditModalOpen || isRMDashboardOpen;

    // --- RENDER CONTENT BASED ON ACTIVE TAB ---
    const renderContent = () => {
        // Separate wrapper classes based on content type
        const limitedWrapperClass = "w-full max-w-[1600px] mx-auto px-4 lg:px-8";
        const fullWidthWrapperClass = "w-full px-4 lg:px-8"; 

        switch (activeModule) {
            case 'adapta':
                return (
                    <div className={limitedWrapperClass}>
                        <Adapta 
                            // Pass down the processing state and start handler
                            processingState={processingState}
                            onStartProcessing={handleStartFileProcessing}
                            onStartCloudProcessing={handleStartCloudProcessing}
                            // Legacy props (some might be deprecated in FileUpload but kept for compatibility if needed)
                            onFileProcessed={handleFileProcessed} // Redundant if handled via state but good for clear interface
                            onProcessingStateChange={handleProcessingStateChange} // Legacy, could be removed
                            okbData={okbData}
                            okbStatus={okbStatus}
                            onOkbStatusChange={handleOkbStatusChange}
                            onOkbDataChange={setOkbData}
                            disabled={isControlPanelLocked}
                            unidentifiedCount={unidentifiedRows.length}
                            activeClientsCount={allActiveClients.length}
                            uploadedData={allData} 
                        />
                    </div>
                );
            case 'dashboard':
                return (
                    <div className={fullWidthWrapperClass}>
                        <RMDashboard 
                            isOpen={true} // Always open when in this view
                            onClose={() => setActiveModule('amp')} 
                            data={filteredData} // Passing enriched data to Dashboard is redundant but safe (dashboard recalcs anyway)
                            okbRegionCounts={okbRegionCounts}
                            okbData={okbData}
                            mode="page"
                            metrics={summaryMetrics}
                            okbStatus={okbStatus}
                            onActiveClientsClick={() => setIsClientsModalOpen(true)}
                            onEditClient={(client: MapPoint) => handleStartEdit(client, 'clients')}
                            dateRange={dateRange} // PASS DATE RANGE
                        />
                    </div>
                );
            case 'prophet':
                return (
                    <div className={limitedWrapperClass}>
                        <Prophet data={smartData} />
                    </div>
                );
            case 'agile':
                return (
                    <div className={limitedWrapperClass}>
                        {/* PASS SMART DATA HERE */}
                        <AgileLearning data={smartData} />
                    </div>
                );
            case 'roi-genome':
                return (
                    <div className={limitedWrapperClass}>
                        <RoiGenome data={allData} />
                    </div>
                );
            case 'amp':
            default:
                return (
                    <div className={`space-y-6 animate-fade-in ${fullWidthWrapperClass}`}>
                        <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                            <div>
                                <h2 className="text-2xl font-bold text-white">AMP <span className="text-gray-500 font-normal text-lg">/ Аналитика</span></h2>
                                <p className="text-gray-400 text-sm mt-1">Построение многомерных моделей, выявление драйверов роста. Holistic (целостное) моделирование.</p>
                            </div>
                        </div>

                        {/* Map occupies full width at the top */}
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

                        {/* Split layout: Filters (Left) | Chart (Right) - Unequal Width (25% / 75%) */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            <div className="h-full lg:col-span-1">
                                <Filters
                                    options={filterOptions}
                                    currentFilters={filters}
                                    onFilterChange={handleFilterChange}
                                    onReset={resetFilters}
                                    disabled={!isDataLoaded || isLoading}
                                />
                            </div>
                            <div className="h-full lg:col-span-3">
                                {filteredData.length > 0 ? (
                                    <PotentialChart data={filteredData} />
                                ) : (
                                    <div className="h-full bg-card-bg/50 border border-indigo-500/10 rounded-2xl flex items-center justify-center text-gray-500">
                                        Нет данных для графика
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Results Table - Full Width at Bottom */}
                        <div className="w-full">
                            <ResultsTable 
                                data={filteredData} 
                                onRowClick={handleRowClick}
                                onPlanClick={handleOpenPlan}
                                disabled={!isDataLoaded || isLoading}
                                unidentifiedRowsCount={unidentifiedRows.length}
                                onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)}
                            />
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className={`flex min-h-screen bg-primary-dark ${theme} font-sans text-text-main overflow-hidden`}>
            
            {/* Sidebar Navigation - Fixed on Left */}
            <Navigation activeTab={activeModule} onTabChange={setActiveModule} />

            {/* Main Content Area - Scrollable */}
            <main className="flex-1 ml-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar relative">
                {/* Header / Top Bar (Mobile Menu could go here) */}
                <div className="sticky top-0 z-30 bg-primary-dark/95 backdrop-blur-md border-b border-gray-800 px-8 py-4 flex justify-end items-center">
                    {/* Metrics Summary Ticker - Always visible if data loaded */}
                    {isDataLoaded && activeModule !== 'dashboard' && (
                        <div className="flex items-center gap-6 text-xs mr-6">
                            <div className="flex flex-col items-end">
                                <span className="text-gray-500">Общий Факт</span>
                                <span className="text-emerald-400 font-mono font-bold">
                                    {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(summaryMetrics?.totalFact || 0)}
                                </span>
                            </div>
                            <div className="h-6 w-px bg-gray-700"></div>
                            <div className="flex flex-col items-end">
                                <span className="text-gray-500">Активных ТТ</span>
                                <span className="text-indigo-400 font-mono font-bold">
                                    {summaryMetrics?.totalActiveClients || 0}
                                </span>
                            </div>
                        </div>
                    )}
                    
                    <div className="flex items-center gap-3">
                        <button className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors relative group">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                            {notifications.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>}
                        </button>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 border-2 border-gray-700"></div>
                    </div>
                </div>

                {/* Content Container */}
                <div className="py-8">
                    {renderContent()}
                </div>

                {/* Footer */}
                <footer className="border-t border-gray-800 p-6 text-center text-gray-600 text-xs">
                    <p>&copy; {new Date().getFullYear()} LimKorm Group. GPS-Enterprise Analytics System. All rights reserved.</p>
                </footer>
            </main>

            {/* Notification Toast */}
            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100] pointer-events-none">
                {notifications.map(n => (
                    <Notification key={n.id} message={n.message} type={n.type} />
                ))}
            </div>

            {/* Modals Layer */}
            {isDetailsModalOpen && selectedDetailsRow && (
                <DetailsModal isOpen={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={(client) => handleStartEdit(client, 'details')} />
            )}
            {isClientsModalOpen && (
                <ClientsListModal isOpen={isClientsModalOpen} onClose={() => setIsClientsModalOpen(false)} clients={filteredActiveClients} onClientSelect={handleClientSelectFromModal} onStartEdit={(client) => handleStartEdit(client, 'clients')} />
            )}
            {isUnidentifiedModalOpen && (
                <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={(row) => handleStartEdit(row, 'unidentified')} />
            )}
            {isEditModalOpen && (
                <AddressEditModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onBack={handleGoBackFromEdit} data={editingClient} onDataUpdate={handleDataUpdate} onStartPolling={pollSheetForCoordinates} onDelete={handleClientDelete} globalTheme={theme} />
            )}
            
            {/* Additional Analytics Modals */}
            {planExplanationData && (
                <GrowthExplanationModal 
                    isOpen={!!planExplanationData} 
                    onClose={() => setPlanExplanationData(null)} 
                    data={planExplanationData} 
                    baseRate={15} 
                />
            )}
        </div>
    );
};

export default App;
