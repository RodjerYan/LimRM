import React, { useState, useCallback, useRef, useEffect } from 'react';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import RMDashboard from './components/RMDashboard';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';

import { 
    AggregatedDataRow, 
    OkbDataRow, 
    OkbStatus, 
    FileProcessingState, 
    CloudLoadParams,
    WorkerMessage,
    UnidentifiedRow,
    NotificationMessage,
    CoordsCache,
    MapPoint
} from './types';

import { calculateSummaryMetrics } from './utils/dataUtils';

export default function App() {
    const [activeTab, setActiveTab] = useState('adapta');
    
    // Data State
    const [aggregatedData, setAggregatedData] = useState<AggregatedDataRow[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus>({ status: 'idle', message: null });
    const [okbRegionCounts, setOkbRegionCounts] = useState<{ [key: string]: number } | null>(null);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);

    // Processing State
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false,
        progress: 0,
        message: '',
        fileName: null,
        backgroundMessage: null,
        startTime: null,
        logs: [],
        loadedCount: 0
    });

    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [apiKeyError, setApiKeyError] = useState(false);

    const workerRef = useRef<Worker | null>(null);
    const aggregatedDataBuffer = useRef<AggregatedDataRow[]>([]);
    const unidentifiedBuffer = useRef<UnidentifiedRow[]>([]);

    const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    }, []);

    useEffect(() => {
        if (!import.meta.env.VITE_GEMINI_API_KEY) {
            setApiKeyError(true);
        }
    }, []);

    const handleResultFinished = useCallback(() => {
        setAggregatedData(aggregatedDataBuffer.current);
        setUnidentifiedRows(unidentifiedBuffer.current);
        addNotification(`Обработка завершена. Загружено: ${aggregatedDataBuffer.current.length} групп.`, 'success');
    }, [addNotification]);

    const initWorker = useCallback(async (
        startMessage: string,
        fileNameForState: string
    ) => {
        aggregatedDataBuffer.current = [];
        unidentifiedBuffer.current = [];

        setProcessingState({
            isProcessing: true,
            progress: 0,
            message: startMessage,
            fileName: fileNameForState,
            backgroundMessage: null,
            startTime: Date.now(),
            logs: [],
            loadedCount: 0
        });

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

        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            switch (msg.type) {
                case 'progress':
                    if (msg.payload.isBackground) {
                        if (msg.payload.percentage === 100 || msg.payload.message.toLowerCase().includes('завершен')) {
                            setProcessingState(prev => ({ ...prev, backgroundMessage: null }));
                        } else {
                            setProcessingState(prev => ({ ...prev, backgroundMessage: msg.payload.message }));
                        }
                    } else {
                        setProcessingState(prev => ({ 
                            ...prev, 
                            progress: msg.payload.percentage, 
                            message: msg.payload.message,
                            logs: [...prev.logs.slice(-5), msg.payload.message]
                        }));
                    }
                    break;
                case 'result_init':
                    setOkbRegionCounts(msg.payload.okbRegionCounts);
                    setDateRange(msg.payload.dateRange);
                    if (msg.payload.dateRange) {
                        addNotification(`Определен период данных: ${msg.payload.dateRange}`, 'info');
                    }
                    break;
                case 'result_chunk_aggregated':
                    const chunk = (msg.payload as AggregatedDataRow[]);
                    aggregatedDataBuffer.current.push(...chunk);
                    setProcessingState(prev => ({ 
                        ...prev, 
                        loadedCount: prev.loadedCount + chunk.length 
                    }));
                    break;
                case 'result_chunk_unidentified':
                    unidentifiedBuffer.current.push(...(msg.payload as UnidentifiedRow[]));
                    break;
                case 'result_finished':
                    handleResultFinished();
                    setProcessingState(prev => ({ 
                        ...prev, 
                        isProcessing: false, 
                        progress: 100, 
                        message: 'Обработка завершена!' 
                    }));
                    break;
                case 'background':
                    if (msg.payload.type === 'save_cache_batch') {
                        const { rmName, rows, batchId } = msg.payload.payload;
                        try {
                            await fetch('/api/add-to-cache', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ rmName, rows: rows.map((r: any) => ({ address: r.address })) })
                            });
                        } catch (err) {
                            console.error('Failed to save cache batch', err);
                        } finally {
                            workerRef.current?.postMessage({ type: 'ACK', payload: { batchId } });
                        }
                    }
                    break;
                case 'error':
                    setProcessingState(prev => ({ ...prev, isProcessing: false, message: `Ошибка: ${msg.payload}` }));
                    addNotification(msg.payload, 'error');
                    break;
            }
        };

        workerRef.current.postMessage({
            type: 'INIT_STREAM',
            payload: { okbData, cacheData }
        });

    }, [okbData, addNotification, handleResultFinished]);

    const handleStartProcessing = useCallback((file: File) => {
        if (okbStatus.status !== 'ready') {
            addNotification('Пожалуйста, дождитесь загрузки ОКБ.', 'error');
            return;
        }
        initWorker('Начало обработки файла...', file.name).then(() => {
            if (workerRef.current) {
                workerRef.current.postMessage({ file, okbData, cacheData: {} });
            }
        });
    }, [okbStatus, okbData, initWorker, addNotification]);

    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams) => {
        if (okbStatus.status !== 'ready') {
            addNotification('Пожалуйста, дождитесь загрузки ОКБ.', 'error');
            return;
        }
        
        await initWorker('Запрос данных из облака...', `Google Drive (${params.year})`);
        
        try {
            let queryStr = `year=${params.year}&mode=list`;
            if (params.month) queryStr += `&month=${params.month}`;
            
            const listRes = await fetch(`/api/get-akb?${queryStr}`);
            if (!listRes.ok) throw new Error('Failed to list files');
            const files = await listRes.json();
            
            if (files.length === 0) {
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Файлы не найдены.' }));
                addNotification('Файлы не найдены за выбранный период', 'error');
                return;
            }

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setProcessingState(prev => ({ 
                    ...prev, 
                    message: `Загрузка файла ${i+1}/${files.length}: ${file.name}`,
                    progress: 10 + ((i / files.length) * 80)
                }));
                
                const contentRes = await fetch(`/api/get-akb?year=${params.year}&fileId=${file.id}`);
                if (!contentRes.ok) continue;
                const rawData = await contentRes.json();
                
                if (workerRef.current) {
                    workerRef.current.postMessage({ 
                        type: 'PROCESS_CHUNK', 
                        payload: { 
                            rawData, 
                            isFirstChunk: i === 0,
                            fileName: file.name 
                        } 
                    });
                }
            }
            
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'FINALIZE_STREAM' });
            }

        } catch (e) {
            console.error(e);
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка загрузки облака.' }));
            addNotification('Ошибка при загрузке данных из облака', 'error');
        }
    }, [okbStatus, initWorker, addNotification]);

    if (apiKeyError) {
        return <ApiKeyErrorDisplay />;
    }

    return (
        <div className="flex h-screen bg-gray-900 text-white font-sans overflow-hidden">
            <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
            
            <main className="flex-1 ml-0 lg:ml-64 p-6 overflow-y-auto custom-scrollbar relative">
                <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
                    {notifications.map(n => (
                        <div key={n.id} className="pointer-events-auto">
                            <Notification message={n.message} type={n.type} />
                        </div>
                    ))}
                </div>

                <div className="max-w-7xl mx-auto space-y-6 pb-20">
                    {activeTab === 'adapta' && (
                        <Adapta 
                            processingState={processingState}
                            onStartProcessing={handleStartProcessing}
                            onStartCloudProcessing={handleStartCloudProcessing}
                            onFileProcessed={() => {}}
                            onProcessingStateChange={() => {}}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            onOkbStatusChange={setOkbStatus}
                            onOkbDataChange={setOkbData}
                            disabled={processingState.isProcessing}
                            unidentifiedCount={unidentifiedRows.length}
                            activeClientsCount={aggregatedData.reduce((acc, r) => acc + r.clients.length, 0)}
                            uploadedData={aggregatedData}
                        />
                    )}

                    {activeTab === 'dashboard' && (
                        <RMDashboard 
                            isOpen={true} 
                            onClose={() => setActiveTab('adapta')} 
                            data={aggregatedData}
                            okbRegionCounts={okbRegionCounts}
                            okbData={okbData}
                            mode="page"
                            metrics={calculateSummaryMetrics(aggregatedData)}
                            okbStatus={okbStatus}
                            dateRange={dateRange}
                        />
                    )}

                    {activeTab === 'prophet' && (
                        <Prophet data={aggregatedData} />
                    )}

                    {activeTab === 'agile' && (
                        <AgileLearning data={aggregatedData} />
                    )}

                    {activeTab === 'roi-genome' && (
                        <RoiGenome data={aggregatedData} />
                    )}
                    
                    {activeTab === 'amp' && (
                        <div className="text-center text-gray-500 mt-20">
                            <p>Модуль AMP находится в разработке.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}