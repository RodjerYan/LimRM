
import React, { useMemo } from 'react';
import * as ReactWindow from 'react-window';
import AutoSizerPkg from 'react-virtualized-auto-sizer';
import Modal from './Modal';
import { UnidentifiedRow } from '../types';
import { findAddressInRow, findValueInRow } from '../utils/dataUtils';
import { WarningIcon, SearchIcon, InfoIcon } from './icons';

const AutoSizer = AutoSizerPkg as any;
const FixedSizeList = (ReactWindow as any).FixedSizeList;

interface UnidentifiedRowsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: UnidentifiedRow[];
    onStartEdit: (row: UnidentifiedRow) => void;
}

// --- Ultra-Robust Data Extractor ---
const extractDisplayData = (row: UnidentifiedRow) => {
    const rawData = row.rowData || {};
    
    // 1. Пытаемся найти красивые значения
    let clientName = findValueInRow(rawData, ['наименование', 'клиент', 'партнер', 'контрагент', 'name', 'client']);
    let address = findAddressInRow(rawData) || findValueInRow(rawData, ['город', 'регион', 'city', 'region']);

    // 2. Если адрес пустой, берем ВСЕ значения из rawArray (если есть) или rowData
    if (!address || address.length < 3 || address === '0' || address === 'undefined') {
        let valuesToJoin: any[] = [];
        
        if (row.rawArray && Array.isArray(row.rawArray) && row.rawArray.length > 0) {
            // Приоритет 1: Исходный массив из воркера (сырой Excel)
            valuesToJoin = row.rawArray;
        } else {
            // Приоритет 2: Значения из объекта
            valuesToJoin = Object.values(rawData);
        }

        const rawValues = valuesToJoin
            .map(v => String(v || '').trim())
            .filter(v => v.length > 0 && v !== row.rm && !v.includes('row_')); 
        
        if (rawValues.length > 0) {
            // Берем первые 5 значений как "Адрес/Данные"
            address = rawValues.slice(0, 5).join(' | '); 
        } else {
            address = ' [ПУСТАЯ СТРОКА] ';
        }
    }

    if (!clientName || clientName === '0') {
        clientName = 'Без названия';
    }

    return {
        name: clientName,
        address: address, 
        raw: rawData
    };
};

// Row component for virtualization
const UnidentifiedRowItem: React.FC<{ 
    data: { rows: UnidentifiedRow[], onEdit: (r: UnidentifiedRow) => void }; 
    index: number; 
    style: React.CSSProperties;
}> = ({ data, index, style }) => {
    const row = data.rows[index];
    const { onEdit } = data;
    const { name, address } = extractDisplayData(row);

    return (
        <div style={style} 
             onClick={() => onEdit(row)}
             className="flex items-center border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors text-sm group"
             title="Нажмите для ручного исправления"
        >
            <div className="w-12 px-2 py-2 border-r border-slate-100 flex-shrink-0 text-slate-400 text-xs font-mono text-center">
                {index + 1}
            </div>
            <div className="w-32 px-3 py-2 border-r border-slate-100 flex-shrink-0 font-bold text-indigo-600 truncate" title={row.rm}>
                {row.rm || 'Не указан'}
            </div>
            <div className="w-1/4 px-4 py-2 border-r border-slate-100 flex-shrink-0 truncate font-medium text-slate-900" title={name}>
                {name}
            </div>
            {/* Основное поле данных */}
            <div className="flex-grow px-4 py-2 truncate text-slate-600 group-hover:text-indigo-600 font-mono text-xs" title={address}>
                <span className="text-slate-400 mr-2">📝</span>
                {address}
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
                <div className="flex-shrink-0 space-y-4 mb-4 bg-amber-50 p-4 rounded-xl border border-amber-200">
                    <div className="flex items-start gap-3">
                        <div className="text-amber-500 mt-1"><WarningIcon /></div>
                        <div>
                            <h4 className="font-bold text-amber-800 text-sm">Требуется ручная привязка</h4>
                            <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                                Ниже показано <strong>сырое содержимое</strong> строк (Raw Data), которые система не смогла распознать автоматически.
                                Нажмите на строку, чтобы открыть форму и вручную ввести корректный адрес для поиска на карте.
                            </p>
                        </div>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="flex-grow flex items-center justify-center text-slate-400 flex-col gap-4">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-emerald-500 text-2xl">✔</div>
                        <p>Отличная работа! Все адреса по выбранному фильтру распознаны.</p>
                    </div>
                ) : (
                    <div className="flex-grow border border-slate-200 rounded-lg overflow-hidden flex flex-col bg-white">
                        {/* Header Row */}
                        <div className="flex items-center bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase py-3">
                            <div className="w-12 px-2 text-center flex-shrink-0">#</div>
                            <div className="w-32 px-3 flex-shrink-0">РМ</div>
                            <div className="w-1/4 px-4 flex-shrink-0">Клиент</div>
                            <div className="flex-grow px-4">Содержимое строки (Raw)</div>
                        </div>

                        {/* Virtual List */}
                        <div className="flex-grow">
                            <AutoSizer>
                                {({ height, width }: { height: number; width: number }) => (
                                    <FixedSizeList
                                        height={height}
                                        itemCount={rows.length}
                                        itemSize={48} 
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
                
                <div className="mt-2 text-xs text-slate-500 text-right px-2">
                    <span>Всего строк: {rows.length}</span>
                </div>
            </div>
        </Modal>
    );
};

export default UnidentifiedRowsModal;