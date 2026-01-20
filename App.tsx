import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome'; 
import InteractiveRegionMap from './components/InteractiveRegionMap';
import Filters from './components/Filters';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import { RMDashboard } from './components/RMDashboard';
import Notification from './components/Notification';
import AddressEditModal from './components/AddressEditModal'; 
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import { 
    AggregatedDataRow, FilterState, NotificationMessage, 
    OkbDataRow, MapPoint, UnidentifiedRow, FileProcessingState,
    WorkerMessage, WorkerResultPayload, CloudLoadParams, CoordsCache, OkbStatus
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, normalizeAddress, findValueInRow } from './utils/dataUtils';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from './utils/db';

const DetailsModal = React.lazy(() => import('./components/DetailsModal'));
const UnidentifiedRowsModal = React.lazy(() => import('./components/UnidentifiedRowsModal'));

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

// КОНСТАНТА: Количество строк данных в одном JSON-файле (чанке)
// 5000 строк обычно занимают 1-2 МБ, что безопасно для fetch и JSON.parse
const ROWS_PER_CHUNK = 5000;

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    
    // --- DATE FILTER STATE ---
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');

    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');
    
    // Shared State for Adapta
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{[key: string]: number}>({});
    
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
    
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false, progress: 0, message: 'Система готова', fileName: null, backgroundMessage: null, startTime: null, totalRowsProcessed: 0
    });

    const totalRowsProcessedRef = useRef<number>(0);
    const processedFileIdsRef = useRef<Set<string>>(new Set());
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const workerRef = useRef<Worker | null>(null);

    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);

    // Update refs when state changes
    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    // --- УНИВЕРСАЛЬНАЯ НОРМАЛИЗАЦИЯ И "ЛЕЧЕНИЕ" ДАННЫХ ---
    const normalize = useCallback((rows: any[]): AggregatedDataRow[] => {
        if (!Array.isArray(rows)) return [];
        
        const result: AggregatedDataRow[] = [];
        rows.forEach(row => {
            if (!row) return;

            const brandRaw = String(row.brand || '').trim();
            const hasMultipleBrands = brandRaw.length > 2 && /[,;|\r\n]/.test(brandRaw);

            if (hasMultipleBrands) {
                const parts = brandRaw.split(/[,;|\r\n]+/).map(b => b.trim()).filter(b => b.length > 0);
                if (parts.length > 1) {
                    const splitFactor = 1 / parts.length;
                    parts.forEach((brandPart, idx) => {
                        result.push({
                            ...row,
                            key: `${row.key}_split_${idx}`,
                            brand: brandPart,
                            clientName: `${row.region}: ${brandPart}`,
                            fact: (row.fact || 0) * splitFactor,
                            potential: (row.potential || 0) * splitFactor,
                            growthPotential: (row.growthPotential || 0) * splitFactor,
                            clients: Array.isArray(row.clients) ? row.clients : []
                        });
                    });
                    return;
                }
            }
            
            result.push({
                ...row,
                clients: Array.isArray(row.clients) && row.clients.length > 0 
                    ? row.clients 
                    : [{ ...row, key: row.key || row.address || `gen_${Math.random()}` }]
            });
        });
        return result;
    }, []);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // --- ЗАГРУЗКА СНИМКА (SNAPSHOT) ---
    // ИСПРАВЛЕННАЯ ЛОГИКА: Загружаем чанки и парсим их КАК ОБЪЕКТЫ, а не как текст
    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация...', progress: 0 }));
            
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error('Failed to fetch snapshot list');
            
            let fileList = await listRes.json();
            
            if (!Array.isArray(fileList) || fileList.length === 0) {
                console.warn('No snapshot files found');
                return false;
            }

            // 1. Сортировка (оставляем улучшенную, она все равно полезна для порядка данных)
            fileList.sort((a: any, b: any) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                const chunkMatchA = nameA.match(/(?:chunk|part)[-_]?(\d+)/i);
                const chunkMatchB = nameB.match(/(?:chunk|part)[-_]?(\d+)/i);
                if (chunkMatchA && chunkMatchB) return parseInt(chunkMatchA[1], 10) - parseInt(chunkMatchB[1], 10);
                const numsA = nameA.match(/\d+/g)?.map(Number) || [0];
                const numsB = nameB.match(/\d+/g)?.map(Number) || [0];
                for (let i = 0; i < Math.max(numsA.length, numsB.length); i++) {
                    const valA = numsA[i] !== undefined ? numsA[i] : -1;
                    const valB = numsB[i] !== undefined ? numsB[i] : -1;
                    if (valA !== valB) return valA - valB;
                }
                return nameA.localeCompare(nameB);
            });

            let loadedCount = 0;
            const total = fileList.length;
            
            // Накопители данных
            let accumulatedRows: AggregatedDataRow[] = [];
            let loadedMeta: any = null;

            // 2. Последовательная загрузка и ПАРСИНГ каждого чанка
            for (const file of fileList) {
                const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`);
                if (!res.ok) throw new Error(`Failed to load chunk ${file.id}`);
                
                const text = await res.text();
                if (!text) continue;

                try {
                    // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Парсим каждый файл отдельно!
                    // Мы ожидаем, что каждый файл - это валидный JSON объект.
                    const chunkData = JSON.parse(text);
                    
                    // Если это старый формат (одна большая строка), код упадет в catch, 
                    // но для новой системы это штатное поведение.
                    
                    // Собираем строки данных
                    if (Array.isArray(chunkData.rows)) {
                        accumulatedRows.push(...chunkData.rows);
                    } else if (Array.isArray(chunkData.aggregatedData)) {
                         // Fallback для совместимости, если вдруг чанк содержит полную структуру
                         accumulatedRows.push(...chunkData.aggregatedData);
                    }

                    // Ищем метаданные (они могут быть в первом или любом чанке)
                    if (chunkData.meta) {
                        loadedMeta = chunkData.meta;
                    }
                    
                } catch (jsonErr) {
                    console.error(`Error parsing chunk ${file.id}:`, jsonErr);
                    // Если это НЕ "Unterminated string", а просто битый файл - мы это увидим
                    throw new Error(`Corrupted chunk file: ${file.name}`);
                }
                
                loadedCount++;
                setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
            }

            if (accumulatedRows.length > 0 || loadedMeta) {
                // Восстанавливаем состояние из накопленных данных
                const validated = normalize(accumulatedRows);
                
                setAllData(validated);
                allDataRef.current = validated;
                
                // Метаданные (или дефолтные значения)
                const safeMeta = loadedMeta || {};
                const uRows = safeMeta.unidentifiedRows || [];
                const rCounts = safeMeta.okbRegionCounts || {};
                
                setUnidentifiedRows(uRows);
                setOkbRegionCounts(rCounts);
                totalRowsProcessedRef.current = safeMeta.totalRowsProcessed || accumulatedRows.length;

                await saveAnalyticsState({
                    allData: validated,
                    unidentifiedRows: uRows,
                    okbRegionCounts: rCounts,
                    totalRowsProcessed: totalRowsProcessedRef.current,
                    versionHash: versionHash,
                    okbData: [], okbStatus: null
                });
                
                localStorage.setItem('last_snapshot_version', versionHash);
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Готово', progress: 100 }));
                return true;
            }
            
            return false;

        } catch (e) { 
            console.error("Snapshot download error:", e); 
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка загрузки' }));
            addNotification('Ошибка загрузки или поврежденные данные', 'error');
        }
        return false;
    }, [normalize, addNotification]);

    // --- ФУНКЦИЯ СОХРАНЕНИЯ В ОБЛАКО (JSON SNAPSHOT) ---
    // ИСПРАВЛЕННАЯ ЛОГИКА: Разбиваем массив на части и сохраняем как отдельные валидные JSON объекты
    const saveSnapshotToCloud = async (currentData: AggregatedDataRow[], currentUnidentified: UnidentifiedRow[]) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Подготовка данных...', progress: 0 }));
            
            const newVersionHash = `edit_${Date.now()}`;
            
            // 1. Разбиваем данные на пакеты (chunks) по ROWS_PER_CHUNK
            const totalRows = currentData.length;
            const totalChunks = Math.ceil(totalRows / ROWS_PER_CHUNK) || 1;
            
            for (let i = 0; i < totalChunks; i++) {
                const start = i * ROWS_PER_CHUNK;
                const end = start + ROWS_PER_CHUNK;
                const chunkRows = currentData.slice(start, end);
                
                // Формируем объект чанка
                const chunkPayload: any = {
                    chunkIndex: i,
                    totalChunks: totalChunks,
                    versionHash: newVersionHash,
                    rows: chunkRows, // Валидный массив
                };

                // Добавляем метаданные только в первый чанк (chunk 0) для экономии места
                if (i === 0) {
                    chunkPayload.meta = {
                        unidentifiedRows: currentUnidentified,
                        okbRegionCounts: okbRegionCounts,
                        totalRowsProcessed: totalRowsProcessedRef.current,
                        versionHash: newVersionHash,
                        timestamp: Date.now()
                    };
                }

                // Сериализуем ЭТОТ КОНКРЕТНЫЙ объект. 
                // Это безопасно, т.к. размер контролируем, и это валидный JSON.
                const chunkJson = JSON.stringify(chunkPayload);

                // Отправляем
                setProcessingState(prev => ({ ...prev, message: `Выгрузка части ${i+1}/${totalChunks}`, progress: Math.round((i/totalChunks)*90) }));
                
                const res = await fetch(`/api/get-full-cache?action=save-chunk&chunkIndex=${i}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chunk: chunkJson }) // Оборачиваем, т.к. API может ожидать { chunk: string }
                });
                
                if (!res.ok) throw new Error(`Upload failed for chunk ${i}`);
            }
            
            // 2. Финализируем (Meta)
            await fetch('/api/get-full-cache?action=save-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    versionHash: newVersionHash,
                    chunkCount: totalChunks,
                    totalRows: totalRowsProcessedRef.current,
                    timestamp: Date.now()
                })
            });

            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Синхронизировано', progress: 100 }));
            addNotification('Данные успешно сохранены в облаке', 'success');
        } catch (e) {
            console.error("Cloud Save Error:", e);
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сохранения' }));
            addNotification('Ошибка синхронизации с облаком', 'warning');
        }
    };

    // --- ОБРАБОТКА ОБЛАКА (WORKER) ---
    const handleStartCloudProcessing = useCallback(async (params: CloudLoadParams) => {
        if (processingState.isProcessing) return;
        
        let rowsProcessedSoFar = totalRowsProcessedRef.current;
        if (rowsProcessedSoFar === 0) {
             setAllData([]);
             setUnidentifiedRows([]);
             setOkbRegionCounts({});
             processedFileIdsRef.current.clear();
        }

        setProcessingState(prev => ({ 
            ...prev,
            isProcessing: true, progress: 0, 
            message: 'Синхронизация...', 
            startTime: Date.now(), totalRowsProcessed: rowsProcessedSoFar
        }));
        
        let cacheData: CoordsCache = {};
        try {
            const response = await fetch(`/api/get-full-cache?t=${Date.now()}`);
            if (response.ok) cacheData = await response.json();
        } catch (error) {}
        
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message, totalRowsProcessed: msg.payload.totalProcessed ?? prev.totalRowsProcessed }));
                if (msg.payload.totalProcessed) totalRowsProcessedRef.current = msg.payload.totalProcessed;
            }
            else if (msg.type === 'result_init') setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
                const validatedChunk = normalize(chunkData);
                setAllData(validatedChunk);
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
                totalRowsProcessedRef.current = totalProcessed;
            }
            else if (msg.type === 'CHECKPOINT') {
                const payload = msg.payload;
                const validated = normalize(payload.aggregatedData);
                setAllData(validated);
                setUnidentifiedRows(payload.unidentifiedRows);
                saveSnapshotToCloud(validated, payload.unidentifiedRows).catch(console.error);
            }
            else if (msg.type === 'result_finished') {
                const payload = msg.payload as WorkerResultPayload;
                const validated = normalize(payload.aggregatedData);
                setOkbRegionCounts(payload.okbRegionCounts);
                setAllData(validated);
                setUnidentifiedRows(payload.unidentifiedRows);
                setDbStatus('ready');
                
                const finalVersion = `processed_${Date.now()}`;
                await saveAnalyticsState({
                    allData: validated,
                    unidentifiedRows: payload.unidentifiedRows,
                    okbRegionCounts: payload.okbRegionCounts,
                    totalRowsProcessed: payload.totalRowsProcessed,
                    versionHash: finalVersion,
                    okbData: [], okbStatus: null
                });
                
                saveSnapshotToCloud(validated, payload.unidentifiedRows).catch(console.error);
                
                localStorage.setItem('last_snapshot_version', finalVersion);
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Завершено', totalRowsProcessed: payload.totalRowsProcessed }));
            }
        };
        
        workerRef.current.postMessage({ 
            type: 'INIT_STREAM', 
            payload: { okbData, cacheData, totalRowsProcessed: rowsProcessedSoFar, restoredData: allDataRef.current, restoredUnidentified: unidentifiedRowsRef.current } 
        });
        
        try {
            const listRes = await fetch(`/api/get-akb?year=${params.year}&mode=list`);
            const allFiles = listRes.ok ? await listRes.json() : [];
            for (const file of allFiles) {
                if (processedFileIdsRef.current.has(file.id)) continue;
                processedFileIdsRef.current.add(file.id);
            }
            workerRef.current?.postMessage({ type: 'FINALIZE_STREAM' });
        } catch (e) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сети' }));
        }
    }, [okbData, processingState.isProcessing, normalize]);

    // --- ОБРАБОТКА ФАЙЛА (ЛОКАЛЬНО) ---
    const handleStartLocalProcessing = useCallback(async (file: File) => {
        if (processingState.isProcessing) return;
        setActiveModule('adapta');
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 0, message: 'Чтение файла...', fileName: file.name, startTime: Date.now() }));
        
        setAllData([]); setUnidentifiedRows([]); totalRowsProcessedRef.current = 0;
        
        let cacheData: CoordsCache = {};
        try { const response = await fetch(`/api/get-full-cache?t=${Date.now()}`); if (response.ok) cacheData = await response.json(); } catch (error) {}
        
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === 'progress') { 
                setProcessingState(prev => ({ ...prev, progress: msg.payload.percentage, message: msg.payload.message, totalRowsProcessed: msg.payload.totalProcessed ?? prev.totalRowsProcessed }));
            }
            else if (msg.type === 'result_init') setOkbRegionCounts(msg.payload.okbRegionCounts);
            else if (msg.type === 'result_chunk_aggregated') {
                const { data: chunkData, totalProcessed } = msg.payload;
                const validated = normalize(chunkData);
                setAllData(validated);
                setProcessingState(prev => ({ ...prev, totalRowsProcessed: totalProcessed }));
            }
            else if (msg.type === 'result_finished') {
                const payload = msg.payload as WorkerResultPayload;
                const validated = normalize(payload.aggregatedData);
                setOkbRegionCounts(payload.okbRegionCounts);
                setAllData(validated);
                setUnidentifiedRows(payload.unidentifiedRows);
                setDbStatus('ready');
                const finalVersion = `local_${Date.now()}`;
                await saveAnalyticsState({
                    allData: validated,
                    unidentifiedRows: payload.unidentifiedRows,
                    okbRegionCounts: payload.okbRegionCounts,
                    totalRowsProcessed: payload.totalRowsProcessed,
                    versionHash: finalVersion,
                    okbData: [], okbStatus: null
                });
                
                saveSnapshotToCloud(validated, payload.unidentifiedRows).catch(console.error);
                setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100, message: 'Готово', totalRowsProcessed: payload.totalRowsProcessed }));
                setActiveModule('amp');
            }
        };
        workerRef.current.postMessage({ type: 'INIT_STREAM', payload: { okbData, cacheData, totalRowsProcessed: 0 } });
        try { const buffer = await file.arrayBuffer(); workerRef.current.postMessage({ type: 'PROCESS_FILE', payload: { fileBuffer: buffer, fileName: file.name } }, [buffer]); } catch (e) { setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка чтения' })); }
    }, [processingState.isProcessing, okbData, normalize]);

    // --- ИНИЦИАЛИЗАЦИЯ ---
    useEffect(() => {
        const init = async () => {
            setDbStatus('loading');
            const local = await loadAnalyticsState();
            if (local?.allData?.length > 0) {
                const validatedLocal = normalize(local.allData);
                setAllData(validatedLocal);
                setUnidentifiedRows(local.unidentifiedRows || []);
                setOkbRegionCounts(local.okbRegionCounts || {});
                setDbStatus('ready');
            }
            const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
            if (metaRes.ok) {
                const serverMeta = await metaRes.json();
                if (serverMeta?.versionHash && serverMeta.versionHash !== local?.versionHash) {
                    await handleDownloadSnapshot(serverMeta.chunkCount, serverMeta.versionHash);
                    setDbStatus('ready');
                }
            }
        };
        init();
    }, [handleDownloadSnapshot, normalize]);

    // --- DATA UPDATE HANDLER (For Edit Modal) ---
    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        let newData = [...allDataRef.current]; 
        let newUnidentified = [...unidentifiedRowsRef.current];
        
        // Сценарий 1: Перенос из неопознанных в опознанные
        if (typeof originalIndex === 'number') {
            const rowIndex = newUnidentified.findIndex(r => r.originalIndex === originalIndex);
            if (rowIndex !== -1) {
                newUnidentified.splice(rowIndex, 1);
            }
            const groupKey = `${newPoint.region}-${newPoint.rm}-${newPoint.brand}-${newPoint.packaging}`.toLowerCase();
            const existingGroupIndex = newData.findIndex(g => g.key === groupKey);

            if (existingGroupIndex !== -1) {
                newData[existingGroupIndex] = {
                    ...newData[existingGroupIndex],
                    fact: newData[existingGroupIndex].fact + (newPoint.fact || 0),
                    clients: [...newData[existingGroupIndex].clients, newPoint]
                };
            } else {
                newData.push({
                    key: groupKey,
                    rm: newPoint.rm,
                    region: newPoint.region,
                    city: newPoint.city,
                    brand: newPoint.brand,
                    packaging: newPoint.packaging,
                    clientName: `${newPoint.region}: ${newPoint.brand}`,
                    fact: newPoint.fact || 0,
                    potential: (newPoint.fact || 0) * 1.15, 
                    growthPotential: 0,
                    growthPercentage: 0,
                    clients: [newPoint]
                });
            }
        } 
        // Сценарий 2: Редактирование существующей точки
        else {
            newData = newData.map(group => {
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                if (clientIndex !== -1) {
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = newPoint;
                    return { ...group, clients: updatedClients };
                }
                return group;
            });
        }

        setAllData(newData);
        setUnidentifiedRows(newUnidentified);
        
        saveSnapshotToCloud(newData, newUnidentified).catch(err => {
            console.error("Background sync failed:", err);
            addNotification('Сбой фоновой синхронизации', 'error');
        });
    }, [okbRegionCounts]); 

    // --- 1. FILTERED DATA CALCULATION ---
    const filtered = useMemo(() => {
        let processedData = allData;
        if (filterStartDate || filterEndDate) {
            processedData = allData.map(row => {
                if (!row.monthlyFact || Object.keys(row.monthlyFact).length === 0) return row; 
                
                let newRowFact = 0;
                Object.entries(row.monthlyFact).forEach(([dateKey, val]) => {
                    if (dateKey === 'unknown') return; 
                    if (filterStartDate && dateKey < filterStartDate) return;
                    if (filterEndDate && dateKey > filterEndDate) return;
                    newRowFact += val;
                });

                const activeClients = row.clients.map(client => {
                    if (!client.monthlyFact || Object.keys(client.monthlyFact).length === 0) return client; 
                    
                    let clientSum = 0;
                    Object.entries(client.monthlyFact).forEach(([d, v]) => {
                        if (d === 'unknown') return;
                        if (filterStartDate && d < filterStartDate) return;
                        if (filterEndDate && d > filterEndDate) return;
                        clientSum += v;
                    });
                    
                    return { ...client, fact: clientSum };
                }).filter(c => (c.fact || 0) > 0);

                return { ...row, fact: newRowFact, clients: activeClients };
            }).filter(r => r.fact > 0); 
        }
        const smart = enrichDataWithSmartPlan(processedData, okbRegionCounts, 15, new Set());
        return applyFilters(smart, filters);
    }, [allData, filters, okbRegionCounts, filterStartDate, filterEndDate]);

    // --- 2. ACTIVE CLIENTS ---
    const allActiveClients = useMemo(() => {
        const clientsMap = new Map<string, MapPoint>();
        filtered.forEach(row => {
            if (row && Array.isArray(row.clients)) {
                row.clients.forEach(c => { if (c && c.key) clientsMap.set(c.key, c); });
            }
        });
        return Array.from(clientsMap.values());
    }, [filtered]);

    // --- 3. POTENTIAL CLIENTS ---
    const mapPotentialClients = useMemo(() => {
        if (!okbData || okbData.length === 0) return [];
        
        const coordsOnly = okbData.filter(r => {
            const lat = r.lat;
            const lon = r.lon;
            return lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon)) && Number(lat) !== 0;
        });

        if (filters.region.length === 0) return coordsOnly;
        
        return coordsOnly.filter(row => {
            const rawRegion = findValueInRow(row, ['регион', 'субъект', 'область']);
            if (!rawRegion) return false;
            
            return filters.region.some(selectedReg => 
                rawRegion.toLowerCase().includes(selectedReg.toLowerCase()) || 
                selectedReg.toLowerCase().includes(rawRegion.toLowerCase())
            );
        });
    }, [okbData, filters.region]);

    const filterOptions = useMemo(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => calculateSummaryMetrics(filtered), [filtered]);

    return (
        <div className="flex min-h-screen bg-primary-dark font-sans text-text-main overflow-hidden">
            <Navigation activeTab={activeModule} onTabChange={setActiveModule} />
            
            <main className="flex-1 ml-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar relative">
                <div className="sticky top-0 z-30 bg-primary-dark/95 backdrop-blur-md border-b border-gray-800 px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${dbStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Local DB</span>
                            </div>
                            <span className="text-xs font-bold text-white">{dbStatus === 'ready' ? 'Ready' : 'Syncing...'}</span>
                        </div>
                        {processingState.isProcessing && (
                            <div className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-bold text-indigo-300 animate-pulse">
                                {processingState.message} {Math.round(processingState.progress)}%
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-500 uppercase font-bold">Активных ТТ</span>
                            <span className="text-emerald-400 font-mono font-bold text-base">{allActiveClients.length.toLocaleString()}</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white">L</div>
                    </div>
                </div>

                <div className="py-8 px-4 lg:px-8">
                    {activeModule === 'adapta' && (
                        <Adapta 
                            processingState={processingState}
                            onStartProcessing={handleStartLocalProcessing}
                            onStartCloudProcessing={handleStartCloudProcessing}
                            onFileProcessed={() => {}}
                            onProcessingStateChange={() => {}}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            onOkbStatusChange={setOkbStatus}
                            onOkbDataChange={setOkbData}
                            disabled={processingState.isProcessing}
                            unidentifiedCount={unidentifiedRows.length}
                            activeClientsCount={allActiveClients.length}
                            uploadedData={filtered} 
                            dbStatus={dbStatus}
                            onStartEdit={setEditingClient}
                            startDate={filterStartDate} 
                            endDate={filterEndDate}     
                            onStartDateChange={setFilterStartDate} 
                            onEndDateChange={setFilterEndDate}     
                        />
                    )}

                    {activeModule === 'amp' && (
                        <div className="space-y-6">
                            <InteractiveRegionMap data={filtered} activeClients={allActiveClients} potentialClients={mapPotentialClients} onEditClient={setEditingClient} selectedRegions={filters.region} flyToClientKey={null} />
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-1">
                                    <Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({rm:'', brand:[], packaging:[], region:[]})} disabled={allData.length === 0} />
                                </div>
                                <div className="lg:col-span-3"><PotentialChart data={filtered} /></div>
                            </div>
                            <ResultsTable data={filtered} onRowClick={setSelectedDetailsRow} unidentifiedRowsCount={unidentifiedRows.length} onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} disabled={allData.length === 0} />
                        </div>
                    )}

                    {activeModule === 'dashboard' && (
                        <RMDashboard isOpen={true} onClose={() => setActiveModule('amp')} data={filtered} metrics={summaryMetrics} okbRegionCounts={okbRegionCounts} mode="page" okbData={okbData} okbStatus={okbStatus} />
                    )}

                    {activeModule === 'prophet' && <Prophet data={filtered} />}
                    {activeModule === 'agile' && <AgileLearning data={filtered} />}
                    {activeModule === 'roi-genome' && <RoiGenome data={filtered} />}
                </div>
            </main>

            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">
                {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
            </div>

            <Suspense fallback={null}>
                {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={setEditingClient} />}
                {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={setEditingClient} />}
            </Suspense>
            
            {editingClient && (
                <AddressEditModal isOpen={!!editingClient} onClose={() => setEditingClient(null)} onBack={() => setEditingClient(null)} data={editingClient} onDataUpdate={handleDataUpdate} onStartPolling={() => {}} onDelete={() => {}} globalTheme="dark" />
            )}
        </div>
    );
};

export default App;
