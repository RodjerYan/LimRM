
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
// Цель: Показать пользователю ХОТЬ ЧТО-ТО, что есть в строке, если стандартные поля не найдены.
const extractDisplayData = (row: UnidentifiedRow) => {
    const rawData = row.rowData || {};
    
    // 1. Пытаемся найти красивые значения
    let clientName = findValueInRow(rawData, ['наименование', 'клиент', 'партнер', 'контрагент', 'name', 'client']);
    let address = findAddressInRow(rawData) || findValueInRow(rawData, ['город', 'регион', 'city', 'region']);

    // 2. Если адрес пустой, берем ВСЕ значения из rawArray (если есть) или rowData
    // Это гарантирует, что пользователь увидит текст из Excel, даже если заголовки "поехали"
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
        address: address, // Теперь здесь всегда будет контент из ячеек
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
    const { name, address, raw } = extractDisplayData(row);

    return (
        <div style={style} 
             onClick={() => onEdit(row)}
             className="flex items-center border-b border-gray-700/50 hover:bg-indigo-500/10 cursor-pointer transition-colors text-sm group"
             title="Нажмите для ручного исправления"
        >
            <div className="w-12 px-2 py-2 border-r border-gray-700/30 flex-shrink-0 text-gray-500 text-xs font-mono text-center">
                {index + 1}
            </div>
            <div className="w-32 px-3 py-2 border-r border-gray-700/30 flex-shrink-0 font-bold text-indigo-300 truncate" title={row.rm}>
                {row.rm || 'Не указан'}
            </div>
            <div className="w-1/4 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 truncate font-medium text-white" title={name}>
                {name}
            </div>
            {/* Основное поле данных - показывает адрес ИЛИ сырые данные */}
            <div className="flex-grow px-4 py-2 truncate text-gray-300 group-hover:text-white font-mono text-xs" title={address}>
                <span className="text-gray-500 mr-2">📝</span>
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
                <div className="flex-shrink-0 space-y-4 mb-4 bg-gray-800/30 p-4 rounded-xl border border-gray-700">
                    <div className="flex items-start gap-3">
                        <div className="text-amber-400 mt-1"><WarningIcon /></div>
                        <div>
                            <h4 className="font-bold text-white text-sm">Требуется ручная привязка</h4>
                            <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                                Ниже показано <strong>сырое содержимое</strong> строк (Raw Data), которые система не смогла распознать автоматически.
                                Нажмите на строку, чтобы открыть форму и вручную ввести корректный адрес для поиска на карте.
                            </p>
                        </div>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="flex-grow flex items-center justify-center text-gray-500 flex-col gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-emerald-500 text-2xl">✔</div>
                        <p>Отличная работа! Все адреса по выбранному фильтру распознаны.</p>
                    </div>
                ) : (
                    <div className="flex-grow border border-gray-700 rounded-lg overflow-hidden flex flex-col bg-gray-900/30">
                        {/* Header Row */}
                        <div className="flex items-center bg-gray-800/90 border-b border-gray-700 text-xs font-bold text-gray-400 uppercase py-3">
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
                
                <div className="mt-2 text-xs text-gray-600 text-right px-2">
                    <span>Всего строк: {rows.length}</span>
                </div>
            </div>
        </Modal>
    );
};

export default UnidentifiedRowsModal;
