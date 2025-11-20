import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { findValueInRow, findAddressInRow, normalizeAddress } from '../utils/dataUtils';
import { parseRussianAddress } from '../services/addressParser';
import { MapPoint } from '../types';
import { LoaderIcon, CheckIcon, ErrorIcon, SaveIcon, TrashIcon } from './icons';

interface UnidentifiedRow {
    rm: string;
    rowData: { [key: string]: any };
}

interface UnidentifiedRowsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: UnidentifiedRow[];
    onRowUpdated: (rowIndex: number) => void;
    onRowResolved: (newPoint: MapPoint, originalIndex: number) => void;
}

type RowStatus = { status: 'idle' | 'loading' | 'success' | 'error' | 'geocoding'; message?: string };

interface RowItemProps {
    row: UnidentifiedRow;
    originalIndex: number;
    editedAddress: string;
    status?: RowStatus;
    disabled: boolean;
    onAddressChange: (index: number, value: string) => void;
    onSave: (index: number) => void;
    onDelete: (index: number) => void;
}

const RowItem: React.FC<RowItemProps> = ({ row, originalIndex, editedAddress, status, disabled, onAddressChange, onSave, onDelete }) => {
    const { rowData } = row;
    const originalAddress = findAddressInRow(rowData) || '';
    const clientName = findValueInRow(rowData, ['наименование клиента', 'контрагент', 'клиент']) || 'N/A';
    const distributor = findValueInRow(rowData, ['дистрибьютор']) || 'N/A';

    const isLoading = status?.status === 'loading';
    const isSuccess = status?.status === 'success';
    const isError = status?.status === 'error';
    const isGeocoding = status?.status === 'geocoding';
    const isIdle = !status || status.status === 'idle';

    return (
        <tr className={`border-b border-gray-700 transition-all duration-500 ${isSuccess ? 'opacity-30' : 'hover:bg-indigo-500/10'}`}>
            <td className="px-4 py-2 text-sm text-white font-medium truncate max-w-xs" title={clientName}>{clientName}</td>
            <td className="px-4 py-2 text-sm text-gray-400 truncate max-w-xs" title={originalAddress}>{originalAddress}</td>
            <td className="px-4 py-2 text-sm text-gray-400 truncate max-w-xs" title={distributor}>{distributor}</td>
            <td className="px-4 py-2">
                <input 
                    type="text"
                    value={editedAddress}
                    onChange={e => onAddressChange(originalIndex, e.target.value)}
                    disabled={disabled || isLoading || isSuccess || isGeocoding}
                    placeholder="Введите корректный адрес..."
                    className="w-full p-2 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition disabled:opacity-50"
                />
                 {isGeocoding && <p className="text-cyan-400 text-xs mt-1 flex items-center gap-1"><LoaderIcon/> {status.message || 'Получение координат...'}</p>}
                {isError && <p className="text-danger text-xs mt-1">{status.message}</p>}
            </td>
            <td className="px-4 py-2">
                <div className="flex items-center justify-center gap-2">
                    <button 
                        onClick={() => onSave(originalIndex)} 
                        disabled={disabled || isLoading || isSuccess || isGeocoding}
                        className="p-2 bg-accent/80 hover:bg-accent text-white rounded-lg transition disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center w-10 h-10"
                        title="Сохранить"
                    >
                        {(isLoading || isGeocoding) && <LoaderIcon />}
                        {isSuccess && <CheckIcon />}
                        {isIdle && <SaveIcon />}
                        {isError && <div className="w-5 h-5"><ErrorIcon/></div>}
                    </button>
                    <button 
                        onClick={() => onDelete(originalIndex)} 
                        disabled={disabled || isLoading || isSuccess}
                        className="p-2 bg-danger/50 hover:bg-danger text-white rounded-lg transition disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center w-10 h-10"
                        title="Удалить"
                    >
                        <TrashIcon />
                    </button>
                </div>
            </td>
        </tr>
    );
};

