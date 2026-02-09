
// ... existing imports ...
import { useState, useRef, useCallback, useEffect } from 'react';
import { AggregatedDataRow, UnidentifiedRow, FileProcessingState, DeltaItem, CoordsCache, OkbStatus, OkbDataRow, WorkerMessage } from '../types';
import { saveAnalyticsState, loadAnalyticsState } from '../utils/db';
import { enrichWithAbcCategories } from '../utils/analytics';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

const MAX_CHUNK_SIZE_BYTES = 850 * 1024;

const normalize = (rows: any[]): AggregatedDataRow[] => {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({
        ...row,
        clients: Array.isArray(row.clients) ? row.clients : [],
        fact: typeof row.fact === 'number' ? row.fact : 0,
        potential: typeof row.potential === 'number' ? row.potential : 0,
        growthPotential: typeof row.growthPotential === 'number' ? row.growthPotential : 0,
        growthPercentage: typeof row.growthPercentage === 'number' ? row.growthPercentage : 0,
    }));
};

export const useDataSync = (addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void) => {
    // ... existing state ...
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [isCloudSaving, setIsCloudSaving] = useState(false);
    const [processingState, setProcessingState] = useState({
        isProcessing: false, progress: 0, message: 'Система готова', fileName: null, backgroundMessage: null, startTime: null, totalRowsProcessed: 0
    });
    
    const [okbRegionCounts, setOkbRegionCounts] = useState<{[key: string]: number}>({});
    const totalRowsProcessedRef = useRef(0);
    const lastSavedChunksRef = useRef<Map<number, string>>(new Map());
    const manualUpdateTimestamps = useRef<Map<string, number>>(new Map());

    // ... saveDeltaToCloud ...
    const saveDeltaToCloud = async (delta: DeltaItem) => {
        setIsCloudSaving(true);
        console.info(`☁️ [Cloud] Saving Delta (${delta.type}):`, delta.key);
        try {
            await fetch('/api/get-full-cache?action=save-delta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(delta) });
            console.log("✅ [Cloud] Delta saved successfully");
        } catch (e) { console.error("❌ [Cloud] Failed to save delta:", e); addNotification('Ошибка сохранения изменений в облако', 'warning'); } 
        finally { setIsCloudSaving(false); }
    };

    // ... applyDeltasToData ...
    const applyDeltasToData = useCallback((rows: AggregatedDataRow[], deltas: DeltaItem[]) => {
        if (!deltas || deltas.length === 0) return rows;
        console.info(`🔄 [Sync] Applying ${deltas.length} deltas/savepoints...`);
        const changesByKey = new Map<string, DeltaItem>();
        const sortedDeltas = [...deltas].sort((a, b) => a.timestamp - b.timestamp);
        sortedDeltas.forEach(currentDelta => {
            const existingChange = changesByKey.get(currentDelta.key);
            if (existingChange && existingChange.type !== 'delete') {
                const mergedPayload = { ...existingChange.payload, ...currentDelta.payload };
                const finalType = currentDelta.type === 'delete' ? 'delete' : 'update';
                changesByKey.set(currentDelta.key, { ...currentDelta, type: finalType, payload: finalType === 'delete' ? undefined : mergedPayload });
            } else {
                changesByKey.set(currentDelta.key, currentDelta);
            }
        });
        const changesByAddress = new Map<string, DeltaItem>();
        changesByKey.forEach(delta => {
            const baseKeyAddr = delta.key.includes('#') ? delta.key.split('#')[0] : delta.key;
            const normKeyAddr = normalizeAddress(baseKeyAddr);
            if (normKeyAddr) changesByAddress.set(normKeyAddr, delta);
        });
        return rows.map(group => {
            let groupModified = false;
            const activeClients = group.clients.reduce((acc, client) => {
                const normClientAddr = normalizeAddress(client.address);
                let relevantDelta = changesByKey.get(client.key);
                if (!relevantDelta && normClientAddr.length > 8) relevantDelta = changesByAddress.get(normClientAddr);
                if (!relevantDelta) { acc.push(client); return acc; }
                if (relevantDelta.type === 'delete') { groupModified = true; return acc; }
                if (relevantDelta.type === 'update' && relevantDelta.payload) {
                    groupModified = true;
                    const payload = relevantDelta.payload;
                    const isAddressChanged = payload.address && (normalizeAddress(payload.address) !== normalizeAddress(client.address));
                    const hasNewCoords = payload.lat !== undefined && payload.lon !== undefined;
                    const mergedClient = { ...client, ...payload, status: (payload.lat && payload.lon) ? 'match' : client.status };
                    if (isAddressChanged && !hasNewCoords) { mergedClient.lat = undefined; mergedClient.lon = undefined; }
                    acc.push(mergedClient);
                    return acc;
                }
                acc.push(client); return acc;
            }, [] as any[]);
            if (groupModified) {
                const newFact = activeClients.reduce((sum: number, c: any) => sum + (c.fact || 0), 0);
                return { ...group, clients: activeClients, fact: newFact, potential: newFact * 1.15 };
            }
            return group;
        }).filter(g => g.clients.length > 0);
    }, []);

    // ... applyCacheToData ...
    const applyCacheToData = useCallback((rows: AggregatedDataRow[], cache: CoordsCache) => {
        if (!cache) return rows;
        const updates = new Map<string, { lat?: number, lon?: number, isDeleted?: boolean }>();
        Object.values(cache).flat().forEach((item) => { if (item.address) { const norm = normalizeAddress(item.address); updates.set(norm, { lat: item.lat, lon: item.lon, isDeleted: item.isDeleted }); } });
        return rows.map(group => {
            let modified = false;
            const newClients = group.clients.reduce((acc, client) => {
                const normAddr = normalizeAddress(client.address);
                const update = updates.get(normAddr);
                if (update) {
                    if (update.isDeleted) { modified = true; return acc; }
                    if (typeof update.lat === 'number' && typeof update.lon === 'number' && update.lat !== 0) { if (client.lat !== update.lat || client.lon !== update.lon) { modified = true; acc.push({ ...client, lat: update.lat, lon: update.lon, status: 'match' }); return acc; } }
                }
                acc.push(client); return acc;
            }, [] as any[]);
            if (modified) {
                const newFact = newClients.reduce((s: number, c: any) => s + (c.fact || 0), 0);
                return { ...group, clients: newClients, fact: newFact, potential: newFact * 1.15 };
            }
            return group;
        }).filter(g => g.clients.length > 0);
    }, []);

    // ... saveSnapshotToCloud ...
    const saveSnapshotToCloud = async (currentData: AggregatedDataRow[], currentUnidentified: UnidentifiedRow[]) => {
        setIsCloudSaving(true);
        console.info('🧹 [Squash] Starting Snapshot Optimization...');
        try {
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            let availableSlots: { id: string, name: string }[] = [];
            if (listRes.ok) availableSlots = await listRes.json();
            const newVersionHash = `edit_${Date.now()}`;
            const encoder = new TextEncoder();
            const getByteSize = (str: string) => encoder.encode(str).length;
            const stickyChunksMap = new Map<number, AggregatedDataRow[]>();
            const unassignedRows: AggregatedDataRow[] = [];
            let maxChunkIndex = -1;
            currentData.forEach(row => {
                if (row._chunkIndex !== undefined && row._chunkIndex >= 0) {
                    if (!stickyChunksMap.has(row._chunkIndex)) stickyChunksMap.set(row._chunkIndex, []);
                    stickyChunksMap.get(row._chunkIndex)!.push(row);
                    maxChunkIndex = Math.max(maxChunkIndex, row._chunkIndex);
                } else { unassignedRows.push(row); }
            });
            const chunkIndices = Array.from(stickyChunksMap.keys()).sort((a, b) => a - b);
            chunkIndices.forEach(idx => {
                const rows = stickyChunksMap.get(idx)!;
                const validRows: AggregatedDataRow[] = [];
                let currentChunkSize = 100;
                rows.forEach(row => {
                    const rowStr = JSON.stringify(row);
                    const rowSize = getByteSize(rowStr) + 2;
                    if (currentChunkSize + rowSize > MAX_CHUNK_SIZE_BYTES) { row._chunkIndex = undefined; unassignedRows.push(row); } 
                    else { currentChunkSize += rowSize; validRows.push(row); }
                });
                stickyChunksMap.set(idx, validRows);
            });
            let currentPackIndex = maxChunkIndex + 1;
            let currentChunkRows: AggregatedDataRow[] = [];
            let currentNewChunkSize = 100;
            if (unassignedRows.length > 0) {
                for (const row of unassignedRows) {
                    row._chunkIndex = currentPackIndex;
                    const rowStr = JSON.stringify(row);
                    const rowSize = getByteSize(rowStr) + 2;
                    if (currentNewChunkSize + rowSize > MAX_CHUNK_SIZE_BYTES && currentChunkRows.length > 0) {
                        stickyChunksMap.set(currentPackIndex, currentChunkRows);
                        currentPackIndex++;
                        currentChunkRows = [];
                        currentNewChunkSize = 100;
                        row._chunkIndex = currentPackIndex;
                    }
                    currentChunkRows.push(row);
                    currentNewChunkSize += rowSize;
                }
                if (currentChunkRows.length > 0) stickyChunksMap.set(currentPackIndex, currentChunkRows);
            }
            const maxSlotIndex = Math.max(maxChunkIndex, availableSlots.length - 1, currentPackIndex);
            const chunksToUpload: { index: number; content: string; targetFileId: string }[] = [];
            for (let i = 0; i <= maxSlotIndex; i++) {
                const rows = stickyChunksMap.get(i) || [];
                if (rows.length === 0 && i >= availableSlots.length && i > currentPackIndex) continue;
                const chunkObj = { chunkIndex: i, rows: rows };
                const content = JSON.stringify(chunkObj);
                const prevContent = lastSavedChunksRef.current.get(i);
                if (prevContent !== content) {
                    const targetFileId = availableSlots[i] ? availableSlots[i].id : '';
                    chunksToUpload.push({ index: i, content, targetFileId });
                }
            }
            if (chunksToUpload.length > 0) {
                console.log(`[Squash] Uploading ${chunksToUpload.length} updated chunks...`);
                const CONCURRENCY = 4;
                for (let i = 0; i < chunksToUpload.length; i += CONCURRENCY) {
                    const batch = chunksToUpload.slice(i, i + CONCURRENCY).map((item) => {
                        const queryParams = item.targetFileId ? `action=save-chunk&targetFileId=${item.targetFileId}` : `action=save-chunk&chunkIndex=${item.index}`;
                        return fetch(`/api/get-full-cache?${queryParams}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chunk: item.content }) }).then(async res => {
                            if (!res.ok) throw new Error(`Upload failed for chunk ${item.index}`);
                            lastSavedChunksRef.current.set(item.index, item.content);
                            console.log(`[Squash] Chunk ${item.index} saved.`);
                        });
                    });
                    await Promise.all(batch);
                }
            } else { console.log('[Squash] No chunks needed updates.'); }
            console.log('[Squash] Updating meta...');
            await fetch('/api/get-full-cache?action=save-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unidentifiedRows: currentUnidentified, okbRegionCounts: okbRegionCounts, totalRowsProcessed: totalRowsProcessedRef.current, versionHash: newVersionHash, chunkCount: lastSavedChunksRef.current.size, totalRows: totalRowsProcessedRef.current, timestamp: Date.now() }) });
            console.log('[Squash] Clearing old deltas...');
            await fetch('/api/get-full-cache?action=clear-deltas', { method: 'POST' });
            console.log("✅ [Squash] Complete. System optimized.");
            addNotification("База успешно оптимизирована (Squash)", "success");
        } catch (e) { console.error("❌ Save Snapshot Error:", e); addNotification('Ошибка сохранения снимка', 'error'); } finally { setIsCloudSaving(false); }
    };

    // --- handleDownloadSnapshot ---
    const handleDownloadSnapshot = useCallback(async (serverMeta: any, startDate?: string, endDate?: string) => {
        console.info('📦 [Sync] Starting Snapshot Download...', { startDate, endDate });
        console.time('Snapshot Load');
        
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация JSON...', progress: 0 }));
            
            console.log('1. [Sync] Requesting snapshot list...');
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error('Failed to fetch snapshot list');
            
            let fileList = await listRes.json();
            if (!Array.isArray(fileList)) fileList = [];

            console.info(`2. [Sync] Received ${fileList.length} files to download.`);

            fileList.sort((a: any, b: any) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                const numA = parseInt(nameA.match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt(nameB.match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });

            const total = fileList.length;
            let accumulatedRows: AggregatedDataRow[] = [];
            let loadedMeta: any = serverMeta || null;
            
            lastSavedChunksRef.current.clear();

            // --- WORKER SETUP ---
            const worker = new Worker(new URL('../services/processing.worker.ts', import.meta.url), { type: 'module' });
            
            await new Promise<void>((resolve, reject) => {
                worker.onmessage = (e) => {
                    const msg = e.data as WorkerMessage;
                    
                    if (msg.type === 'progress') {
                        setProcessingState(prev => ({ 
                            ...prev, 
                            progress: msg.payload.percentage,
                            message: msg.payload.message,
                            totalRowsProcessed: msg.payload.totalProcessed
                        }));
                    } else if (msg.type === 'result_init') {
                        setOkbRegionCounts(msg.payload.okbRegionCounts);
                    } else if (msg.type === 'result_chunk_aggregated') {
                        // Incremental update
                    } else if (msg.type === 'result_finished') {
                        accumulatedRows = msg.payload.aggregatedData;
                        setUnidentifiedRows(msg.payload.unidentifiedRows);
                        setOkbRegionCounts(msg.payload.okbRegionCounts);
                        totalRowsProcessedRef.current = msg.payload.totalRowsProcessed;
                        resolve();
                    } else if (msg.type === 'error') {
                        reject(new Error(msg.payload));
                    }
                };

                worker.postMessage({
                    type: 'INIT_STREAM',
                    payload: { okbData: [], cacheData: {}, startDate, endDate }
                });

                const CONCURRENCY = 6;
                const queue = fileList.map((file: any, index: number) => ({ file, index }));
                
                const downloadWorker = async () => {
                    while (queue.length > 0) {
                        const item = queue.shift();
                        if (!item) break;
                        
                        try {
                            const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${item.file.id}`);
                            const text = await res.text();
                            
                            if (text && text.trim().length > 0) {
                                lastSavedChunksRef.current.set(item.index, text);
                                const chunkData = JSON.parse(text);
                                
                                let newRows = [];
                                if (Array.isArray(chunkData.rows)) newRows = chunkData.rows;
                                else if (Array.isArray(chunkData.aggregatedData)) newRows = chunkData.aggregatedData;
                                
                                // DETECT IF THIS IS A SNAPSHOT (OBJECTS) OR RAW FILE (ARRAYS)
                                const isSnapshotObject = newRows.length > 0 && !Array.isArray(newRows[0]);

                                if (newRows.length > 0) {
                                    console.log(`Processing chunk ${item.file.name}: ${newRows.length} rows (${isSnapshotObject ? 'Snapshot' : 'Raw'})`);
                                    if (isSnapshotObject) {
                                        worker.postMessage({
                                            type: 'RESTORE_CHUNK',
                                            payload: { chunkData: newRows }
                                        });
                                    } else {
                                        worker.postMessage({
                                            type: 'PROCESS_CHUNK',
                                            payload: {
                                                rawData: newRows,
                                                isFirstChunk: item.index === 0
                                            }
                                        });
                                    }
                                } else {
                                    console.warn(`Empty chunk skipped: ${item.file.name}`);
                                }

                                if (chunkData.meta && !loadedMeta) loadedMeta = chunkData.meta;
                            }
                        } catch (chunkError) {
                            console.error(`❌ [Snapshot] Error processing chunk ${item.file.name}:`, chunkError);
                        }
                    }
                };

                Promise.all(Array.from({ length: CONCURRENCY }, downloadWorker))
                    .then(() => worker.postMessage({ type: 'FINALIZE_STREAM' }))
                    .catch(reject);
            });
            
            worker.terminate();

            if (loadedMeta || accumulatedRows.length > 0 || total > 0) {
                console.info(`4. [Sync] Processing complete. Total rows in range: ${accumulatedRows.length}`);
                setProcessingState(prev => ({ ...prev, message: 'Синхронизация дельт и кэша...' }));
                
                let finalData = accumulatedRows;

                try {
                    console.log('5. [Sync] Fetching savepoint deltas...');
                    const deltasRes = await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`);
                    if (deltasRes.ok) {
                        const deltas = await deltasRes.json();
                        if (Array.isArray(deltas) && deltas.length > 0) {
                            console.info(`   [Sync] Applying ${deltas.length} deltas...`);
                            finalData = applyDeltasToData(finalData, deltas);
                        } else { console.log('   [Sync] No deltas found.'); }
                    }
                } catch (e) { console.error("Failed to fetch/apply deltas:", e); }

                enrichWithAbcCategories(finalData);
                setAllData(finalData);
                
                const safeMeta = loadedMeta || {};
                const versionHash = serverMeta?.versionHash || 'unknown';

                await saveAnalyticsState({
                    allData: finalData,
                    unidentifiedRows: safeMeta.unidentifiedRows || [], 
                    okbRegionCounts: safeMeta.okbRegionCounts || {},
                    totalRowsProcessed: totalRowsProcessedRef.current,
                    versionHash: versionHash,
                    okbData: [], okbStatus: null
                });
                
                localStorage.setItem('last_snapshot_version', versionHash);
                setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Готово', progress: 100 }));
                console.timeEnd('Snapshot Load');
                console.info('✅ [Sync] Process completed successfully.');
                return true;
            }
            return false;
        } catch (e) { 
            console.error("❌ Snapshot critical error:", e); 
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сети' }));
            return false;
        }
    }, [addNotification, applyDeltasToData]);

    return {
        allData, setAllData,
        unidentifiedRows, setUnidentifiedRows,
        okbRegionCounts, setOkbRegionCounts,
        isCloudSaving, setIsCloudSaving, 
        processingState, setProcessingState,
        totalRowsProcessedRef,
        manualUpdateTimestamps,
        saveDeltaToCloud,
        saveSnapshotToCloud,
        applyDeltasToData,
        applyCacheToData,
        handleDownloadSnapshot,
    };
};
