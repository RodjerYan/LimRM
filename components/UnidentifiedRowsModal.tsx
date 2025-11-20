import React, { useMemo } from 'react';
import Modal from './Modal';
import { findValueInRow, findAddressInRow } from '../utils/dataUtils';
import { UnidentifiedRow } from '../types';

interface UnidentifiedRowsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: UnidentifiedRow[];
    onStartEdit: (row: UnidentifiedRow) => void;
}

const UnidentifiedRowsModal: React.FC<UnidentifiedRowsModalProps> = ({ isOpen, onClose, rows, onStartEdit }) => {
    
    const groupedRows = useMemo(() => {
        return rows.reduce((acc, row) => {
            if (!acc[row.rm]) acc[row.rm] = [];
            acc[row.rm].push(row);
            return acc;
        }, {} as Record<string, UnidentifiedRow[]>);
    }, [rows]);

    const rmOrder = useMemo(() => Object.keys(groupedRows).sort((a,b) => a.localeCompare(b)), [groupedRows]);
    
    const modalTitle = `Неопределенные адреса (${rows.length})`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
            <div className="space-y-6">
                <p className="text-gray-400 text-sm">
                    Для этих строк не удалось автоматически определить город или регион. 
                    Дважды щелкните по строке, чтобы открыть окно редактирования, внести исправления и сохранить. 
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
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {groupedRows[rm].map((row: UnidentifiedRow) => {
                                        const { rowData, originalIndex } = row;
                                        const originalAddress = findAddressInRow(rowData) || 'N/A';
                                        const clientName = findValueInRow(rowData, ['наименование клиента', 'контрагент', 'клиент']) || 'N/A';
                                        const distributor = findValueInRow(rowData, ['дистрибьютор']) || 'N/A';

                                        return (
                                            <tr 
                                                key={originalIndex} 
                                                className="border-b border-gray-700 hover:bg-indigo-500/10 cursor-pointer"
                                                onDoubleClick={() => onStartEdit(row)}
                                                title="Двойной клик для редактирования"
                                            >
                                                <td className="px-4 py-2 text-sm text-white font-medium truncate max-w-xs" title={clientName}>{clientName}</td>
                                                <td className="px-4 py-2 text-sm text-gray-400 truncate max-w-xs" title={originalAddress}>{originalAddress}</td>
                                                <td className="px-4 py-2 text-sm text-gray-400 truncate max-w-xs" title={distributor}>{distributor}</td>
                                            </tr>
                                        );
                                    })}
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