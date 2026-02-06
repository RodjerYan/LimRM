
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
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [isCloudSaving, setIsCloudSaving] = useState(false);
    const [processingState, setProcessingState] = useState({
        isProcessing: false, progress: 0, message: 'Система готова', fileName: null, backgroundMessage: null, startTime: null, totalRowsProcessed: 0
    });
    
    // Additional State needed for snapshots
    const [okbRegionCounts, setOkbRegionCounts] = useState<{[key: string]: number}>({});
    const totalRowsProcessedRef = useRef(0);
    const lastSavedChunksRef = useRef<Map<number, string>>(new Map());
    const manualUpdateTimestamps = useRef<Map<string, number>>(new Map());

    // --- DELTA MANAGEMENT ---
    const saveDeltaToCloud = async (delta: DeltaItem) => {
        setIsCloudSaving(true);
        console.groupCollapsed('☁️ Saving Delta');
        console.log('Type:', delta.type);
        console.log('Key:', delta.key);
        console.log('Payload:', delta.payload);
        
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

    // --- REFACTORED APPLY DELTAS (FINAL VERSION) ---
    const applyDeltasToData = useCallback((rows: AggregatedDataRow[], deltas: DeltaItem[]) => {
        if (!deltas || deltas.length === 0) return rows;
        console.log(`Applying ${deltas.length} deltas (Savepoints) with payload merging...`);

        // 1. Build Index of MERGED Changes (Last Writer Wins PER-PROPERTY)
        const changesByKey = new Map<string, DeltaItem>();
        
        // Sort by timestamp to process changes in their historical order
        const sortedDeltas = [...deltas].sort((a, b) => a.timestamp - b.timestamp);

        sortedDeltas.forEach(currentDelta => {
            const existingChange = changesByKey.get(currentDelta.key);
            
            if (existingChange && existingChange.type !== 'delete') {
                // A change for this key already exists, so we MERGE their payloads.
                const mergedPayload = {
                    ...existingChange.payload,
                    ...currentDelta.payload // Newest properties overwrite older ones
                };
                
                const finalType = currentDelta.type === 'delete' ? 'delete' : 'update';
                
                changesByKey.set(currentDelta.key, {
                    ...currentDelta, // Use the latest delta's metadata
                    type: finalType,
                    payload: finalType === 'delete' ? undefined : mergedPayload,
                });
            } else {
                changesByKey.set(currentDelta.key, currentDelta);
            }
        });

        // 2. Create the address-based lookup map AFTER merging is complete.
        const changesByAddress = new Map<string, DeltaItem>();
        changesByKey.forEach(delta => {
            const baseKeyAddr = delta.key.includes('#') ? delta.key.split('#')[0] : delta.key;
            const normKeyAddr = normalizeAddress(baseKeyAddr);
            if (normKeyAddr) {
                changesByAddress.set(normKeyAddr, delta);
            }
        });

        // 3. Apply the final, merged changes to the data.
        return rows.map(group => {
            let groupModified = false;
            
            const activeClients = group.clients.reduce((acc, client) => {
                const normClientAddr = normalizeAddress(client.address);
                
                // Priority 2: Find Delta by Strict Key
                let relevantDelta = changesByKey.get(client.key);
                
                // Fallback: If no key match, try address match BUT only if it's not a generic/short address
                if (!relevantDelta && normClientAddr.length > 8) {
                    relevantDelta = changesByAddress.get(normClientAddr);
                }

                if (!relevantDelta) {
                    acc.push(client); // No change
                    return acc;
                }

                // Handle Delete
                if (relevantDelta.type === 'delete') {
                    groupModified = true;
                    return acc; // Skip pushing to acc -> effectively deletes
                }

                // Handle Update
                if (relevantDelta.type === 'update' && relevantDelta.payload) {
                    groupModified = true;
                    
                    const payload = relevantDelta.payload;
                    
                    // INTELLIGENT MERGE LOGIC:
                    // If the address has changed in the payload, but NO coordinates are provided in the payload,
                    // we must assume the old coordinates are invalid and CLEAR them.
                    const isAddressChanged = payload.address && (normalizeAddress(payload.address) !== normalizeAddress(client.address));
                    const hasNewCoords = payload.lat !== undefined && payload.lon !== undefined;

                    // Start with merged object
                    const mergedClient = {
                        ...client,
                        ...payload,
                        // Ensure status is match if coords are present in the final merged payload
                        status: (payload.lat && payload.lon) ? 'match' : client.status
                    };

                    // CRITICAL FIX: Explicitly clear coords if address moved but no new coords came with the delta.
                    // This fixes the "Ghost Coordinates" issue where old coords persisted after address change
                    // because JSON.stringify dropped 'undefined' values from the delta payload.
                    if (isAddressChanged && !hasNewCoords) {
                        mergedClient.lat = undefined;
                        mergedClient.lon = undefined;
                    }

                    acc.push(mergedClient);
                    return acc;
                }

                acc.push(client);
                return acc;
            }, [] as any[]);

            if (groupModified) {
                const newFact = activeClients.reduce((sum: number, c: any) => sum + (c.fact || 0), 0);
                const newPotential = newFact * 1.15;
                
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

    // --- APPLY CACHE (LEGACY) ---
    const applyCacheToData = useCallback((rows: AggregatedDataRow[], cache: CoordsCache) => {
        if (!cache) return rows;
        
        const updates = new Map<string, { lat?: number, lon?: number, isDeleted?: boolean }>();
        
        Object.values(cache).flat().forEach((item) => {
            if (item.address) {
                const norm = normalizeAddress(item.address);
                updates.set(norm, {
                    lat: item.lat,
                    lon: item.lon,
                    isDeleted: item.isDeleted
                });
            }
        });

        return rows.map(group => {
            let modified = false;
            const newClients = group.clients.reduce((acc, client) => {
                const normAddr = normalizeAddress(client.address);
                const update = updates.get(normAddr);
                
                if (update) {
                    if (update.isDeleted) {
                        modified = true;
                        return acc; // Skip (Delete)
                    }
                    if (typeof update.lat === 'number' && typeof update.lon === 'number' && update.lat !== 0) {
                        if (client.lat !== update.lat || client.lon !== update.lon) {
                            modified = true;
                            acc.push({ ...client, lat: update.lat, lon: update.lon, status: 'match' });
                            return acc;
                        }
                    }
                }
                acc.push(client);
                return acc;
            }, [] as any[]);

            if (modified) {
                const newFact = newClients.reduce((s: number, c: any) => s + (c.fact || 0), 0);
                const newPotential = newFact * 1.15;
                return { ...group, clients: newClients, fact: newFact, potential: newPotential };
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

                // 2. Apply Deltas (Savepoints)
                try {
                    console.log('5. Fetching savepoint deltas...');
                    const deltasRes = await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`);
                    if (deltasRes.ok) {
                        const deltas = await deltasRes.json();
                        if (Array.isArray(deltas) && deltas.length > 0) {
                            console.log(`   Applying ${deltas.length} deltas...`);
                            // --- USE NEW MERGING LOGIC HERE ---
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
