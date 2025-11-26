

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { MapPoint } from '../types';
import { SearchIcon, CopyIcon, CheckIcon, SortIcon, SortUpIcon, SortDownIcon, LoaderIcon, ErrorIcon } from './icons';

interface ClientsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: MapPoint[];
    onClientSelect: (client: MapPoint) => void;
    onStartEdit: (client: MapPoint) => void;
}

// Extracted Row Component to handle local animation state
const ClientRow: React.FC<{ client: MapPoint; onStartEdit: (client: MapPoint) => void }> = ({ client, onStartEdit }) => {
    const [showSuccess, setShowSuccess] = useState(false);
    const [showError, setShowError] = useState(false);
    const prevGeocoding = useRef(client.isGeocoding);

    useEffect(() => {
        // If it WAS geocoding, and NOW it's not
        if (prevGeocoding.current && !client.isGeocoding) {
            if (client.lat && client.lon) {
                // Success!
                setShowSuccess(true);
                const timer = setTimeout(() => setShowSuccess(false), 3000);
                return () => clearTimeout(timer);
            } else {
                // Failure!
                setShowError(true);
                const timer = setTimeout(() => setShowError(false), 5000);
                return () => clearTimeout(timer);
            }
        }
        prevGeocoding.current = client.isGeocoding;
    }, [client.isGeocoding, client.lat, client.lon]);

    const formatNumber = (num: number | undefined) => {
        if (num === undefined || num === null) return '0';
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);
    };

    return (
        <tr className='border-b border-gray-700 hover:bg-indigo-500/10'>
            <th scope="row" className="px-4 py-3 font-medium text-white whitespace-nowrap">{client.name}</th>
            <td 
                className="px-4 py-3 text-gray-400 cursor-pointer"
                onClick={() => onStartEdit(client)} 
                title="Нажмите для редактирования"
            >
                <div className="flex items-center gap-2">
                    {client.isGeocoding && (
                        <div className="text-cyan-400 animate-spin flex-shrink-0" title="Получение координат...">
                            <LoaderIcon />
                        </div>
                    )}
                    {showSuccess && (
                        <div className="text-green-400 flex-shrink-0 animate-pulse" title="Координаты успешно обновлены">
                            <CheckIcon />
                        </div>
                    )}
                    {showError && (
                        <div className="text-red-500 flex-shrink-0 animate-pulse" title="Не удалось определить координаты">
                            <div className="w-5 h-5"><ErrorIcon /></div>
                        </div>
                    )}
                    <span className={`
                        ${client.isGeocoding ? "text-gray-300 font-medium" : ""} 
                        ${showSuccess ? "text-green-300 transition-colors duration-500" : ""}
                        ${showError ? "text-red-300 transition-colors duration-500" : ""}
                    `}>
                        {client.address}
                    </span>
                    {client.isGeocoding && <span className="text-xs text-cyan-500 italic whitespace-nowrap">(Поиск...)</span>}
                </div>
            </td>
            <td className="px-4 py-3">{client.city}</td>
            <td className="px-4 py-3 font-mono text-emerald-400 font-bold text-right">{formatNumber(client.fact)}</td>
            <td className="px-4 py-3">{client.rm}</td>
            <td className="px-4 py-3">{client.brand}</td>
        </tr>
    );
};

const ClientsListModal: React.FC<ClientsListModalProps> = ({ isOpen, onClose, clients, onClientSelect, onStartEdit }) => {
    const [sortConfig, setSortConfig] = useState<{ key: keyof MapPoint; direction: 'ascending' | 'descending' } | null>({ key: 'fact', direction: 'descending' });
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [copied, setCopied] = useState(false);
    
    const handleCopyToClipboard = () => {
        const tsv = [
            ['Наименование', 'Адрес', 'Город/Группа', 'Объем (кг)', 'Регион', 'РМ', 'Бренд', 'Канал продаж'].join('\t'),
            ...sortedData.map(row => [
                row.name, row.address, row.city, row.fact || 0, row.region, row.rm, row.brand, row.type
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
                
                // Handle null/undefined gracefully
                if ((aValue === undefined || aValue === null) && (bValue === undefined || bValue === null)) return 0;
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
            setSortConfig({ key: 'fact', direction: 'descending' });
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
                                <SortableHeader sortKey="fact">Объем (кг)</SortableHeader>
                                <SortableHeader sortKey="rm">РМ</SortableHeader>
                                <SortableHeader sortKey="brand">Бренд</SortableHeader>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((row) => (
                                <ClientRow 
                                    key={row.key} 
                                    client={row} 
                                    onStartEdit={onStartEdit} 
                                />
                            ))}
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