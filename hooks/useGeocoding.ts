
import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPoint, ActionQueueItem } from '../types';

const MAX_GEOCODING_ATTEMPTS = 60;
const GEOCODING_POLLING_INTERVAL_MS = 3000;
const INITIAL_POLL_DELAY_MS = 2000; // Wait 2s before first read to allow write to propagate

export const useGeocoding = (
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void,
    onDataUpdate: (oldKey: string, newPoint: MapPoint, originalIndex?: number) => void,
    onDeleteClientLocal: (rm: string, address: string) => void
) => {
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
                    const { rmName, oldAddress, newAddress, comment, lat, lon, skipHistory, waitForGeocoding, trackingKey, originalIndex, basePoint } = action.payload;
                    
                    // 1. Send Update Request
                    const res = await fetch('/api/update-address', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rmName, oldAddress, newAddress, comment, lat, lon, skipHistory }),
                    });
                    if (!res.ok) throw new Error('Failed to update address');
                    console.log(`✅ [Queue] Successfully updated: ${newAddress}`);

                    // 2. If Geocoding requested, POLL until done
                    if (waitForGeocoding && trackingKey && basePoint) {
                        console.log(`⏳ [Queue] Waiting for geocoding: ${newAddress}`);
                        
                        let attempts = 0;
                        // Initial delay
                        await new Promise(r => setTimeout(r, INITIAL_POLL_DELAY_MS));

                        while (attempts < MAX_GEOCODING_ATTEMPTS) {
                            attempts++;
                            console.info(`📡 [Geocoding] Polling for ${newAddress} (Attempt ${attempts}/${MAX_GEOCODING_ATTEMPTS})`);
                            
                            try {
                                const pollRes = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(newAddress)}&t=${Date.now()}`);
                                if (pollRes.ok) {
                                    const data = await pollRes.json();
                                    
                                    // Success Condition
                                    if (data && typeof data.lat === 'number' && typeof data.lon === 'number' && data.lat !== 0) {
                                        console.log(`✅ [Geocoding] Success for ${newAddress}:`, data);
                                        
                                        const newPoint: MapPoint = {
                                            ...basePoint,
                                            lat: data.lat,
                                            lon: data.lon,
                                            isGeocoding: false, 
                                            coordStatus: 'confirmed',
                                            comment: data.comment || basePoint.comment,
                                            lastUpdated: Date.now()
                                        };

                                        onDataUpdateRef.current(trackingKey, newPoint, originalIndex);
                                        addNotification(`Координаты получены: ${newAddress}`, 'success');
                                        break; // Done
                                    } 
                                    // Invalid Condition
                                    else if (data && (data.isInvalid || data.coordStatus === 'invalid')) {
                                         console.warn(`⚠️ [Geocoding] Address marked invalid: ${newAddress}`);
                                         const failedPoint: MapPoint = {
                                            ...basePoint,
                                            isGeocoding: false,
                                            coordStatus: 'invalid',
                                            geocodingError: 'Адрес не найден в картах',
                                            lastUpdated: Date.now()
                                        };
                                        onDataUpdateRef.current(trackingKey, failedPoint, originalIndex);
                                        addNotification(`Не удалось найти координаты: ${newAddress}`, 'error');
                                        break; // Done
                                    }
                                }
                            } catch (e) {
                                console.error(`❌ Error polling for ${newAddress}:`, e);
                            }

                            // Wait before next attempt
                            await new Promise(r => setTimeout(r, GEOCODING_POLLING_INTERVAL_MS));
                        }

                        if (attempts >= MAX_GEOCODING_ATTEMPTS) {
                             console.warn(`⚠️ [Geocoding] Timeout for ${newAddress}`);
                             const timeoutPoint: MapPoint = {
                                 ...basePoint,
                                 isGeocoding: false,
                                 geocodingError: 'Timeout',
                                 lastUpdated: Date.now()
                             };
                             onDataUpdateRef.current(trackingKey, timeoutPoint, originalIndex);
                             addNotification(`Время ожидания координат истекло: ${newAddress}`, 'warning');
                        }
                    }

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
                
                // Remove processed action
                setActionQueue(prev => prev.slice(1));

            } catch (error) {
                console.error(`❌ [Queue] Error processing action ${action.type}:`, error);
                
                if (action.retryCount < 3) {
                    // Retry logic (move to end or keep at front with delay?)
                    // Here we move to end to not block others if it's a transient network error, 
                    // but for strict sequencing maybe we should retry in place? 
                    // Let's keep existing logic: move to end.
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

    // --- PUBLIC HANDLERS ---

    const handleStartPolling = useCallback((rmName: string, address: string, oldKey: string, basePoint: MapPoint, originalIndex?: number, originalAddress?: string) => {
        // Use provided originalAddress or fallback to basePoint's address if not provided (safety)
        const oldAddr = originalAddress || basePoint.address;

        // CRITICAL: Determine tracking key. If basePoint has a new key (e.g. from Unidentified row conversion), use that.
        // Otherwise fallback to oldKey. This ensures subsequent updates find the correct item in allData.
        const trackingKey = basePoint.key || oldKey;

        // Local state update: show spinner, clear coords
        const tempPoint: MapPoint = { 
            ...basePoint, 
            key: trackingKey,
            address, 
            isGeocoding: true, 
            lat: undefined, 
            lon: undefined 
        };
        
        // Update local data with the placeholder (moves from Unidentified to Active if originalIndex provided)
        onDataUpdateRef.current(oldKey, tempPoint, originalIndex);

        // Add to Queue with waitForGeocoding flag
        setActionQueue(prev => [...prev, {
            type: 'UPDATE_ADDRESS',
            id: Date.now().toString(),
            payload: { 
                rmName, 
                oldAddress: oldAddr, 
                newAddress: address, 
                comment: basePoint.comment,
                waitForGeocoding: true,
                trackingKey,
                originalIndex,
                basePoint: tempPoint
            },
            retryCount: 0
        }]);
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
                    skipHistory: options?.skipHistory,
                    waitForGeocoding: false
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
        actionQueue,
        handleStartPolling,
        handleQueuedUpdate,
        handleQueuedDelete
    };
};
