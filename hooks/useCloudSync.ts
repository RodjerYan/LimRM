
import { useState, useRef, useCallback } from 'react';
import { AggregatedDataRow, UnidentifiedRow, FileProcessingState } from '../types';
import { saveAnalyticsState } from '../utils/db';
import { enrichWithAbcCategories } from '../utils/analytics';
import { normalize } from '../utils/normalization';

const MAX_CHUNK_SIZE_BYTES = 850 * 1024;

interface UseCloudSyncProps {
    allDataRef: React.MutableRefObject<AggregatedDataRow[]>;
    unidentifiedRowsRef: React.MutableRefObject<UnidentifiedRow[]>;
    okbRegionCounts: { [key: string]: number };
    totalRowsProcessedRef: React.MutableRefObject<number>;
    setAllData: (data: AggregatedDataRow[]) => void;
    setUnidentifiedRows: (rows: UnidentifiedRow[]) => void;
    setOkbRegionCounts: (counts: { [key: string]: number }) => void;
    setProcessingState: React.Dispatch<React.SetStateAction<FileProcessingState>>;
    addNotification: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    setDbStatus: (status: 'empty' | 'ready' | 'loading') => void;
}

export const useCloudSync = ({
    allDataRef,
    unidentifiedRowsRef,
    okbRegionCounts,
    totalRowsProcessedRef,
    setAllData,
    setUnidentifiedRows,
    setOkbRegionCounts,
    setProcessingState,
    addNotification,
    setDbStatus
}: UseCloudSyncProps) => {
    const [isCloudSaving, setIsCloudSaving] = useState(false);
    
    const isSavingRef = useRef(false);
    const saveQueuedRef = useRef(false);
    const lastSavedChunksRef = useRef<Map<number, string>>(new Map());
    
    // Map to store parsed data per chunk index to allow partial updates
    const chunkDataMapRef = useRef<Map<number, AggregatedDataRow[]>>(new Map());
    // Map to store the version ID of loaded chunks from the server
    const loadedChunkVersionsRef = useRef<Map<number, string>>(new Map());

    const saveSnapshotToCloud = async (currentData: AggregatedDataRow[], currentUnidentified: UnidentifiedRow[]) => {
        if (isSavingRef.current) {
            console.log("%c[Save] Save in progress. Queuing next run.", "color: orange");
            saveQueuedRef.current = true;
            return;
        }
        
        isSavingRef.current = true;
        setIsCloudSaving(true);

        try {
            console.time('fetch-slots');
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            let availableSlots: { id: string, name: string }[] = [];
            if (listRes.ok) {
                availableSlots = await listRes.json();
            }
            console.timeEnd('fetch-slots');

            const newVersionHash = `edit_${Date.now()}`;
            const encoder = new TextEncoder();
            const getByteSize = (str: string) => encoder.encode(str).length;
            
            console.time('chunk-generation');
            const chunks: string[] = [];
            const chunkDataObjects: AggregatedDataRow[][] = [];

            let currentChunkObj: any = {
                chunkIndex: 0,
                rows: [],
            };
            
            let currentSize = getByteSize(JSON.stringify(currentChunkObj));
            
            for (const row of currentData) {
                const rowStr = JSON.stringify(row);
                const rowSize = getByteSize(rowStr) + 2; 
                
                if (currentSize + rowSize > MAX_CHUNK_SIZE_BYTES) {
                    chunks.push(JSON.stringify(currentChunkObj));
                    chunkDataObjects.push(currentChunkObj.rows);

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
            chunkDataObjects.push(currentChunkObj.rows);
            console.timeEnd('chunk-generation');
            
            const chunksToUpload: { index: number; content: string; targetFileId: string }[] = [];
            
            chunks.forEach((chunkContent, idx) => {
                const prevContent = lastSavedChunksRef.current.get(idx);
                
                // Always update local data map to match what we are saving
                chunkDataMapRef.current.set(idx, chunkDataObjects[idx]);

                if (prevContent !== chunkContent) {
                    const targetFileId = availableSlots[idx] ? availableSlots[idx].id : '';
                    if (targetFileId) {
                        chunksToUpload.push({ 
                            index: idx, 
                            content: chunkContent, 
                            targetFileId 
                        });
                    } else {
                        chunksToUpload.push({ index: idx, content: chunkContent, targetFileId: '' });
                    }
                }
            });

            if (chunksToUpload.length === 0) {
                console.log("%c[Cloud Save] No data chunks changed. Skipping large upload.", "color: #10b981");
                chunks.forEach((content, idx) => {
                    lastSavedChunksRef.current.set(idx, content);
                });
            } else {
                console.log(`%c[Cloud Save] Changes detected. Uploading ${chunksToUpload.length} chunk(s)...`, "color: #f59e0b");
                
                const CONCURRENCY = 4;
                for (let i = 0; i < chunksToUpload.length; i += CONCURRENCY) {
                    const batch = chunksToUpload.slice(i, i + CONCURRENCY).map((item) => {
                        const queryParams = item.targetFileId 
                            ? `action=save-chunk&targetFileId=${item.targetFileId}` 
                            : `action=save-chunk&chunkIndex=${item.index}`;

                        // RESTORED: Detailed start log
                        console.log(`[Cloud Save] Uploading chunk ${item.index} (Size: ${(item.content.length/1024).toFixed(1)}KB)...`);

                        return fetch(`/api/get-full-cache?${queryParams}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chunk: item.content }) 
                        }).then(async res => {
                            if (!res.ok) {
                                const txt = await res.text();
                                console.error(`[Cloud Save] Error uploading chunk ${item.index}:`, txt);
                                throw new Error(`Upload failed for chunk ${item.index}: ${txt}`);
                            }
                            const responseJson = await res.json();
                            
                            // RESTORED: Detailed success log
                            console.log(`[Cloud Save] Chunk ${item.index} saved. Version: ${responseJson.version}`);

                            lastSavedChunksRef.current.set(item.index, item.content);
                            
                            if (responseJson.version) {
                                loadedChunkVersionsRef.current.set(item.index, responseJson.version);
                            }
                        });
                    });
                    
                    await Promise.all(batch);
                }
            }
            
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
            saveQueuedRef.current = true;
        } finally {
            isSavingRef.current = false;
            
            if (saveQueuedRef.current) {
                saveQueuedRef.current = false;
                saveSnapshotToCloud(allDataRef.current, unidentifiedRowsRef.current);
            } else {
                setIsCloudSaving(false);
            }
        }
    };

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
            
            lastSavedChunksRef.current.clear();
            chunkDataMapRef.current.clear();
            loadedChunkVersionsRef.current.clear();

            for (let i = 0; i < total; i++) {
                const file = fileList[i];
                const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`);
                if (!res.ok) throw new Error(`Failed to load chunk ${file.id}`);
                const text = await res.text();

                lastSavedChunksRef.current.set(i, text);
                
                if (file.version) {
                    loadedChunkVersionsRef.current.set(i, file.version);
                }

                if (text.length >= 1048576) {
                    addNotification('Снимок поврежден (лимит размера)', 'warning');
                    return false;
                }
                
                const chunkData = JSON.parse(text);
                let newRows: any[] = Array.isArray(chunkData.rows) ? chunkData.rows : (Array.isArray(chunkData.aggregatedData) ? chunkData.aggregatedData : []);
                
                const normalizedChunk = normalize(newRows);
                chunkDataMapRef.current.set(i, normalizedChunk);
                
                if (chunkData.meta) {
                    setUnidentifiedRows(chunkData.meta.unidentifiedRows || []);
                    setOkbRegionCounts(chunkData.meta.okbRegionCounts || {});
                    totalRowsProcessedRef.current = chunkData.meta.totalRowsProcessed || 0;
                }
                
                loadedCount++;
                setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
            }

            const accumulatedRows = Array.from(chunkDataMapRef.current.values()).flat();

            if (accumulatedRows.length > 0) {
                enrichWithAbcCategories(accumulatedRows);
                setAllData(accumulatedRows);
                
                await saveAnalyticsState({
                    allData: accumulatedRows,
                    unidentifiedRows: unidentifiedRowsRef.current,
                    okbRegionCounts: okbRegionCounts,
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
    }, [addNotification, setAllData, setOkbRegionCounts, setProcessingState, setUnidentifiedRows, totalRowsProcessedRef]);

    const checkForUpdates = useCallback(async () => {
        if (isSavingRef.current || saveQueuedRef.current) return;

        try {
            const listRes = await fetch(`/api/get-full-cache?action=get-snapshot-list&t=${Date.now()}`);
            if (!listRes.ok) return;
            
            const fileList = await listRes.json();
            if (!Array.isArray(fileList)) return;

            const chunksToUpdate: { index: number, id: string }[] = [];

            fileList.sort((a: any, b: any) => {
                const numA = parseInt((a.name || '').match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt((b.name || '').match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });

            fileList.forEach((file: any, index: number) => {
                const currentVersion = loadedChunkVersionsRef.current.get(index);
                if (currentVersion && file.version && String(currentVersion) !== String(file.version)) {
                    chunksToUpdate.push({ index, id: file.id });
                }
                else if (!chunkDataMapRef.current.has(index)) {
                    chunksToUpdate.push({ index, id: file.id });
                }
            });

            if (chunksToUpdate.length > 0) {
                console.log(`[Polling] Found ${chunksToUpdate.length} updated chunks. Fetching...`);
                let hasChanges = false;

                for (const chunk of chunksToUpdate) {
                    const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${chunk.id}`);
                    if (res.ok) {
                        const text = await res.text();
                        lastSavedChunksRef.current.set(chunk.index, text);
                        
                        const matchedFile = fileList.find((f: any) => f.id === chunk.id);
                        if (matchedFile && matchedFile.version) {
                            loadedChunkVersionsRef.current.set(chunk.index, matchedFile.version);
                        }

                        const chunkData = JSON.parse(text);
                        let newRows: any[] = Array.isArray(chunkData.rows) ? chunkData.rows : [];
                        
                        const normalizedChunk = normalize(newRows);
                        chunkDataMapRef.current.set(chunk.index, normalizedChunk);
                        hasChanges = true;
                        
                        if (chunkData.meta) {
                             if (chunkData.meta.unidentifiedRows) setUnidentifiedRows(chunkData.meta.unidentifiedRows);
                             if (chunkData.meta.okbRegionCounts) setOkbRegionCounts(chunkData.meta.okbRegionCounts);
                        }
                    }
                }

                if (hasChanges) {
                    const accumulatedRows = Array.from(chunkDataMapRef.current.values()).flat();
                    enrichWithAbcCategories(accumulatedRows);
                    setAllData(accumulatedRows);
                    addNotification('Данные обновлены из облака', 'info');
                }
            }

        } catch (e) {
            console.error("Polling error:", e);
        }
    }, [addNotification, setAllData, setOkbRegionCounts, setUnidentifiedRows]);

    const handleForceUpdate = useCallback(async () => {
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
    }, [handleDownloadSnapshot, setDbStatus, setProcessingState]);

    return {
        saveSnapshotToCloud,
        handleDownloadSnapshot,
        handleForceUpdate,
        checkForUpdates,
        isCloudSaving,
        lastSavedChunksRef 
    };
};