const UnidentifiedRowsModal: React.FC<UnidentifiedRowsModalProps> = ({ isOpen, onClose, rows, onRowUpdated, onRowResolved }) => {
    const [editedAddresses, setEditedAddresses] = useState<Record<number, string>>({});
    const [rowStatuses, setRowStatuses] = useState<Record<number, RowStatus>>({});
    const [isSavingAll, setIsSavingAll] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setEditedAddresses({});
            setRowStatuses({});
            setIsSavingAll(false);
        }
    }, [isOpen]);

    const handleAddressChange = (index: number, value: string) => {
        setEditedAddresses(prev => ({ ...prev, [index]: value }));
        setRowStatuses(prev => {
            const newStatuses = { ...prev };
            if (newStatuses[index]?.status !== 'loading') {
                 delete newStatuses[index];
            }
            return newStatuses;
        });
    };
    
    const handleDeleteRow = useCallback((index: number) => {
        onRowUpdated(index);
    }, [onRowUpdated]);

    const handleSaveAndGeocode = useCallback(async (index: number, newAddress: string) => {
        setRowStatuses(prev => ({...prev, [index]: { status: 'geocoding', message: 'Ожидание 10с...' }}));
    
        setTimeout(async () => {
            try {
                setRowStatuses(prev => ({...prev, [index]: { status: 'geocoding', message: 'Запрос координат...' }}));
                const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(newAddress)}`);
                if (!geoRes.ok) {
                    throw new Error('Координаты не найдены в базе.');
                }
                const { lat, lon } = await geoRes.json();
                
                const originalRow = rows[index];
                const parsed = parseRussianAddress(newAddress, findValueInRow(originalRow.rowData, ['дистрибьютор']));
    
                const newPoint: MapPoint = {
                    key: normalizeAddress(newAddress),
                    lat, lon, isCached: true, status: 'match',
                    name: findValueInRow(originalRow.rowData, ['наименование клиента', 'контрагент', 'клиент']) || 'N/A',
                    address: newAddress,
                    city: parsed.city,
                    region: parsed.region,
                    rm: originalRow.rm,
                    brand: findValueInRow(originalRow.rowData, ['торговая марка']),
                    type: findValueInRow(originalRow.rowData, ['канал продаж']),
                    contacts: findValueInRow(originalRow.rowData, ['контакты']),
                };
    
                onRowResolved(newPoint, index);
    
            } catch (e) {
                setRowStatuses(prev => ({...prev, [index]: { status: 'error', message: (e as Error).message + ' Адрес сохранен.' }}));
                setTimeout(() => onRowUpdated(index), 3000);
            }
        }, 10000); // 10-секундная задержка
    }, [rows, onRowResolved, onRowUpdated]);

    const handleSaveRow = useCallback(async (index: number) => {
        const originalRow = rows[index];
        if (!originalRow) return;
        const originalAddress = findAddressInRow(originalRow.rowData) ?? '';
        const newAddress = editedAddresses[index] ?? originalAddress;

        if (newAddress.trim() === '' || newAddress.trim() === originalAddress.trim()) {
            setRowStatuses(prev => ({...prev, [index]: { status: 'error', message: 'Адрес не изменен или пуст.' }}));
            return;
        }

        setRowStatuses(prev => ({...prev, [index]: { status: 'loading' }}));

        try {
            const payload = { rmName: originalRow.rm, oldAddress: originalAddress, newAddress };
            const res = await fetch('/api/update-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.details || errData.error || 'Не удалось обновить адрес.');
            }
            
            handleSaveAndGeocode(index, newAddress);

        } catch (e) {
            setRowStatuses(prev => ({...prev, [index]: { status: 'error', message: (e as Error).message }}));
        }
    }, [rows, editedAddresses, handleSaveAndGeocode]);

    const handleSaveAll = useCallback(async () => {
        setIsSavingAll(true);
        
        const savePromises = Object.keys(editedAddresses).map(async (indexStr) => {
            const index = parseInt(indexStr, 10);
            const originalRow = rows[index];
            if (!originalRow) return null;

            const originalAddress = findAddressInRow(originalRow.rowData) ?? '';
            const newAddress = editedAddresses[index];

            if (newAddress && newAddress.trim() !== '' && newAddress.trim() !== originalAddress.trim() && rowStatuses[index]?.status !== 'success' && rowStatuses[index]?.status !== 'geocoding') {
                 setRowStatuses(prev => ({ ...prev, [index]: { status: 'loading' } }));
                 try {
                     const payload = { rmName: originalRow.rm, oldAddress: originalAddress, newAddress };
                     const res = await fetch('/api/update-address', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                     });
                     if (!res.ok) {
                         const err = await res.json();
                         throw new Error(err.details || 'Ошибка записи');
                     }
                     return { index, newAddress };
                 } catch (e) {
                     setRowStatuses(prev => ({ ...prev, [index]: { status: 'error', message: (e as Error).message } }));
                     return null;
                 }
            }
            return null;
        });

        const results = (await Promise.all(savePromises)).filter(Boolean);

        if (results.length > 0) {
            results.forEach(result => {
                if (result) {
                    handleSaveAndGeocode(result.index, result.newAddress);
                }
            });
        }
        
        setIsSavingAll(false);
    }, [editedAddresses, rows, rowStatuses, handleSaveAndGeocode]);

    const groupedRows = useMemo(() => {
        return rows.reduce((acc, row, index) => {
            if (!acc[row.rm]) acc[row.rm] = [];
            acc[row.rm].push({ ...row, originalIndex: index });
            return acc;
        }, {} as Record<string, (UnidentifiedRow & { originalIndex: number })[]>);
    }, [rows]);

    const rmOrder = useMemo(() => Object.keys(groupedRows).sort((a,b) => a.localeCompare(b)), [groupedRows]);
    const hasPendingChanges = Object.keys(editedAddresses).some(indexStr => {
        const index = parseInt(indexStr);
        const originalAddress = findAddressInRow(rows[index]?.rowData) ?? '';
        const status = rowStatuses[index]?.status;
        return editedAddresses[index].trim() !== '' && editedAddresses[index].trim() !== originalAddress.trim() && status !== 'loading' && status !== 'success' && status !== 'geocoding';
    });
    
    const modalTitle = (
         <div className="flex items-center justify-between w-full">
            <span>Неопределенные адреса ({rows.length})</span>
            <button 
                onClick={handleSaveAll}
                disabled={isSavingAll || !hasPendingChanges}
                className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg transition text-sm flex items-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                {isSavingAll ? <LoaderIcon /> : <SaveIcon />}
                Сохранить все
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
            <div className="space-y-6">
                <p className="text-gray-400 text-sm">
                    Для этих строк не удалось автоматически определить город или регион. Внесите исправления в поле "Исправленный адрес" и сохраните. 
                    После сохранения адрес будет заменен в кэше и будет корректно распознаваться при следующих загрузках.
                </p>
                {rmOrder.map(rm => (
                    <div key={rm} className="bg-card-bg/50 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-indigo-500/10">
                        <h3 className="text-lg font-bold text-accent mb-3">РМ: {rm} ({groupedRows[rm].length} строк)</h3>
                        <div className="overflow-x-auto max-h-[50vh] custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="text-xs text-gray-400 uppercase bg-card-bg/95 sticky top-0 backdrop-blur-sm z-10">
                                    <tr>
                                        <th className="px-4 py-3">Клиент</th>
                                        <th className="px-4 py-3">Исходный адрес</th>
                                        <th className="px-4 py-3">Дистрибьютор</th>
                                        <th className="px-4 py-3 w-2/5">Исправленный адрес</th>
                                        <th className="px-4 py-3 text-center">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {groupedRows[rm].map((row) => (
                                        <RowItem 
                                            key={row.originalIndex} 
                                            row={row}
                                            originalIndex={row.originalIndex}
                                            editedAddress={editedAddresses[row.originalIndex] ?? findAddressInRow(row.rowData) ?? ''}
                                            status={rowStatuses[row.originalIndex]}
                                            disabled={isSavingAll}
                                            onAddressChange={handleAddressChange}
                                            onSave={handleSaveRow} 
                                            onDelete={handleDeleteRow}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
};

export default UnidentifiedRowsModal;