
import { useState, useRef, useCallback, useEffect } from 'react';
import { AggregatedDataRow, UnidentifiedRow, FileProcessingState, DeltaItem, CoordsCache, OkbStatus } from '../types';
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
        try {
            await fetch('/api/get-full-cache?action=save-delta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(delta)
            });
            console.log("Delta saved successfully");
        } catch (e) {
            console.error("Failed to save delta:", e);
            addNotification('Ошибка сохранения изменений в облако', 'warning');
        } finally {
            setIsCloudSaving(false);
        }
    };

    // --- FULL SAVE / SQUASH ---
    const saveSnapshotToCloud = async (currentData: AggregatedDataRow[], currentUnidentified: UnidentifiedRow[]) => {
        setIsCloudSaving(true);
        try {
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            let availableSlots: { id: string, name: string }[] = [];
            if (listRes.ok) availableSlots = await listRes.json();

            const newVersionHash = `edit_${Date.now()}`;
            const encoder = new TextEncoder();
            const getByteSize = (str: string) => encoder.encode(str).length;
            
            // 1. Organize into Sticky Chunks
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

            // 2. Validate Sizes & Handle Overflow
            const chunkIndices = Array.from(stickyChunksMap.keys()).sort((a, b) => a - b);
            chunkIndices.forEach(idx => {
                const rows = stickyChunksMap.get(idx)!;
                const validRows: AggregatedDataRow[] = [];
                let currentChunkSize = 100; // overhead

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

            // 3. Pack Unassigned
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

            // 4. Upload Changed Chunks
            const maxSlotIndex = Math.max(maxChunkIndex, availableSlots.length - 1, currentPackIndex);
            const chunksToUpload: { index: number; content: string; targetFileId: string }[] = [];
            
            for (let i = 0; i <= maxSlotIndex; i++) {
                const rows = stickyChunksMap.get(i) || [];
                if (rows.length === 0 && i >= availableSlots.length && i > currentPackIndex) continue;

                const chunkObj = { chunkIndex: i, rows: rows };
                const content = JSON.stringify(chunkObj);
                
                // Compare with cache to avoid unnecessary uploads (if squash wasn't forced)
                // But for full squash we typically want to ensure consistency. 
                // We'll rely on the cache check to be efficient.
                const prevContent = lastSavedChunksRef.current.get(i);
                
                if (prevContent !== content) {
                    const targetFileId = availableSlots[i] ? availableSlots[i].id : '';
                    chunksToUpload.push({ index: i, content, targetFileId });
                }
            }

            if (chunksToUpload.length > 0) {
                console.log(`[Squash] Uploading ${chunksToUpload.length} chunks...`);
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
                        });
                    });
                    await Promise.all(batch);
                }
            }

            // 5. Save Meta
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

            // 6. CLEAR DELTAS (The squash magic)
            await fetch('/api/get-full-cache?action=clear-deltas', { method: 'POST' });
            
            console.log("[Squash] Complete. Deltas cleared.");
            addNotification("База успешно оптимизирована (Squash)", "success");

        } catch (e) {
            console.error("Save Snapshot Error:", e);
            addNotification('Ошибка сохранения снимка', 'error');
        } finally {
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

    // --- LOAD SNAPSHOT + DELTAS ---
    const handleDownloadSnapshot = useCallback(async (chunkCount: number, versionHash: string) => {
        try {
            setProcessingState(prev => ({ ...prev, isProcessing: true, message: 'Синхронизация JSON...', progress: 0 }));
            
            // 1. Load Chunks
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) throw new Error('Failed to fetch snapshot list');
            let fileList = await listRes.json();
            fileList.sort((a: any, b: any) => {
                const numA = parseInt((a.name || '').match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt((b.name || '').match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });

            let accumulatedRows: AggregatedDataRow[] = [];
            let loadedMeta: any = null;
            lastSavedChunksRef.current.clear();

            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`);
                if (!res.ok) throw new Error(`Failed to load chunk ${file.id}`);
                const text = await res.text();
                lastSavedChunksRef.current.set(i, text);
                
                const chunkData = JSON.parse(text);
                let newRows: AggregatedDataRow[] = Array.isArray(chunkData.rows) ? chunkData.rows : (Array.isArray(chunkData.aggregatedData) ? chunkData.aggregatedData : []);
                const chunkIndex = parseInt(file.name.match(/\d+/)?.[0] || String(i), 10);
                newRows.forEach(row => row._chunkIndex = chunkIndex);

                if (newRows.length > 0) accumulatedRows.push(...normalize(newRows));
                if (chunkData.meta) loadedMeta = chunkData.meta;
                setProcessingState(prev => ({ ...prev, progress: Math.round(((i+1)/fileList.length)*100) }));
            }

            if (accumulatedRows.length > 0 || loadedMeta) {
                // 2. Apply Legacy Cache
                let finalData = accumulatedRows;
                try {
                    const cacheRes = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                    if (cacheRes.ok) {
                        const cacheData = await cacheRes.json();
                        finalData = applyCacheToData(accumulatedRows, cacheData);
                    }
                } catch (e) { console.warn("Cache sync failed", e); }

                // 3. APPLY DELTAS
                try {
                    setProcessingState(prev => ({ ...prev, message: 'Применение правок (Delta)...' }));
                    const deltaRes = await fetch(`/api/get-full-cache?action=get-deltas&t=${Date.now()}`);
                    if (deltaRes.ok) {
                        const deltas: DeltaItem[] = await deltaRes.json();
                        deltas.sort((a, b) => a.timestamp - b.timestamp);
                        
                        // Check if we need to squash (e.g., > 1000 deltas)
                        const shouldSquash = deltas.length > 1000;

                        finalData = finalData.map(group => {
                            let wasModified = false;
                            let groupClients = [...group.clients];
                            deltas.forEach(delta => {
                                if (delta.type === 'delete') {
                                    const initialLen = groupClients.length;
                                    groupClients = groupClients.filter(c => c.key !== delta.key);
                                    if (groupClients.length !== initialLen) wasModified = true;
                                } else if (delta.type === 'update') {
                                    const idx = groupClients.findIndex(c => c.key === delta.key);
                                    if (idx !== -1 && delta.payload) {
                                        groupClients[idx] = { ...groupClients[idx], ...delta.payload };
                                        wasModified = true;
                                    }
                                }
                            });
                            if (wasModified) {
                                const newFact = groupClients.reduce((s, c) => s + (c.fact || 0), 0);
                                return { ...group, clients: groupClients, fact: newFact };
                            }
                            return group;
                        });

                        if (shouldSquash) {
                            addNotification('Авто-оптимизация базы (Squash)...', 'info');
                            // Trigger squash in background
                            setTimeout(() => {
                                saveSnapshotToCloud(finalData, loadedMeta?.unidentifiedRows || []);
                            }, 5000);
                        }
                    }
                } catch (e) { console.warn("Delta sync failed", e); }

                enrichWithAbcCategories(finalData);
                setAllData(finalData);
                
                const safeMeta = loadedMeta || {};
                setUnidentifiedRows(safeMeta.unidentifiedRows || []);
                setOkbRegionCounts(safeMeta.okbRegionCounts || {});
                totalRowsProcessedRef.current = safeMeta.totalRowsProcessed || finalData.length;

                // Sync to Local IndexedDB
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
                return true;
            }
            return false;
        } catch (e) {
            console.error("Snapshot Load Error:", e);
            setProcessingState(prev => ({ ...prev, isProcessing: false, message: 'Ошибка сети' }));
            return false;
        }
    }, [applyCacheToData, addNotification]);

    return {
        allData, setAllData,
        unidentifiedRows, setUnidentifiedRows,
        okbRegionCounts, setOkbRegionCounts,
        isCloudSaving, setIsCloudSaving,
        processingState, setProcessingState,
        totalRowsProcessedRef,
        manualUpdateTimestamps,
        saveDeltaToCloud,
        saveSnapshotToCloud, // Expose for manual squash if needed
        handleDownloadSnapshot,
        applyCacheToData // Needed for geocoding hook
    };
};
