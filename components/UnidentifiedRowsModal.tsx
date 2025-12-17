
import React, { useMemo, useState, useEffect } from 'react';
import Modal from './Modal';
import { findAddressInRow, normalizeAddress } from '../utils/dataUtils';
import { UnidentifiedRow } from '../types';
import { ArrowLeftIcon } from './icons';

interface UnidentifiedRowsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: UnidentifiedRow[];
    onStartEdit: (row: UnidentifiedRow) => void;
}

const ITEMS_PER_PAGE = 50;

const UnidentifiedRowsModal: React.FC<UnidentifiedRowsModalProps> = ({ isOpen, onClose, rows, onStartEdit }) => {
    const [currentPage, setCurrentPage] = useState(1);

    // Reset page when modal opens or rows change
    useEffect(() => {
        if (isOpen) setCurrentPage(1);
    }, [isOpen, rows.length]);

    // 1. Slice the data FIRST. This prevents processing 7000 rows for grouping/headers.
    const visibleRows = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [rows, currentPage]);

    const totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE);

    // 2. Group only the visible slice. Fast and efficient.
    const groupedRows = useMemo(() => {
        return visibleRows.reduce((acc, row) => {
            if (!row) return acc;
            if (!acc[row.rm]) acc[row.rm] = [];
            acc[row.rm].push(row);
            return acc;
        }, {} as Record<string, UnidentifiedRow[]>);
    }, [visibleRows]);

    const rmOrder = useMemo(() => Object.keys(groupedRows).sort((a,b) => a.localeCompare(b)), [groupedRows]);
    
    const modalTitle = `Неопределенные адреса (${rows.length})`;

    const PaginationControls = () => (
        <div className="flex justify-between items-center p-4 bg-gray-900/50 rounded-lg border border-gray-700 mt-4 flex-shrink-0">
            <div className="text-sm text-gray-400">
                Показано {visibleRows.length} из {rows.length} записей
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                    Назад
                </button>
                <span className="text-sm font-mono text-white bg-gray-800 px-3 py-1.5 rounded border border-gray-600">
                    Стр. {currentPage} / {totalPages}
                </span>
                <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                    Вперед
                </button>
            </div>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} maxWidth="max-w-[95vw]">
            <div className="flex flex-col h-[80vh]">
                <div className="flex-shrink-0 space-y-4 mb-4">
                    <p className="text-gray-400 text-sm">
                        Для этих строк не удалось автоматически определить город или регион. 
                        Нажмите на строку, чтобы открыть окно редактирования, внести исправления и сохранить. 
                        Ниже представлены полные данные из загруженного файла для облегчения поиска.
                    </p>
                    {/* Top Pagination for easy access */}
                    {totalPages > 1 && <PaginationControls />}
                </div>

                <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
                    {rows.length === 0 ? (
                        <div className="text-center p-8 text-gray-500">Все адреса успешно распознаны!</div>
                    ) : rmOrder.length === 0 ? (
                        <div className="text-center p-8 text-gray-500">Нет данных для отображения на этой странице.</div>
                    ) : (
                        <div className="space-y-6">
                            {rmOrder.map(rm => {
                                const groupRows = groupedRows[rm];
                                
                                // Dynamically extract headers ONLY for the current visible rows
                                const allHeaders = Array.from(new Set(
                                    groupRows.flatMap(r => Object.keys(r.rowData))
                                )).filter(key => key !== '__rowNum__'); 

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
                                        <h3 className="text-lg font-bold text-accent mb-3 sticky left-0">РМ: {rm}</h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-card-bg/95 border-b border-gray-700">
                                                    <tr>
                                                        {allHeaders.map(header => (
                                                            <th key={header} className="px-4 py-3 text-xs text-gray-400 uppercase font-semibold whitespace-nowrap bg-gray-800/90 min-w-[150px]">
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
                    )}
                </div>
                
                {/* Bottom Pagination */}
                {totalPages > 1 && <div className="mt-4 flex-shrink-0"><PaginationControls /></div>}
            </div>
        </Modal>
    );
};

export default UnidentifiedRowsModal;
