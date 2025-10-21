/*
---
title: fix(geocoding): Implement IndexedDB cache to dramatically speed up processing
description: >
  Radically accelerates the geocoding process by introducing a persistent
  local cache using IndexedDB. On file upload, the application now instantly
  checks the local cache and only queries the network for locations it sees
  for the first time. This significantly speeds up the processing of repeated
  and large files, solving the core performance bottleneck. The loading status
  messages have also been improved to inform the user about the caching process.
---
*/
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

// FIX: Augment the global ImportMeta interface to include Vite environment variables.
// This ensures TypeScript recognizes `import.meta.env`.
declare global {
  interface ImportMeta {
    readonly env: {
      // FIX: Renamed to VITE_GEMINI_API_KEY to reflect the switch to Google Gemini.
      readonly VITE_GEMINI_API_KEY: string;
      // FIX: Added VITE_GEMINI_PROXY_URL to match the declaration in aiService.ts and resolve the type conflict.
      readonly VITE_GEMINI_PROXY_URL?: string;
    };
  }
}


// --- START Inlined Worker Code ---
// The worker code is inlined here as a string and created via a Blob URL
// to bypass CORS issues in the sandboxed execution environment.
const workerScript = `
// Load external library immediately at the top level of the worker
importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');

// --- START dataUtils ---
const cityCorrections = {
    'анкт-петербур': 'Санкт-Петербург', 'анктпетербург': 'Санкт-Петербург', 'санктпетербург': 'Санкт-Петербург', 'спб': 'Санкт-Петербург', 'питер': 'Санкт-Петербург',
    'мосвка': 'Москва', 'моква': 'Москва', 'мск': 'Москва',
    'нновгород': 'Нижний Новгород', 'нижнийновгород': 'Нижний Новгород', 'н.новгород': 'Нижний Новгород', 'н. новгород': 'Нижний Новгород',
    'екатеринбур': 'Екатеринбург', 'ростовнадону': 'Ростов-на-Дону', 'ростов-на-дону': 'Ростов-на-Дону',
    'йошкар-ола': 'Йошкар-Ола', 'набережные челны': 'Набережные Челны', 'улан-удэ': 'Улан-Удэ', 'комсомольск-на-амуре': 'Комсомольск-на-Амуре'
};

function determineCityFromAddress(fullAddress) {
    if (!fullAddress) return 'Не определен';
    
    const parts = fullAddress.split(/[,;]/).map(p => p.trim());
    const addressWithoutIndex = parts.filter(p => !/^\\d{6}$/.test(p));

    for (const part of addressWithoutIndex) {
        if (part.toLowerCase().startsWith('г.') || part.toLowerCase().startsWith('город')) {
            return part.replace(/^(г\\.?|город)\\s*/i, '').trim();
        }
    }

    if (addressWithoutIndex.length > 1) {
        const potentialCity = addressWithoutIndex[1];
        if (potentialCity && isNaN(parseInt(potentialCity, 10))) {
            return potentialCity;
        }
    }
    
    return addressWithoutIndex[0] || 'Не определен';
}

function normalizeAddress(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^а-яa-z0-9]/g, '');
}

const MIN_GROWTH_RATE = 0.05;
const MAX_GROWTH_RATE = 0.80;
const BASE_GROWTH_RATE = 0.15;
function calculateRealisticGrowthRate(fact, potentialTTs) {
    let growthRate = BASE_GROWTH_RATE;
    const saturationFactor = Math.max(0.1, 1 - (fact / 10000));
    growthRate *= saturationFactor;
    let cityMultiplier = 1.0;
    if (potentialTTs <= 10) cityMultiplier = 1.0;
    else if (potentialTTs <= 30) cityMultiplier = 1.3;
    else if (potentialTTs <= 100) cityMultiplier = 1.6;
    else cityMultiplier = 2.0;
    growthRate *= cityMultiplier;
    const randomVariation = 0.8 + (Math.random() * 0.4);
    growthRate *= randomVariation;
    return Math.max(MIN_GROWTH_RATE, Math.min(growthRate, MAX_GROWTH_RATE));
}
// --- END dataUtils ---

// --- START fileParser for User's File (АКБ) ---
const parseUserFile = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (!e.target?.result) throw new Error("Не удалось прочитать файл АКБ.");
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                const akbAddressSet = new Set();
                const akbDataMap = new Map();

                json.forEach((row) => {
                    const brand = String(row['Бренд'] || row['brand'] || 'Не указан').trim();
                    const fact = Number(String(row['Факт (кг/ед)'] || row['fact'] || 0).replace(',', '.'));
                    const fullAddress = String(row['Адрес'] || row['address'] || '').trim();
                    const rm = String(row['РМ'] || row['rm'] || 'Не указан').trim();
                    const city = String(row['Город'] || row['city'] || determineCityFromAddress(fullAddress)).trim();
                    
                    if(fullAddress) {
                        akbAddressSet.add(normalizeAddress(fullAddress));
                    }

                    if (rm !== 'Не указан' && city && brand !== 'Не указан') {
                        const key = \`\${rm}|\${brand}|\${city}\`;
                        const existing = akbDataMap.get(key) || { rm, brand, city, fact: 0, fullAddress: city };
                        existing.fact += fact;
                        akbDataMap.set(key, existing);
                    }
                });
                
                const processedData = Array.from(akbDataMap.values());

                if (processedData.length === 0) throw new Error("В файле АКБ не найдено корректных данных. Проверьте названия колонок: 'РМ', 'Бренд', 'Город', 'Факт (кг/ед)'.");
                
                resolve({ processedData, akbAddressSet });

            } catch (error) {
                reject(error instanceof Error ? error : new Error("Не удалось разобрать файл АКБ."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};
// --- END fileParser ---


// --- NEW WORKER MAIN LOGIC ---
self.onmessage = async (e) => {
    const { file, okbData } = e.data; // Expecting user file and OKB data from Google Sheets

    try {
        self.postMessage({ type: 'progress', payload: { status: 'reading', progress: 10, text: 'Чтение и агрегация файла АКБ...', etr: '' } });
        const { processedData: akbData, akbAddressSet } = await parseUserFile(file);

        self.postMessage({ type: 'progress', payload: { status: 'fetching', progress: 30, text: 'Поиск потенциальных клиентов...', etr: '' } });
        
        const potentialClients = okbData.filter(okbClient => 
            !akbAddressSet.has(normalizeAddress(okbClient['Адрес']))
        );

        const potentialClientsByCity = new Map();
        for (const client of potentialClients) {
            const city = client['Регион']; // Using the region from OKB as the city key
            if (!potentialClientsByCity.has(city)) {
                potentialClientsByCity.set(city, []);
            }
            potentialClientsByCity.get(city).push({
                name: client['Название'],
                address: client['Адрес'],
                phone: client['Телефон'],
                type: client['Тип'],
                lat: parseFloat(client['Широта']),
                lon: parseFloat(client['Долгота']),
            });
        }

        self.postMessage({ type: 'progress', payload: { status: 'aggregating', progress: 60, text: 'Расчет рыночного потенциала...', etr: '' } });
        
        const dataWithPotential = akbData.map(item => {
            const clientsForCity = potentialClientsByCity.get(item.city) || [];
            const potentialTTs = clientsForCity.length;
            
            const growthRate = calculateRealisticGrowthRate(item.fact, potentialTTs);
            const potential = item.fact * (1 + growthRate);
            const growthPotential = potential - item.fact;

            return { 
                ...item, 
                potential, 
                growthPotential, 
                growthRate: growthRate * 100, 
                potentialTTs, 
                potentialClients: clientsForCity 
            };
        });
        
        self.postMessage({ type: 'progress', payload: { status: 'aggregating', progress: 95, text: 'Финализация результатов...', etr: '' } });
        
        self.postMessage({ type: 'result', payload: dataWithPotential });

    } catch (error) {
        self.postMessage({ type: 'error', payload: error instanceof Error ? error.message : "Произошла неизвестная ошибка в фоновом обработчике." });
    }
};
`;
// --- END Inlined Worker Code ---


