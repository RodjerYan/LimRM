import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AggregatedDataRow, FilterState, LoadingState, NotificationMessage, SortConfig, GeminiAnalysisResult, RawDataRow } from './types';
import { calculateMetrics } from './utils/dataUtils';
import { getGeminiSalesAnalysis } from './services/aiService';
import ExcelAnalysisController from './components/ExcelAnalysisController';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import ChoroplethMap from './components/ChoroplethMap';
import InsightCard from './components/InsightCard';
import AiAssistant from './components/AiAssistant';
import Papa from 'papaparse';


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
    if (clientApiKey.startsWith('AIza')) {
        return <ApiKeyErrorDisplay errorType="swapped" />;
    }
    
    const [baseAggregatedData, setBaseAggregatedData] = useState<AggregatedDataRow[]>([]);
    const [dataWithPlan, setDataWithPlan] = useState<AggregatedDataRow[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle', progress: 0, text: '', etr: '' });
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [geminiAnalysis, setGeminiAnalysis] = useState<{ loading: boolean; data?: GeminiAnalysisResult | null; error?: string | null; }>({ loading: false, data: null, error: null });
    
    const [filters, setFilters] = useState<FilterState>({ rm: [], brand: [], city: [] });
    const [searchTerm, setSearchTerm] = useState<string>('');
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
        if (baseAggregatedData.length === 0) {
            setDataWithPlan([]);
            return;
        }

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
        addNotification('Надстройка готова! Выделите данные и нажмите "Анализировать".', 'success');
        return () => cleanupWorker();
    }, [addNotification]);
    
    const handleAnalysisStart = (rawJsonData: any[], csvString: string) => {
        setGeminiAnalysis({ loading: true, data: null, error: null });
        getGeminiSalesAnalysis(csvString)
            .then(analysisResult => {
                setGeminiAnalysis({ loading: false, data: analysisResult, error: null });
                addNotification('AI-анализ продаж успешно завершен!', 'info');
            })
            .catch(error => {
                const errorMessage = error.message || "Неизвестная ошибка AI-анализа";
                setGeminiAnalysis({ loading: false, data: null, error: errorMessage });
                addNotification(`Ошибка AI-анализа: ${errorMessage}`, 'error');
            });
    };

    const handleDataProcessed = (result: { processedData: RawDataRow[], uniqueLocations: Set<string>, existingClientsByRegion: Record<string, string[]> }) => {
        cleanupWorker();
        setBaseAggregatedData([]);
        setDataWithPlan([]);
        setFilters({ rm: [], brand: [], city: [] });
        setSearchTerm('');
        
        setLoadingState({ status: 'reading', progress: 25, text: 'Структура корректна. Запускаю фоновый анализ...', etr: '' });

        const worker = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        
        worker.onmessage = (e: MessageEvent<{ type: string; payload: any }>) => {
            const { type, payload } = e.data;
            if (type === 'progress') setLoadingState(payload);
            else if (type === 'result') {
                setLoadingState({ status: 'aggregating', progress: 98, text: 'Завершение: Расчет планов...', etr: '' });
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
        worker.postMessage({ 
            processedData: result.processedData, 
            uniqueLocations: Array.from(result.uniqueLocations), 
            existingClientsByRegion: result.existingClientsByRegion 
        });
    };
    
    const handleAnalysisError = (error: Error) => {
        addNotification(error.message, 'error');
        setLoadingState({ status: 'error', progress: 0, text: error.message, etr: '' });
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
        const rms = [...new Set(availableData.map(d => d.rm))].sort();
        const brands = [...new Set(availableData.map(d => d.brand))].sort();
        const cities = [...new Set(availableData.map(d => d.city))].sort();
        return { rms, brands, cities };
    }, [baseAggregatedData]);
    
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
    
    const isBusy = loadingState.status !== 'idle' && loadingState.status !== 'done' && loadingState.status !== 'error';

    return (
        <div className="flex flex-col gap-6 p-2 sm:p-4">
            <header>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">
                    Limkorm <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-hover">AI</span>
                </h1>
            </header>

            <div id="notification-area" className="fixed top-4 right-4 z-[100] space-y-2 w-full max-w-sm">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            <main className="flex flex-col gap-6">
                <ExcelAnalysisController 
                    onAnalysisStart={handleAnalysisStart}
                    onDataProcessed={handleDataProcessed}
                    onAnalysisError={handleAnalysisError}
                    isBusy={isBusy}
                />
                
                {dataWithPlan.length > 0 && (
                    <>
                        <Filters 
                            options={filterOptions}
                            currentFilters={filters}
                            onFilterChange={handleFilterChange}
                            onReset={resetFilters}
                            disabled={baseAggregatedData.length === 0}
                        />
                        <InsightCard analysisState={geminiAnalysis} />
                        <AiAssistant dataContext={filteredAndSortedData} />
                        <MetricsSummary metrics={metrics} totalPotentialTTs={totalPotentialTTs} totalActiveTTs={totalActiveTTs} />
                        <PotentialChart data={filteredByDropdownsData} />
                        <ChoroplethMap data={filteredByDropdownsData} onRegionClick={handleRegionClick} selectedRegions={filters.city} />
                        <ResultsTable 
                            data={filteredAndSortedData} 
                            isLoading={isBusy}
                            sortConfig={sortConfig}
                            requestSort={requestSort}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            baseIncreasePercent={baseIncreasePercent}
                            onBaseIncreaseChange={handleBaseIncreaseChange}
                        />
                    </>
                )}
            </main>
        </div>
    );
}