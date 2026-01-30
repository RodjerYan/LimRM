
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

            // 5. Save Meta
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

            // 6. CLEAR DELTAS (The squash magic)
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
    // Note: The main logic for initial load is usually in useAppLogic, but this hook provides
    // helper logic for managing the state it owns.
    
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
    };
};