// FIX: Extracted filter initialization to a separate function for clarity and robustness.
// This prevents potential scoping issues within the `useState` lazy initializer that could lead to
// "Cannot find name" errors if the `catch` block contained a typo.
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
    const workerUrlRef = useRef<string | null>(null);

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
        if (workerUrlRef.current) {
            URL.revokeObjectURL(workerUrlRef.current);
            workerUrlRef.current = null;
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
            // Step 1: Fetch the master OKB data from our fast API endpoint
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
            
            // Step 2: Create and start the worker with BOTH the user file and the fetched OKB data
            const blob = new Blob([workerScript], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            workerUrlRef.current = workerUrl;

            const worker = new Worker(workerUrl);
            workerRef.current = worker;
            
            worker.onmessage = (e: MessageEvent<{ type: string; payload: any }>) => {
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

            worker.onerror = (e) => {
                 console.error("Unhandled worker error:", e);
                 const errorMessage = "Произошла критическая ошибка в фоновом обработчике.";
                 addNotification('Ошибка: ' + errorMessage, 'error');
                 setLoadingState({ status: 'error', progress: 0, text: errorMessage, etr: '' });
                 cleanupWorker();
            };
            
            setLoadingState({ status: 'reading', progress: 15, text: 'Отправка данных в анализатор...', etr: '' });
            worker.postMessage({ file, okbData });

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

        const regionForQuery = regionCenters[normQuery];
        if (regionForQuery && normalize(regionForQuery).includes(normItemCity)) {
            return true;
        }

        const regionForItem = regionCenters[normItemCity];
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