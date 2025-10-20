// FIX: Add a triple-slash directive to include Vite's client types,
// which provides type definitions for `import.meta.env`.
/// <reference types="vite/client" />
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import FileUpload from '../components/FileUpload';
import Filters from '../components/Filters';
import MetricsSummary from '../components/MetricsSummary';
import ResultsTable from '../components/ResultsTable';
import DetailsModal from '../components/DetailsModal';
import PotentialChart from '../components/PotentialChart';
import ApiKeyErrorDisplay from '../components/ApiKeyErrorDisplay';
import Notification from '../components/Notification';
import ExportControls from '../components/ExportControls';
import { LoadingState, ProcessedData, FilterState, AggregatedDataRow, NotificationMessage } from '../types';
import { parseFile } from '../services/fileParser';
import { applyFilters } from '../utils/dataUtils';
import { formatETR } from '../utils/timeUtils';

const initialFilterState: FilterState = { rm: '', brand: [], city: [] };

// Проверка ключей API на клиенте
// FIX: Add an explicit return type to the function. This allows TypeScript
// to correctly infer the type of `apiKeyStatus` and narrow it down in
// conditional checks, resolving the assignment error for the `errorType` prop.
const checkApiKeyConfig = (): 'missing' | 'swapped' | 'ok' => {
    const keyVar = import.meta.env.VITE_GEMINI_API_KEY;
    const proxyVar = import.meta.env.VITE_GEMINI_PROXY_URL;
    const osmProxyVar = import.meta.env.VITE_OSM_PROXY_URL;
    
    if (!keyVar || !proxyVar || !osmProxyVar) {
        return 'missing';
    }
    if (keyVar.startsWith('AIza')) {
        return 'swapped';
    }
    return 'ok';
};


