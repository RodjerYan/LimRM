import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AggregatedDataRow, FilterState, LoadingState, NotificationMessage, SortConfig } from './types';
import { calculateMetrics, formatLargeNumber } from './utils/dataUtils';
import FileUpload from './components/FileUpload';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import { regionCenters } from './utils/regionCenters';
import OKBManagement from './components/OKBManagement';

declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_GEMINI_API_KEY: string;
      readonly VITE_GEMINI_PROXY_URL?: string;
    };
  }
}

const getInitialFilters = (): FilterState => {
    try {
        const savedFilters = localStorage.getItem('geoAnalysisFilters');
        if (!savedFilters) return { rm: '', brand: [], city: [] };

        const parsed = JSON.parse(savedFilters);
        return {
            rm: parsed?.rm || '',
            brand: Array.isArray(parsed?.brand) ? parsed.brand : [],
            city: Array.isArray(parsed?.city) ? parsed.city : [],
        };
    } catch (error) {
        console.error("Failed to parse filters from localStorage", error);
        return { rm: '', brand: [], city: [] };
    }
};

export default function App() {
    const apiKeyExists = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKeyExists) {
        return <ApiKeyErrorDisplay />;
    }
    
    const [aggregatedData, setAggregatedData] = useState<AggregatedDataRow[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle', progress: 0, text: '', etr: '' });
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [failedRegions, setFailedRegions] = useState<Set<string>>(new Set());
    
    const [filters, setFilters] = useState<FilterState>(getInitialFilters);
    const [searchTerm, setSearchTerm] = useState<string>(() => localStorage.getItem('geoAnalysisSearchTerm') || '');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'growthPotential', direction: 'descending' });

    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        try {
            localStorage.setItem('geoAnalysisFilters', JSON.stringify(filters));
        } catch (error) {
            console.error("Could not save filters to localStorage", error);
        }
    }, [filters]);

    useEffect(() => {
        try {
            localStorage.setItem('geoAnalysisSearchTerm', searchTerm);
        } catch (error) {
            console.error("Could not save search term to localStorage", error);
        }
    }, [searchTerm]);

    const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    }, []);
    
    const cleanupWorker = () => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
    };

    useEffect(() => {
        addNotification('Система готова! Загрузите файл или обновите базу ОКБ.', 'success');
        return () => cleanupWorker();
    }, [addNotification]);
    
    const handleFileSelect = async (file: File) => {
        cleanupWorker(); 

        setAggregatedData([]);
        setFilters({ rm: '', brand: [], city: [] });
        setSearchTerm('');
        setFailedRegions(new Set());
        
        try {
            setLoadingState({ status: 'fetching', progress: 5, text: 'Загрузка мастер-базы ОКБ...', etr: '' });
            const okbResponse = await fetch('/api/get-okb');
            if (!okbResponse.ok) {
                const errorData = await okbResponse.json();
                throw new Error(errorData.error || 'Не удалось загрузить базу ОКБ с сервера.');
            }
            const okbData = await okbResponse.json();

            if (okbData.length === 0) {
                 addNotification('База ОКБ пуста. Сначала обновите её.', 'error');
                 setLoadingState({ status: 'error', progress: 0, text: 'Ошибка: База ОКБ не содержит данных.', etr: '' });
                 return;
            }
            
            // Modern and robust way to instantiate a worker with Vite
            workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
            
            workerRef.current.onmessage = (e: MessageEvent<{ type: string; payload: any }>) => {
                const { type, payload } = e.data;

                if (type === 'progress') {
                    setLoadingState(payload);
                } else if (type === 'result') {
                    setAggregatedData(payload);
                    setLoadingState({ status: 'done', progress: 100, text: 'Анализ завершен!', etr: '' });
                    addNotification('Анализ потенциальных клиентов завершен!', 'success');
                    setTimeout(() => {
                        setLoadingState({ status: 'idle', progress: 0, text: '', etr: '' });
                    }, 3000);
                    cleanupWorker();
                } else if (type === 'error') {
                    console.error("Error from worker:", payload);
                    addNotification('Ошибка: ' + payload, 'error');
                    setLoadingState({ status: 'error', progress: 0, text: 'Ошибка: ' + payload, etr: '' });
                    cleanupWorker();
                }
            };

            workerRef.current.onerror = (e) => {
                 console.error("Unhandled worker error:", e);
                 const errorMessage = "Произошла критическая ошибка в фоновом обработчике.";
                 addNotification('Ошибка: ' + errorMessage, 'error');
                 setLoadingState({ status: 'error', progress: 0, text: errorMessage, etr: '' });
                 cleanupWorker();
            };
            
            setLoadingState({ status: 'reading', progress: 15, text: 'Отправка данных в анализатор...', etr: '' });
            workerRef.current.postMessage({ file, okbData });

        } catch(error: any) {
            console.error("Failed during file select process:", error);
            addNotification(error.message, 'error');
            setLoadingState({ status: 'error', progress: 0, text: error.message, etr: '' });
        }
    };


    const handleFilterChange = useCallback((newFilters: FilterState) => {
        setFilters(newFilters);
    }, []);

    const resetFilters = useCallback(() => {
        setFilters({ rm: '', brand: [], city: [] });
        setSearchTerm('');
        addNotification('Фильтры сброшены.', 'success');
    }, [addNotification]);

    const requestSort = useCallback((key: keyof AggregatedDataRow) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]);

    const filterOptions = useMemo(() => {
        const rms = [...new Set(aggregatedData.map(d => d.rm))].sort();
        const brands = [...new Set(aggregatedData.map(d => d.brand))].sort();
        const cities = [...new Set(aggregatedData.map(d => d.city))].sort();
        return { rms, brands, cities };
    }, [aggregatedData]);

    const normalize = useCallback((str: string): string =>
        str
        ?.toLowerCase()
        .replace(/(город федерального значения|автономный округ|республика|область|край|ао|г\.|обл\.|респ\.)/gi, '')
        .trim()
        .replace(/\s+/g, ' '),
    []);

    const matchesRegionOrCity = useCallback((item: AggregatedDataRow, query: string): boolean => {
        const normQuery = normalize(query);
        if (!normQuery) return false;

        const normItemCity = normalize(item.city);

        if (normItemCity.includes(normQuery)) {
            return true;
        }

        const regionForQuery = regionCenters[normQuery as keyof typeof regionCenters];
        if (regionForQuery && normalize(regionForQuery).includes(normItemCity)) {
            return true;
        }

        const regionForItem = Object.keys(regionCenters).find(key => normalize(regionCenters[key as keyof typeof regionCenters]) === normItemCity);
        if (regionForItem && normalize(regionForItem).includes(normQuery)) {
            return true;
        }
        
        return false;
    }, [normalize]);

    const filteredAndSortedData = useMemo(() => {
        let processedData = aggregatedData.filter(item => 
            (!filters.rm || item.rm === filters.rm) &&
            (filters.brand.length === 0 || filters.brand.includes(item.brand)) &&
            (filters.city.length === 0 || filters.city.includes(item.city))
        );

        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            processedData = processedData.filter(item =>
                item.rm.toLowerCase().includes(lowercasedTerm) ||
                item.brand.toLowerCase().includes(lowercasedTerm) ||
                matchesRegionOrCity(item, searchTerm) ||
                String(item.potentialTTs).includes(lowercasedTerm) ||
                formatLargeNumber(item.fact).toLowerCase().includes(lowercasedTerm) ||
                formatLargeNumber(item.potential).toLowerCase().includes(lowercasedTerm) ||
                formatLargeNumber(item.growthPotential).toLowerCase().includes(lowercasedTerm) ||
                item.growthRate.toFixed(2).includes(lowercasedTerm)
            );
        }

        if (sortConfig !== null) {
            processedData.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return sortConfig.direction === 'ascending' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                if (aVal < bVal) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aVal > bVal) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        
        return processedData;
    }, [aggregatedData, filters, searchTerm, sortConfig, matchesRegionOrCity]);

    const metrics = useMemo(() => calculateMetrics(filteredAndSortedData), [filteredAndSortedData]);

    const totalPotentialTTs = useMemo(() => {
        const cityTTs = new Map<string, number>();
        filteredAndSortedData.forEach(item => {
            if (!cityTTs.has(item.city)) {
                cityTTs.set(item.city, item.potentialTTs || 0);
            }
        });
        return Array.from(cityTTs.values()).reduce((sum, count) => sum + count, 0);
    }, [filteredAndSortedData]);


    return (
        <div className="container mx-auto p-4 md:p-8 min-h-screen">
            <header className="mb-10 text-center">
                <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                    Гео-Анализ <span className="text-accent">Limkorm</span>
                </h1>
                <p className="text-gray-400 mt-2 max-w-2xl mx-auto">
                    Инструмент для планирования продаж: детализация по РМ, Бренду и Городу на основе открытых данных OpenStreetMap.
                </p>
            </header>

            <div id="notification-area" className="fixed top-4 right-4 z-[100] space-y-2 w-full max-w-sm">
                {notifications.map(n => (
                    <Notification key={n.id} message={n.message} type={n.type} />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-8">
                    <OKBManagement addNotification={addNotification} />
                    <FileUpload onFileSelect={handleFileSelect} loadingState={loadingState} />
                    <Filters 
                        options={filterOptions}
                        currentFilters={filters}
                        onFilterChange={handleFilterChange}
                        onReset={resetFilters}
                        disabled={aggregatedData.length === 0}
                    />
                    <MetricsSummary metrics={metrics} totalPotentialTTs={totalPotentialTTs} />
                </div>

                <div className="lg:col-span-2 space-y-8">
                    <PotentialChart data={filteredAndSortedData} />
                    <ResultsTable 
                        data={filteredAndSortedData} 
                        isLoading={loadingState.status !== 'idle' && loadingState.status !== 'done'}
                        sortConfig={sortConfig}
                        requestSort={requestSort}
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        failedRegions={failedRegions}
                    />
                </div>
            </div>
        </div>
    );
}
