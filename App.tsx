/*
---
title: fix(parser): Implement robust address parsing for accurate city extraction
description: >
  Overhauls the address parsing logic within the web worker to correctly identify and
  extract the primary settlement (city/town) from a full, complex address string.
  The new, more intelligent parser effectively filters out postal codes, street names,
  house numbers, and districts, resolving the critical bug where the entire address
  was used as a location key. This ensures correct data aggregation, accurate
  geocoding queries, and a clean, user-friendly display in the results table.
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
    if (done === 0 || total === 0) return Infinity;
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
const regionToCenterMap = {
    'москва': 'Москва', 'санкт-петербург': 'Санкт-Петербург', 'севастополь': 'Севастополь',
    'адыгея': 'Майкоп', 'алтай': 'Горно-Алтайск', 'башкортостан': 'Уфа', 'бурятия': 'Улан-Удэ',
    'дагестан': 'Махачкала', 'ингушетия': 'Магас', 'кабардино-балкарская': 'Нальчик',
    'калмыкия': 'Элиста', 'карачаево-черкесская': 'Черкесск', 'карелия': 'Петрозаводск',
    'коми': 'Сыктывкар', 'крым': 'Симферополь', 'марий эл': 'Йошкар-Ола', 'мордовия': 'Саранск',
    'саха (якутия)': 'Якутск', 'северная осетия - алания': 'Владикавказ', 'татарстан': 'Казань',
    'тыва': 'Кызыл', 'удмуртская': 'Ижевск', 'хакасия': 'Абакан', 'чеченская': 'Грозный', 'чувашская': 'Чебоксары',
    'алтайский край': 'Барнаул', 'забайкальский край': 'Чита', 'камчатский край': 'Петропавловск-Камчатский',
    'краснодарский край': 'Краснодар', 'красноярский край': 'Красноярск', 'пермский край': 'Пермь',
    'приморский край': 'Владивосток', 'ставропольский край': 'Ставрополь', 'хабаровский край': 'Хабаровск',
    'амурская область': 'Благовещенск', 'архангельская область': 'Архангельск', 'астраханская область': 'Астрахань',
    'белгородская область': 'Белгород', 'брянская область': 'Брянск', 'владимирская область': 'Владимир', 'волгоградская область': 'Волгоград',
    'вологодская область': 'Вологда', 'воронежская область': 'Воронеж', 'ивановская область': 'Иваново', 'иркутская область': 'Иркутск',
    'калининградская область': 'Калининград', 'калужская область': 'Калуга', 'кемеровская область': 'Кемерово',
    'кировская область': 'Киров', 'костромская область': 'Кострома', 'курганская область': 'Курган', 'курская область': 'Курск',
    'ленинградская область': 'Санкт-Петербург', 'липецкая область': 'Липецк', 'магаданская область': 'Магадан', 'московская область': 'Москва',
    'мурманская область': 'Мурманск', 'нижегородская область': 'Нижний Новгород', 'новгородская область': 'Великий Новгород',
    'новосибирская область': 'Новосибирск', 'омская область': 'Омск', 'оренбургская область': 'Оренбург', 'орловская область': 'Орёл',
    'пензенская область': 'Пенза', 'псковская область': 'Псков', 'ростовская область': 'Ростов-на-Дону', 'рязанская область': 'Рязань',
    'самарская область': 'Самара', 'саратовская область': 'Саратов', 'сахалинская область': 'Южно-Сахалинск', 'свердловская область': 'Екатеринбург',
    'смоленская область': 'Смоленск', 'тамбовская область': 'Тамбов', 'тверская область': 'Тверь', 'томская область': 'Томск',
    'тульская область': 'Тула', 'тюменская область': 'Тюмень', 'ульяновская область': 'Ульяновск', 'челябинская область': 'Челябинск', 'ярославская область': 'Ярославль',
    'еврейская': 'Биробиджан', 'ненецкий': 'Нарьян-Мар', 'ханты-мансийский - югра': 'Ханты-Мансийск',
    'чукотский': 'Анадырь', 'ямало-ненецкий': 'Салехард'
};
const allRegions = new Set(Object.keys(regionToCenterMap));
const capitalCities = new Set(Object.values(regionToCenterMap));

function extractSettlementFromAddress(address) {
    if (!address) return null;
    let bestCandidate = null;

    const parts = address.split(/[,;]/).map(p => p.trim()).filter(Boolean);

    // Pass 1: Look for parts with explicit settlement indicators (e.g., "г. Орёл" or "Брянск г")
    for (const part of parts) {
        let cleanPart = part;
        const settlementTypes = ['г', 'город', 'пос', 'поселок', 'пгт', 'село', 'деревня', 'д', 'ст-ца', 'станица', 'аул', 'хутор', 'рп', 'кп'];
        const typesRegex = new RegExp(\`(?:^|\\s)(\\\${settlementTypes.join('|')})\\.?\\s+|\\s*,?\\s*\\.?(\\\${settlementTypes.join('|')})\\s*$\`, 'i');
        
        const match = cleanPart.match(typesRegex);
        if (match) {
            // Remove the type indicator to get the clean name
            const cleaned = cleanPart.replace(typesRegex, '').trim();
            // Ensure we didn't just match noise from a street name like "ул. Городская"
            const noiseWords = ['ул', 'улица', 'проспект', 'пр-т', 'шоссе', 'ш'];
            const containsNoise = noiseWords.some(noise => new RegExp(\`\\\\b\\\${noise}\\\\.?\\\\b\`, 'i').test(part));

            if (cleaned && !containsNoise) {
                 // Found a strong candidate, return it immediately.
                return cleaned;
            }
        }
    }

    // Pass 2: If no explicit indicator was found, use heuristics on the parts
    // Iterate backwards as settlement is often before street/house
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        
        // Ignore postal codes and parts that are only digits (like house numbers)
        if (/^\\d{5,6}$/.test(part) || /^\\d+$/.test(part)) continue;
        
        // Ignore parts that are clearly streets, regions, districts etc.
        const ignoreRegex = /(ул|улица|пр-т|проспект|ш|шоссе|пер|переулок|пл|площадь|мкр|микрорайон|дом|зд|здание|стр|строение|корп|корпус|кв|квартира|р-н|район|обл|область|край|республика|округ)/i;
        if (ignoreRegex.test(part)) continue;

        // Ignore if it's a known region name
        if (allRegions.has(part.toLowerCase())) continue;
        
        // The remaining part is our best guess
        bestCandidate = part;
        break; // Stop after finding the first likely candidate from the end
    }
    
    // Fallback to the very first part if nothing else was found
    return bestCandidate || (parts.length > 0 && !/\\d{5,6}/.test(parts[0]) ? parts[0] : null);
}

function determineQueryInfo(fullAddress) {
    let cleanAddress = String(fullAddress || '').trim().toLowerCase().replace(/ё/g, 'е');
    const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

    if (!cleanAddress) return { locationKey: 'Не определен', queryLocation: null, capitalToExclude: null, isCapital: false };
    
    const settlement = extractSettlementFromAddress(fullAddress); // Use original case address for better extraction
    const capitalizedSettlement = capitalize(settlement);

    let identifiedRegion = null;
    for (const region of Object.keys(regionToCenterMap)) {
        if (cleanAddress.includes(region)) {
            identifiedRegion = region;
            break;
        }
    }

    // Case 1: A settlement was clearly identified
    if (settlement) {
         // Is this settlement a capital city?
        if (capitalCities.has(capitalizedSettlement)) {
             return {
                locationKey: capitalizedSettlement,
                queryLocation: capitalizedSettlement,
                capitalToExclude: null,
                isCapital: true
            };
        } else {
             // It's a smaller settlement. We must group it by its region.
            if (identifiedRegion) {
                const regionName = capitalize(identifiedRegion);
                const capital = regionToCenterMap[identifiedRegion];
                 return {
                    locationKey: regionName,
                    queryLocation: regionName,
                    capitalToExclude: capital,
                    isCapital: false
                };
            } else {
                // We have a settlement but no clear region, treat it as a city search
                 return {
                    locationKey: capitalizedSettlement,
                    queryLocation: capitalizedSettlement,
                    capitalToExclude: null,
                    isCapital: true // Assume it's a primary location
                };
            }
        }
    }
    
    // Case 2: Only a region was found (no specific settlement)
    if (identifiedRegion) {
        const regionName = capitalize(identifiedRegion);
        const capital = regionToCenterMap[identifiedRegion];
        if (capitalCities.has(regionName)) { // e.g., address is just "Москва"
             return { locationKey: regionName, queryLocation: regionName, capitalToExclude: null, isCapital: true };
        }
        return {
            locationKey: regionName,
            queryLocation: regionName,
            capitalToExclude: capital,
            isCapital: false
        };
    }
    
    // Fallback: Use the original full address as a key, but this should be rare.
    return { locationKey: capitalize(fullAddress), queryLocation: capitalize(fullAddress), capitalToExclude: null, isCapital: false };
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

function aggregateData(data) {
    const aggregationMap = new Map();

    data.forEach(item => {
        const key = \`\\\${item.rm}|\\\${item.brand}|\\\${item.locationKey}\`;
        if (!aggregationMap.has(key)) {
            aggregationMap.set(key, {
                rm: item.rm,
                brand: item.brand,
                city: item.locationKey,
                fact: 0,
                potential: 0,
                growthPotential: 0,
                growthRateSum: 0,
                count: 0,
                // These will be set from the first item, as they are consistent per locationKey
                potentialTTs: item.potentialTTs || 0,
                potentialClients: item.potentialClients || [],
            });
        }
        const current = aggregationMap.get(key);
        current.fact += item.fact;
        current.potential += item.potential;
        current.growthPotential += item.growthPotential;
        current.growthRateSum += item.growthRate;
        current.count += 1;
    });

    return Array.from(aggregationMap.values()).map(item => {
        const uniqueClients = Array.from(new Map(item.potentialClients.map(c => [
            c.lat && c.lon ? \`\\\${c.lat},\\\${c.lon}\` : c.name, 
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
const parseFileAndExtractData = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (!e.target?.result) throw new Error("Не удалось прочитать файл.");
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) throw new Error("В файле .xlsx не найдено листов.");
                
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                if (json.length === 0) throw new Error("Файл пуст или имеет неверный формат.");

                // --- START Flexible Header Parsing ---
                const normalizeHeader = (header) => String(header || '').toLowerCase().trim().replace(/\\s+/g, ' ');

                const HEADER_ALIASES = {
                    rm: ['рм', 'региональный менеджер'],
                    brand: ['бренд', 'торговая марка'],
                    city: ['город', 'адрес тт limkorm'],
                    fact: ['факт (кг/ед)', 'факт', 'вес, кг', 'факт (кг)'],
                };

                const fileHeaders = Object.keys(json[0]);

                const findHeaderKey = (aliases) => {
                    for (const header of fileHeaders) {
                        if (aliases.includes(normalizeHeader(header))) {
                            return header; // Return original header name
                        }
                    }
                    return null;
                };

                const headerMap = {
                    rm: findHeaderKey(HEADER_ALIASES.rm),
                    brand: findHeaderKey(HEADER_ALIASES.brand),
                    city: findHeaderKey(HEADER_ALIASES.city),
                    fact: findHeaderKey(HEADER_ALIASES.fact),
                };
                
                const missingHeaders = Object.entries(headerMap)
                    .filter(([key, value]) => !value)
                    .map(([key]) => key);

                if (missingHeaders.length > 0) {
                    const missingRussian = missingHeaders.map(h => {
                        if (h === 'rm') return "'РМ'/'Региональный менеджер'";
                        if (h === 'brand') return "'Бренд'/'Торговая марка'";
                        if (h === 'city') return "'Город'/'Адрес ТТ LimKorm'";
                        if (h === 'fact') return "'Факт (кг/ед)'/'Вес, кг'";
                        return h;
                    }).join(', ');
                    throw new Error(\`В файле отсутствуют обязательные столбцы: \\\${missingRussian}. Пожалуйста, проверьте названия столбцов.\`);
                }
                // --- END Flexible Header Parsing ---

                const processedData = json.map((row) => {
                    const brand = String(row[headerMap.brand] || '').trim();
                    // Handle both comma and dot as decimal separators
                    const factValue = String(row[headerMap.fact] || '0').replace(',', '.');
                    const fact = parseFloat(factValue) || 0;
                    const fullAddress = String(row[headerMap.city] || '').trim();
                    const rm = String(row[headerMap.rm] || '').trim();
                    
                    if (!rm || !brand || !fullAddress) return null; // Skip rows with essential missing data

                    const queryInfo = determineQueryInfo(fullAddress);
                    return { rm, brand, fact, locationKey: queryInfo.locationKey, queryInfo };
                }).filter(Boolean); // Filter out null items

                if (processedData.length === 0) throw new Error("В файле не найдено корректных строк с данными. Убедитесь, что столбцы 'РМ', 'Бренд' и 'Город'/'Адрес' заполнены для всех строк.");
                resolve(processedData);
            } catch (error) {
                console.error('File parsing error:', error);
                reject(error instanceof Error ? error : new Error("Не удалось разобрать файл. Убедитесь, что он имеет правильный формат и названия столбцов."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};
// --- END fileParser ---

// --- START overpassService ---
let baseUrl = ''; 
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

const nominatimRateLimiter = createRateLimiter(1001);

async function getAreaIdForLocation(locationName) {
    if (!locationName) return null;
    const url = baseUrl + '/api/nominatim-proxy?q=' + encodeURIComponent(locationName);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Nominatim proxy network error');
        const data = await response.json();
        if (data && data.length > 0) {
            const result = data[0];
            if (result.osm_type === 'relation') return 3600000000 + parseInt(result.osm_id, 10);
            if (result.osm_type === 'way') return 2400000000 + parseInt(result.osm_id, 10);
        }
        return null;
    } catch (error) {
        console.error('Nominatim lookup failed for ' + locationName + ':', error);
        return null;
    }
}
const throttledGetAreaIdForLocation = nominatimRateLimiter(getAreaIdForLocation);

async function getMarketPotentialForArea(queryInfo) {
    const cacheKey = \`\\\${queryInfo.regionAreaId}|\\\${queryInfo.capitalAreaId || ''}\`;
    if (areaMarketPotentialCache.has(cacheKey)) {
        return areaMarketPotentialCache.get(cacheKey);
    }
    if (!queryInfo.regionAreaId) return { count: 0, clients: [] };

    let areaQueryPart;
    if (queryInfo.capitalAreaId && queryInfo.regionAreaId !== queryInfo.capitalAreaId) {
        areaQueryPart = \`(area(\\\${queryInfo.regionAreaId}); - area(\\\${queryInfo.capitalAreaId});)->.searchArea;\`;
    } else {
        areaQueryPart = \`area(\\\${queryInfo.regionAreaId})->.searchArea;\`;
    }

    const query = \`[out:json][timeout:120];\\\${areaQueryPart}(nwr["shop"~"pet|veterinary"](area.searchArea);nwr["amenity"="veterinary"](area.searchArea););out center;\`;
    
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const response = await fetch(OVERPASS_URL, {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (response.ok) {
                const data = await response.json();
                const clients = data.elements.map((el) => ({
                    name: el.tags?.name || 'Без названия',
                    address: ((el.tags?.['addr:street'] || '') + ' ' + (el.tags?.['addr:housenumber'] || '')).trim(),
                    phone: el.tags?.phone || '',
                    type: el.tags?.shop === 'pet' ? 'Зоомагазин' : 'Ветклиника/Аптека',
                    lat: el.lat || el.center?.lat, lon: el.lon || el.center?.lon,
                }));
                const result = { count: data.elements.length, clients };
                areaMarketPotentialCache.set(cacheKey, result);
                return result;
            }

            if (response.status === 429 || response.status === 504) {
                attempt++;
                if (attempt >= maxRetries) throw new Error('Overpass API failed after ' + maxRetries + ' attempts with status ' + response.status + '.');
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            throw new Error('Network response was not ok. Status: ' + response.status);
        } catch (error) {
             console.error('Overpass fetch error on attempt ' + (attempt + 1) + ':', error);
             attempt++;
             if (attempt >= maxRetries) return { count: 0, clients: [], error: 'fetch_error' };
             const delay = Math.pow(2, attempt) * 1000;
             await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return { count: 0, clients: [], error: 'fetch_error_unhandled' };
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

const calculateRealisticPotential = async (initialData, onProgress) => {
    // 1. Identify unique geocoding tasks
    const locationsToGeocode = new Set();
    initialData.forEach(item => {
        if (item.queryInfo.queryLocation) locationsToGeocode.add(item.queryInfo.queryLocation);
        if (item.queryInfo.capitalToExclude) locationsToGeocode.add(item.queryInfo.capitalToExclude);
    });
    const locationArray = Array.from(locationsToGeocode);
    const totalGeocodingTasks = locationArray.length;
    let geocodedCount = 0;
    const startTime = Date.now();
    
    // 2. Check cache and fetch missing area IDs
    onProgress(30, \`Этап 1: Проверка кеша для \\\${totalGeocodingTasks} локаций...\`, '');
    const cachedAreaIds = await GeoCache.batchGetAreaIds(locationArray);
    const locationsToFetch = locationArray.filter(name => !cachedAreaIds.has(name));
    const locationToAreaIdMap = new Map(cachedAreaIds);
    onProgress(40, \`Найдено в кеше: \\\${cachedAreaIds.size}. Запрос \\\${locationsToFetch.length} новых...\`, '');

    const geocodingPromises = locationsToFetch.map(async (locationName) => {
        const areaId = await throttledGetAreaIdForLocation(locationName);
        if (areaId) {
            locationToAreaIdMap.set(locationName, areaId);
            await GeoCache.setAreaId(locationName, areaId);
        }
        geocodedCount++;
        const etr = calculateEtr(startTime, geocodedCount, totalGeocodingTasks);
        onProgress(40 + (geocodedCount / totalGeocodingTasks) * 20, \`Геокодирование... (\\\${geocodedCount}/\\\${totalGeocodingTasks})\`, etr);
    });
    await Promise.all(geocodingPromises);

    // 3. Identify unique Overpass queries
    const uniqueOverpassQueries = new Map();
    initialData.forEach(item => {
        const regionAreaId = locationToAreaIdMap.get(item.queryInfo.queryLocation);
        const capitalAreaId = item.queryInfo.capitalToExclude ? locationToAreaIdMap.get(item.queryInfo.capitalToExclude) : null;
        if (regionAreaId) {
            const queryKey = \`\\\${regionAreaId}|\\\${capitalAreaId || ''}\`;
            if (!uniqueOverpassQueries.has(queryKey)) {
                uniqueOverpassQueries.set(queryKey, { regionAreaId, capitalAreaId });
            }
        }
    });

    // 4. Execute Overpass queries
    onProgress(60, \`Этап 2: Выполнение \\\${uniqueOverpassQueries.size} уникальных запросов к рынку...\`, '');
    const enqueue = createRequestQueue(4);
    const potentialMap = new Map();
    let queriesProcessed = 0;
    const totalQueries = uniqueOverpassQueries.size;

    const overpassPromises = Array.from(uniqueOverpassQueries.entries()).map(([key, query]) => enqueue(async () => {
        const potential = await getMarketPotentialForArea(query);
        potentialMap.set(key, potential);
        queriesProcessed++;
        const etr = calculateEtr(startTime, geocodedCount + queriesProcessed, totalGeocodingTasks + totalQueries);
        onProgress(60 + (queriesProcessed / totalQueries) * 35, \`Сбор данных... (\\\${queriesProcessed}/\\\${totalQueries})\`, etr);
    }));
    await Promise.all(overpassPromises);

    // 5. Map results back and calculate potential for each row
    const dataWithPotential = initialData.map(item => {
        const regionAreaId = locationToAreaIdMap.get(item.queryInfo.queryLocation);
        const capitalAreaId = item.queryInfo.capitalToExclude ? locationToAreaIdMap.get(item.queryInfo.capitalToExclude) : null;
        const queryKey = \`\\\${regionAreaId}|\\\${capitalAreaId || ''}\`;
        const cityPotential = potentialMap.get(queryKey) || { count: 0, clients: [] };
        
        const potentialTTs = cityPotential.count;
        const potentialClients = cityPotential.clients;
        const growthRate = calculateRealisticGrowthRate(item.fact, potentialTTs);
        const potential = item.fact * (1 + growthRate);
        const growthPotential = potential - item.fact;

        return { ...item, potential, growthPotential, growthRate: growthRate * 100, potentialTTs, potentialClients };
    });
    
    return dataWithPotential;
};


// --- WORKER MAIN LOGIC ---
self.onmessage = async (e) => {
    const { file, baseUrl: newBaseUrl } = e.data;
    baseUrl = newBaseUrl; 

    try {
        self.postMessage({ type: 'progress', payload: { status: 'reading', progress: 10, text: 'Чтение файла...', etr: '' } });
        const processedData = await parseFileAndExtractData(file);
        
        self.postMessage({ type: 'progress', payload: { status: 'fetching', progress: 30, text: \`Найдено \\\${processedData.length} строк. Запрос данных...\`, etr: '' } });
        
        const onProgress = (progress, text, etr) => {
            self.postMessage({ type: 'progress', payload: { status: 'fetching', progress, text, etr: formatTime(etr) } });
        };

        const dataWithPotential = await calculateRealisticPotential(processedData, onProgress);

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
        const cities = [...new Set(aggregatedData.map(d => d.city))].sort((a, b) => a.localeCompare(b, 'ru'));
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

                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return sortConfig.direction === 'ascending' 
                        ? aVal.localeCompare(bVal, 'ru') 
                        : bVal.localeCompare(aVal, 'ru');
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