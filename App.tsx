import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AggregatedDataRow, FilterState, LoadingState, NotificationMessage, SortConfig } from './types';
import { calculateMetrics, formatLargeNumber } from './utils/dataUtils';
import { parseFile } from './services/fileParser';
import FileUpload from './components/FileUpload';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';


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
        // Собираем агрегированные данные по РМ, брендам и их комбинациям для быстрого доступа.
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
            
            // --- Сценарий 1: Нулевой факт ---
            // Если текущих продаж нет, устанавливаем небольшой стартовый план,
            // основанный на средних продажах по бренду.
            if (fact === 0) {
                const brandTotalFact = brandTotals.get(brand)?.fact || 0;
                const brandCount = brandRowCounts.get(brand) || 1;
                const brandAvgFact = brandTotalFact / brandCount;
                const newPlan = Math.max(50, brandAvgFact * 0.1); 
                return { ...row, newPlan };
            }

            // --- Сценарий 2: Есть фактические продажи ---
            const baseInc = baseIncreasePercent / 100;
            
            // Определяем веса и максимальный порог для динамического роста
            const maxDynamicGrowth = 0.15; // Максимальный дополнительный рост: 15%
            const w_coverage = 0.6; // 60% влияния от показателя покрытия рынка
            const w_brand = 0.4;    // 40% влияния от показателя баланса брендов

            // --- Фактор 1: Охват рынка (Coverage Score) ---
            // Оценивает, насколько полно мы представлены на рынке.
            // Score -> 1: низкое покрытие (большой потенциал). Score -> 0: высокое покрытие.
            const effectiveTotalMarket = Math.max(activeTT, totalMarketTTs) + Math.ceil(activeTT * 0.10);
            const penetration = Math.min(1.0, activeTT > 0 ? (activeTT / effectiveTotalMarket) : 0);
            const coverageScore = Math.sqrt(1 - penetration); // sqrt для нелинейного поощрения низкого охвата

            // --- Фактор 2: Баланс брендов (Brand Balance Score) ---
            // Сравнивает долю продаж бренда у конкретного РМ с долей этого же бренда в целом по компании.
            // Score > 0: РМ недорабатывает по бренду (план будет увеличен).
            // Score < 0: РМ перевыполняет по бренду (динамический рост будет уменьшен).
            const brandTotalFact = brandTotals.get(brand)?.fact || 0;
            const rmTotalFact = rmTotals.get(rm)?.fact || 0;
            const rmBrandTotalFact = rmBrandTotals.get(`${rm}|${brand}`)?.fact || 0;
            
            let brandScore = 0;
            if (rmTotalFact > 0 && brandTotalFact > 0 && totalFactAll > 0) {
                const brandShareAvg = brandTotalFact / totalFactAll; // Доля бренда в компании
                const brandShareRM = rmBrandTotalFact / rmTotalFact; // Доля бренда у РМ
                if (brandShareRM > 0) {
                    const shareRatio = brandShareAvg / brandShareRM;
                    // Используем tanh для получения гладкого, ограниченного [-1, 1] значения
                    brandScore = Math.tanh(shareRatio - 1);
                } else {
                    // Если РМ вообще не продает этот бренд, даем максимальный стимул
                    brandScore = 1; 
                }
            }
            
            // --- Этап 3: Комбинирование факторов и финальный расчет ---
            // Суммируем базовый рост и динамический рост (с учетом весов)
            const dynamicGrowth = maxDynamicGrowth * (w_coverage * coverageScore + w_brand * brandScore);
            const totalMultiplier = 1 + baseInc + dynamicGrowth;
            const newPlan = Math.max(fact, fact * totalMultiplier); // План не может быть меньше факта

            return { ...row, newPlan };
        });

        setDataWithPlan(calculatedData);

        // Финальное обновление статуса после завершения всех расчетов
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
        
        try {
            setLoadingState({ status: 'reading', progress: 10, text: 'Анализ структуры файла...', etr: '' });
            const { processedData, uniqueLocations, existingClientsByRegion } = await parseFile(file);
            setLoadingState(prev => ({ ...prev, progress: 25, text: 'Структура файла корректна. Запускаю фоновый анализ...' }));

            const worker = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
            workerRef.current = worker;
            
            worker.onmessage = (e: MessageEvent<{ type: string; payload: any }>) => {
                const { type, payload } = e.data;
                if (type === 'progress') {
                    setLoadingState(payload);
                } else if (type === 'result') {
                    setLoadingState({ status: 'aggregating', progress: 98, text: 'Завершение: Расчет новых планов...', etr: '' });
                    setBaseAggregatedData(payload); // This triggers the plan calculation useEffect
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
                 const errorMessage = "Произошла критическая ошибка в фоновом обработчике.";
                 addNotification('Ошибка: ' + errorMessage, 'error');
                 setLoadingState({ status: 'error', progress: 0, text: errorMessage, etr: '' });
                 cleanupWorker();
            };
            
            worker.postMessage({ 
                processedData, 
                uniqueLocations: Array.from(uniqueLocations),
                existingClientsByRegion,
            });

        } catch(error) {
            console.error("Failed to parse file or start worker:", error);
            const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка при обработке файла.";
            addNotification(errorMessage, 'error');
            setLoadingState({ status: 'error', progress: 0, text: errorMessage, etr: '' });
        }
    };


    const handleFilterChange = useCallback((newFilters: FilterState) => {
        setFilters(newFilters);
    }, []);

    const resetFilters = useCallback(() => {
        setFilters({ rm: [], brand: [], city: [] });
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
    
    const handleBaseIncreaseChange = useCallback((value: number) => {
        setBaseIncreasePercent(value);
    }, []);

    const filterOptions = useMemo(() => {
        let availableData = baseAggregatedData;

        // Фильтруем данные для получения доступных РМ
        let rmsData = availableData;
        if (filters.brand.length > 0) {
            rmsData = rmsData.filter(d => filters.brand.includes(d.brand));
        }
        if (filters.city.length > 0) {
            rmsData = rmsData.filter(d => filters.city.includes(d.city));
        }
        const rms = [...new Set(rmsData.map(d => d.rm))].sort();

        // Фильтруем данные для получения доступных Брендов
        let brandsData = availableData;
        if (filters.rm.length > 0) {
            brandsData = brandsData.filter(d => filters.rm.includes(d.rm));
        }
        if (filters.city.length > 0) {
            brandsData = brandsData.filter(d => filters.city.includes(d.city));
        }
        const brands = [...new Set(brandsData.map(d => d.brand))].sort();

        // Фильтруем данные для получения доступных Городов
        let citiesData = availableData;
        if (filters.rm.length > 0) {
            citiesData = citiesData.filter(d => filters.rm.includes(d.rm));
        }
        if (filters.brand.length > 0) {
            citiesData = citiesData.filter(d => filters.brand.includes(d.brand));
        }
        const cities = [...new Set(citiesData.map(d => d.city))].sort();

        return { rms, brands, cities };
    }, [baseAggregatedData, filters]);

    const filteredAndSortedData = useMemo(() => {
        let processedData = dataWithPlan.filter(item => 
            (filters.rm.length === 0 || filters.rm.includes(item.rm)) &&
            (filters.brand.length === 0 || filters.brand.includes(item.brand)) &&
            (filters.city.length === 0 || filters.city.includes(item.city))
        );

        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            processedData = processedData.filter(item =>
                item.rm.toLowerCase().includes(lowercasedTerm) ||
                item.brand.toLowerCase().includes(lowercasedTerm) ||
                item.city.toLowerCase().includes(lowercasedTerm) ||
                String(item.potentialTTs).includes(lowercasedTerm) ||
                formatLargeNumber(item.fact).toLowerCase().includes(lowercasedTerm) ||
                formatLargeNumber(item.potential).toLowerCase().includes(lowercasedTerm) ||
                formatLargeNumber(item.growthPotential).toLowerCase().includes(lowercasedTerm) ||
                (item.newPlan && formatLargeNumber(item.newPlan).toLowerCase().includes(lowercasedTerm)) ||
                item.growthRate.toFixed(2).includes(lowercasedTerm)
            );
        }

        if (sortConfig !== null) {
            processedData.sort((a, b) => {
                let aVal, bVal;

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
    }, [dataWithPlan, filters, searchTerm, sortConfig]);

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

    const totalActiveTTs = useMemo(() => {
        return filteredAndSortedData.reduce((sum, item) => sum + (item.activeTT || 0), 0);
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
                {notifications.map(n => (
                    <Notification key={n.id} message={n.message} type={n.type} />
                ))}
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
                    <MetricsSummary 
                        metrics={metrics} 
                        totalPotentialTTs={totalPotentialTTs} 
                        totalActiveTTs={totalActiveTTs}
                    />
                </aside>

                <div className="lg:col-span-9 space-y-6">
                    <PotentialChart data={filteredAndSortedData} />
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