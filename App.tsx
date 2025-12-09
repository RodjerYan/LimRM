import React, { useState, useCallback, useRef, useEffect } from 'react';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import RMDashboard from './components/RMDashboard';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome';
import Notification from './components/Notification';
import UnidentifiedRowsModal from './components/UnidentifiedRowsModal';
import AddressEditModal from './components/AddressEditModal';
import { 
    FileProcessingState, 
    OkbStatus, 
    AggregatedDataRow, 
    OkbDataRow, 
    SummaryMetrics,
    WorkerMessage,
    WorkerResultPayload,
    MapPoint,
    CoordsCache,
    UnidentifiedRow,
    NotificationMessage
} from './types';
import { calculateSummaryMetrics } from './utils/dataUtils';

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState('adapta');
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false,
        progress: 0,
        message: '',
        fileName: null,
        backgroundMessage: null,
        startTime: null
    });
    const [okbStatus, setOkbStatus] = useState<OkbStatus>({ status: 'idle', message: null });
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [data, setData] = useState<AggregatedDataRow[]>([]);
    const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{ [key: string]: number } | null>(null);
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    // Data for modals and editing
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<UnidentifiedRow | MapPoint | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);

    const workerRef = useRef<Worker | null>(null);
    const processingQueue = useRef<Set<string>>(new Set());

    const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
    }, []);

    const handleDataUpdate = useCallback((key: string, newPoint: MapPoint, originalIndex?: number) => {
         setData(prevData => {
             return prevData.map(group => {
                 const clientIndex = group.clients.findIndex(c => c.key === key);
                 if (clientIndex !== -1) {
                     const newClients = [...group.clients];
                     newClients[clientIndex] = { ...newClients[clientIndex], ...newPoint };
                     return { ...group, clients: newClients };
                 }
                 return group;
             });
         });
         // Also update unidentified rows if applicable
         if (originalIndex !== undefined) {
             setUnidentifiedRows(prev => prev.filter(r => r.originalIndex !== originalIndex));
         }
    }, []);

    const pollSheetForCoordinates = useCallback(async (rmName: string, address: string, tempKey: string, basePoint: MapPoint, originalIndex?: number) => {
        const processKey = `${rmName}-${address}`;
        if (processingQueue.current.has(processKey)) return;
        processingQueue.current.add(processKey);

        const MAX_POLL_TIME = 48 * 60 * 60 * 1000;
        const startTime = Date.now();

        // Fire and forget update request
        fetch(`/api/data-service?action=geocode&address=${encodeURIComponent(address)}`)
            .then(res => res.ok ? res.json() : null)
            .then(coords => {
                if (coords) {
                     fetch('/api/data-service?action=update-coords', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ rmName, updates: [{ address, lat: coords.lat, lon: coords.lon }] })
                    }).catch(console.error);
                }
            }).catch(console.error);

        const check = async () => {
            try {
                if (Date.now() - startTime > MAX_POLL_TIME) throw new Error('Timeout waiting for coordinates');
                const res = await fetch(`/api/data-service?action=get-cached-address&rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(address)}`);
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

    const initWorker = useCallback(async (
        payload: { file?: File, rawSheetData?: any[][] },
        messageStart: string, 
        fileNameForState: string
    ) => {
        setProcessingState({
            isProcessing: true,
            progress: 0,
            message: messageStart,
            fileName: fileNameForState,
            backgroundMessage: null,
            startTime: Date.now()
        });

        // Recreate worker
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (event: MessageEvent<WorkerMessage>) => {
            const { type, payload } = event.data;
            if (type === 'progress') {
                setProcessingState(prev => ({
                    ...prev,
                    progress: payload.percentage,
                    message: payload.message,
                    backgroundMessage: payload.isBackground ? payload.message : prev.backgroundMessage
                }));
            } else if (type === 'result') {
                const result = payload as WorkerResultPayload;
                setData(result.aggregatedData);
                setUnidentifiedRows(result.unidentifiedRows);
                setOkbRegionCounts(result.okbRegionCounts);
                if(result.dateRange) setDateRange(result.dateRange);
                
                const metrics = calculateSummaryMetrics(result.aggregatedData);
                setMetrics(metrics);

                setProcessingState(prev => ({
                    ...prev,
                    isProcessing: false,
                    progress: 100,
                    message: 'Обработка завершена',
                    backgroundMessage: null
                }));
                addNotification('Файл успешно обработан', 'success');
            } else if (type === 'error') {
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: `Ошибка: ${payload}` }));
                addNotification(`Ошибка обработки: ${payload}`, 'error');
            }
        };

        // Fetch cache first then post message
        try {
            // Using unified data-service
            const response = await fetch(`/api/data-service?action=get-full-cache&t=${Date.now()}`, { cache: 'no-store' });
            let cacheData: CoordsCache = {};
            if (response.ok) {
                cacheData = await response.json();
                setProcessingState(prev => ({ ...prev, message: 'Кэш загружен, инициализация...' }));
            }
            
            workerRef.current.postMessage({ 
                type: 'process', 
                payload: { ...payload, cacheData, okbData } 
            });

        } catch (error) {
            console.error('Cache load error', error);
            // Try processing without cache
            workerRef.current.postMessage({ 
                type: 'process', 
                payload: { ...payload, cacheData: {}, okbData } 
            });
        }
    }, [okbData, addNotification]);

    const handleStartFileProcessing = useCallback((file: File) => {
        initWorker({ file }, 'Чтение файла...', file.name);
    }, [initWorker]);

    const handleStartCloudProcessing = useCallback(async () => {
        setProcessingState({
            isProcessing: true,
            progress: 5,
            message: 'Подключение к Google Sheets (АКБ)...',
            fileName: 'Cloud: AKB Sheet',
            backgroundMessage: null,
            startTime: Date.now()
        });

        try {
            const response = await fetch('/api/data-service?action=get-akb');
            if (!response.ok) throw new Error('Failed to fetch AKB data from cloud');
            const rawSheetData = await response.json();
            
            if (!Array.isArray(rawSheetData) || rawSheetData.length === 0) {
                throw new Error('Cloud sheet is empty');
            }

            initWorker({ rawSheetData }, 'Данные получены, запуск обработки...', 'Cloud: AKB Sheet');

        } catch (error) {
            console.error("Cloud load error:", error);
            setProcessingState(prev => ({ 
                ...prev, 
                isProcessing: false, 
                message: `Ошибка загрузки из облака: ${(error as Error).message}` 
            }));
            addNotification('Не удалось загрузить данные из Google Sheets', 'error');
        }
    }, [initWorker, addNotification]);

    const handleDeleteRow = useCallback((key: string) => {
        // Find row, remove from data/unidentified
        // This is a stub for the logic passed to AddressEditModal
        setData(prev => {
             return prev.map(group => ({
                 ...group,
                 clients: group.clients.filter(c => c.key !== key)
             })).filter(group => group.clients.length > 0);
        });
        setUnidentifiedRows(prev => prev.filter(r => {
            // Unidentified rows use originalIndex, need mapping
            // For now, simpler refresh might be needed or detailed tracking
            return true; 
        }));
        setIsEditModalOpen(false);
        addNotification('Запись скрыта из текущего набора', 'info');
    }, [addNotification]);

    return (
        <div className="flex h-screen bg-gray-900 text-white font-sans overflow-hidden">
            <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
            <main className="flex-1 overflow-auto ml-0 lg:ml-64 p-6 relative">
                <div className="max-w-[1920px] mx-auto space-y-6">
                    {activeTab === 'adapta' && (
                        <Adapta 
                            processingState={processingState}
                            onStartProcessing={handleStartFileProcessing}
                            onStartCloudProcessing={handleStartCloudProcessing}
                            onFileProcessed={() => {}} // Legacy
                            onProcessingStateChange={() => {}} // Legacy
                            okbData={okbData}
                            okbStatus={okbStatus}
                            onOkbStatusChange={setOkbStatus}
                            onOkbDataChange={setOkbData}
                            disabled={processingState.isProcessing}
                            unidentifiedCount={unidentifiedRows.length}
                            activeClientsCount={metrics?.totalActiveClients || 0}
                            uploadedData={data}
                        />
                    )}
                    {activeTab === 'amp' && (
                        <RMDashboard 
                            isOpen={true} 
                            onClose={() => {}} 
                            data={data} 
                            okbRegionCounts={okbRegionCounts}
                            okbData={okbData}
                            mode="page"
                            metrics={metrics}
                            okbStatus={okbStatus}
                            onEditClient={(c) => { setEditingRow(c); setIsEditModalOpen(true); }}
                            dateRange={dateRange}
                        />
                    )}
                    {activeTab === 'dashboard' && (
                         <RMDashboard 
                            isOpen={true} 
                            onClose={() => {}} 
                            data={data} 
                            okbRegionCounts={okbRegionCounts}
                            okbData={okbData}
                            mode="page"
                            metrics={metrics}
                            okbStatus={okbStatus}
                            onEditClient={(c) => { setEditingRow(c); setIsEditModalOpen(true); }}
                            dateRange={dateRange}
                        />
                    )}
                    {activeTab === 'prophet' && <Prophet data={data} />}
                    {activeTab === 'agile' && <AgileLearning data={data} />}
                    {activeTab === 'roi-genome' && <RoiGenome data={data} />}
                </div>
                
                {/* Floating Notifications */}
                <div className="fixed top-4 right-4 z-[100] space-y-2">
                    {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
                </div>

                {/* Modals */}
                {unidentifiedRows.length > 0 && (
                    <div className="fixed bottom-4 right-4 z-50">
                        <button 
                            onClick={() => setIsUnidentifiedModalOpen(true)}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-full shadow-lg animate-bounce"
                        >
                            Неопознанные: {unidentifiedRows.length}
                        </button>
                    </div>
                )}
                
                <UnidentifiedRowsModal 
                    isOpen={isUnidentifiedModalOpen} 
                    onClose={() => setIsUnidentifiedModalOpen(false)} 
                    rows={unidentifiedRows} 
                    onStartEdit={(row) => { setEditingRow(row); setIsEditModalOpen(true); }} 
                />

                <AddressEditModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onBack={() => setIsEditModalOpen(false)}
                    data={editingRow}
                    onDataUpdate={handleDataUpdate}
                    onStartPolling={pollSheetForCoordinates}
                    onDelete={handleDeleteRow}
                    globalTheme="dark"
                />
            </main>
        </div>
    );
};

export default App;