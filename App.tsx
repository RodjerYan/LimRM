/*
---
title: fix(worker): Refactor file parsing to prevent critical errors
description: >
  Overhauls the data processing pipeline to resolve a persistent 'Unhandled
  worker error'. The root cause was the worker's dependency on `importScripts`
  to fetch the XLSX library from a CDN, which could fail silently in certain
  environments. The fix moves the file parsing logic (using XLSX) to the main
  thread, ensuring the library is reliably available. The worker is now
  dramatically simplified: it no longer parses files but receives pre-parsed
  JSON data. Its sole responsibility is to perform the long-running Gemini API
  calls, thus preventing UI blocking without the risk of script-loading
  failures.
---
*/
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { AggregatedDataRow, FilterState, LoadingState, NotificationMessage, SortConfig } from './types';
import { calculateMetrics, formatLargeNumber } from './utils/dataUtils';
import FileUpload from './components/FileUpload';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import './index.css';

// FIX: Augment the global ImportMetaEnv interface to correctly define Vite environment variables.
// This resolves the "Subsequent property declarations must have the same type" error by
// augmenting the existing `ImportMetaEnv` type instead of re-declaring `import.meta.env`.
declare global {
  interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string;
    readonly VITE_GEMINI_PROXY_URL?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}


// --- START Location Normalization ---
const CITY_TO_REGION_MAP: Record<string, string> = {
    // Federal Cities (they are their own region)
    'москва': 'Москва',
    'санкт-петербург': 'Санкт-Петербург',
    'севастополь': 'Севастополь',
    
    // Republics
    'майкоп': 'Республика Адыгея',
    'горно-алтайск': 'Республика Алтай',
    'уфа': 'Республика Башкортостан',
    'стерлитамак': 'Республика Башкортостан',
    'салават': 'Республика Башкортостан',
    'улан-удэ': 'Республика Бурятия',
    'махачкала': 'Республика Дагестан',
    'дербент': 'Республика Дагестан',
    'хасавюрт': 'Республика Дагестан',
    'магас': 'Республика Ингушетия',
    'назрань': 'Республика Ингушетия',
    'нальчик': 'Кабардино-Балкарская Республика',
    'элиста': 'Республика Калмыкия',
    'черкесск': 'Карачаево-Черкесская Республика',
    'петрозаводск': 'Республика Карелия',
    'сыктывкар': 'Республика Коми',
    'ухта': 'Республика Коми',
    'симферополь': 'Республика Крым',
    'керчь': 'Республика Крым',
    'евпатория': 'Республика Крым',
    'йошкар-ола': 'Республика Марий Эл',
    'саранск': 'Республика Мордовия',
    'якутск': 'Республика Саха (Якутия)',
    'владикавказ': 'Республика Северная Осетия — Алания',
    'казань': 'Республика Татарстан',
    'набережные челны': 'Республика Татарстан',
    'нижнекамск': 'Республика Татарстан',
    'кызыл': 'Республика Тыва',
    'ижевск': 'Удмуртская Республика',
    'абакан': 'Республика Хакасия',
    'грозный': 'Чеченская Республика',
    'чебоксары': 'Чувашская Республика',
    'новочебоксарск': 'Чувашская Республика',

    // Krais
    'барнаул': 'Алтайский край',
    'бийск': 'Алтайский край',
    'чита': 'Забайкальский край',
    'петропавловск-камчатский': 'Камчатский край',
    'краснодар': 'Краснодарский край',
    'сочи': 'Краснодарский край',
    'новороссийск': 'Краснодарский край',
    'красноярск': 'Красноярский край',
    'норильск': 'Красноярский край',
    'пермь': 'Пермский край',
    'владивосток': 'Приморский край',
    'уссурийск': 'Приморский край',
    'находка': 'Приморский край',
    'ставрополь': 'Ставропольский край',
    'пятигорск': 'Ставропольский край',
    'кисловодск': 'Ставропольский край',
    'хабаровск': 'Хабаровский край',
    'комсомольск-на-амуре': 'Хабаровский край',

    // Oblasts
    'благовещенск': 'Амурская область',
    'архангельск': 'Архангельская область',
    'северодвинск': 'Архангельская область',
    'астрахань': 'Астраханская область',
    'белгород': 'Белгородская область',
    'старый оскол': 'Белгородская область',
    'брянск': 'Брянская область',
    'клинцы': 'Брянская область',
    'новозыбков': 'Брянская область',
    'владимир': 'Владимирская область',
    'ковров': 'Владимирская область',
    'муром': 'Владимирская область',
    'волгоград': 'Волгоградская область',
    'волжский': 'Волгоградская область',
    'вологда': 'Вологодская область',
    'череповец': 'Вологодская область',
    'воронеж': 'Воронежская область',
    'иваново': 'Ивановская область',
    'иркутск': 'Иркутская область',
    'братск': 'Иркутская область',
    'ангарск': 'Иркутская область',
    'калининград': 'Калининградская область',
    'калуга': 'Калужская область',
    'обнинск': 'Калужская область',
    'кемерово': 'Кемеровская область - Кузбасс',
    'новокузнецк': 'Кемеровская область - Кузбасс',
    'прокопьевск': 'Кемеровская область - Кузбасс',
    'киров': 'Кировская область',
    'кострома': 'Костромская область',
    'курган': 'Курганская область',
    'курск': 'Курская область',
    'железногорск': 'Курская область',
    'липецк': 'Липецкая область',
    'елец': 'Липецкая область',
    'магадан': 'Магаданская область',
    'мурманск': 'Мурманская область',
    'нижний новгород': 'Нижегородская область',
    'дзержинск': 'Нижегородская область',
    'великий новгород': 'Новгородская область',
    'новгород': 'Новгородская область', // Common shorter name
    'новосибирск': 'Новосибирская область',
    'омск': 'Омская область',
    'оренбург': 'Оренбургская область',
    'орск': 'Оренбургская область',
    'орёл': 'Орловская область',
    'орел': 'Орловская область',
    'ливны': 'Орловская область',
    'мценск': 'Орловская область',
    'пенза': 'Пензая область',
    'псков': 'Псковская область',
    'ростов-на-дону': 'Ростовская область',
    'таганрог': 'Ростовская область',
    'шахты': 'Ростовская область',
    'рязань': 'Рязанская область',
    'самара': 'Самарская область',
    'тольятти': 'Самарская область',
    'саратов': 'Саратовская область',
    'энгельс': 'Саратовская область',
    'южно-сахалинск': 'Сахалинская область',
    'екатеринбург': 'Свердловская область',
    'нижний тагил': 'Свердловская область',
    'каменск-уральский': 'Свердловская область',
    'смоленск': 'Смоленская область',
    'вязьма': 'Смоленская область',
    'рославль': 'Смоленская область',
    'ярцево': 'Смоленская область',
    'десногорск': 'Смоленская область',
    'смоленский район': 'Смоленская область',
    'тамбов': 'Тамбовская область',
    'тверь': 'Тверская область',
    'томск': 'Томская область',
    'тула': 'Тульская область',
    'новомосковск': 'Тульская область',
    'тюмень': 'Тюменская область',
    'тобольск': 'Тюменская область',
    'ульяновск': 'Ульяновская область',
    'димитровград': 'Ульяновская область',
    'челябинск': 'Челябинская область',
    'магнитогорск': 'Челябинская область',
    'златоуст': 'Челябинская область',
    'ярославль': 'Ярославская область',
    'рыбинск': 'Ярославская область',
    
    // Autonomous Oblast
    'биробиджан': 'Еврейская автономная область',

    // Autonomous Okrugs
    'нарьян-мар': 'Ненецкий автономный округ',
    'ханты-мансийск': 'Ханты-Мансийский автономный округ - Югра',
    'сургут': 'Ханты-Мансийский автономный округ - Югра',
    'нижневартовск': 'Ханты-Мансийский автономный округ - Югра',
    'анадырь': 'Чукотский автономный округ',
    'салехард': 'Ямало-Ненецкий автономный округ',
    'новый уренгой': 'Ямало-Ненецкий автономный округ',
    'ноябрьск': 'Ямало-Ненецкий автономный округ',
};
// --- END Location Normalization ---


