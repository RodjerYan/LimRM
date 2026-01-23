
import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { MapPoint, UnidentifiedRow } from '../types';
import { LoaderIcon, CheckIcon, ErrorIcon, TrashIcon, SaveIcon, ArrowLeftIcon, SearchIcon } from './icons';
import { normalizeAddress, findValueInRow } from '../utils/dataUtils';

interface AddressEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBack: () => void;
    data: MapPoint | UnidentifiedRow | null;
    onDataUpdate: (oldKey: string, newPoint: MapPoint, originalIndex?: number) => void;
    onStartPolling: (rm: string, address: string) => void;
    onDelete: (rm: string, address: string) => void;
    globalTheme?: 'dark' | 'light';
}

const AddressEditModal: React.FC<AddressEditModalProps> = ({ 
    isOpen, onClose, onBack, data, onDataUpdate, onStartPolling, onDelete 
}) => {
    // State
    const [address, setAddress] = useState('');
    const [comment, setComment] = useState('');
    const [lat, setLat] = useState<string>('');
    const [lon, setLon] = useState<string>('');
    
    const [status, setStatus] = useState<'idle' | 'saving' | 'polling' | 'success' | 'error' | 'error_geocoding'>('idle');
    const [error, setError] = useState<string | null>(null);
    
    const [pollingTarget, setPollingTarget] = useState<{ rm: string, address: string } | null>(null);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Initial Data Load
    useEffect(() => {
        if (data) {
            setStatus('idle');
            setError(null);
            
            if ('rowData' in data) {
                // UnidentifiedRow
                const addr = findValueInRow(data.rowData, ['адрес', 'юридический адрес']) || '';
                setAddress(addr);
                setComment('');
                setLat('');
                setLon('');
            } else {
                // MapPoint
                setAddress(data.address || '');
                setComment(data.comment || '');
                setLat(data.lat ? String(data.lat) : '');
                setLon(data.lon ? String(data.lon) : '');
            }
        }
    }, [data]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    // Helper to finalize data update
    const finalizeUpdate = (geoResult: any) => {
        if (!data) return;
        
        setStatus('success');
        
        const isUnidentified = 'rowData' in data;
        const rmName = isUnidentified ? data.rm : data.rm;
        
        const newPoint: MapPoint = {
            key: normalizeAddress(geoResult.address || address), 
            lat: geoResult.lat,
            lon: geoResult.lon,
            status: 'match',
            name: isUnidentified ? (findValueInRow(data.rowData, ['наименование', 'клиент']) || 'Новый клиент') : data.name,
            address: geoResult.address || address,
            city: 'Определяется...', 
            region: 'Определяется...',
            rm: rmName,
            brand: isUnidentified ? 'Не определен' : data.brand,
            packaging: isUnidentified ? 'Не определен' : data.packaging,
            type: isUnidentified ? 'Не определен' : data.type,
            comment: geoResult.comment || comment,
            originalRow: isUnidentified ? data.rowData : data.originalRow,
            fact: isUnidentified ? 0 : data.fact, 
            abcCategory: isUnidentified ? 'C' : data.abcCategory
        };

        const originalIndex = isUnidentified ? data.originalIndex : undefined;
        const oldKey = isUnidentified ? '' : data.key;

        setTimeout(() => {
            onDataUpdate(oldKey, newPoint, originalIndex);
            onClose();
        }, 1000);
    };

    // Polling Effect
    useEffect(() => {
        if (!pollingTarget) return;

        const { rm, address } = pollingTarget;
        setStatus('polling');
        
        let attempts = 0;
        const maxAttempts = 30; // 60 seconds (2s interval)

        pollIntervalRef.current = setInterval(async () => {
            attempts++;
            try {
                // Ensure RM is properly encoded
                const rmParam = encodeURIComponent(rm || 'Unknown_RM');
                const addrParam = encodeURIComponent(address);
                const res = await fetch(`/api/get-cached-address?rmName=${rmParam}&address=${addrParam}&t=${Date.now()}`);
                
                if (res.ok) {
                    const result = await res.json();
                    
                    // CRITICAL FIX: Strict coord validation. 
                    // Accept if we have valid numbers. The explicit 'confirmed' status check is removed
                    // because the external geocoder might not update the status column.
                    const hasValidCoords = typeof result.lat === 'number' && typeof result.lon === 'number';

                    if (hasValidCoords) {
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        setPollingTarget(null);
                        finalizeUpdate(result);
                    }
                }
            } catch (e) {
                console.warn("Polling error:", e);
            }

            if (attempts >= maxAttempts) {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setPollingTarget(null);
                setStatus('error_geocoding');
                setError('Время ожидания координат истекло. Попробуйте позже.');
            }
        }, 2000);

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [pollingTarget]);

    const handleSave = async () => {
        if (!data || !address.trim()) return;
        
        setStatus('saving');
        setError(null);

        const isUnidentified = 'rowData' in data;
        const rmName = isUnidentified ? data.rm : data.rm;
        const oldAddress = isUnidentified ? (findValueInRow(data.rowData, ['адрес']) || '') : data.address;
        
        let manualLat: number | undefined;
        let manualLon: number | undefined;
        if (lat && lon) {
            const l = parseFloat(lat.replace(',', '.'));
            const n = parseFloat(lon.replace(',', '.'));
            if (!isNaN(l) && !isNaN(n)) {
                manualLat = l;
                manualLon = n;
            }
        }

        try {
            const res = await fetch(`/api/get-full-cache?action=update-address`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rmName,
                    oldAddress,
                    newAddress: address,
                    comment,
                    lat: manualLat,
                    lon: manualLon
                })
            });

            if (!res.ok) throw new Error("Failed to save");
            
            const result = await res.json();

            // If manual coords were provided, use them immediately
            if (manualLat && manualLon) {
                 finalizeUpdate({ ...result, lat: manualLat, lon: manualLon });
            } 
            // If result returned valid coords immediately (rare but possible if cached)
            else if (result.lat && result.lon) {
                finalizeUpdate(result);
            } 
            // Otherwise start polling
            else {
                setPollingTarget({ rm: rmName, address: address });
            }

        } catch (e) {
            console.error(e);
            setStatus('error');
            setError('Ошибка сохранения. Проверьте сеть.');
        }
    };

    const handleDelete = async () => {
        if(!data) return;
        if(!confirm('Вы уверены? Это удалит привязку координат.')) return;
        
        const isUnidentified = 'rowData' in data;
        const rm = isUnidentified ? data.rm : data.rm;
        const addr = isUnidentified ? (findValueInRow(data.rowData, ['адрес']) || '') : data.address;

        try {
            await fetch(`/api/get-full-cache?action=delete-address`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: rm, address: addr })
            });
            onDelete(rm, addr); 
            onClose();
        } catch(e) {
            alert('Ошибка удаления');
        }
    };

    if (!isOpen || !data) return null;

    const isUnidentified = 'rowData' in data;
    const originalAddr = isUnidentified ? (findValueInRow(data.rowData, ['адрес']) || '') : data.address;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isUnidentified ? 'Исправление адреса' : 'Редактирование клиента'} maxWidth="max-w-xl" zIndex="z-[1200]">
            <div className="space-y-5">
                {/* Header Actions */}
                <div className="flex items-center justify-between border-b border-gray-700 pb-2 mb-2">
                    <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-2 text-sm transition-colors">
                        <ArrowLeftIcon small /> Назад
                    </button>
                    {!isUnidentified && (
                        <button onClick={handleDelete} className="text-red-400 hover:text-red-300 flex items-center gap-2 text-sm transition-colors">
                            <TrashIcon small /> Удалить
                        </button>
                    )}
                </div>

                {/* Form Content - Simpler Layout */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Исходный адрес</label>
                        <div className="text-gray-300 text-sm p-2 bg-black/20 rounded border border-gray-700/50">
                            {originalAddr || '(пусто)'}
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Новый адрес (для поиска)</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 pl-10 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                placeholder="Введите корректный адрес..."
                            />
                            <div className="absolute left-3 top-3.5 text-gray-500"><SearchIcon small/></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Широта (Lat)</label>
                            <input 
                                type="text" 
                                value={lat}
                                onChange={(e) => setLat(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white font-mono text-sm focus:ring-1 focus:ring-indigo-500"
                                placeholder="Auto"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Долгота (Lon)</label>
                            <input 
                                type="text" 
                                value={lon}
                                onChange={(e) => setLon(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white font-mono text-sm focus:ring-1 focus:ring-indigo-500"
                                placeholder="Auto"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Комментарий</label>
                        <textarea 
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white text-sm focus:ring-1 focus:ring-indigo-500 outline-none h-20 resize-none"
                            placeholder="Дополнительная информация..."
                        />
                    </div>
                </div>

                {/* Footer Status & Button */}
                <div className="flex flex-col gap-3 pt-2">
                    <div className="min-h-[24px]">
                        {status === 'saving' && <span className="text-indigo-400 text-sm flex items-center gap-2"><LoaderIcon small /> Сохранение...</span>}
                        {status === 'polling' && <span className="text-cyan-400 text-sm flex items-center gap-2"><LoaderIcon small /> Ожидание координат (до 60сек)...</span>}
                        {status === 'success' && <span className="text-emerald-400 text-sm flex items-center gap-2"><CheckIcon small /> Успешно!</span>}
                        {error && <span className="text-red-400 text-sm flex items-center gap-2"><ErrorIcon small /> {error}</span>}
                    </div>
                    <button 
                        onClick={handleSave}
                        disabled={status === 'saving' || status === 'polling' || !address}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2"
                    >
                        <SaveIcon small />
                        Сохранить и найти
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default AddressEditModal;
