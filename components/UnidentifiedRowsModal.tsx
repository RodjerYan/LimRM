
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
            if (!row) return acc; // Safety check
            if (!acc[row.rm]) acc[row.rm] = [];
            acc[row.rm].push(row);
            return acc;
        }, {} as Record<string, UnidentifiedRow[]>);
    }, [rows]);

    const rmOrder = useMemo(() => Object.keys(groupedRows).sort((a,b) => a.localeCompare(b)), [groupedRows]);
    
    const modalTitle = `Неопределенные адреса (${rows.length})`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} maxWidth="max-w-7xl">
            <div className="space-y-6">
                <p className="text-gray-400 text-sm">
                    Для этих строк не удалось автоматически определить город или регион. 
                    Нажмите на строку, чтобы открыть окно редактирования, внести исправления и сохранить. 
                    Ниже представлены полные данные из загруженного файла для облегчения поиска.
                </p>
                {rmOrder.length === 0 && (
                    <div className="text-center p-8 text-gray-500">Все адреса успешно распознаны!</div>
                )}
                {rmOrder.map(rm => {
                    const groupRows = groupedRows[rm];
                    
                    // Dynamically extract all unique headers from the rows in this group
                    const allHeaders = Array.from(new Set(
                        groupRows.flatMap(r => Object.keys(r.rowData))
                    )).filter(key => key !== '__rowNum__'); // Filter out internal keys if any

                    // Sort headers to put potential identifiers first if possible (optional optimization)
                    const priorityHeaders = ['наименование', 'клиент', 'адрес', 'дистрибьютор'];
                    allHeaders.sort((a, b) => {
                        const aLow = a.toLowerCase();
                        const bLow = b.toLowerCase();
                        const aP = priorityHeaders.findIndex(p => aLow.includes(p));
                        const bP = priorityHeaders.findIndex(p => bLow.includes(p));
                        
                        if (aP !== -1 && bP !== -1) return aP - bP;
                        if (aP !== -1) return -1;
                        if (bP !== -1) return 1;
                        return a.localeCompare(b);
                    });

                    return (
                        <div key={rm} className="bg-card-bg/50 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-indigo-500/10">
                            <h3 className="text-lg font-bold text-accent mb-3">РМ: {rm} ({groupRows.length} строк)</h3>
                            <div className="overflow-x-auto max-h-[50vh] custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-card-bg/95 sticky top-0 backdrop-blur-sm z-10 shadow-sm">
                                        <tr>
                                            {allHeaders.map(header => (
                                                <th key={header} className="px-4 py-3 text-xs text-gray-400 uppercase font-semibold whitespace-nowrap border-b border-gray-700 bg-gray-800/90">
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-300">
                                        {groupRows.map((row: UnidentifiedRow) => (
                                            <tr 
                                                key={row.originalIndex} 
                                                className="border-b border-gray-700 hover:bg-indigo-500/10 cursor-pointer transition-colors"
                                                onClick={() => onStartEdit(row)}
                                                title="Нажмите для редактирования"
                                            >
                                                {allHeaders.map(header => (
                                                    <td key={`${row.originalIndex}-${header}`} className="px-4 py-2 text-sm whitespace-nowrap border-r border-gray-700/30 last:border-r-0 max-w-[300px] truncate">
                                                        {row.rowData[header] !== undefined && row.rowData[header] !== null ? String(row.rowData[header]) : ''}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
};

export default UnidentifiedRowsModal;