// --- START File Parser (runs on main thread) ---
const parseFileAndExtractData = (file: File): Promise<{ processedData: any[], uniqueLocations: Set<string>, existingClientsByRegion: Record<string, string[]> }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (!e.target?.result) throw new Error("Не удалось прочитать файл.");
                const data = new Uint8Array(e.target.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                if (json.length === 0) {
                     throw new Error("Файл пуст или имеет неверный формат.");
                }

                const fileHeaders = Object.keys(json[0] as object);
                const normalizeHeader = (header: string) => String(header || '').toLowerCase().trim().replace(/\s+/g, ' ');

                const HEADER_ALIASES = {
                    rm: ['рм', 'региональный менеджер', 'rm', 'regional manager'],
                    brand: ['бренд', 'brand', 'торговая марка'],
                    city: ['адрес тт limkorm', 'город', 'city', 'адрес поставки', 'адрес'],
                    fact: ['вес, кг', 'факт (кг/ед)', 'факт', 'fact', 'факт (кг)'],
                };

                const findHeaderKey = (headers: string[], aliases: string[]) => {
                    for (const header of headers) {
                        if (aliases.includes(normalizeHeader(header))) return header;
                    }
                    return null;
                };

                const headerMap = {
                    rm: findHeaderKey(fileHeaders, HEADER_ALIASES.rm),
                    brand: findHeaderKey(fileHeaders, HEADER_ALIASES.brand),
                    city: findHeaderKey(fileHeaders, HEADER_ALIASES.city),
                    fact: findHeaderKey(fileHeaders, HEADER_ALIASES.fact),
                };

                if (!headerMap.rm || !headerMap.city || !headerMap.fact) {
                    const missing = [
                        !headerMap.rm && "'РМ'",
                        !headerMap.city && "'Адрес ТТ LimKorm' или 'Город'",
                        !headerMap.fact && "'Вес, кг' или 'Факт'"
                    ].filter(Boolean).join(', ');
                    throw new Error(`Не найдены обязательные столбцы: ${missing}.`);
                }

                const uniqueLocations = new Set<string>();
                const existingClientsByRegion: Record<string, string[]> = {};

                const processedData = (json as any[]).map((row) => {
                    const rm = String(row[headerMap.rm!] || '').trim();
                    const brand = String(row[headerMap.brand!] || 'Не указан').trim();
                    const factValue = String(row[headerMap.fact!] || '0').replace(',', '.');
                    const fact = parseFloat(factValue) || 0;
                    const fullAddress = String(row[headerMap.city!] || '').trim();
                    
                    let location = '';
                    let regionFound = '';
                    const addressParts = fullAddress.replace(/^\d{6},?/, '').split(',').map(p => p.trim()).filter(Boolean);

                    const regionPart = addressParts.find(p => 
                        /область|край|республика|автономный округ|ао|аобл/i.test(p)
                    );
                    if (regionPart) {
                        regionFound = regionPart.trim();
                    }

                    const cityPart = addressParts.find(p => p.toLowerCase().startsWith('г ') || p.toLowerCase().startsWith('г.'));
                    const districtPart = addressParts.find(p => p.toLowerCase().includes(' р-н') || p.toLowerCase().includes(' район'));
                    
                    let mainLocationPart = '';
                    if (cityPart) {
                        mainLocationPart = cityPart.replace(/^[г|Г]\.?\s*/, '').trim();
                    } else if (districtPart) {
                        mainLocationPart = districtPart.trim();
                    } else {
                        // Fallback to the first or second significant part of the address
                        mainLocationPart = addressParts[1] || addressParts[0] || '';
                    }
                    mainLocationPart = mainLocationPart.trim();

                    if (regionFound) {
                        location = regionFound;
                    } else {
                        const normalizedLocation = mainLocationPart.toLowerCase().replace('ё', 'е');
                        // CRITICAL CHANGE: Only use the map. If a city/district is not in the map,
                        // it will result in an empty location, and the row will be filtered out later.
                        // This enforces the strict region-based aggregation.
                        location = CITY_TO_REGION_MAP[normalizedLocation] || '';
                    }

                    if (location) {
                        uniqueLocations.add(location);
                        if (!existingClientsByRegion[location]) {
                            existingClientsByRegion[location] = [];
                        }
                        if (fullAddress && !existingClientsByRegion[location].includes(fullAddress)) {
                            existingClientsByRegion[location].push(fullAddress);
                        }
                    }
                    return { rm, brand, city: location, fact, fullAddress };
                }).filter(item => item.rm && item.city && item.brand);
                
                if (processedData.length === 0) throw new Error("В файле не найдено корректных строк с данными, которые можно сопоставить с регионами. Проверьте адреса или содержимое столбцов.");

                resolve({ processedData, uniqueLocations, existingClientsByRegion });
            } catch (error) {
                console.error('File parsing error:', error);
                reject(error instanceof Error ? error : new Error("Не удалось разобрать файл."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};
// --- END File Parser ---



export default function App() {
    const apiKeyExists = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKeyExists) {
        return <ApiKeyErrorDisplay />;
    }
    
    const [aggregatedData, setAggregatedData] = useState<AggregatedDataRow[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle', progress: 0, text: '', etr: '' });
    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    const [filters, setFilters] = useState<FilterState>(() => {
        try {
            const savedFilters = localStorage.getItem('geoAnalysisFilters');
            const parsed = savedFilters ? JSON.parse(savedFilters) : null;
            return {
                rm: parsed?.rm || '',
                brand: Array.isArray(parsed?.brand) ? parsed.brand : [],
                city: Array.isArray(parsed?.city) ? parsed.city : [],
            };
        } catch (error) {
            console.error("Failed to parse filters from localStorage", error);
            return { rm: '', brand: [], city: [] };
        }
    });
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
        }, 4000);
    }, []);
    
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
        setAggregatedData([]);
        setFilters({ rm: '', brand: [], city: [] });
        setSearchTerm('');
        
        try {
            setLoadingState({ status: 'reading', progress: 10, text: 'Чтение и разбор файла...', etr: '' });

            // --- Step 1: Parse file on the main thread ---
            const { processedData, uniqueLocations, existingClientsByRegion } = await parseFileAndExtractData(file);
            
            setLoadingState(prev => ({ ...prev, progress: 25, text: 'Файл успешно разобран. Инициализация AI-аналитика...' }));

            // --- Step 2: Hand off data to the worker for heavy processing ---
            const worker = new Worker(new URL('./services/processing.worker.ts', import.meta.url), {
                type: 'module'
            });
            workerRef.current = worker;
            
            worker.onmessage = (e: MessageEvent<{ type: string; payload: any }>) => {
                const { type, payload } = e.data;

                if (type === 'progress') {
                    setLoadingState(payload);
                } else if (type === 'result') {
                    setAggregatedData(payload);
                    setLoadingState({ status: 'done', progress: 100, text: 'Анализ завершен!', etr: '' });
                    addNotification('Анализ рынка завершен!', 'success');
                    setTimeout(() => {
                        setLoadingState({ status: 'idle', progress: 0, text: '', etr: '' });
                    }, 3000);
                    cleanupWorker();
                } else if (type === 'error') {
                    console.error("Error from worker:", payload);
                    const errorMessage = payload;
                    addNotification('Ошибка: ' + errorMessage, 'error');
                    setLoadingState({ status: 'error', progress: 0, text: 'Ошибка: ' + errorMessage, etr: '' });
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
                uniqueLocations: Array.from(uniqueLocations), // Sets can't be cloned, so convert to array
                existingClientsByRegion,
                baseUrl: window.location.origin 
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
                item.city.toLowerCase().includes(lowercasedTerm) ||
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
    }, [aggregatedData, filters, searchTerm, sortConfig]);

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
                    Инструмент для планирования продаж: детализация по РМ, Бренду и Региону на основе открытых данных OpenStreetMap.
                </p>
            </header>

            <div id="notification-area" className="fixed top-4 right-4 z-[100] space-y-2 w-full max-w-sm">
                {notifications.map(n => (
                    <Notification key={n.id} message={n.message} type={n.type} />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-8">
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
                    />
                </div>
            </div>
        </div>
    );
}