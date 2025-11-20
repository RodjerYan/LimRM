import React, { useMemo, useState, useCallback } from 'react';
import Modal from './Modal';
import { MapPoint } from '../types';
import { SearchIcon, CopyIcon, CheckIcon, SortIcon, SortUpIcon, SortDownIcon, LoaderIcon, ErrorIcon, SaveIcon } from './icons';
import { parseRussianAddress } from '../services/addressParser';
import { normalizeAddress } from '../utils/dataUtils';

type RowStatus = 'idle' | 'loading' | 'geocoding' | 'error';

interface ClientsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: MapPoint[];
    onClientSelect: (client: MapPoint) => void;
    onAddressUpdate: (oldAddressKey: string, updatedPoint: MapPoint) => void;
}

const ClientsListModal: React.FC<ClientsListModalProps> = ({ isOpen, onClose, clients, onClientSelect, onAddressUpdate }) => {
    const [sortConfig, setSortConfig] = useState<{ key: keyof MapPoint; direction: 'ascending' | 'descending' } | null>({ key: 'name', direction: 'ascending' });
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [copied, setCopied] = useState(false);
    
    // State for inline editing
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editedAddress, setEditedAddress] = useState('');
    const [editingStatus, setEditingStatus] = useState<RowStatus>('idle');
    const [editingError, setEditingError] = useState<string | null>(null);

    const handleCopyToClipboard = () => {
        const tsv = [
            ['Наименование', 'Адрес', 'Город/Группа', 'Регион', 'РМ', 'Бренд', 'Канал продаж'].join('\t'),
            ...sortedData.map(row => [
                row.name, row.address, row.city, row.region, row.rm, row.brand, row.type
            ].join('\t'))
        ].join('\n');
        navigator.clipboard.writeText(tsv).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const filteredData = useMemo(() => {
        if (!searchTerm) return clients;
        const lowercasedFilter = searchTerm.toLowerCase();
        return clients.filter(item =>
            item.name.toLowerCase().includes(lowercasedFilter) ||
            item.address.toLowerCase().includes(lowercasedFilter) ||
            item.city.toLowerCase().includes(lowercasedFilter) ||
            item.rm.toLowerCase().includes(lowercasedFilter) ||
            item.brand.toLowerCase().includes(lowercasedFilter)
        );
    }, [clients, searchTerm]);

    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue === undefined || aValue === null) return 1;
                if (bValue === undefined || bValue === null) return -1;
                
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
                }
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue, 'ru') : bValue.localeCompare(aValue, 'ru');
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredData, sortConfig]);

    const requestSort = (key: keyof MapPoint) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
        setCurrentPage(1);
    };

    const totalPages = Math.ceil(sortedData.length / rowsPerPage);
    const paginatedData = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const startEditing = (row: MapPoint) => {
        setEditingKey(row.key);
        setEditedAddress(row.address);
        setEditingStatus('idle');
        setEditingError(null);
    };

    const cancelEditing = () => {
        setEditingKey(null);
    };

    const saveAddress = async (row: MapPoint) => {
        if (editedAddress.trim() === '' || editedAddress.trim() === row.address.trim()) {
            setEditingError('Адрес не изменен или пуст.');
            setEditingStatus('error');
            return;
        }

        setEditingStatus('loading');
        setEditingError(null);
        try {
            const res = await fetch('/api/update-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rmName: row.rm, oldAddress: row.address, newAddress: editedAddress }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.details || 'Ошибка сохранения адреса.');
            }
            
            setEditingStatus('geocoding');
            // Wait 10 seconds for external systems to potentially populate coords
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(editedAddress)}`);
            if (!geoRes.ok) {
                // Even if geocoding fails, update the address text
                onAddressUpdate(row.key, { ...row, address: editedAddress, key: normalizeAddress(editedAddress), lat: undefined, lon: undefined });
                throw new Error('Координаты не найдены, но адрес обновлен.');
            }

            const { lat, lon } = await geoRes.json();
            const parsed = parseRussianAddress(editedAddress, ''); // Re-parse to get correct region/city
            
            const updatedPoint: MapPoint = {
                ...row,
                address: editedAddress,
                key: normalizeAddress(editedAddress),
                region: parsed.region,
                city: parsed.city,
                lat,
                lon,
            };
            onAddressUpdate(row.key, updatedPoint);
            setEditingKey(null);

        } catch (e) {
            setEditingError((e as Error).message);
            setEditingStatus('error');
            // Hide the error and reset after a delay
            setTimeout(() => {
                if (editingKey === row.key) { // only reset if we are still editing the same row
                     cancelEditing();
                }
            }, 3000);
        }
    };


    const SortableHeader: React.FC<{ sortKey: keyof MapPoint; children: React.ReactNode }> = ({ sortKey, children }) => {
        const isSorted = sortConfig?.key === sortKey;
        const icon = isSorted ? (sortConfig?.direction === 'ascending' ? <SortUpIcon /> : <SortDownIcon />) : <SortIcon />;
        return (
            <th scope="col" className="px-4 py-3 cursor-pointer select-none" onClick={() => requestSort(sortKey)}>
                <div className="flex items-center gap-1.5">{children}<span className="w-4 h-4">{icon}</span></div>
            </th>
        );
    };

    React.useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setCurrentPage(1);
            setSortConfig({ key: 'name', direction: 'ascending' });
            cancelEditing();
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Список активных клиентов (${clients.length})`}>
            <div className="flex flex-col h-[70vh]">
                <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-700 flex-shrink-0">
                    <div className="relative w-full md:w-auto flex-grow">
                        <input type="text" placeholder="Поиск по клиентам..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full p-2 pl-10 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition" />
                         <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                    </div>
                    <button onClick={handleCopyToClipboard} title="Скопировать в буфер обмена (TSV)" className="p-2 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-300 hover:bg-indigo-500/20 hover:text-white transition flex-shrink-0">
                         {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                </div>
                
                <div className="flex-grow overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-card-bg/95 sticky top-0 backdrop-blur-sm z-10">
                            <tr>
                                <SortableHeader sortKey="name">Наименование</SortableHeader>
                                <th scope="col" className="px-4 py-3">Адрес</th>
                                <SortableHeader sortKey="city">Город/Группа</SortableHeader>
                                <SortableHeader sortKey="rm">РМ</SortableHeader>
                                <SortableHeader sortKey="brand">Бренд</SortableHeader>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((row) => {
                                const isEditing = editingKey === row.key;
                                return (
                                    <tr key={row.key} className={`border-b border-gray-700 ${!isEditing ? 'hover:bg-indigo-500/10' : ''}`}>
                                        <th scope="row" className="px-4 py-3 font-medium text-white whitespace-nowrap">{row.name}</th>
                                        <td className="px-4 py-3 text-gray-400">
                                            {isEditing ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="text"
                                                            value={editedAddress}
                                                            onChange={e => setEditedAddress(e.target.value)}
                                                            className="w-full p-2 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
                                                            autoFocus
                                                        />
                                                        <button onClick={() => saveAddress(row)} disabled={editingStatus === 'loading' || editingStatus === 'geocoding'} className="p-2 bg-accent/80 hover:bg-accent rounded-lg disabled:bg-gray-600"><SaveIcon/></button>
                                                        <button onClick={cancelEditing} className="p-2 bg-gray-600/50 hover:bg-gray-500/50 rounded-lg">Отмена</button>
                                                    </div>
                                                    {editingStatus === 'loading' && <div className="text-xs text-indigo-400 flex items-center gap-1"><LoaderIcon /> Сохранение...</div>}
                                                    {editingStatus === 'geocoding' && <div className="text-xs text-cyan-400 flex items-center gap-1"><LoaderIcon /> Поиск координат...</div>}
                                                    {editingStatus === 'error' && <div className="text-xs text-danger flex items-center gap-1"><ErrorIcon /> {editingError}</div>}
                                                </div>
                                            ) : (
                                                <div onClick={() => onClientSelect(row)} onDoubleClick={() => startEditing(row)} className="cursor-pointer" title="Нажмите для перехода на карту, двойной клик для редактирования">
                                                    {row.address}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">{row.city}</td>
                                        <td className="px-4 py-3">{row.rm}</td>
                                        <td className="px-4 py-3">{row.brand}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (<div className="text-center py-10 text-gray-500"><p>Нет клиентов, соответствующих вашим фильтрам.</p></div>)}
                </div>

                {totalPages > 1 && (
                     <div className="p-4 flex flex-col md:flex-row justify-between items-center text-sm text-gray-400 border-t border-gray-700 flex-shrink-0">
                         <div className="mb-2 md:mb-0">Показано {paginatedData.length} из {filteredData.length} записей</div>
                         <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-600 rounded-md disabled:opacity-50">Назад</button>
                            <span>Стр. {currentPage} из {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-600 rounded-md disabled:opacity-50">Вперед</button>
                            <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                className="p-1.5 bg-gray-900/50 border border-gray-600 rounded-md focus:ring-accent focus:border-accent">
                                <option value={15}>15 / стр</option><option value={30}>30 / стр</option><option value={50}>50 / стр</option><option value={100}>100 / стр</option>
                            </select>
                        </div>
                     </div>
                )}
            </div>
        </Modal>
    );
};

export default ClientsListModal;