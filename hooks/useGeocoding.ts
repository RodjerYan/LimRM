
import { useState, useEffect, useCallback } from 'react';
import { MapPoint, ActionQueueItem } from '../types';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

interface PendingGeocodingItem {
    rm: string;
    address: string;
    oldKey: string;
    basePoint: MapPoint;
    originalIndex?: number;
    attempts: number;
}

const MAX_GEOCODING_ATTEMPTS = 60;
const GEOCODING_POLLING_INTERVAL_MS = 3000;

export const useGeocoding = (
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void,
    onDataUpdate: (oldKey: string, newPoint: MapPoint, originalIndex?: number) => void,
    onDeleteClientLocal: (rm: string, address: string) => void
) => {
    const [pendingGeocoding, setPendingGeocoding] = useState<PendingGeocodingItem[]>([]);
    const [actionQueue, setActionQueue] = useState<ActionQueueItem[]>([]);
    const [isProcessingQueue, setIsProcessingQueue] = useState(false);

    // --- QUEUE PROCESSOR ---
    useEffect(() => {
        const processNextAction = async () => {
            if (actionQueue.length === 0 || isProcessingQueue) return;

            setIsProcessingQueue(true);
            const action = actionQueue[0];

            try {
                if (action.type === 'UPDATE_ADDRESS') {
                    const { rmName, oldAddress, newAddress, comment, lat, lon } = action.payload;
                    const res = await fetch('/api/update-address', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rmName, oldAddress, newAddress, comment, lat, lon }),
                    });
                    if (!res.ok) throw new Error('Failed to update address');
                    console.log(`[Queue] Successfully updated: ${newAddress}`);
                } else if (action.type === 'DELETE_ADDRESS') {
                    const { rmName, address } = action.payload;
                    const res = await fetch('/api/delete-address', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rmName, address }),
                    });
                    if (!res.ok) throw new Error('Failed to delete address');
                    console.log(`[Queue] Successfully deleted: ${address}`);
                }
                // Success: Remove from queue
                setActionQueue(prev => prev.slice(1));
            } catch (error) {
                console.error(`[Queue] Action failed (${action.type}):`, error);
                if (action.retryCount < 2) {
                    setActionQueue(prev => [{ ...action, retryCount: action.retryCount + 1 }, ...prev.slice(1)]);
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    addNotification(`Не удалось синхронизировать изменение: ${action.type}`, 'warning');
                    setActionQueue(prev => prev.slice(1));
                }
            } finally {
                setIsProcessingQueue(false);
            }
        };
        processNextAction();
    }, [actionQueue, isProcessingQueue, addNotification]);

    // --- GEOCODING POLLING ---
    useEffect(() => {
        if (pendingGeocoding.length === 0) return;

        const intervalId = setInterval(async () => {
            const nextPending: PendingGeocodingItem[] = [];
            let changed = false;

            for (const item of pendingGeocoding) {
                if (item.attempts >= MAX_GEOCODING_ATTEMPTS) {
                    addNotification(`Не удалось найти координаты (тайм-аут): ${item.address}`, 'error');
                    // Update client with error status
                    onDataUpdate(item.oldKey, { ...item.basePoint, isGeocoding: false, geocodingError: 'Тайм-аут' }, item.originalIndex);
                    changed = true;
                    continue;
                }

                try {
                    const url = `/api/get-cached-address?rmName=${encodeURIComponent(item.rm)}&address=${encodeURIComponent(item.address)}`;
                    const res = await fetch(url);
                    let found = false;
                    if (res.ok) {
                        const data = await res.json();
                        if (data && typeof data.lat === 'number' && typeof data.lon === 'number') {
                            const updatedPoint = { ...item.basePoint, lat: data.lat, lon: data.lon, isGeocoding: false, status: 'match' as const };
                            onDataUpdate(item.oldKey, updatedPoint, item.originalIndex);
                            addNotification(`Координаты найдены: ${item.address}`, 'success');
                            found = true;
                        }
                    }
                    if (found) {
                        changed = true;
                        continue;
                    }
                } catch (e) { /* ignore */ }

                nextPending.push({ ...item, attempts: item.attempts + 1 });
            }

            if (changed || nextPending.length !== pendingGeocoding.length) {
                setPendingGeocoding(nextPending);
            }
        }, GEOCODING_POLLING_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [pendingGeocoding, onDataUpdate, addNotification]);

    // --- PUBLIC HANDLERS ---
    const handleStartPolling = useCallback((rm: string, address: string, oldKey: string, basePoint: MapPoint, originalIndex?: number) => {
        addNotification(`Адрес "${address.substring(0, 30)}..." отправлен на геокодинг`, 'info');
        // Optimistic update
        onDataUpdate(oldKey, basePoint, originalIndex);
        setPendingGeocoding(prev => [...prev, { rm, address, oldKey, basePoint, originalIndex, attempts: 0 }]);
    }, [addNotification, onDataUpdate]);

    const handleQueuedUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        // 1. Local Update
        onDataUpdate(oldKey, newPoint, originalIndex);
        // 2. Queue Server Update
        const originalRow = newPoint.originalRow || {};
        const oldAddress = findAddressInRow(originalRow) || newPoint.address;
        
        setActionQueue(prev => [...prev, {
            type: 'UPDATE_ADDRESS',
            id: Date.now().toString(),
            payload: {
                rmName: newPoint.rm,
                oldAddress: oldAddress,
                newAddress: newPoint.address,
                comment: newPoint.comment,
                lat: newPoint.lat,
                lon: newPoint.lon
            },
            retryCount: 0
        }]);
        
        if (!newPoint.isGeocoding) {
            addNotification('Изменения сохранены в очередь', 'success');
        }
    }, [onDataUpdate, addNotification]);

    const handleQueuedDelete = useCallback((rm: string, address: string) => {
        // 1. Local Delete
        onDeleteClientLocal(rm, address);
        // 2. Queue Server Delete
        setActionQueue(prev => [...prev, {
            type: 'DELETE_ADDRESS',
            id: Date.now().toString(),
            payload: { rmName: rm, address: address },
            retryCount: 0
        }]);
        addNotification('Удаление добавлено в очередь', 'info');
    }, [onDeleteClientLocal, addNotification]);

    return {
        pendingGeocoding,
        actionQueue,
        handleStartPolling,
        handleQueuedUpdate,
        handleQueuedDelete
    };
};
