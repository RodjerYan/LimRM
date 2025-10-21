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
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AggregatedDataRow, FilterState, LoadingState, NotificationMessage, SortConfig } from './types';
import { calculateMetrics, formatLargeNumber } from './utils/dataUtils';
import FileUpload from './components/FileUpload';
import Filters from './components/Filters';
import MetricsSummary from './components/MetricsSummary';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import Notification from './components/Notification';
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';

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

// --- START timeUtils ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds <= 0 || !isFinite(seconds)) {
        return '';
    }
    if (seconds < 1) {
        return 'Осталось менее секунды';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    let result = '~';
    if (minutes > 0) {
        result += ' ' + minutes + ' мин';
    }
    if (remainingSeconds > 0) {
        result += ' ' + remainingSeconds + ' сек';
    }
    return 'Осталось ' + result.trim();
}
function calculateEtr(startTime, done, total) {
    if (done === 0) return Infinity;
    const elapsedTime = (Date.now() - startTime) / 1000;
    const timePerItem = elapsedTime / done;
    const remainingItems = total - done;
    return timePerItem * remainingItems;
}
// --- END timeUtils ---

// --- START IndexedDB Geocoding Cache Service ---
const GeoCache = (() => {
    const DB_NAME = 'GeoAnalysisCache';
    const STORE_NAME = 'locations';
    const DB_VERSION = 1;
    let db = null;

    function initDB() {
        return new Promise((resolve, reject) => {
            if (db) return resolve(db);
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => reject("Ошибка при открытии IndexedDB.");
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
            request.onupgradeneeded = (event) => {
                const tempDb = event.target.result;
                if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                    tempDb.createObjectStore(STORE_NAME, { keyPath: 'locationName' });
                }
            };
        });
    }

    async function getAreaId(locationName) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(locationName);
            request.onsuccess = () => resolve(request.result ? request.result.areaId : null);
            request.onerror = () => reject('Ошибка при чтении из кеша.');
        });
    }
    
    async function setAreaId(locationName, areaId) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ locationName, areaId });
            request.onsuccess = () => resolve();
            request.onerror = () => reject('Ошибка при записи в кеш.');
        });
    }

    async function batchGetAreaIds(locationNames) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const results = new Map();
            let completed = 0;

            if (locationNames.length === 0) {
                resolve(results);
                return;
            }

            locationNames.forEach(name => {
                const request = store.get(name);
                request.onsuccess = () => {
                    if (request.result) {
                        results.set(name, request.result.areaId);
                    }
                    completed++;
                    if (completed === locationNames.length) {
                        resolve(results);
                    }
                };
                 request.onerror = () => {
                    // Log error but continue
                    console.error('Ошибка при чтении из кеша для:', name);
                    completed++;
                    if (completed === locationNames.length) {
                        resolve(results);
                    }
                };
            });
             transaction.onerror = () => reject('Ошибка транзакции при пакетном чтении.');
        });
    }

    return { getAreaId, setAreaId, batchGetAreaIds };
})();
// --- END IndexedDB Geocoding Cache Service ---


// --- START dataUtils ---
const cityCorrections = {
    'анкт-петербур': 'Санкт-Петербург', 'анктпетербург': 'Санкт-Петербург', 'санктпетербург': 'Санкт-Петербург', 'спб': 'Санкт-Петербург', 'питер': 'Санкт-Петербург',
    'мосвка': 'Москва', 'моква': 'Москва', 'мск': 'Москва',
    'нновгород': 'Нижний Новгород', 'нижнийновгород': 'Нижний Новгород', 'н.новгород': 'Нижний Новгород', 'н. новгород': 'Нижний Новгород',
    'екатеринбур': 'Екатеринбург', 'ростовнадону': 'Ростов-на-Дону', 'ростов-на-дону': 'Ростов-на-Дону',
    'йошкар-ола': 'Йошкар-Ола', 'набережные челны': 'Набережные Челны', 'улан-удэ': 'Улан-Удэ', 'комсомольск-на-амуре': 'Комсомольск-на-Амуре'
};

