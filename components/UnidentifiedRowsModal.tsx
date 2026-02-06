
import React, { useMemo } from 'react';
import * as ReactWindow from 'react-window';
import AutoSizerPkg from 'react-virtualized-auto-sizer';
import Modal from './Modal';
import { UnidentifiedRow } from '../types';
import { findAddressInRow, findValueInRow } from '../utils/dataUtils';
import { WarningIcon, SearchIcon } from './icons';

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
    data: { rows: UnidentifiedRow[], onEdit: (r: UnidentifiedRow) => void }; 
    index: number; 
    style: React.CSSProperties;
}> = ({ data, index, style }) => {
    const row = data.rows[index];
    const { onEdit } = data;

    // Intelligent value extraction regardless of column headers
    const rawData = row.rowData || {};
    
    // Try to find Client Name
    const clientName = findValueInRow(rawData, ['наименование', 'клиент', 'партнер', 'контрагент', 'name', 'client']) || 'Без названия';
    
    // Try to find Address
    const address = findAddressInRow(rawData) || findValueInRow(rawData, ['город', 'регион']) || 'Адрес не найден';

    // Preview of other data (first 2 non-empty values that aren't name or address)
    const preview = Object.entries(rawData)
        .filter(([k, v]) => {
            const val = String(v).toLowerCase();
            return v && 
                   !k.includes('rowId') && 
                   !val.includes(clientName.toLowerCase()) && 
                   !val.includes(address.toLowerCase());
        })
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');

    return (
        <div style={style} 
             onClick={() => onEdit(row)}
             className="flex items-center border-b border-gray-700/50 hover:bg-indigo-500/10 cursor-pointer transition-colors text-sm group"
             title="Нажмите для ручного исправления"
        >
            <div className="w-16 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 text-gray-500 text-xs font-mono">
                {index + 1}
            </div>
            <div className="w-32 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 font-bold text-indigo-300 truncate">
                {row.rm || 'Не указан'}
            </div>
            <div className="w-1/4 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 truncate font-medium text-white">
                {clientName}
            </div>
            <div className="w-1/3 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 truncate text-gray-300 group-hover:text-white">
                <span className="text-gray-500 mr-2">📍</span>{address}
            </div>
            <div className="flex-grow px-4 py-2 truncate text-xs text-gray-500 italic">
                {preview}
            </div>
        </div>
    );
};

const UnidentifiedRowsModal: React.FC<UnidentifiedRowsModalProps> = ({ isOpen, onClose, rows, onStartEdit }) => {
    
    const itemData = useMemo(() => ({
        rows,
        onEdit: onStartEdit
    }), [rows, onStartEdit]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Неопределенные адреса (${rows.length.toLocaleString()})`} maxWidth="max-w-[95vw]">
            <div className="flex flex-col h-[80vh]">
                <div className="flex-shrink-0 space-y-4 mb-4 bg-gray-800/30 p-4 rounded-xl border border-gray-700">
                    <div className="flex items-start gap-3">
                        <div className="text-amber-400 mt-1"><WarningIcon /></div>
                        <div>
                            <h4 className="font-bold text-white text-sm">Что это за список?</h4>
                            <p className="text-gray-400 text-sm mt-1">
                                Это строки, в которых автоматический алгоритм не смог уверенно определить <strong>Регион</strong> или <strong>Город</strong>. 
                                Это часто случается из-за опечаток, сокращений или отсутствия города в адресе.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-indigo-400">
                        <SearchIcon small />
                        <span>Нажмите на любую строку, чтобы вручную найти адрес на карте и привязать его.</span>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="flex-grow flex items-center justify-center text-gray-500 flex-col gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-emerald-500 text-2xl">✔</div>
                        <p>Отличная работа! Все адреса успешно распознаны.</p>
                    </div>
                ) : (
                    <div className="flex-grow border border-gray-700 rounded-lg overflow-hidden flex flex-col bg-gray-900/30">
                        {/* Header Row */}
                        <div className="flex items-center bg-gray-800/90 border-b border-gray-700 text-xs font-bold text-gray-400 uppercase py-3">
                            <div className="w-16 px-4 flex-shrink-0">#</div>
                            <div className="w-32 px-4 flex-shrink-0">РМ</div>
                            <div className="w-1/4 px-4 flex-shrink-0">Клиент</div>
                            <div className="w-1/3 px-4 flex-shrink-0">Исходный Адрес</div>
                            <div className="flex-grow px-4">Прочие данные</div>
                        </div>

                        {/* Virtual List */}
                        <div className="flex-grow">
                            <AutoSizer>
                                {({ height, width }: { height: number; width: number }) => (
                                    <FixedSizeList
                                        height={height}
                                        itemCount={rows.length}
                                        itemSize={44} // Slightly taller for readability
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
                
                <div className="mt-2 text-xs text-gray-600 text-right flex justify-between">
                    <span>* Строки с пустым адресом можно игнорировать</span>
                    <span>Рендеринг: Virtualized List</span>
                </div>
            </div>
        </Modal>
    );
};

export default UnidentifiedRowsModal;
