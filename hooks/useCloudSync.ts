
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
            console.timeEnd('chunk-generation');
            
            const chunksToUpload: { index: number; content: string; targetFileId: string }[] = [];
            
            chunks.forEach((chunkContent, idx) => {
                const prevContent = lastSavedChunksRef.current.get(idx);
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

                        return fetch(`/api/get-full-cache?${queryParams}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chunk: item.content }) 
                        }).then(async res => {
                            if (!res.ok) {
                                const txt = await res.text();
                                throw new Error(`Upload failed for chunk ${item.index}: ${txt}`);
                            }
                            lastSavedChunksRef.current.set(item.index, item.content);
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
            let accumulatedRows: AggregatedDataRow[] = [];
            let loadedMeta: any = null;
            
            lastSavedChunksRef.current.clear();

            for (let i = 0; i < total; i++) {
                const file = fileList[i];
                const res = await fetch(`/api/get-full-cache?action=get-file-content&fileId=${file.id}`);
                if (!res.ok) throw new Error(`Failed to load chunk ${file.id}`);
                const text = await res.text();

                lastSavedChunksRef.current.set(i, text);

                if (text.length >= 1048576) {
                    addNotification('Снимок поврежден (лимит размера)', 'warning');
                    return false;
                }
                
                const chunkData = JSON.parse(text);
                let newRows: any[] = Array.isArray(chunkData.rows) ? chunkData.rows : (Array.isArray(chunkData.aggregatedData) ? chunkData.aggregatedData : []);
                
                if (newRows.length > 0) {
                    accumulatedRows.push(...normalize(newRows));
                }
                if (chunkData.meta) loadedMeta = chunkData.meta;
                
                loadedCount++;
                setProcessingState(prev => ({ ...prev, progress: Math.round((loadedCount/total)*100) }));
            }

            if (accumulatedRows.length > 0 || loadedMeta) {
                enrichWithAbcCategories(accumulatedRows);
                
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
    }, [addNotification, setAllData, setOkbRegionCounts, setProcessingState, setUnidentifiedRows, totalRowsProcessedRef]);

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
        isCloudSaving,
        lastSavedChunksRef // Expose if needed elsewhere, though mainly internal
    };
};