const IndexPage: React.FC = () => {
    const [apiKeyStatus] = useState(checkApiKeyConfig());
    const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
    const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle', progress: 0, text: '' });
    const [filters, setFilters] = useState<FilterState>(initialFilterState);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRow, setSelectedRow] = useState<AggregatedDataRow | null>(null);
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [worker, setWorker] = useState<Worker | null>(null);
    const [startTime, setStartTime] = useState<number | null>(null);

    // Инициализация Web Worker
    useEffect(() => {
        const newWorker = new Worker(new URL('../services/processing.worker.ts', import.meta.url), { type: 'module' });
        setWorker(newWorker);

        return () => {
            newWorker.terminate();
        };
    }, []);

    // Обработка сообщений от Worker
    useEffect(() => {
        if (!worker) return;

        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'progress') {
                const elapsed = (Date.now() - (startTime ?? Date.now())) / 1000;
                const speed = payload.progress / Math.max(elapsed, 1);
                const remainingProgress = 100 - payload.progress;
                const remainingTime = remainingProgress / speed;

                setLoadingState({
                    ...payload,
                    etr: payload.progress > 5 && remainingTime !== Infinity ? formatETR(remainingTime) : undefined
                });
            } else if (type === 'result') {
                setProcessedData(payload);
                setLoadingState({ status: 'done', progress: 100, text: 'Анализ завершен!' });
                addNotification('Данные успешно обработаны', 'success');
                // Инициализируем фильтры (выбираем все)
                setFilters({
                    rm: '',
                    brand: payload.filterOptions.brands,
                    city: payload.filterOptions.cities,
                });
            } else if (type === 'error') {
                setLoadingState({ status: 'error', progress: 0, text: `Ошибка: ${payload}` });
                addNotification(`Ошибка обработки: ${payload}`, 'error');
            }
        };

        worker.onerror = (err) => {
            console.error('Worker error:', err);
            setLoadingState({ status: 'error', progress: 0, text: 'Критическая ошибка воркера' });
            addNotification('Произошла критическая ошибка при обработке данных.', 'error');
        };

    }, [worker, startTime]);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const id = Math.random().toString(36);
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    }, []);

    const handleFileSelect = async (file: File) => {
        setLoadingState({ status: 'reading', progress: 0, text: 'Чтение файла...' });
        setProcessedData(null);
        setFilters(initialFilterState);
        setStartTime(Date.now());
        try {
            const rawData = await parseFile(file);
            if (rawData.length === 0) {
                throw new Error("Файл пуст или не содержит данных.");
            }
            setLoadingState({ status: 'processing', progress: 10, text: 'Отправка данных на анализ...' });
            worker?.postMessage({ fileData: rawData });

        } catch (error: any) {
            setLoadingState({ status: 'error', progress: 0, text: error.message });
            addNotification(error.message, 'error');
        }
    };
    
    const handleFilterChange = useCallback((newFilters: FilterState) => {
        setFilters(newFilters);
    }, []);
    
    const handleResetFilters = useCallback(() => {
        if (!processedData) return;
        setFilters({
            rm: '',
            brand: processedData.filterOptions.brands,
            city: processedData.filterOptions.cities
        });
    }, [processedData]);

    const handleRowClick = (rowData: AggregatedDataRow) => {
        setSelectedRow(rowData);
        setIsModalOpen(true);
    };

    const filteredData = useMemo(() => {
        if (!processedData) return [];
        return applyFilters(processedData.aggregatedData, filters);
    }, [processedData, filters]);

    const metrics = useMemo(() => {
        const totalFact = filteredData.reduce((sum, row) => sum + row.fact, 0);
        const totalPotential = filteredData.reduce((sum, row) => sum + row.potential, 0);
        return { totalFact, totalPotential };
    }, [filteredData]);

    if (apiKeyStatus !== 'ok') {
        return <ApiKeyErrorDisplay errorType={apiKeyStatus} />;
    }

    const isDataLoaded = processedData !== null;
    const isLoading = loadingState.status !== 'idle' && loadingState.status !== 'done' && loadingState.status !== 'error';

    return (
        <div className="min-h-screen bg-primary-dark text-gray-200 font-sans p-4 lg:p-8">
            {/* Notifications Container */}
            <div className="fixed top-5 right-5 z-[100] space-y-3 w-80">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            <header className="mb-8">
                <h1 className="text-4xl font-bold text-white">
                    Limkorm <span className="text-accent">Geo-Analytics</span>
                </h1>
                <p className="text-gray-400 mt-1">Инструмент для анализа и планирования продаж</p>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left Sidebar */}
                <aside className="lg:col-span-1 space-y-8">
                    <FileUpload onFileSelect={handleFileSelect} loadingState={loadingState} />
                    <Filters 
                        options={processedData?.filterOptions || { rms: [], brands: [], cities: [] }} 
                        currentFilters={filters}
                        onFilterChange={handleFilterChange}
                        onReset={handleResetFilters}
                        disabled={!isDataLoaded || isLoading}
                    />
                </aside>

                {/* Main Content */}
                <div className="lg:col-span-3 space-y-8">
                    <MetricsSummary 
                        totalFact={metrics.totalFact}
                        totalPotential={metrics.totalPotential}
                        filteredCount={filteredData.length}
                        totalCount={processedData?.aggregatedData.length || 0}
                    />
                    <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 min-h-[400px]">
                         <div className="flex justify-between items-center mb-4">
                             <h2 className="text-xl font-bold text-white">Детализация по рынку</h2>
                            <ExportControls data={filteredData} disabled={filteredData.length === 0}/>
                        </div>
                        <div className="h-[60vh] max-h-[700px]">
                            <ResultsTable data={filteredData} onRowClick={handleRowClick} />
                        </div>
                    </div>
                     {filteredData.length > 0 && (
                        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 h-96">
                             <PotentialChart data={filteredData} />
                        </div>
                    )}
                </div>
            </main>

            <DetailsModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                data={selectedRow}
            />
        </div>
    );
};

export default IndexPage;