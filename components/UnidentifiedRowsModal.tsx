
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

// --- Heuristic Data Extractor ---
// Attempts to find meaningful data even if headers are broken or missing
const extractDisplayData = (row: UnidentifiedRow) => {
    const rawData = row.rowData || {};
    
    // 1. Try Strict Key Matching (Best Quality)
    let clientName = findValueInRow(rawData, ['наименование', 'клиент', 'партнер', 'контрагент', 'name', 'client', 'customer']);
    let address = findAddressInRow(rawData) || findValueInRow(rawData, ['город', 'регион', 'city', 'region', 'address']);

    const hasName = clientName && clientName.length > 1;
    const hasAddress = address && address.length > 1;

    // 2. Fallback: Heuristic Content Scanning (If keys failed)
    if (!hasName || !hasAddress) {
        const allValues = Object.entries(rawData)
            .map(([k, v]) => String(v || '').trim())
            .filter(v => v.length > 0);

        // Filter out values that look like the RM name or IDs/Numbers
        const candidates = allValues.filter(v => 
            v !== row.rm && 
            !/^\d+$/.test(v) && // Not just numbers
            v.length > 3 // Significant length
        );

        if (!hasAddress) {
            // Address usually contains digits, commas, or specific markers
            const addrCandidate = candidates.find(v => 
                (v.includes(',') && /\d/.test(v)) || 
                v.toLowerCase().includes('ул.') || 
                v.toLowerCase().includes('обл.') || 
                v.toLowerCase().includes('г.')
            );
            if (addrCandidate) address = addrCandidate;
        }

        if (!hasName) {
            // Name is usually the longest remaining string that isn't the address
            const nameCandidates = candidates.filter(v => v !== address);
            if (nameCandidates.length > 0) {
                // Sort by length, assuming client name is descriptive
                clientName = nameCandidates.sort((a, b) => b.length - a.length)[0];
            }
        }
    }

    // 3. Fallback: Raw Dump
    // If we still have nothing, just join the first few values so the user sees *something*
    if ((!clientName || clientName === '0') && (!address || address === '0')) {
        const rawValues = Object.values(rawData).filter(v => v && String(v).trim() !== '').slice(0, 3).join(' | ');
        clientName = rawValues || 'Нет данных';
    }

    return {
        name: clientName || 'Без названия',
        address: address || 'Адрес не найден',
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

    // Prepare preview of "Other Data" excluding what we already displayed
    const preview = Object.entries(raw)
        .filter(([k, v]) => {
            const val = String(v).toLowerCase();
            const key = k.toLowerCase();
            return v && 
                   !key.startsWith('__') && // Skip internal fields
                   !val.includes(name.toLowerCase()) && 
                   !val.includes(address.toLowerCase()) &&
                   key !== 'rm' && key !== 'manager';
        })
        .slice(0, 3)
        .map(([k, v]) => `${v}`)
        .join(' • ');

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
            <div className="w-1/3 px-4 py-2 border-r border-gray-700/30 flex-shrink-0 truncate text-gray-300 group-hover:text-white" title={address}>
                {address !== 'Адрес не найден' ? <span className="text-gray-500 mr-2">📍</span> : <span className="text-red-500 mr-2">?</span>}
                {address}
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
                            <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                                Это записи, которые система не смогла привязать к карте автоматически. <br/>
                                <span className="text-indigo-300">Причины:</span> Опечатки в адресе, отсутствие города, или нестандартный формат файла.<br/>
                                <span className="text-gray-500 text-xs">Система попыталась извлечь данные эвристически, даже если заголовки колонок не были найдены.</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                        <InfoIcon small />
                        <span>Нажмите на любую строку, чтобы открыть форму <strong>ручного поиска</strong> и привязать клиента к карте.</span>
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
                            <div className="w-12 px-2 text-center flex-shrink-0">#</div>
                            <div className="w-32 px-3 flex-shrink-0">РМ</div>
                            <div className="w-1/4 px-4 flex-shrink-0">Клиент (Raw)</div>
                            <div className="w-1/3 px-4 flex-shrink-0">Адрес (Raw)</div>
                            <div className="flex-grow px-4">Прочие данные</div>
                        </div>

                        {/* Virtual List */}
                        <div className="flex-grow">
                            <AutoSizer>
                                {({ height, width }: { height: number; width: number }) => (
                                    <FixedSizeList
                                        height={height}
                                        itemCount={rows.length}
                                        itemSize={48} // Taller for better readability
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
                
                <div className="mt-2 text-xs text-gray-600 text-right flex justify-between px-2">
                    <span>* Данные показаны "как есть" из исходного файла</span>
                    <span>Всего строк: {rows.length}</span>
                </div>
            </div>
        </Modal>
    );
};

export default UnidentifiedRowsModal;
