
import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPoint, ActionQueueItem } from '../types';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

interface PendingGeocodingItem {
    rm: string;
    address: string;
    oldKey: string;
    basePoint: MapPoint;
    originalIndex?: number;
    attempts: number;
    nextPollTime: number; // Added to manage polling schedule
}

const MAX_GEOCODING_ATTEMPTS = 60;
const GEOCODING_POLLING_INTERVAL_MS = 3000;
const INITIAL_POLL_DELAY_MS = 2000; // Wait 2s before first read to allow write to propagate

export const useGeocoding = (
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void,
    onDataUpdate: (oldKey: string, newPoint: MapPoint, originalIndex?: number) => void,
    onDeleteClientLocal: (rm: string, address: string) => void
) => {
    const [pendingGeocoding, setPendingGeocoding] = useState<PendingGeocodingItem[]>([]);
    const [actionQueue, setActionQueue] = useState<ActionQueueItem[]>([]);
    const [isProcessingQueue, setIsProcessingQueue] = useState(false);

    // --- REF PATTERN FOR CALLBACKS ---
    const onDataUpdateRef = useRef(onDataUpdate);
    const onDeleteClientLocalRef = useRef(onDeleteClientLocal);

    useEffect(() => {
        onDataUpdateRef.current = onDataUpdate;
    }, [onDataUpdate]);

    useEffect(() => {
        onDeleteClientLocalRef.current = onDeleteClientLocal;
    }, [onDeleteClientLocal]);

    // --- QUEUE PROCESSOR ---
    useEffect(() => {
        const processNextAction = async () => {
            if (actionQueue.length === 0 || isProcessingQueue) return;

            setIsProcessingQueue(true);
            const action = actionQueue[0];
            
            console.info(`[Queue] Processing action: ${action.type}`, action.payload);

            try {
                if (action.type === 'UPDATE_ADDRESS') {
                    const { rmName, oldAddress, newAddress, comment, lat, lon, skipHistory } = action.payload;
                    const res = await fetch('/api/update-address', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rmName, oldAddress, newAddress, comment, lat, lon, skipHistory }),
                    });
                    if (!res.ok) throw new Error('Failed to update address');
                    console.log(`✅ [Queue] Successfully updated: ${newAddress}`);
                } else if (action.type === 'DELETE_ADDRESS') {
                    const { rmName, address } = action.payload;
                    const res = await fetch('/api/delete-address', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rmName, address }),
                    });
                    
                    if (!res.ok) throw new Error('Failed to delete address');
                    console.log(`✅ [Queue] Successfully deleted: ${address}`);
                    
                    onDeleteClientLocalRef.current(rmName, address);
                }
                
                setActionQueue(prev => prev.slice(1));
            } catch (error) {
                console.error(`❌ [Queue] Error processing action ${action.type}:`, error);
                
                if (action.retryCount < 3) {
                    setActionQueue(prev => {
                        const [failed, ...rest] = prev;
                        return [...rest, { ...failed, retryCount: failed.retryCount + 1 }];
                    });
                } else {
                    addNotification(`Не удалось выполнить действие: ${action.type}`, 'error');
                    setActionQueue(prev => prev.slice(1));
                }
            } finally {
                setIsProcessingQueue(false);
            }
        };

        const timer = setInterval(processNextAction, 500);
        return () => clearInterval(timer);
    }, [actionQueue, isProcessingQueue, addNotification]);

    // --- GEOCODING POLLER ---
    useEffect(() => {
        const checkPendingItems = async () => {
            if (pendingGeocoding.length === 0) return;

            const now = Date.now();
            
            // Filter items ready for polling
            const activeItems = pendingGeocoding.filter(item => 
                item.attempts < MAX_GEOCODING_ATTEMPTS && 
                now >= item.nextPollTime
            );
            
            // Items waiting for their time slot (keep them in state)
            const waitingItems = pendingGeocoding.filter(item => 
                item.attempts < MAX_GEOCODING_ATTEMPTS && 
                now < item.nextPollTime
            );
            
            if (activeItems.length === 0) {
                // If nothing to poll yet, just keep waiting items
                if (waitingItems.length < pendingGeocoding.length) {
                     setPendingGeocoding(waitingItems);
                }
                return;
            }

            const itemsByRm: Record<string, PendingGeocodingItem[]> = {};
            activeItems.forEach(item => {
                if (!itemsByRm[item.rm]) itemsByRm[item.rm] = [];
                itemsByRm[item.rm].push(item);
            });

            const processedKeys = new Set<string>();

            for (const [rm, items] of Object.entries(itemsByRm)) {
                try {
                    for (const item of items) {
                        console.info(`📡 [Geocoding] Polling for ${item.address} (Attempt ${item.attempts + 1}/${MAX_GEOCODING_ATTEMPTS})`);
                        
                        const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rm)}&address=${encodeURIComponent(item.address)}&t=${now}`);
                        if (!res.ok) continue;
                        
                        const data = await res.json();
                        
                        // Success Condition: Must have valid numbers AND not be in pending state (if status available)
                        // Backend now guarantees clearing coords if address changed, so data.lat will be undefined while pending.
                        if (data && typeof data.lat === 'number' && typeof data.lon === 'number' && data.lat !== 0) {
                            console.log(`✅ [Geocoding] Success for ${item.address}:`, data);
                            
                            const newPoint: MapPoint = {
                                ...item.basePoint,
                                lat: data.lat,
                                lon: data.lon,
                                isGeocoding: false, 
                                coordStatus: 'confirmed',
                                comment: data.comment || item.basePoint.comment,
                                lastUpdated: Date.now()
                            };

                            onDataUpdateRef.current(item.oldKey, newPoint, item.originalIndex);
                            
                            processedKeys.add(item.oldKey);
                            addNotification(`Координаты получены: ${item.address}`, 'success');
                        } 
                        else if (data && (data.isInvalid || data.coordStatus === 'invalid')) {
                             console.warn(`⚠️ [Geocoding] Address marked invalid: ${item.address}`);
                             const failedPoint: MapPoint = {
                                ...item.basePoint,
                                isGeocoding: false,
                                coordStatus: 'invalid',
                                geocodingError: 'Адрес не найден в картах',
                                lastUpdated: Date.now()
                            };
                            onDataUpdateRef.current(item.oldKey, failedPoint, item.originalIndex);
                            processedKeys.add(item.oldKey);
                            addNotification(`Не удалось найти координаты: ${item.address}`, 'error');
                        }
                    }
                } catch (e) {
                    console.error(`❌ Error polling for RM ${rm}:`, e);
                }
            }

            // Update state: Remove processed, update attempts/time for others
            setPendingGeocoding(prev => {
                const nextState: PendingGeocodingItem[] = [];
                
                prev.forEach(item => {
                    // If processed successfully or failed terminally, drop it
                    if (processedKeys.has(item.oldKey)) return;
                    
                    // If it was waiting, keep it as is
                    if (now < item.nextPollTime) {
                        nextState.push(item);
                        return;
                    }
                    
                    // If it was polled but not ready, increment attempt and delay
                    if (item.attempts + 1 < MAX_GEOCODING_ATTEMPTS) {
                        nextState.push({
                            ...item,
                            attempts: item.attempts + 1,
                            nextPollTime: now + GEOCODING_POLLING_INTERVAL_MS
                        });
                    }
                });
                
                return nextState;
            });
        };

        const timer = setInterval(checkPendingItems, 1000); // Check every second for items ready to poll
        return () => clearInterval(timer);
    }, [pendingGeocoding, addNotification]);

    // --- PUBLIC HANDLERS ---

    const handleStartPolling = useCallback((rmName: string, address: string, oldKey: string, basePoint: MapPoint, originalIndex?: number, originalAddress?: string) => {
        // Use provided originalAddress or fallback to basePoint's address if not provided (safety)
        const oldAddr = originalAddress || basePoint.address;

        setActionQueue(prev => [...prev, {
            type: 'UPDATE_ADDRESS',
            id: Date.now().toString(),
            payload: { 
                rmName, 
                oldAddress: oldAddr, // CORRECT: Pass the OLD address so backend finds the record
                newAddress: address, // CORRECT: Pass the NEW address to update to
                comment: basePoint.comment 
            },
            retryCount: 0
        }]);

        // Local state update: show spinner, clear coords
        const tempPoint: MapPoint = { 
            ...basePoint, 
            address, 
            isGeocoding: true, 
            lat: undefined, 
            lon: undefined 
        };
        onDataUpdateRef.current(oldKey, tempPoint, originalIndex);

        setPendingGeocoding(prev => {
            const filtered = prev.filter(p => p.oldKey !== oldKey);
            return [...filtered, {
                rm: rmName,
                address,
                oldKey,
                basePoint,
                originalIndex,
                attempts: 0,
                // CRITICAL FIX: Add delay before first poll to prevent race condition 
                // reading old coords before write completes.
                nextPollTime: Date.now() + INITIAL_POLL_DELAY_MS 
            }];
        });
    }, []);

    const handleQueuedUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number, options?: { skipHistory?: boolean }) => {
        if (!newPoint.isGeocoding) {
             setActionQueue(prev => [...prev, {
                type: 'UPDATE_ADDRESS',
                id: Date.now().toString(),
                payload: { 
                    rmName: newPoint.rm, 
                    oldAddress: newPoint.address, 
                    newAddress: newPoint.address, 
                    comment: newPoint.comment,
                    lat: newPoint.lat,
                    lon: newPoint.lon,
                    skipHistory: options?.skipHistory
                },
                retryCount: 0
            }]);
        }
        onDataUpdateRef.current(oldKey, newPoint, originalIndex);
    }, []);

    const handleQueuedDelete = useCallback((rm: string, address: string) => {
        setActionQueue(prev => [...prev, {
            type: 'DELETE_ADDRESS',
            id: Date.now().toString(),
            payload: { 
                rmName: rm, 
                address: address 
            },
            retryCount: 0
        }]);
    }, []);

    return {
        pendingGeocoding,
        actionQueue,
        handleStartPolling,
        handleQueuedUpdate,
        handleQueuedDelete
    };
};
