import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AggregatedDataRow, FilterState, LoadingState, NotificationMessage, SortConfig, GeminiAnalysisResult } from './types';
import { calculateMetrics, formatLargeNumber } from './utils/dataUtils';
import { parseFile } from './services/fileParser';
import { getGeminiSalesAnalysis } from './services/aiService';
import FileUpload from './components/FileUpload';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import ChoroplethMap from './components/ChoroplethMap';
import InsightCard from './components/InsightCard';


// FIX: Augment the global ImportMetaEnv interface to correctly define Vite environment variables.
// This resolves the "Subsequent property declarations must have the same type" error by
// augmenting the existing `ImportMetaEnv` type instead of re-declaring `import.meta.env`.
declare global {
  interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string;
    readonly VITE_GEMINI_PROXY_URL?: string;
    readonly VITE_OSM_PROXY_URL?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export default function App() {
    const clientApiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!clientApiKey || !import.meta.env.VITE_OSM_PROXY_URL || !import.meta.env.VITE_GEMINI_PROXY_URL) {
        return <ApiKeyErrorDisplay errorType="missing" />;
    }
    // NEW: Add a specific check to prevent a common user error where the actual API key
    // is placed in the client-side variable, which is both a security risk and incorrect.
    if (clientApiKey.startsWith('AIza')) {
        return <ApiKeyErrorDisplay errorType="swapped" />;
    }
    
    const [baseAggregatedData, setBaseAggregatedData] = useState<AggregatedDataRow[]>([]);
    const [dataWithPlan, setDataWithPlan] = useState<AggregatedDataRow[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle', progress: 0, text: '', etr: '' });
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [geminiAnalysis, setGeminiAnalysis] = useState<{ loading: boolean; data?: GeminiAnalysisResult | null; error?: string | null; }>({ loading: false, data: null, error: null });
    
    const [filters, setFilters] = useState<FilterState>(() => {
        try {
            const savedFilters = localStorage.getItem('geoAnalysisFilters');
            const parsed = savedFilters ? JSON.parse(savedFilters) : null;
            return {
                rm: Array.isArray(parsed?.rm) ? parsed.rm : [],
                brand: Array.isArray(parsed?.brand) ? parsed.brand : [],
                city: Array.isArray(parsed?.city) ? parsed.city : [],
            };
        } catch (error) {
            console.error("Failed to parse filters from localStorage", error);
            return { rm: [], brand: [], city: [] };
        }
    });
    const [searchTerm, setSearchTerm] = useState<string>(() => localStorage.getItem('geoAnalysisSearchTerm') || '');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'growthPotential', direction: 'descending' });
    const [baseIncreasePercent, setBaseIncreasePercent] = useState<number>(15);

    const workerRef = useRef<Worker | null>(null);

    const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 4000);
    }, []);

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

    // --- New Plan Calculation Effect ---
    useEffect(() => {
        if (baseAggregatedData.length === 0) {
            setDataWithPlan([]);
            return;
        }

        // --- Этап 1: Предварительный расчет общих сумм ---
        const rmTotals = new Map<string, { fact: number }>();
        const brandTotals = new Map<string, { fact: number }>();
        const rmBrandTotals = new Map<string, { fact: number }>();
        const brandRowCounts = new Map<string, number>();
        let totalFactAll = 0;

        baseAggregatedData.forEach(row => {
            const rmKey = row.rm;
            rmTotals.set(rmKey, { fact: (rmTotals.get(rmKey)?.fact || 0) + row.fact });
            const brandKey = row.brand;
            brandTotals.set(brandKey, { fact: (brandTotals.get(brandKey)?.fact || 0) + row.fact });
            const rmBrandKey = `${row.rm}|${row.brand}`;
            rmBrandTotals.set(rmBrandKey, { fact: (rmBrandTotals.get(rmBrandKey)?.fact || 0) + row.fact });
            totalFactAll += row.fact;
            brandRowCounts.set(row.brand, (brandRowCounts.get(row.brand) || 0) + 1);
        });
        
        // --- Этап 2: Основной расчет нового плана для каждой строки ---
        const calculatedData = baseAggregatedData.map(row => {
            const { fact, rm, brand, activeTT, totalMarketTTs } = row;
            if (fact === 0) {
                const brandTotalFact = brandTotals.get(brand)?.fact || 0;
                const brandCount = brandRowCounts.get(brand) || 1;
                const brandAvgFact = brandTotalFact / brandCount;
                const newPlan = Math.max(50, brandAvgFact * 0.1); 
                return { ...row, newPlan };
            }

            const baseInc = baseIncreasePercent / 100;
            const maxDynamicGrowth = 0.15;
            const w_coverage = 0.6;
            const w_brand = 0.4;
            const effectiveTotalMarket = Math.max(activeTT, totalMarketTTs) + Math.ceil(activeTT * 0.10);
            const penetration = Math.min(1.0, activeTT > 0 ? (activeTT / effectiveTotalMarket) : 0);
            const coverageScore = Math.sqrt(1 - penetration);

            const brandTotalFact = brandTotals.get(brand)?.fact || 0;
            const rmTotalFact = rmTotals.get(rm)?.fact || 0;
            const rmBrandTotalFact = rmBrandTotals.get(`${rm}|${brand}`)?.fact || 0;
            
            let brandScore = 0;
            if (rmTotalFact > 0 && brandTotalFact > 0 && totalFactAll > 0) {
                const brandShareAvg = brandTotalFact / totalFactAll;
                const brandShareRM = rmBrandTotalFact / rmTotalFact;
                if (brandShareRM > 0) {
                    brandScore = Math.tanh((brandShareAvg / brandShareRM) - 1);
                } else {
                    brandScore = 1; 
                }
            }
            
            const dynamicGrowth = maxDynamicGrowth * (w_coverage * coverageScore + w_brand * brandScore);
            const newPlan = Math.max(fact, fact * (1 + baseInc + dynamicGrowth));
            return { ...row, newPlan };
        });

        setDataWithPlan(calculatedData);
        setLoadingState({ status: 'done', progress: 100, text: 'Анализ завершен!', etr: '' });
        addNotification('Анализ рынка и расчет планов завершен!', 'success');
        const resetTimer = setTimeout(() => {
            setLoadingState({ status: 'idle', progress: 0, text: '', etr: '' });
        }, 3000);
        return () => clearTimeout(resetTimer);
    }, [baseAggregatedData, baseIncreasePercent, addNotification]);


    const cleanupWorker = () => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
    };

    useEffect(() => {
        addNotification('Система готова! Пожалуйста, загрузите файл Excel/CSV.', 'success');
        return () => cleanupWorker();
    }, [addNotification]);
    
    const handleFileSelect = async (file: File) => {
        cleanupWorker();
        setBaseAggregatedData([]);
        setDataWithPlan([]);
        setFilters({ rm: [], brand: [], city: [] });
        setSearchTerm('');
        setGeminiAnalysis({ loading: false, data: null, error: null });

        // Start Gemini Analysis (runs in parallel)
        const runGeminiAnalysis = async (file: File) => {
            setGeminiAnalysis({ loading: true, data: null, error: null });
            try {
                // Read file as text to get CSV data
                const fileText = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event) => resolve(event.target?.result as string);
                    reader.onerror = (error) => reject(error);
                    reader.readAsText(file);
                });

                const analysisResult = await getGeminiSalesAnalysis(fileText);
                setGeminiAnalysis({ loading: false, data: analysisResult, error: null });
                addNotification('AI-анализ продаж успешно завершен!', 'info');
            } catch (error: any) {
                const errorMessage = error.message || "Неизвестная ошибка AI-анализа";
                setGeminiAnalysis({ loading: false, data: null, error: errorMessage });
                addNotification(`Ошибка AI-анализа: ${errorMessage}`, 'error');
            }
        };
        runGeminiAnalysis(file);

        // Start Worker-based Analysis
        try {
            setLoadingState({ status: 'reading', progress: 10, text: 'Анализ структуры файла...', etr: '' });
            const { processedData, uniqueLocations, existingClientsByRegion } = await parseFile(file);
            setLoadingState(prev => ({ ...prev, progress: 25, text: 'Структура файла корректна. Запускаю фоновый анализ...' }));

            const worker = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
            workerRef.current = worker;
            
            worker.onmessage = (e: MessageEvent<{ type: string; payload: any }>) => {
                const { type, payload } = e.data;
                if (type === 'progress') setLoadingState(payload);
                else if (type === 'result') {
                    setLoadingState({ status: 'aggregating', progress: 98, text: 'Завершение: Расчет новых планов...', etr: '' });
                    setBaseAggregatedData(payload);
                    cleanupWorker();
                } else if (type === 'error') {
                    console.error("Error from worker:", payload);
                    addNotification('Ошибка: ' + payload, 'error');
                    setLoadingState({ status: 'error', progress: 0, text: 'Ошибка: ' + payload, etr: '' });
                    cleanupWorker();
                }
            };
            worker.onerror = (e) => {
                 console.error("Unhandled worker error:", e);
                 const errorMessage = "Критическая ошибка в фоновом обработчике.";
                 addNotification('Ошибка: ' + errorMessage, 'error');
                 setLoadingState({ status: 'error', progress: 0, text: errorMessage, etr: '' });
                 cleanupWorker();
            };
            worker.postMessage({ processedData, uniqueLocations: Array.from(uniqueLocations), existingClientsByRegion });
        } catch(error) {
            console.error("Failed to parse file or start worker:", error);
            const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка при обработке файла.";
            addNotification(errorMessage, 'error');
            setLoadingState({ status: 'error', progress: 0, text: errorMessage, etr: '' });
        }
    };

    const handleFilterChange = useCallback((newFilters: FilterState) => setFilters(newFilters), []);
    const resetFilters = useCallback(() => {
        setFilters({ rm: [], brand: [], city: [] });
        setSearchTerm('');
        addNotification('Фильтры сброшены.', 'success');
    }, [addNotification]);
    const requestSort = useCallback((key: keyof AggregatedDataRow) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig?.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    }, [sortConfig]);
    const handleBaseIncreaseChange = useCallback((value: number) => setBaseIncreasePercent(value), []);

    const filterOptions = useMemo(() => {
        let availableData = baseAggregatedData;
        let rmsData = availableData;
        if (filters.brand.length > 0) rmsData = rmsData.filter(d => filters.brand.includes(d.brand));
        if (filters.city.length > 0) rmsData = rmsData.filter(d => filters.city.includes(d.city));
        const rms = [...new Set(rmsData.map(d => d.rm))].sort();
        let brandsData = availableData;
        if (filters.rm.length > 0) brandsData = brandsData.filter(d => filters.rm.includes(d.rm));
        if (filters.city.length > 0) brandsData = brandsData.filter(d => filters.city.includes(d.city));
        const brands = [...new Set(brandsData.map(d => d.brand))].sort();
        let citiesData = availableData;
        if (filters.rm.length > 0) citiesData = citiesData.filter(d => filters.rm.includes(d.rm));
        if (filters.brand.length > 0) citiesData = citiesData.filter(d => filters.brand.includes(d.brand));
        const cities = [...new Set(citiesData.map(d => d.city))].sort();
        return { rms, brands, cities };
    }, [baseAggregatedData, filters]);
    
    const handleRegionClick = useCallback((regionName: string) => {
        setFilters(prevFilters => {
            const isSelected = prevFilters.city.length === 1 && prevFilters.city[0] === regionName;
            const newCities = isSelected ? [] : [regionName];
            addNotification(isSelected ? 'Фильтр по регионам сброшен' : `Отфильтровано по региону: ${regionName}`, 'info');
            return { ...prevFilters, city: newCities };
        });
    }, [addNotification]);

    const filteredByDropdownsData = useMemo(() => {
        return dataWithPlan.filter(item =>
            (filters.rm.length === 0 || filters.rm.includes(item.rm)) &&
            (filters.brand.length === 0 || filters.brand.includes(item.brand)) &&
            (filters.city.length === 0 || filters.city.includes(item.city))
        );
    }, [dataWithPlan, filters]);

    const filteredAndSortedData = useMemo(() => {
        let processedData = filteredByDropdownsData;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            processedData = processedData.filter(item =>
                Object.values(item).some(val => 
                    String(val).toLowerCase().includes(term)
                )
            );
        }
        if (sortConfig !== null) {
            processedData.sort((a, b) => {
                let aVal: any, bVal: any;
                if (sortConfig.key === 'growthPotential') {
                    aVal = (a.newPlan || a.fact) - a.fact;
                    bVal = (b.newPlan || b.fact) - b.fact;
                } else if (sortConfig.key === 'growthRate') {
                    aVal = a.fact > 0 ? ((a.newPlan || a.fact) - a.fact) / a.fact : 0;
                    bVal = b.fact > 0 ? ((b.newPlan || b.fact) - b.fact) / b.fact : 0;
                } else {
                    aVal = a[sortConfig.key] ?? -Infinity;
                    bVal = b[sortConfig.key] ?? -Infinity;
                }
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return processedData;
    }, [filteredByDropdownsData, searchTerm, sortConfig]);

    const metrics = useMemo(() => calculateMetrics(filteredAndSortedData), [filteredAndSortedData]);
    const totalPotentialTTs = useMemo(() => {
        const cityTTs = new Map<string, number>();
        filteredAndSortedData.forEach(item => { cityTTs.set(item.city, item.totalMarketTTs || 0); });
        return Array.from(cityTTs.values()).reduce((sum, count) => sum + count, 0);
    }, [filteredAndSortedData]);
    const totalActiveTTs = useMemo(() => {
        const uniqueAddresses = new Set<string>();
        filteredAndSortedData.forEach(item => { item.activeAddresses?.forEach(address => uniqueAddresses.add(address)); });
        return uniqueAddresses.size;
    }, [filteredAndSortedData]);

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 min-h-screen">
            <header className="mb-8 md:mb-12">
                <div>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                        Limkorm <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-hover">Analytics</span>
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base mt-1">
                        Инструмент для планирования продаж и анализа рыночного потенциала
                    </p>
                </div>
            </header>

            <div id="notification-area" className="fixed top-4 right-4 z-[100] space-y-2 w-full max-w-sm">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <aside className="lg:col-span-3 space-y-6">
                    <FileUpload onFileSelect={handleFileSelect} loadingState={loadingState} />
                    <Filters 
                        options={filterOptions}
                        currentFilters={filters}
                        onFilterChange={handleFilterChange}
                        onReset={resetFilters}
                        disabled={baseAggregatedData.length === 0}
                    />
                    {baseAggregatedData.length > 0 && <InsightCard analysisState={geminiAnalysis} />}
                    <MetricsSummary metrics={metrics} totalPotentialTTs={totalPotentialTTs} totalActiveTTs={totalActiveTTs} />
                </aside>

                <div className="lg:col-span-9 space-y-6">
                    <PotentialChart data={filteredByDropdownsData} />
                    <ChoroplethMap data={filteredByDropdownsData} onRegionClick={handleRegionClick} selectedRegions={filters.city} />
                    <ResultsTable 
                        data={filteredAndSortedData} 
                        isLoading={loadingState.status !== 'idle' && loadingState.status !== 'done'}
                        sortConfig={sortConfig}
                        requestSort={requestSort}
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        baseIncreasePercent={baseIncreasePercent}
                        onBaseIncreaseChange={handleBaseIncreaseChange}
                    />
                </div>
            </main>
        </div>
    );
}
