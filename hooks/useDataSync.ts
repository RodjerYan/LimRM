
import { useState, useRef, useCallback, useEffect } from 'react';
import { AggregatedDataRow, UnidentifiedRow, FileProcessingState, DeltaItem, CoordsCache, OkbStatus, OkbDataRow, WorkerMessage } from '../types';
import { saveAnalyticsState, loadAnalyticsState } from '../utils/db';
import { enrichWithAbcCategories } from '../utils/analytics';
import { normalizeAddress } from '../utils/dataUtils';

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
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [isCloudSaving, setIsCloudSaving] = useState(false);
    const [processingState, setProcessingState] = useState<FileProcessingState>({
        isProcessing: false, progress: 0, message: 'Система готова', fileName: null, backgroundMessage: null, startTime: null, totalRowsProcessed: 0
    });
    
    // Additional State needed for snapshots
    const [okbRegionCounts, setOkbRegionCounts] = useState<{[key: string]: number}>({});
    const totalRowsProcessedRef = useRef<number>(0);
    const lastSavedChunksRef = useRef<Map<number, string>>(new Map());
    const manualUpdateTimestamps = useRef<Map<string, number>>(new Map());

    // --- DELTA MANAGEMENT ---
    const saveDeltaToCloud = async (delta: DeltaItem) => {
        setIsCloudSaving(true);
        console.groupCollapsed('☁️ Saving Delta');
        console.log('Type:', delta.type);
        console.log('Payload:', delta);
        
        try {
            await fetch('/api/get-full-cache?action=save-delta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(delta)
            });
            console.log("✅ Delta saved successfully");
        } catch (e) {
            console.error("❌ Failed to save delta:", e);
            addNotification('Ошибка сохранения изменений в облако', 'warning');
        } finally {
            console.groupEnd();
            setIsCloudSaving(false);
        }
    };

    // --- APPLY CACHE & DELTAS HELPERS ---
    const applyCacheToData = useCallback((rows: AggregatedDataRow[], cacheData: CoordsCache) => {
        const cacheMap = new Map<string, { lat: number; lon: number; comment?: string }>();
        const deletedSet = new Set<string>();

        Object.values(cacheData).flat().forEach((item: any) => {
            const norm = normalizeAddress(item.address);
            if (item.isDeleted) {
                deletedSet.add(norm);
            } else if (item.address && item.lat && item.lon) {
                cacheMap.set(norm, { lat: item.lat, lon: item.lon, comment: item.comment });
            }
        });

        // 1. Filter deleted
        let cleanData = rows.map(group => {
            const activeClients = group.clients.filter(c => !deletedSet.has(normalizeAddress(c.address)));
            if (activeClients.length !== group.clients.length) {
                const newFact = activeClients.reduce((sum, c) => sum + (c.fact || 0), 0);
                return { ...group, clients: activeClients, fact: newFact, potential: newFact * 1.15 };
            }
            return group;
        }).filter(g => g.clients.length > 0);

        // 2. Apply coords
        cleanData = cleanData.map(group => {
            let modified = false;
            const updatedClients = group.clients.map(client => {
                const normAddr = normalizeAddress(client.address);
                if (manualUpdateTimestamps.current.get(normAddr) && (Date.now() - manualUpdateTimestamps.current.get(normAddr)! < 120000)) {
                    return client;
                }
                const cached = cacheMap.get(normAddr);
                if (cached) {
                    if (Math.abs((client.lat || 0) - cached.lat) > 0.0001 || Math.abs((client.lon || 0) - cached.lon) > 0.0001) {
                        modified = true;
                        return { ...client, lat: cached.lat, lon: cached.lon, comment: cached.comment, status: 'match' as const };
                    }
                }
                return client;
            });
            return modified ? { ...group, clients: updatedClients } : group;
        });

        return cleanData;
    }, []);

    const applyDeltasToData = useCallback((rows: AggregatedDataRow[], deltas: DeltaItem[]) => {
        if (!deltas || deltas.length === 0) return rows;

        // Sort deltas by timestamp to ensure chronological order
        const sortedDeltas = [...deltas].sort((a, b) => a.timestamp - b.timestamp);
        
        const updatesByKey = new Map<string, DeltaItem[]>();
        sortedDeltas.forEach(d => {
            if (!updatesByKey.has(d.key)) updatesByKey.set(d.key, []);
            updatesByKey.get(d.key)!.push(d);
        });

        return rows.map(group => {
            let groupModified = false;
            
            // 1. Handle Deletions
            let activeClients = group.clients.filter(client => {
                const clientDeltas = updatesByKey.get(client.key);
                if (!clientDeltas) return true;
                
                const lastOp = clientDeltas[clientDeltas.length - 1];
                if (lastOp.type === 'delete') {
                    groupModified = true;
                    return false;
                }
                return true;
            });

            // 2. Handle Updates
            activeClients = activeClients.map(client => {
                const normAddr = normalizeAddress(client.address);
                
                // Skip if locally modified recently (Optimistic UI preservation)
                if (manualUpdateTimestamps.current.get(normAddr) && (Date.now() - manualUpdateTimestamps.current.get(normAddr)! < 120000)) {
                    return client;
                }

                const clientDeltas = updatesByKey.get(client.key);
                if (!clientDeltas) return client;

                let updatedClient = { ...client };
                let clientModified = false;

                clientDeltas.forEach(d => {
                    if (d.type === 'update' && d.payload) {
                        updatedClient = { ...updatedClient, ...d.payload };
                        clientModified = true;
                    }
                });

                if (clientModified) {
                    groupModified = true;
                    return updatedClient;
                }
                return client;
            });

            if (groupModified) {
                const newFact = activeClients.reduce((sum, c) => sum + (c.fact || 0), 0);
                const newPotential = newFact * 1.15; // Simple recalculation
                
                return { 
                    ...group, 
                    clients: activeClients, 
                    fact: newFact, 
                    potential: newPotential 
                };
            }
            
            return group;
        }).filter(g => g.clients.length > 0);
    }, []);

    // --- FULL SAVE / SQUASH ---
    const saveSnapshotToCloud = async (currentData: AggregatedDataRow[], currentUnidentified: UnidentifiedRow[]) => {
        setIsCloudSaving(true);
        console.group('🧹 Snapshot Squash (Optimization)');
        
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
                } else {
                    unassignedRows.push(row);
                }
            });

            const chunkIndices = Array.from(stickyChunksMap.keys()).sort((a, b) => a - b);
            chunkIndices.forEach(idx => {
                const rows = stickyChunksMap.get(idx)!;
                const validRows: AggregatedDataRow[] = [];
                let currentChunkSize = 100;

                rows.forEach(row => {
                    const rowStr = JSON.stringify(row);
                    const rowSize = getByteSize(rowStr) + 2;
                    if (currentChunkSize + rowSize > MAX_CHUNK_SIZE_BYTES) {
                        row._chunkIndex = undefined;
                        unassignedRows.push(row);
                    } else {
                        currentChunkSize += rowSize;
                        validRows.push(row);
                    }
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
                        const queryParams = item.targetFileId 
                            ? `action=save-chunk&targetFileId=${item.targetFileId}` 
                            : `action=save-chunk&chunkIndex=${item.index}`;
                        return fetch(`/api/get-full-cache?${queryParams}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chunk: item.content }) 
                        }).then(async res => {
                            if (!res.ok) throw new Error(`Upload failed for chunk ${item.index}`);
                            lastSavedChunksRef.current.set(item.index, item.content);
                            console.log(`[Squash] Chunk ${item.index} saved.`);
                        });
                    });
                    await Promise.all(batch);
                }
            } else {
                console.log('[Squash] No chunks needed updates.');
            }

            console.log('[Squash] Updating meta...');
            await fetch('/api/get-full-cache?action=save-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidentifiedRows: currentUnidentified,
                    okbRegionCounts: okbRegionCounts,
                    totalRowsProcessed: totalRowsProcessedRef.current,
                    versionHash: newVersionHash,
                    chunkCount: lastSavedChunksRef.current.size,
                    totalRows: totalRowsProcessedRef.current,
                    timestamp: Date.now()
                })
            });

            console.log('[Squash] Clearing old deltas...');
            await fetch('/api/get-full-cache?action=clear-deltas', { method: 'POST' });
            
            console.log("✅ [Squash] Complete. System optimized.");
            addNotification("База успешно оптимизирована (Squash)", "success");

        } catch (e) {
            console.error("❌ Save Snapshot Error:", e);
            addNotification('Ошибка сохранения снимка', 'error');
        } finally {
            console.groupEnd();
            setIsCloudSaving(false);
        }
    };

    const handleDownloadSnapshot = useCallback(async (serverMeta: any) => {
        console.groupCollapsed('📦 Snapshot Download Process');
        console.time('Snapshot Total Load Time');
        
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация JSON...', progress: 0 }));
            
            console.log('1. Requesting snapshot list...');
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error('Failed to fetch snapshot list');
            
            let fileList = await listRes.json();
            if (!Array.isArray(fileList)) fileList = [];

            console.log(`2. Received ${fileList.length} files to download.`);

            fileList.sort((a: any, b: any) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                const numA = parseInt(nameA.match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt(nameB.match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });

            const total = fileList.length;
            let loadedCount = 0;
            let accumulatedRows: AggregatedDataRow[] = [];
            let loadedMeta: any = serverMeta || null;
            
            lastSavedChunksRef.current.clear();

            const CONCURRENCY = 6; 
            const queue = fileList.map((file: any, index: number) => ({ file, index }));
            
            const fetchWithRetry = async (url: string, retries = 3, delay = 1000) => {
                for (let i = 0; i < retries; i++) {
                    try {
                        const res = await fetch(url);
                        if (!res.ok) throw new Error(`Status ${res.status}`);
                        return res;
                    } catch (err) {
                        console.warn(`[Retry ${i+1}/${retries}] Failed to fetch ${url}`);
                        if (i === retries - 1) throw err;
                        await new Promise(res => setTimeout(res, delay * (i + 1)));
                    }
                }
                throw new Error("Retry failed");
            };

            const worker = async (workerId: number) => {
                while (queue.length > 0) {
                    const item = queue.shift();
                    if (!item) break;
                    
                    const label = `Worker ${workerId} -> File ${item.file.name}`;
                    console.time(label);
                    
                    try {
                        const res = await fetchWithRetry(`/api/get-full-cache?action=get-file-content&fileId=${item.file.id}`);
                        const text = await res.text();
                        
                        if (text && text.trim().length > 0) {
                            lastSavedChunksRef.current.set(item.index, text);
                            const chunkData = JSON.parse(text);
                            let newRows: AggregatedDataRow[] = Array.isArray(chunkData.rows) ? chunkData.rows : (Array.isArray(chunkData.aggregatedData) ? chunkData.aggregatedData : []);
                            
                            const chunkIndex = parseInt(item.file.name.match(/\d+/)?.[0] || String(item.index), 10);
                            newRows.forEach(row => row._chunkIndex = chunkIndex);

                            if (newRows.length > 0) {
                                accumulatedRows.push(...normalize(newRows));
                            }
                            if (chunkData.meta && !loadedMeta) loadedMeta = chunkData.meta;
                        }
                    } catch (chunkError) {
                        console.error(`❌ [Snapshot] Error processing chunk ${item.file.name}:`, chunkError);
                    } finally {
                        console.timeEnd(label);
                        loadedCount++;
                        setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
                    }
                }
            };

            console.log(`3. Starting ${CONCURRENCY} download workers...`);
            await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

            if (loadedMeta || accumulatedRows.length > 0 || total > 0) {
                console.log(`4. Download complete. Total accumulated rows: ${accumulatedRows.length}`);
                setProcessingState(prev => ({ ...prev, message: 'Синхронизация дельт и кэша...' }));
                
                let finalData = accumulatedRows;
                
                // 1. Apply Legacy Cache (Sheets)
                try {
                    const cacheRes = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                    if (cacheRes.ok) {
                        const cacheData = await cacheRes.json();
                        finalData = applyCacheToData(finalData, cacheData);
                        console.log('   Legacy Cache applied.');
                    }
                } catch (e) {
                    console.error("Failed to fetch legacy cache:", e);
                }

                // 2. Apply Deltas (Savepoints)
                try {
                    console.log('5. Fetching savepoint deltas...');
                    const deltasRes = await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`);
                    if (deltasRes.ok) {
                        const deltas = await deltasRes.json();
                        if (Array.isArray(deltas) && deltas.length > 0) {
                            console.log(`   Applying ${deltas.length} deltas...`);
                            finalData = applyDeltasToData(finalData, deltas);
                        } else {
                            console.log('   No deltas found.');
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch/apply deltas:", e);
                }

                enrichWithAbcCategories(finalData);
                setAllData(finalData);
                
                const safeMeta = loadedMeta || {};
                setUnidentifiedRows(safeMeta.unidentifiedRows || []);
                setOkbRegionCounts(safeMeta.okbRegionCounts || {});
                totalRowsProcessedRef.current = safeMeta.totalRowsProcessed || finalData.length;
                
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
                console.timeEnd('Snapshot Total Load Time');
                console.groupEnd();
                return true;
            }
            return false;
        } catch (e) { 
            console.error("❌ Snapshot critical error:", e); 
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сети' }));
            console.groupEnd();
            return false;
        }
    }, [addNotification, applyCacheToData, applyDeltasToData]);

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
        applyCacheToData,
        applyDeltasToData, // Exported for use in polling
        handleDownloadSnapshot,
    };
};
