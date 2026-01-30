
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

    // --- REF PATTERN FOR CALLBACKS ---
    // Prevent interval resets when parent state updates function references
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
                    
                    // Update Local State immediately
                    onDeleteClientLocalRef.current(rmName, address);
                }
                
                // Remove successful item
                setActionQueue(prev => prev.slice(1));
            } catch (error) {
                console.error(`[Queue] Error processing action ${action.type}:`, error);
                
                // Retry logic
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
            const activeItems = pendingGeocoding.filter(item => item.attempts < MAX_GEOCODING_ATTEMPTS);
            
            if (activeItems.length === 0) {
                setPendingGeocoding([]);
                return;
            }

            // Group by RM to batch requests
            const itemsByRm: Record<string, PendingGeocodingItem[]> = {};
            activeItems.forEach(item => {
                if (!itemsByRm[item.rm]) itemsByRm[item.rm] = [];
                itemsByRm[item.rm].push(item);
            });

            for (const [rm, items] of Object.entries(itemsByRm)) {
                try {
                    // Check cache for updates
                    for (const item of items) {
                        console.log(`[Geocoding] Polling for ${item.address} (Attempt ${item.attempts + 1}/${MAX_GEOCODING_ATTEMPTS})`);
                        
                        const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rm)}&address=${encodeURIComponent(item.address)}&t=${now}`);
                        if (!res.ok) continue;
                        
                        const data = await res.json();
                        
                        // Success Condition
                        if (data && typeof data.lat === 'number' && typeof data.lon === 'number' && data.lat !== 0) {
                            console.log(`[Geocoding] Success for ${item.address}:`, data);
                            
                            const newPoint: MapPoint = {
                                ...item.basePoint,
                                lat: data.lat,
                                lon: data.lon,
                                isGeocoding: false, // Turn off loading state immediately
                                coordStatus: 'confirmed',
                                comment: data.comment || item.basePoint.comment,
                                lastUpdated: Date.now()
                            };

                            // Update Global State (This triggers the Delta Save in useAppLogic)
                            onDataUpdateRef.current(item.oldKey, newPoint, item.originalIndex);
                            
                            // Remove from polling list
                            setPendingGeocoding(prev => prev.filter(p => p.oldKey !== item.oldKey));
                            addNotification(`Координаты получены: ${item.address}`, 'success');
                        } 
                        // Failure Condition (Marked invalid in DB)
                        else if (data && (data.isInvalid || data.coordStatus === 'invalid')) {
                             console.warn(`[Geocoding] Address marked invalid: ${item.address}`);
                             const failedPoint: MapPoint = {
                                ...item.basePoint,
                                isGeocoding: false,
                                coordStatus: 'invalid',
                                geocodingError: 'Адрес не найден в картах',
                                lastUpdated: Date.now()
                            };
                            onDataUpdateRef.current(item.oldKey, failedPoint, item.originalIndex);
                            setPendingGeocoding(prev => prev.filter(p => p.oldKey !== item.oldKey));
                            addNotification(`Не удалось найти координаты: ${item.address}`, 'error');
                        }
                    }
                } catch (e) {
                    console.error(`Error polling for RM ${rm}:`, e);
                }
            }

            // Increment attempts for remaining items
            setPendingGeocoding(prev => prev.map(item => ({ ...item, attempts: item.attempts + 1 })));
        };

        const timer = setInterval(checkPendingItems, GEOCODING_POLLING_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [pendingGeocoding, addNotification]); // dependencies are stable refs

    // --- PUBLIC HANDLERS ---

    const handleStartPolling = useCallback((rmName: string, address: string, oldKey: string, basePoint: MapPoint, originalIndex?: number) => {
        // 1. Add to Action Queue (Optimistic Update Request to Server)
        setActionQueue(prev => [...prev, {
            type: 'UPDATE_ADDRESS',
            id: Date.now().toString(),
            payload: { rmName, oldAddress: basePoint.address, newAddress: address, comment: basePoint.comment },
            retryCount: 0
        }]);

        // 2. Set Local State to "Geocoding" immediately.
        // IMPORTANT: Set lat/lon to undefined so the UI knows to wait.
        const tempPoint: MapPoint = { 
            ...basePoint, 
            address, 
            isGeocoding: true, 
            lat: undefined, 
            lon: undefined 
        };
        onDataUpdateRef.current(oldKey, tempPoint, originalIndex);

        // 3. Add to Polling List
        setPendingGeocoding(prev => {
            // Remove duplicates
            const filtered = prev.filter(p => p.oldKey !== oldKey);
            return [...filtered, {
                rm: rmName,
                address,
                oldKey,
                basePoint, // Keep original context
                originalIndex,
                attempts: 0
            }];
        });
    }, []);

    const handleQueuedUpdate = useCallback((oldKey: string, newPoint: MapPoint, originalIndex?: number) => {
        // Direct update (e.g. manual coords or comment only)
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
                    lon: newPoint.lon
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
        // Note: Local deletion is handled in the effect after success to ensure consistency
    }, []);

    return {
        pendingGeocoding,
        actionQueue,
        handleStartPolling,
        handleQueuedUpdate,
        handleQueuedDelete
    };
};
