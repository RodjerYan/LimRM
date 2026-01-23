
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
    WorkerMessage, WorkerResultPayload, CoordsCache, OkbStatus
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findValueInRow, normalizeAddress } from './utils/dataUtils';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { saveAnalyticsState, loadAnalyticsState } from './utils/db';

const DetailsModal = React.lazy(() => import('./components/DetailsModal'));
const UnidentifiedRowsModal = React.lazy(() => import('./components/UnidentifiedRowsModal'));

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== '';

// Максимальный размер JSON-файла в байтах (850 КБ)
const MAX_CHUNK_SIZE_BYTES = 850 * 1024; 

// Интервал авто-обновления (в миллисекундах)
const POLLING_INTERVAL_MS = 15000;

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
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const manualUpdateTimestamps = useRef<Map<string, number>>(new Map());
    const workerRef = useRef<Worker | null>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSavingRef = useRef(false); // Lock for save operation
    
    // SMART SAVE: Cache for the content of the last saved/loaded chunks
    // Key: Chunk Index, Value: Stringified JSON content
    const lastSavedChunksRef = useRef<Map<number, string>>(new Map());

    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null);

    // Sync refs
    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    // Cleanup worker
    useEffect(() => {
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // --- LIVE SYNC POLLING ---
    useEffect(() => {
        const syncData = async () => {
            // Only sync if we have data loaded
            if (allDataRef.current.length === 0 && unidentifiedRowsRef.current.length === 0) return;
            if (processingState.isProcessing) return; // Don't sync while heavy processing

            try {
                // 1. Fetch latest cache from server
                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                if (!res.ok) return;
                const cacheData: CoordsCache = await res.json();

                // 2. Flatten cache for O(1) lookup
                const cacheMap = new Map<string, { lat: number; lon: number; comment?: string }>();
                Object.values(cacheData).flat().forEach((item: any) => {
                    if (item.address && !item.isDeleted && item.lat && item.lon) {
                        cacheMap.set(normalizeAddress(item.address), { lat: item.lat, lon: item.lon, comment: item.comment });
                    }
                });

                let hasChanges = false;

                // 3. Update All Data (Active Clients)
                const newAllData = allDataRef.current.map(row => {
                    let rowChanged = false;
                    const newClients = row.clients.map(client => {
                        const normAddr = normalizeAddress(client.address);
                        
                        // RACE CONDITION FIX: Ignore cache if user updated this client recently (< 2 mins)
                        const lastManualUpdate = manualUpdateTimestamps.current.get(normAddr);
                        if (lastManualUpdate && (Date.now() - lastManualUpdate < 120000)) {
                            return client;
                        }

                        const cached = cacheMap.get(normAddr);
                        
                        // Check if we have new data that is different from current
                        if (cached) {
                            const latDiff = Math.abs((client.lat || 0) - cached.lat);
                            const lonDiff = Math.abs((client.lon || 0) - cached.lon);
                            const commentDiff = (client.comment || '') !== (cached.comment || '');
                            
                            // If significant change (> 0.0001 deg or comment changed)
                            if (latDiff > 0.0001 || lonDiff > 0.0001 || commentDiff) {
                                rowChanged = true;
                                hasChanges = true;
                                return { ...client, lat: cached.lat, lon: cached.lon, comment: cached.comment, isGeocoding: false, status: 'match' as const };
                            }
                        }
                        return client;
                    });
                    
                    if (rowChanged) return { ...row, clients: newClients };
                    return row;
                });

                if (hasChanges) {
                    setAllData(newAllData);
                }

            } catch (e) {
                console.error("Auto-sync failed", e);
            }
        };

        const intervalId = setInterval(syncData, POLLING_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [processingState.isProcessing]);


    // --- БЕЗОПАСНАЯ НОРМАЛИЗАЦИЯ ---
    const normalize = useCallback((rows: any[]): AggregatedDataRow[] => {
        if (!Array.isArray(rows)) return [];
        const result: AggregatedDataRow[] = [];
        
        const safeFloat = (v: any) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') {
                const f = parseFloat(v.replace(',', '.'));
                return isNaN(f) ? undefined : f;
            }
            return undefined;
        };
        
        const isValidCoord = (n: any) => typeof n === 'number' && !isNaN(n) && n !== 0;

        rows.forEach((row, index) => {
            if (!row) return;
            const brandRaw = String(row.brand || '').trim();
            const hasMultipleBrands = brandRaw.length > 2 && /[,;|\r\n]/.test(brandRaw);

            const generateStableKey = (base: any, suffix: string | number) => {
                const baseStr = base.key || base.address || `idx_${index}`;
                return `${baseStr}_${suffix}`.replace(/\s+/g, '_');
            };

            const normalizeClient = (c: any, cIdx: number) => {
                const clientObj = { ...c };
                const original = c.originalRow || {}; 

                // 1. Explicitly map 'lng' to 'lon' if present (Fix for snapshot JSON format)
                if (c.lng !== undefined) {
                    clientObj.lon = safeFloat(c.lng);
                }
                // Also ensure 'lat' is picked up directly
                if (c.lat !== undefined) {
                    clientObj.lat = safeFloat(c.lat);
                }

                // 2. Fallback checks if still invalid
                if (!isValidCoord(clientObj.lat)) {
                    clientObj.lat = safeFloat(c.latitude) || safeFloat(c.geo_lat) || safeFloat(c.y) || safeFloat(c.Lat) ||
                                    safeFloat(original.lat) || safeFloat(original.latitude) || safeFloat(original.geo_lat) || safeFloat(original.y);
                }
                if (!isValidCoord(clientObj.lon)) {
                    clientObj.lon = safeFloat(c.longitude) || safeFloat(c.geo_lon) || safeFloat(c.x) || safeFloat(c.Lng) || safeFloat(c.Lon) ||
                                    safeFloat(original.lon) || safeFloat(original.lng) || safeFloat(original.longitude) || safeFloat(original.geo_lon) || safeFloat(original.x);
                }
                
                if (!clientObj.key) {
                    clientObj.key = generateStableKey(row, `cli_${cIdx}`);
                }
                return clientObj;
            };

            if (hasMultipleBrands) {
                const parts = brandRaw.split(/[,;|\r\n]+/).map(b => b.trim()).filter(b => b.length > 0);
                if (parts.length > 1) {
                    const splitFactor = 1 / parts.length;
                    parts.forEach((brandPart, idx) => {
                        result.push({
                            ...row,
                            key: generateStableKey(row, `spl_${idx}`),
                            brand: brandPart,
                            clientName: `${row.region}: ${brandPart}`,
                            fact: (row.fact || 0) * splitFactor,
                            potential: (row.potential || 0) * splitFactor,
                            growthPotential: (row.growthPotential || 0) * splitFactor,
                            clients: Array.isArray(row.clients) ? row.clients.map(normalizeClient) : []
                        });
                    });
                    return;
                }
            }
            
            // Handle rows without 'clients' array (flat structure from snapshot)
            // If row.clients is missing, treat the row itself as the client source
            let clientSource = row.clients;
            if (!Array.isArray(clientSource) || clientSource.length === 0) {
                 clientSource = [row];
            }

            const normalizedClients = clientSource.map(normalizeClient);

            result.push({
                ...row,
                key: row.key || generateStableKey(row, 'm'),
                clients: normalizedClients
            });
        });
        return result;
    }, []);

    // --- СОХРАНЕНИЕ В ОБЛАКО (С ЧАНКАМИ И DIFF-ПРОВЕРКОЙ) ---
    const saveSnapshotToCloud = async (currentData: AggregatedDataRow[], currentUnidentified: UnidentifiedRow[]) => {
        if (isSavingRef.current) {
            console.warn("Save already in progress, skipping.");
            return;
        }
        isSavingRef.current = true;

        try {
            console.log('Начало умного сохранения...');
            
            // 1. Get file slots first
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            let availableSlots: { id: string, name: string }[] = [];
            if (listRes.ok) {
                availableSlots = await listRes.json();
            }

            const encoder = new TextEncoder();
            const getByteSize = (str: string) => encoder.encode(str).length;
            
            // 2. Generate chunks locally
            const chunks: string[] = [];
            let currentChunkObj: any = {
                chunkIndex: 0,
                // CRITICAL FIX: Removed volatile 'versionHash' from individual chunks to allow meaningful diffing.
                // The main version is tracked in the Meta file.
                rows: [],
            };
            
            let currentSize = getByteSize(JSON.stringify(currentChunkObj));
            
            for (const row of currentData) {
                const rowStr = JSON.stringify(row);
                const rowSize = getByteSize(rowStr) + 2; 
                
                if (currentSize + rowSize > MAX_CHUNK_SIZE_BYTES) {
                    chunks.push(JSON.stringify(currentChunkObj)); 
                    currentChunkObj = {
                        chunkIndex: chunks.length,
                        rows: []
                    };
                    currentSize = getByteSize(JSON.stringify(currentChunkObj));
                }
                currentChunkObj.rows.push(row);
                currentSize += rowSize;
            }
            chunks.push(JSON.stringify(currentChunkObj));
            
            // 3. Diffing Strategy: Identify ONLY changed chunks
            const chunksToUpload: { index: number; content: string; targetFileId: string }[] = [];
            
            chunks.forEach((chunkContent, idx) => {
                const prevContent = lastSavedChunksRef.current.get(idx);
                // String comparison now works because 'versionHash' is gone
                if (prevContent !== chunkContent) {
                    // Map to existing file ID if available (by index)
                    // The backend list is sorted, so index 0 = file 1, index 1 = file 2...
                    // NOTE: backend `get-snapshot-list` returns chunk files in order.
                    const targetFileId = availableSlots[idx] ? availableSlots[idx].id : '';
                    
                    chunksToUpload.push({ 
                        index: idx, 
                        content: chunkContent, 
                        targetFileId 
                    });
                }
            });

            if (chunksToUpload.length === 0) {
                console.log("No data chunks changed. Skipping large upload.");
            } else {
                console.log(`Changes detected. Uploading ${chunksToUpload.length} chunk(s)...`);
                
                // Concurrency Control
                const CONCURRENCY = 4;
                for (let i = 0; i < chunksToUpload.length; i += CONCURRENCY) {
                    const batch = chunksToUpload.slice(i, i + CONCURRENCY).map((item) => {
                        const queryParams = item.targetFileId 
                            ? `action=save-chunk&targetFileId=${item.targetFileId}` 
                            : `action=save-chunk&chunkIndex=${item.index}`; // Fallback for creation

                        return fetch(`/api/get-full-cache?${queryParams}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chunk: item.content }) 
                        }).then(async res => {
                            if (!res.ok) {
                                const txt = await res.text();
                                throw new Error(`Upload failed for chunk ${item.index}: ${txt}`);
                            }
                            // Update cache ONLY on success
                            lastSavedChunksRef.current.set(item.index, item.content);
                        });
                    });
                    
                    await Promise.all(batch);
                }
            }
            
            // 4. Always save Meta to update timestamp/versionHash
            // This is fast and tells other clients about the update
            const newVersionHash = `edit_${Date.now()}`;
            await fetch('/api/get-full-cache?action=save-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidentifiedRows: currentUnidentified,
                    okbRegionCounts: okbRegionCounts,
                    totalRowsProcessed: totalRowsProcessedRef.current,
                    versionHash: newVersionHash,
                    chunkCount: chunks.length,
                    totalRows: totalRowsProcessedRef.current,
                    timestamp: Date.now()
                })
            });
            
            addNotification('Изменения сохранены', 'success');
        } catch (e) {
            console.error("Cloud Save Error:", e);
            addNotification('Ошибка сохранения в облако', 'warning');
        } finally {
            isSavingRef.current = false;
        }
    };

    // --- ЗАГРУЗКА СНИМКА (JSON) ---
    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация JSON...', progress: 0 }));
            
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error('Failed to fetch snapshot list');
            
            let fileList = await listRes.json();
            if (!Array.isArray(fileList) || fileList.length === 0) return false;

            fileList.sort((a: any, b: any) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                const numA = parseInt(nameA.match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt(nameB.match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });

            let loadedCount = 0;
            const total = fileList.length;
            let accumulatedRows: AggregatedDataRow[] = [];
            let loadedMeta: any = null;
            
            // Clear cache before fresh load
            lastSavedChunksRef.current.clear();

            for (let i = 0; i < total; i++) {
                const file = fileList[i];
                const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`);
                if (!res.ok) throw new Error(`Failed to load chunk ${file.id}`);
                const text = await res.text();

                // CACHE POPULATION & NORMALIZATION
                try {
                    const parsed = JSON.parse(text);
                    // We must strip 'versionHash' from loaded chunks if present to align with local save format.
                    // This ensures the FIRST save after load isn't a full upload.
                    if (parsed.versionHash) delete parsed.versionHash;
                    
                    // Store the normalized (stripped) version in cache
                    lastSavedChunksRef.current.set(i, JSON.stringify(parsed));
                    
                    let newRows: any[] = Array.isArray(parsed.rows) ? parsed.rows : (Array.isArray(parsed.aggregatedData) ? parsed.aggregatedData : []);
                    if (newRows.length > 0) {
                        accumulatedRows.push(...normalize(newRows));
                    }
                    if (parsed.meta) loadedMeta = parsed.meta;

                } catch (e) {
                    console.warn("Error parsing loaded chunk, skipping normalization", e);
                }
                
                loadedCount++;
                setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
            }

            if (accumulatedRows.length > 0 || loadedMeta) {
                setAllData(accumulatedRows);
                
                const safeMeta = loadedMeta || {};
                setUnidentifiedRows(safeMeta.unidentifiedRows || []);
                setOkbRegionCounts(safeMeta.okbRegionCounts || {});
                totalRowsProcessedRef.current = safeMeta.totalRowsProcessed || accumulatedRows.length;
                
                await saveAnalyticsState({
                    allData: accumulatedRows,
                    unidentifiedRows: safeMeta.unidentifiedRows || [],
                    okbRegionCounts: safeMeta.okbRegionCounts || {},
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
            console.error("Snapshot error:", e); 
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сети' }));
        }
        return false;
    }, [normalize, addNotification]);

    // --- ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ ---
    const handleForceUpdate = useCallback(async () => {
        if (processingState.isProcessing) return;
        
        setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 0, message: 'Проверка обновления...', startTime: Date.now() }));
        
        try {
            const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
            if (metaRes.ok) {
                const serverMeta = await metaRes.json();
                if (serverMeta?.versionHash) {
                    await handleDownloadSnapshot(serverMeta.chunkCount, serverMeta.versionHash);
                    setDbStatus('ready');
                } else {
                    setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Снимок не найден' }));
                }
            } else {
               throw new Error("Meta fetch failed");
            }
        } catch (e) {
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка соединения' }));
        }
    }, [processingState.isProcessing, handleDownloadSnapshot]);

    // --- INIT ---
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

    // --- DATA UPDATE HANDLER (DEBOUNCED) ---
    const handleDataUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        let newData = [...allDataRef.current]; 
        let newUnidentified = [...unidentifiedRowsRef.current];
        
        // RACE CONDITION PROTECTION: Mark this address as manually updated
        if (newPoint.address) {
            const normAddr = normalizeAddress(newPoint.address);
            manualUpdateTimestamps.current.set(normAddr, Date.now());
        }
        
        if (typeof originalIndex === 'number') {
            const rowIndex = newUnidentified.findIndex(r => r.originalIndex === originalIndex);
            if (rowIndex !== -1) newUnidentified.splice(rowIndex, 1);
            
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
                    key: groupKey, rm: newPoint.rm, region: newPoint.region, city: newPoint.city, brand: newPoint.brand, packaging: newPoint.packaging,
                    clientName: `${newPoint.region}: ${newPoint.brand}`, fact: newPoint.fact || 0,
                    potential: (newPoint.fact || 0) * 1.15, growthPotential: 0, growthPercentage: 0, clients: [newPoint]
                });
            }
        } else {
            let found = false;
            newData = newData.map(group => {
                // IMPORTANT: Search for the specific client by key
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                if (clientIndex !== -1) {
                    found = true;
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = newPoint;
                    return { ...group, clients: updatedClients };
                }
                return group;
            });
            
            if (!found) {
                console.warn(`Could not find client with key: ${oldKey} to update.`);
            }
        }

        setAllData(newData);
        setUnidentifiedRows(newUnidentified);
        
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveSnapshotToCloud(newData, newUnidentified).catch(err => {
                console.error("Auto-save failed:", err);
            });
        }, 2000);

    }, [okbRegionCounts]); 

    // --- FILTERED DATA ---
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

    // --- ACTIVE CLIENTS ---
    const allActiveClients = useMemo(() => {
        const clientsMap = new Map<string, MapPoint>();
        filtered.forEach(row => {
            if (row && Array.isArray(row.clients)) {
                row.clients.forEach(c => { if (c && c.key) clientsMap.set(c.key, c); });
            }
        });
        return Array.from(clientsMap.values());
    }, [filtered]);

    // --- POTENTIAL CLIENTS ---
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
                            onForceUpdate={handleForceUpdate}
                            onFileProcessed={() => {}}
                            onProcessingStateChange={() => {}}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            onOkbStatusChange={setOkbStatus}
                            onOkbDataChange={setOkbData}
                            disabled={processingState.isProcessing}
                            unidentifiedCount={unidentifiedRows.length}
                            onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)}
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
                            <ResultsTable 
                                data={filtered} 
                                onRowClick={setSelectedDetailsRow} 
                                unidentifiedRowsCount={unidentifiedRows.length} 
                                onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} 
                                disabled={allData.length === 0} 
                            />
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