function sanitizeForOverpass(name) {
    if (!name) return '';
    let sanitized = name.trim();
    sanitized = sanitized.replace(/р-н\\.?/i, 'район');
    sanitized = sanitized.replace(/^(г|город)\\.?\\s+/i, ''); 
    sanitized = sanitized.replace(/\\s+(г|город)\\.?$/i, '');
    sanitized = sanitized.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
    return sanitized.trim();
}


function correctCityTypos(cityName) {
    if (!cityName) return '';
    const lowerCity = cityName.toLowerCase().trim().replace(/\\./g, '');
    for (const [typo, correction] of Object.entries(cityCorrections)) {
        if (lowerCity === typo.toLowerCase()) return correction;
    }
    return cityName;
}
function determineLocationAndKey(fullAddress) {
    if (!fullAddress) return { locationKey: 'Не определен', overpassQuery: 'Не определен' };
    
    // FIX: Map of regions to their administrative centers for more reliable searching.
    const regionToCenterMap = {
        'орловская': 'Орёл',
        'брянская': 'Брянск',
        'смоленская': 'Смоленск',
        'калужская': 'Калуга',
        'тульская': 'Тула',
        'курская': 'Курск',
        'липецкая': 'Липецк',
        'московская': 'Москва',
        'ленинградская': 'Санкт-Петербург',
        'воронежская': 'Воронеж',
        'рязанская': 'Рязань',
        'владимирская': 'Владимир',
        'ярославская': 'Ярославль',
        'ивановская': 'Иваново',
        'костромская': 'Кострома',
        'тверская': 'Тверь',
    };

    const cityKeywords = ['г', 'город'];
    const settlementKeywords = ['с', 'село', 'пгт', 'поселок', 'деревня', 'станица', 'ст-ца', 'аул', 'х', 'хутор'];
    const allSettlementKeywords = [...cityKeywords, ...settlementKeywords];
    const regionKeywords = ['область', 'обл', 'край', 'республика', 'респ', 'округ', 'ао', 'автономная'];
    const streetKeywords = ['ул', 'улица', 'пр', 'проспект', 'пр-кт', 'пер', 'переулок', 'ш', 'шоссе', 'проезд', 'бульвар', 'б-р', 'наб', 'набережная', 'пл', 'площадь', 'аллея', 'мкр', 'микрорайон', 'квартал', 'территория', 'тер'];
    const buildingKeywords = ['дом', 'д', 'корпус', 'корп', 'к', 'стр', 'строение', 'лит', 'литера', 'кв', 'квартира', 'пом', 'помещение', 'офис', 'здание'];
    const countryStopWords = ['россия', 'российская федерация'];
    let cleanAddress = fullAddress.replace(/^\\d{6},\\s*/, '').trim();
    const parts = cleanAddress.split(/[,;]|\\s-\\s/).map(p => p.trim()).filter(p => p.length > 1);
    let region = null;
    let settlement = null;
    let settlementType = 'unknown';
    for (const part of parts) {
        const lowerPart = part.toLowerCase();
        if (!region && regionKeywords.some(kw => lowerPart.includes(kw) && !streetKeywords.some(skw => lowerPart.startsWith(skw)))) {
            region = part;
        }
        const prefixMatch = lowerPart.match(new RegExp('^(' + allSettlementKeywords.join('|') + ')[.\\\\s]+(.+)'));
        if (prefixMatch && prefixMatch[2]) {
            const typePrefix = prefixMatch[1];
            const name = prefixMatch[2].trim();
            if (!/^\\d+([а-яА-ЯёЁ]|\\/)?$/.test(name)) {
                settlement = name.charAt(0).toUpperCase() + name.slice(1);
                settlementType = cityKeywords.includes(typePrefix) ? 'city' : 'settlement';
                break;
            }
        }
    }
    if (!settlement) {
        const candidates = [];
        for (const part of parts) {
            const lowerPart = part.toLowerCase();
            if (!/[а-яА-ЯёЁ]/.test(part)) continue;
            const hasRegionKeyword = regionKeywords.some(kw => lowerPart.includes(kw));
            const hasStreetKeyword = streetKeywords.some(kw => lowerPart.includes(kw));
            const hasBuildingKeyword = buildingKeywords.some(kw => lowerPart.includes(kw));
            const hasCountryKeyword = countryStopWords.some(kw => lowerPart.includes(kw));
            if (hasRegionKeyword || hasStreetKeyword || hasCountryKeyword) continue;
            if (hasBuildingKeyword && /\\d/.test(lowerPart)) continue;
            const letters = (part.match(/[а-яА-ЯёЁ]/g) || []).length;
            const digits = (part.match(/\\d/g) || []).length;
            if (digits > letters) continue;
            candidates.push(part);
        }
        if (candidates.length > 0) {
            settlement = candidates[0].charAt(0).toUpperCase() + candidates[0].slice(1);
        }
    }
    
    // FIX: If only a region is found, use its administrative center for the query.
    if (!settlement && region) {
        const lowerRegion = region.toLowerCase().replace(/\\s*(обл|область|край|республика|респ)\\.?$/g, '').trim();
        const center = regionToCenterMap[lowerRegion];
        if (center) {
            settlement = center; // Use the admin center for the query, but keep the region for display.
        } else {
            settlement = region; // Fallback to old (less reliable) behavior if center is not in our map.
        }
    }

    if (!settlement) {
        return { locationKey: 'Не определен', overpassQuery: 'Не определен' };
    }
    const correctedSettlement = correctCityTypos(settlement);
    let locationKey;
    if (settlementType === 'city' || ['Москва', 'Санкт-Петербург'].includes(correctedSettlement)) {
        locationKey = correctedSettlement;
    } else if (region) {
        locationKey = region;
    } else {
        locationKey = correctedSettlement;
    }
    
    // Treat "Орел" and "Орёл" as the same city, displaying "Орёл".
    if (locationKey && locationKey.toLowerCase().replace(/ё/g, 'е') === 'орел') {
        locationKey = 'Орёл';
    }
    
    const overpassQuery = sanitizeForOverpass(correctedSettlement);
    return { locationKey, overpassQuery };
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

// FIX: Corrected aggregation logic to properly handle cases where multiple display names 
// (e.g., "Орловская обл", "Орёл") map to the same query location ("Орёл"). This ensures
// potential client data (ОКБ) is correctly assigned to all relevant groups.
function aggregateData(data) {
    const aggregationMap = new Map();
    
    // Step 1: Create a map from the query name (e.g., 'Орёл') to its potential data.
    // This correctly collects the potential for each unique geographical location once.
    const queryToPotentialMap = new Map();
    data.forEach(item => {
        if (item.cityForOverpass && !queryToPotentialMap.has(item.cityForOverpass)) {
            queryToPotentialMap.set(item.cityForOverpass, {
                potentialTTs: item.potentialTTs || 0,
                potentialClients: item.potentialClients || []
            });
        }
    });

    // Step 2: Aggregate sales data, grouping by the display name (e.g., "Орловская обл").
    data.forEach(item => {
        const key = \`\${item.rm}|\${item.brand}|\${item.city}\`; // Group by display city
        if (!aggregationMap.has(key)) {
            // On first sight of a group, create it.
            // Look up the potential using the item's unique query name.
            const potentials = queryToPotentialMap.get(item.cityForOverpass) || { potentialTTs: 0, potentialClients: [] };
            aggregationMap.set(key, {
                rm: item.rm,
                brand: item.brand,
                city: item.city, // The display name
                fact: 0,
                potential: 0,
                growthPotential: 0,
                growthRateSum: 0,
                count: 0,
                potentialTTs: potentials.potentialTTs,
                potentialClients: potentials.potentialClients,
            });
        }
        // Add the current item's sales data to the aggregate.
        const current = aggregationMap.get(key);
        current.fact += item.fact;
        current.potential += item.potential;
        current.growthPotential += item.growthPotential;
        current.growthRateSum += item.growthRate;
        current.count += 1;
    });

    // Step 3: Finalize the aggregated data (calculate averages and de-duplicate clients).
    return Array.from(aggregationMap.values()).map(item => {
        // Ensure client list is unique for display purposes.
        const uniqueClients = Array.from(new Map(item.potentialClients.map(c => [
            c.lat && c.lon ? \`\${c.lat},\${c.lon}\` : c.name, 
            c
        ])).values());

        return {
            rm: item.rm,
            brand: item.brand,
            city: item.city,
            fact: item.fact,
            potential: item.potential,
            growthPotential: item.growthPotential,
            potentialTTs: item.potentialTTs,
            potentialClients: uniqueClients,
            growthRate: item.count > 0 ? item.growthRateSum / item.count : 0,
        };
    });
}
// --- END dataUtils ---

// --- START fileParser ---
const parseFileAndExtractCities = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (!e.target?.result) throw new Error("Не удалось прочитать файл.");
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const rawData = json.slice(1);
                const uniqueLocations = new Set();
                const processedData = rawData.map((row) => {
                    const brand = String(row[1] || '').trim();
                    const fact = Number(row[4]) || 0;
                    const fullAddress = String(row[6] || '').trim();
                    const rm = String(row[8] || '').trim();
                    const { locationKey, overpassQuery } = determineLocationAndKey(fullAddress);
                    if (overpassQuery && overpassQuery !== 'Не определен') {
                        uniqueLocations.add(overpassQuery);
                    }
                    return { rm, brand, fullAddress, city: locationKey, cityForOverpass: overpassQuery, fact };
                }).filter(item => item.rm && item.city !== 'Не определен' && item.brand);
                if (processedData.length === 0) throw new Error("В файле не найдено корректных данных. Проверьте порядок и содержимое столбцов.");
                resolve({ processedData, uniqueLocations });
            } catch (error) {
                console.error('File parsing error:', error);
                reject(error instanceof Error ? error : new Error("Не удалось разобрать файл."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};
// --- END fileParser ---

// --- START overpassService ---
let baseUrl = ''; // Will be set by the main thread
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const areaMarketPotentialCache = new Map();

function createRateLimiter(minInterval) {
    let lastCallTime = 0;
    return (fn) => {
        return (...args) => {
            return new Promise((resolve) => {
                const now = Date.now();
                const timeSinceLastCall = now - lastCallTime;
                const delay = Math.max(0, minInterval - timeSinceLastCall);
                
                setTimeout(() => {
                    lastCallTime = Date.now();
                    resolve(fn(...args));
                }, delay);
            });
        };
    };
}

const nominatimRateLimiter = createRateLimiter(1001); // 1 req/sec + 1ms buffer

async function getAreaIdForLocation(locationName) {
    // FIX: Web workers cannot resolve relative URLs. Prepend the baseUrl passed from the main thread.
    const url = baseUrl + '/api/nominatim-proxy?q=' + encodeURIComponent(locationName);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Nominatim proxy network error');
        const data = await response.json();
        if (data && data.length > 0) {
            const result = data[0];
            if (result.osm_type === 'relation') {
                return 3600000000 + parseInt(result.osm_id, 10);
            }
            if (result.osm_type === 'way') {
                return 2400000000 + parseInt(result.osm_id, 10);
            }
        }
        return null;
    } catch (error) {
        console.error('Nominatim lookup failed for ' + locationName + ':', error);
        return null;
    }
}
const throttledGetAreaIdForLocation = nominatimRateLimiter(getAreaIdForLocation);

async function getMarketPotentialForArea(areaId) {
    if (areaMarketPotentialCache.has(areaId)) {
        return areaMarketPotentialCache.get(areaId);
    }
    // FIX: Replaced template literal with standard string concatenation to fix Vercel build error.
    // FIX: Increased timeout to 60s for better reliability with large areas.
    const query = '[out:json][timeout:60];area(' + areaId + ')->.searchArea;(nwr["shop"~"pet|veterinary"](area.searchArea);nwr["amenity"="veterinary"](area.searchArea););out center;';
    try {
        const response = await fetch(OVERPASS_URL, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (!response.ok) {
            if (response.status === 429) return { error: 'rate_limit' };
            throw new Error('Network response was not ok. Status: ' + response.status);
        }
        const data = await response.json();
        const clients = data.elements.map((el) => ({
            name: el.tags?.name || 'Без названия',
            address: ((el.tags?.['addr:street'] || '') + ' ' + (el.tags?.['addr:housenumber'] || '')).trim(),
            phone: el.tags?.phone || '',
            type: el.tags?.shop === 'pet' ? 'Зоомагазин' : 'Ветклиника/Аптека',
            lat: el.lat || el.center?.lat, lon: el.lon || el.center?.lon,
        }));
        const result = { count: data.elements.length, clients };
        areaMarketPotentialCache.set(areaId, result);
        return result;
    } catch (error) {
        console.error('There has been a problem with your fetch operation for area ' + areaId + ':', error);
        return { count: 0, clients: [], error: 'fetch_error' };
    }
}
function createRequestQueue(concurrency) {
    const queue = []; let activeRequests = 0;
    function processQueue() {
        if (activeRequests >= concurrency || queue.length === 0) return;
        activeRequests++;
        const { task, resolve, reject } = queue.shift();
        task().then(resolve).catch(reject)
            .finally(() => { activeRequests--; processQueue(); });
    }
    return function enqueue(task) {
        return new Promise((resolve, reject) => {
            queue.push({ task, resolve, reject });
            processQueue();
        });
    };
}
// --- END overpassService ---

const calculateRealisticPotential = async (initialData, uniqueLocations, onProgress) => {
    const dataWithPotential = [];
    const locationArray = Array.from(uniqueLocations);
    const totalLocations = locationArray.length;
    let processedCount = 0;
    const startTime = Date.now();
    
    // --- STAGE 1: Geocoding (with caching) ---
    onProgress(30, 'Этап 1: Проверка локального кеша...', '');
    const cachedAreaIds = await GeoCache.batchGetAreaIds(locationArray);
    const locationsToFetch = locationArray.filter(name => !cachedAreaIds.has(name));
    
    const locationToAreaIdMap = new Map(cachedAreaIds);
    onProgress(40, 'Найдено в кеше: ' + cachedAreaIds.size + '. Запрос ' + locationsToFetch.length + ' новых локаций...', '');

    const totalGeocodingSteps = locationsToFetch.length;
    let geocodedCount = 0;

    const geocodingPromises = locationsToFetch.map(async (locationName) => {
        const areaId = await throttledGetAreaIdForLocation(locationName);
        if (areaId) {
            locationToAreaIdMap.set(locationName, areaId);
            await GeoCache.setAreaId(locationName, areaId);
        }
        geocodedCount++;
        const etr = calculateEtr(startTime, geocodedCount, totalGeocodingSteps);
        onProgress(40 + (geocodedCount / (totalGeocodingSteps || 1)) * 20, 'Геокодирование... (' + geocodedCount + '/' + totalGeocodingSteps + ')', etr);
    });
    
    await Promise.all(geocodingPromises);
    
    // --- STAGE 2: Fetching market data from Overpass ---
    onProgress(60, 'Этап 2: Сбор данных о точках продаж...', '');
    const enqueue = createRequestQueue(4);
    const potentialMap = new Map();
    
    const locationsWithIds = Array.from(locationToAreaIdMap.entries()).filter(([_, areaId]) => areaId !== null);
    
    const promises = locationsWithIds.map(([locationName, areaId]) => enqueue(async () => {
        const potential = await getMarketPotentialForArea(areaId);
        potentialMap.set(locationName, potential);

        processedCount++;
        const etr = calculateEtr(startTime, processedCount + totalGeocodingSteps, locationsWithIds.length + totalGeocodingSteps);
        onProgress(60 + (processedCount / (locationsWithIds.length || 1)) * 35, 'Сбор данных... (' + processedCount + '/' + locationsWithIds.length + ')', etr);
    }));

    await Promise.all(promises);
    
    locationArray.forEach(locationName => {
        if (!potentialMap.has(locationName)) {
             potentialMap.set(locationName, { count: 0, clients: [] });
        }
    });

    // --- STAGE 3: Merging data ---
    for (const item of initialData) {
        const cityPotential = potentialMap.get(item.cityForOverpass) || { count: 0, clients: [] };
        const potentialTTs = cityPotential.count;
        const potentialClients = cityPotential.clients;
        const growthRate = calculateRealisticGrowthRate(item.fact, potentialTTs);
        const potential = item.fact * (1 + growthRate);
        const growthPotential = potential - item.fact;
        dataWithPotential.push({ ...item, potential, growthPotential, growthRate: growthRate * 100, potentialTTs, potentialClients });
    }
    
    return dataWithPotential;
};


// --- WORKER MAIN LOGIC ---
self.onmessage = async (e) => {
    // FIX: The message now contains both the file and the application's base URL.
    const { file, baseUrl: newBaseUrl } = e.data;
    baseUrl = newBaseUrl; // Set the global baseUrl for the worker's fetch calls.

    try {
        self.postMessage({ type: 'progress', payload: { status: 'reading', progress: 10, text: 'Чтение файла...', etr: '' } });
        const { processedData, uniqueLocations } = await parseFileAndExtractCities(file);
        const locationCount = uniqueLocations.size;
        self.postMessage({ type: 'progress', payload: { status: 'fetching', progress: 30, text: 'Найдено ' + locationCount + ' уникальных локаций. Запрос данных...', etr: '' } });
        if (locationCount === 0) {
            self.postMessage({ type: 'error', payload: "В файле не найдено локаций для анализа. Проверьте данные." });
            return;
        }
        const onProgress = (progress, text, etr) => {
            self.postMessage({ type: 'progress', payload: { status: 'fetching', progress, text, etr: formatTime(etr) } });
        };
        const dataWithPotential = await calculateRealisticPotential(processedData, uniqueLocations, onProgress);
        self.postMessage({ type: 'progress', payload: { status: 'aggregating', progress: 95, text: 'Агрегация результатов...', etr: '' } });
        const finalAggregatedData = aggregateData(dataWithPotential);
        self.postMessage({ type: 'result', payload: finalAggregatedData });
    } catch (error) {
        self.postMessage({ type: 'error', payload: error instanceof Error ? error.message : "Произошла неизвестная ошибка в фоновом обработчике." });
    }
};
`;
// --- END Inlined Worker Code ---



export default function App() {
    // Check for API key existence using Vite's environment variable standard.
    // FIX: Renamed to VITE_GEMINI_API_KEY to reflect the switch to Google Gemini.
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
            // Ensure parsed filters have the correct shape, defaulting to arrays for brand/city
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
    const workerUrlRef = useRef<string | null>(null);

    // Persist filters to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('geoAnalysisFilters', JSON.stringify(filters));
        } catch (error) {
            console.error("Could not save filters to localStorage", error);
        }
    }, [filters]);

    // Persist search term to localStorage
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
        if (workerUrlRef.current) {
            URL.revokeObjectURL(workerUrlRef.current);
            workerUrlRef.current = null;
        }
    };

    useEffect(() => {
        addNotification('Система готова! Пожалуйста, загрузите файл Excel/CSV.', 'success');
        return () => cleanupWorker(); // Cleanup on component unmount
    }, [addNotification]);
    
    const handleFileSelect = async (file: File) => {
        cleanupWorker(); // Terminate any existing worker before starting a new one

        // Reset state for new analysis
        setAggregatedData([]);
        setFilters({ rm: '', brand: [], city: [] });
        setSearchTerm('');
        
        try {
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
                    addNotification('Анализ рынка завершен!', 'success');
                    setTimeout(() => {
                        setLoadingState({ status: 'idle', progress: 0, text: '', etr: '' });
                    }, 3000);
                    cleanupWorker();
                } else if (type === 'error') {
                    console.error("Error from worker:", payload);
                    const errorMessage = payload;
                    // FIX: Replaced template literal with standard string concatenation to fix Vercel build error.
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

            // FIX: Pass the file AND the application's origin to the worker.
            worker.postMessage({ file, baseUrl: window.location.origin });

        } catch(error) {
            console.error("Failed to create or post to worker:", error);
            const errorMessage = "Не удалось запустить фоновый обработчик. Возможно, ваш браузер не поддерживает эту функцию или возникла проблема с загрузкой скрипта.";
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

    // FIX: More robust calculation for total potential TTs to prevent NaN.
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