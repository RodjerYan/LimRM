import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import Filters from './components/Filters';
import ResultsTable from './components/ResultsTable';
import MetricsSummary from './components/MetricsSummary';
import PotentialChart from './components/PotentialChart';
import ChoroplethMap from './components/ChoroplethMap';
import AiAssistant from './components/AiAssistant';
import InsightCard from './components/InsightCard';
import ExcelAnalysisController from './components/ExcelAnalysisController';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import Notification from './components/Notification';
import { processJsonData } from './services/dataProcessor';
import { calculateMetrics, getUniqueFilterOptions } from './utils/dataUtils';
import { RawDataRow, AggregatedDataRow, LoadingState, FilterState, FilterOptions, SortConfig, NotificationMessage, GeminiAnalysisResult } from './types';

// API Key Check
const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const VITE_GEMINI_PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL;
const VITE_OSM_PROXY_URL = import.meta.env.VITE_OSM_PROXY_URL;

const isApiKeyMissing = !VITE_GEMINI_API_KEY || !VITE_GEMINI_PROXY_URL || !VITE_OSM_PROXY_URL;
const isApiKeySwapped = VITE_GEMINI_API_KEY && VITE_GEMINI_API_KEY.startsWith('AIza');

const App: React.FC = () => {
    const [rawData, setRawData] = useState<RawDataRow[]>([]);
    const [aggregatedData, setAggregatedData] = useState<AggregatedDataRow[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle', progress: 0, text: '', etr: '' });
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [filters, setFilters] = useState<FilterState>({ rm: [], brand: [], city: [] });
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'growthPotential', direction: 'descending' });
    const [baseIncreasePercent, setBaseIncreasePercent] = useState(15.0);
    
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    // FIX: useRef was used but not imported. Adding it to the React import statement on line 1.
    const workerRef = useRef<Worker>();

    // --- Gemini Full Analysis State ---
    const [rawCsvData, setRawCsvData] = useState<string | null>(null);
    const [geminiAnalysis, setGeminiAnalysis] = useState<{
        loading: boolean;
        data: GeminiAnalysisResult | null;
        error: string | null;
    }>({ loading: false, data: null, error: null });

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    }, []);

    useEffect(() => {
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e: MessageEvent) => {
            const { type, payload } = e.data;
            if (type === 'progress') {
                setLoadingState(payload);
            } else if (type === 'result') {
                setAggregatedData(payload);
                setLoadingState({ status: 'done', progress: 100, text: 'Анализ завершен!', etr: '' });
                addNotification('Данные успешно обработаны и агрегированы.', 'success');
            } else if (type === 'error') {
                setLoadingState({ status: 'error', progress: 0, text: payload, etr: '' });
                setUploadError(payload);
                addNotification(`Ошибка обработки: ${payload}`, 'error');
            }
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, [addNotification]);
    
    const handleFileUpload = (jsonData: any[], fileName: string, rawCsv: string) => {
        if (jsonData.length === 0) {
            const errorMsg = 'Файл пуст или имеет неверный формат.';
            setLoadingState({ status: 'error', progress: 0, text: errorMsg, etr: '' });
            setUploadError(errorMsg);
            addNotification(errorMsg, 'error');
            return;
        }

        try {
            setLoadingState({ status: 'reading', progress: 10, text: 'Чтение и первичная обработка данных...', etr: '' });
            const { processedData, uniqueLocations, existingClientsByRegion } = processJsonData(jsonData);
            setRawData(processedData);
            setRawCsvData(rawCsv); // Save raw CSV for Gemini analysis
            addNotification(`Файл "${fileName}" успешно прочитан.`, 'info');
            
            workerRef.current?.postMessage({
                processedData,
                uniqueLocations: Array.from(uniqueLocations),
                existingClientsByRegion
            });

        } catch (error: any) {
            setLoadingState({ status: 'error', progress: 0, text: error.message, etr: '' });
            setUploadError(error.message);
            addNotification(error.message, 'error');
        }
    };
    
    const filterOptions: FilterOptions = useMemo(() => getUniqueFilterOptions(aggregatedData), [aggregatedData]);

    const filteredAndSearchedData = useMemo(() => {
        let filtered = aggregatedData;

        if (filters.rm.length > 0) filtered = filtered.filter(item => filters.rm.includes(item.rm));
        if (filters.brand.length > 0) filtered = filtered.filter(item => filters.brand.includes(item.brand));
        if (filters.city.length > 0) filtered = filtered.filter(item => filters.city.includes(item.city));

        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.rm.toLowerCase().includes(lowercasedTerm) ||
                item.brand.toLowerCase().includes(lowercasedTerm) ||
                item.city.toLowerCase().includes(lowercasedTerm)
            );
        }

        // Calculate newPlan dynamically
        return filtered.map(item => {
            const growthFromMarket = (item.potential > item.fact) ? (item.potential - item.fact) * 0.5 : 0; // 50% of raw potential diff
            const baseGrowth = item.fact * (baseIncreasePercent / 100);
            const brandBalanceFactor = item.brand.toLowerCase().includes('royal canin') ? 1.05 : 0.95;
            const newPlan = (item.fact + baseGrowth + growthFromMarket) * brandBalanceFactor;
            return { ...item, newPlan };
        });

    }, [aggregatedData, filters, searchTerm, baseIncreasePercent]);

    const sortedData = useMemo(() => {
        let sortableItems = [...filteredAndSearchedData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key] ?? 0;
                const bVal = b[sortConfig.key] ?? 0;
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filteredAndSearchedData, sortConfig]);

    const metrics = useMemo(() => calculateMetrics(sortedData), [sortedData]);
    const { totalPotentialTTs, totalActiveTTs } = useMemo(() => {
        const uniqueCities = new Set(sortedData.map(d => d.city));
        const totalPotential = Array.from(uniqueCities).reduce((sum, city) => {
            const cityData = aggregatedData.find(d => d.city === city);
            return sum + (cityData?.totalMarketTTs || 0);
        }, 0);
        const totalActive = sortedData.reduce((sum, item) => sum + item.activeTT, 0);
        return { totalPotentialTTs: totalPotential, totalActiveTTs: totalActive };
    }, [sortedData, aggregatedData]);

    const requestSort = (key: keyof AggregatedDataRow) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleResetFilters = () => {
        setFilters({ rm: [], brand: [], city: [] });
        setSearchTerm('');
        setSortConfig({ key: 'growthPotential', direction: 'descending' });
    };

    const handleRegionClick = (regionName: string) => {
        setFilters(prev => ({
            ...prev,
            city: prev.city.includes(regionName)
                ? prev.city.filter(r => r !== regionName)
                : [...prev.city, regionName]
        }));
    };

    if (isApiKeyMissing) return <ApiKeyErrorDisplay errorType="missing" />;
    if (isApiKeySwapped) return <ApiKeyErrorDisplay errorType="swapped" />;

    const isLoading = loadingState.status === 'reading' || loadingState.status === 'fetching' || loadingState.status === 'aggregating';

    return (
        <div className="bg-primary-dark min-h-screen text-slate-300 font-sans p-4 sm:p-6 lg:p-8">
            <div className="fixed top-4 right-4 z-[100] space-y-2 w-80">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            <header className="mb-8 text-center">
                <h1 className="text-4xl font-extrabold text-white">
                    Limkorm <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-purple-500">Geo-Insight Engine</span>
                </h1>
                <p className="mt-2 text-lg text-slate-400">Интеллектуальный анализ рыночного потенциала</p>
            </header>

            <main className="max-w-screen-2xl mx-auto space-y-6">
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-3 space-y-6">
                        <FileUpload 
                            onFileUpload={handleFileUpload} 
                            onProcessingStart={() => { setUploadError(null); setAggregatedData([]); }}
                            disabled={isLoading}
                            uploadError={uploadError}
                        />
                        <Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={handleResetFilters} disabled={isLoading || aggregatedData.length === 0} />
                    </div>
                    <div className="lg:col-span-9 space-y-6">
                        <MetricsSummary metrics={metrics} totalPotentialTTs={totalPotentialTTs} totalActiveTTs={totalActiveTTs} />
                        <ResultsTable 
                            data={sortedData} 
                            isLoading={isLoading}
                            sortConfig={sortConfig!}
                            requestSort={requestSort}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            baseIncreasePercent={baseIncreasePercent}
                            onBaseIncreaseChange={setBaseIncreasePercent}
                        />
                    </div>
                </section>
                 {aggregatedData.length > 0 && !isLoading && (
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <PotentialChart data={sortedData} />
                        <ChoroplethMap data={aggregatedData} onRegionClick={handleRegionClick} selectedRegions={filters.city} />
                    </section>
                )}
                {aggregatedData.length > 0 && (
                     <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-2">
                             <ExcelAnalysisController rawCsvData={rawCsvData} analysisState={geminiAnalysis} setAnalysisState={setGeminiAnalysis} />
                             <div className="mt-6">
                                <InsightCard analysisState={geminiAnalysis} />
                             </div>
                        </div>
                        <div className="lg:col-span-3">
                            <AiAssistant dataContext={sortedData} />
                        </div>
                    </section>
                )}
            </main>
             <footer className="text-center mt-12 text-xs text-gray-600">
                <p>&copy; {new Date().getFullYear()} Limkorm Geo-Insight Engine. AI-powered by Google Gemini.</p>
            </footer>
        </div>
    );
};

export default App;
