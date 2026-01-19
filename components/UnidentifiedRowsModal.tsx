
import React, { useMemo, useState } from 'react';
import * as ReactWindow from 'react-window';
import AutoSizerPkg from 'react-virtualized-auto-sizer';
import Modal from './Modal';
import { UnidentifiedRow } from '../types';

const AutoSizer = AutoSizerPkg as any;
const FixedSizeList = (ReactWindow as any).FixedSizeList;

interface UnidentifiedRowsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: UnidentifiedRow[];
    onStartEdit: (row: UnidentifiedRow) => void;
}

// Row component for virtualization
const UnidentifiedRowItem: React.FC<{ 
    data: { rows: UnidentifiedRow[], headers: string[], onEdit: (r: UnidentifiedRow) => void }; 
    index: number; 
    style: React.CSSProperties;
}> = ({ data, index, style }) => {
    const row = data.rows[index];
    const { headers, onEdit } = data;

    return (
        <div style={style} 
             onClick={() => onEdit(row)}
             className="flex items-center border-b border-gray-700/50 hover:bg-indigo-500/10 cursor-pointer transition-colors text-sm text-gray-300"
             title="Нажмите для редактирования"
        >
            <div className="w-16 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 text-gray-500 text-xs">
                {index + 1}
            </div>
            <div className="w-32 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 font-bold text-indigo-300 truncate">
                {row.rm}
            </div>
            {headers.map(header => (
                <div key={header} className="w-48 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 truncate last:border-r-0">
                    {row.rowData[header] !== undefined && row.rowData[header] !== null ? String(row.rowData[header]) : ''}
                </div>
            ))}
        </div>
    );
};

const UnidentifiedRowsModal: React.FC<UnidentifiedRowsModalProps> = ({ isOpen, onClose, rows, onStartEdit }) => {
    
    // Extract headers once from a sample of rows to keep the grid consistent
    const headers = useMemo(() => {
        if (rows.length === 0) return [];
        // Take first 50 rows to find common headers
        const sample = rows.slice(0, 50);
        const allKeys = new Set(sample.flatMap(r => Object.keys(r.rowData)));
        const ignore = new Set(['__rowNum__', 'originalRow']);
        
        // Prioritize specific headers for visibility
        const priority = ['наименование', 'клиент', 'адрес', 'дистрибьютор', 'город', 'регион'];
        
        return Array.from(allKeys)
            .filter(k => !ignore.has(k))
            .sort((a, b) => {
                const aIdx = priority.findIndex(p => a.toLowerCase().includes(p));
                const bIdx = priority.findIndex(p => b.toLowerCase().includes(p));
                if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                if (aIdx !== -1) return -1;
                if (bIdx !== -1) return 1;
                return a.localeCompare(b);
            });
    }, [rows]);

    const itemData = useMemo(() => ({
        rows,
        headers,
        onEdit: onStartEdit
    }), [rows, headers, onStartEdit]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Неопределенные адреса (${rows.length})`} maxWidth="max-w-[95vw]">
            <div className="flex flex-col h-[80vh]">
                <div className="flex-shrink-0 space-y-2 mb-4">
                    <p className="text-gray-400 text-sm">
                        Система не смогла автоматически определить город или регион для этих записей. 
                        Нажмите на строку, чтобы вручную привязать её к карте.
                    </p>
                </div>

                {rows.length === 0 ? (
                    <div className="flex-grow flex items-center justify-center text-gray-500">
                        Все адреса успешно распознаны!
                    </div>
                ) : (
                    <div className="flex-grow border border-gray-700 rounded-lg overflow-hidden flex flex-col bg-gray-900/30">
                        {/* Header Row */}
                        <div className="flex items-center bg-gray-800/90 border-b border-gray-700 text-xs font-bold text-gray-400 uppercase">
                            <div className="w-16 px-4 py-3 flex-shrink-0 border-r border-gray-700">#</div>
                            <div className="w-32 px-4 py-3 flex-shrink-0 border-r border-gray-700">РМ</div>
                            {headers.map(h => (
                                <div key={h} className="w-48 px-4 py-3 flex-shrink-0 border-r border-gray-700 truncate" title={h}>
                                    {h}
                                </div>
                            ))}
                        </div>

                        {/* Virtual List */}
                        <div className="flex-grow">
                            <AutoSizer>
                                {({ height, width }: { height: number; width: number }) => (
                                    <FixedSizeList
                                        height={height}
                                        itemCount={rows.length}
                                        itemSize={40}
                                        width={width}
                                        itemData={itemData}
                                    >
                                        {UnidentifiedRowItem}
                                    </FixedSizeList>
                                )}
                            </AutoSizer>
                        </div>
                    </div>
                )}
                
                <div className="mt-2 text-xs text-gray-500 text-right">
                    Рендеринг оптимизирован: {rows.length.toLocaleString()} строк
                </div>
            </div>
        </Modal>
    );
};

export default UnidentifiedRowsModal;
