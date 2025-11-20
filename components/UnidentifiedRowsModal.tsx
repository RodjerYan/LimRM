import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { findValueInRow, findAddressInRow } from '../utils/dataUtils';
import { LoaderIcon, CheckIcon, ErrorIcon, SaveIcon } from './icons';

interface UnidentifiedRow {
    rm: string;
    rowData: { [key: string]: any };
}

interface UnidentifiedRowsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: UnidentifiedRow[];
    onRowUpdated: (rowIndex: number) => void;
}

const RowItem: React.FC<{ row: UnidentifiedRow; onUpdate: () => void }> = ({ row, onUpdate }) => {
    const { rm, rowData } = row;
    const originalAddress = findAddressInRow(rowData) || '';
    const [editedAddress, setEditedAddress] = useState(originalAddress);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [error, setError] = useState('');

    const clientName = findValueInRow(rowData, ['наименование клиента', 'контрагент', 'клиент']) || 'N/A';
    const distributor = findValueInRow(rowData, ['дистрибьютор']) || 'N/A';

    const handleSave = async () => {
        if (editedAddress.trim() === '' || editedAddress.trim() === originalAddress.trim()) {
            setError('Адрес не изменен или пуст.');
            setStatus('error');
            return;
        }
        setStatus('loading');
        setError('');

        try {
            const geocodeRes = await fetch(`/api/geocode?address=${encodeURIComponent(editedAddress)}`);
            if (!geocodeRes.ok) {
                const errData = await geocodeRes.json();
                throw new Error(errData.error || 'Не удалось получить координаты.');
            }
            const { lat, lon } = await geocodeRes.json();

            const cachePayload = {
                rmName: rm,
                rows: [{ address: editedAddress, lat, lon }]
            };
            const cacheRes = await fetch('/api/add-to-cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cachePayload)
            });
            if (!cacheRes.ok) {
                const errData = await cacheRes.json();
                throw new Error(errData.error || 'Не удалось сохранить в кэш.');
            }
            
            setStatus('success');
            setTimeout(onUpdate, 1200);
        } catch (e) {
            setError((e as Error).message);
            setStatus('error');
        }
    };

    const isSaved = status === 'success';
    const isLoading = status === 'loading';

    return (
        <tr className={`border-b border-gray-700 transition-opacity ${isSaved ? 'opacity-30' : 'hover:bg-indigo-500/10'}`}>
            <td className="px-4 py-2 text-sm text-white font-medium truncate max-w-xs" title={clientName}>{clientName}</td>
            <td className="px-4 py-2 text-sm text-gray-400 truncate max-w-xs" title={originalAddress}>{originalAddress}</td>
            <td className="px-4 py-2 text-sm text-gray-400 truncate max-w-xs" title={distributor}>{distributor}</td>
            <td className="px-4 py-2">
                <input 
                    type="text"
                    value={editedAddress}
                    onChange={e => setEditedAddress(e.target.value)}
                    disabled={isSaved || isLoading}
                    placeholder="Введите корректный адрес..."
                    className="w-full p-2 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition disabled:opacity-50"
                />
                {status === 'error' && <p className="text-danger text-xs mt-1">{error}</p>}
            </td>
            <td className="px-4 py-2 text-center">
                <button 
                    onClick={handleSave} 
                    disabled={isSaved || isLoading}
                    className="p-2 bg-accent/80 hover:bg-accent text-white rounded-lg transition disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center w-10 h-10"
                    title="Сохранить"
                >
                    {isLoading && <LoaderIcon />}
                    {isSaved && <CheckIcon />}
                    {status === 'idle' && <SaveIcon />}
                    {status === 'error' && <div className="w-5 h-5"><ErrorIcon/></div>}
                </button>
            </td>
        </tr>
    );
};

const UnidentifiedRowsModal: React.FC<UnidentifiedRowsModalProps> = ({ isOpen, onClose, rows, onRowUpdated }) => {
    const groupedRows = useMemo(() => {
        return rows.reduce((acc, row, index) => {
            if (!acc[row.rm]) {
                acc[row.rm] = [];
            }
            acc[row.rm].push({ ...row, originalIndex: index });
            return acc;
        }, {} as Record<string, (UnidentifiedRow & { originalIndex: number })[]>);
    }, [rows]);

    const rmOrder = useMemo(() => Object.keys(groupedRows).sort((a,b) => a.localeCompare(b)), [groupedRows]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Неопределенные адреса (${rows.length})`}>
            <div className="space-y-6">
                <p className="text-gray-400 text-sm">
                    Для этих строк не удалось автоматически определить город или регион. Внесите исправления в поле "Исправленный адрес" и сохраните. 
                    После сохранения адрес будет добавлен в кэш и будет корректно распознаваться при следующих загрузках.
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
                                        <th className="px-4 py-3 w-1/3">Исправленный адрес</th>
                                        <th className="px-4 py-3 text-center">Действие</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {groupedRows[rm].map((row) => (
                                        <RowItem 
                                            key={row.originalIndex} 
                                            row={row} 
                                            onUpdate={() => onRowUpdated(row.originalIndex)} 
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
