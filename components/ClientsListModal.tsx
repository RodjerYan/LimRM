
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import * as ReactWindow from 'react-window';
import AutoSizerPkg from 'react-virtualized-auto-sizer';
import Modal from './Modal';
import { MapPoint } from '../types';
import { SearchIcon, CopyIcon, CheckIcon, SortIcon, SortUpIcon, SortDownIcon, LoaderIcon, ErrorIcon, ExportIcon, AlertIcon } from './icons';

// Fix for AutoSizer JSX type error
const AutoSizer = AutoSizerPkg as any;
const FixedSizeList = (ReactWindow as any).FixedSizeList;

interface ClientsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode; 
    clients: MapPoint[];
    onClientSelect: (client: MapPoint) => void;
    onStartEdit: (client: MapPoint) => void;
    showAbcLegend?: boolean;
}

// Extracted Row Component to handle local animation state
const ClientRow: React.FC<{ client: MapPoint; onStartEdit: (client: MapPoint) => void; style: React.CSSProperties }> = ({ client, onStartEdit, style }) => {
    const [showSuccess, setShowSuccess] = useState(false);
    const [showError, setShowError] = useState(false);
    const prevGeocoding = useRef(client.isGeocoding);

    // Mock Churn Detection: If fact is very low for a B/A client, assume risk
    const isChurnRisk = (client.abcCategory === 'A' || client.abcCategory === 'B') && (client.fact || 0) < 50;

    useEffect(() => {
        if (prevGeocoding.current && !client.isGeocoding) {
            if (client.lat && client.lon) {
                setShowSuccess(true);
                const timer = setTimeout(() => setShowSuccess(false), 3000);
                return () => clearTimeout(timer);
            } else {
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
        <div style={style} className={`border-b border-gray-700/50 hover:bg-indigo-500/10 transition-colors flex items-center text-sm text-gray-300 ${isChurnRisk ? 'bg-red-900/10' : ''}`}>
            <div className="px-4 py-2 font-medium text-white flex items-center gap-2 w-[25%] truncate">
                {client.name}
                {isChurnRisk && <span title="Риск оттока" className="text-red-400"><AlertIcon small /></span>}
            </div>
            <div 
                className="px-4 py-2 text-gray-400 cursor-pointer w-[30%] truncate"
                onClick={() => onStartEdit(client)} 
                title={client.address}
            >
                <div className="flex items-center gap-2">
                    {client.isGeocoding && <div className="text-cyan-400 animate-spin flex-shrink-0"><LoaderIcon small/></div>}
                    {showSuccess && <div className="text-green-400 flex-shrink-0 animate-pulse"><CheckIcon small/></div>}
                    {showError && <div className="text-red-500 flex-shrink-0 animate-pulse"><ErrorIcon small/></div>}
                    <span className={`${client.isGeocoding ? "text-gray-300 font-medium" : ""} truncate`}>
                        {client.address}
                    </span>
                </div>
            </div>
            <div className="px-4 py-2 w-[15%] truncate">{client.city}</div>
            <div className="px-4 py-2 font-mono text-emerald-400 font-bold text-right w-[10%]">{formatNumber(client.fact)}</div>
            <div className="px-4 py-2 w-[10%] truncate">{client.rm}</div>
            <div className="px-4 py-2 w-[10%] truncate">{client.brand}</div>
        </div>
    );
};

const ClientsListModal: React.FC<ClientsListModalProps> = ({ isOpen, onClose, title, clients, onClientSelect, onStartEdit, showAbcLegend }) => {
    const [sortConfig, setSortConfig] = useState<{ key: keyof MapPoint; direction: 'ascending' | 'descending' } | null>({ key: 'fact', direction: 'descending' });
    const [searchTerm, setSearchTerm] = useState('');
    const [copied, setCopied] = useState(false);
    
    const handleCopyToClipboard = () => {
        const tsv = [['Наименование', 'Адрес', 'Город/Группа', 'Объем (кг)', 'Регион', 'РМ', 'Бренд', 'Канал продаж'].join('\t'), ...sortedData.map(row => [row.name, row.address, row.city, row.fact || 0, row.region, row.rm, row.brand, row.type].join('\t'))].join('\n');
        navigator.clipboard.writeText(tsv).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    };

    const handleExportXLSX = () => {
        const exportData = sortedData.map(row => ({ 'Наименование': row.name, 'Адрес': row.address, 'Город/Группа': row.city, 'Объем (кг)': row.fact || 0, 'Регион': row.region, 'РМ': row.rm, 'Бренд': row.brand, 'Канал продаж': row.type }));
        const worksheet = XLSX.utils.json_to_sheet(exportData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Клиенты'); XLSX.writeFile(workbook, `Clients_List_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const filteredData = useMemo(() => { 
        if (!searchTerm) return clients; 
        const lowercasedFilter = searchTerm.toLowerCase(); 
        const safeLower = (val: any) => (val || '').toString().toLowerCase();

        return clients.filter(item => 
            safeLower(item.name).includes(lowercasedFilter) || 
            safeLower(item.address).includes(lowercasedFilter) || 
            safeLower(item.city).includes(lowercasedFilter) || 
            safeLower(item.rm).includes(lowercasedFilter) || 
            safeLower(item.brand).includes(lowercasedFilter)
        ); 
    }, [clients, searchTerm]);

    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key]; const bValue = b[sortConfig.key];
                if ((aValue === undefined || aValue === null) && (bValue === undefined || bValue === null)) return 0;
                if (aValue === undefined || aValue === null) return 1; if (bValue === undefined || bValue === null) return -1;
                if (typeof aValue === 'number' && typeof bValue === 'number') return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
                if (typeof aValue === 'string' && typeof bValue === 'string') return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue, 'ru') : bValue.localeCompare(aValue, 'ru');
                return 0;
            });
        }
        return sortableItems;
    }, [filteredData, sortConfig]);

    const requestSort = (key: keyof MapPoint) => { let direction: 'ascending' | 'descending' = 'ascending'; if (sortConfig?.key === key && sortConfig.direction === 'ascending') { direction = 'descending'; } setSortConfig({ key, direction }); };
    
    // Sortable Header Component (width must match row items)
    const SortableHeader: React.FC<{ sortKey: keyof MapPoint; width: string; children: React.ReactNode }> = ({ sortKey, width, children }) => { 
        const isSorted = sortConfig?.key === sortKey; 
        const icon = isSorted ? (sortConfig?.direction === 'ascending' ? <SortUpIcon /> : <SortDownIcon />) : <SortIcon />; 
        return (<div className={`px-4 py-3 cursor-pointer select-none font-bold text-gray-400 uppercase text-xs flex items-center gap-1.5 hover:text-white transition-colors ${width}`} onClick={() => requestSort(sortKey)}>{children}<span className="w-3 h-3">{icon}</span></div>); 
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-7xl">
            <div className="flex flex-col h-[70vh]">
                {showAbcLegend && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-900/30 border-b border-gray-700 text-xs text-gray-400 flex-shrink-0">
                        <div className="flex flex-col gap-1"><strong className="text-amber-400 text-sm">A (Лидеры)</strong><span>Немногочисленные клиенты, которые приносят 80% всей выручки.</span></div>
                        <div className="flex flex-col gap-1"><strong className="text-emerald-400 text-sm">B (Середняки)</strong><span>Клиенты, обеспечивающие следующие 15% выручки.</span></div>
                        <div className="flex flex-col gap-1"><strong className="text-slate-400 text-sm">C (Аутсайдеры)</strong><span>"Длинный хвост", дающий всего 5% выручки.</span></div>
                        <div className="flex flex-col gap-1 bg-red-900/10 p-2 rounded border border-red-500/20"><strong className="text-red-400 text-sm flex items-center gap-1"><AlertIcon small/> Зона Риска</strong><span>Клиенты A/B с аномально низким фактом. Проверьте отток!</span></div>
                    </div>
                )}
                <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-700 flex-shrink-0">
                    <div className="relative w-full md:w-auto flex-grow"><input type="text" placeholder="Поиск по клиентам..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 pl-10 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition" /><div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div></div>
                    <div className="flex items-center gap-2 flex-shrink-0"><button onClick={handleExportXLSX} title="Выгрузить в Excel" className="p-2 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-300 hover:bg-emerald-600/20 hover:text-emerald-400 transition"><ExportIcon /></button><button onClick={handleCopyToClipboard} title="Скопировать в буфер обмена (TSV)" className="p-2 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-300 hover:bg-indigo-500/20 hover:text-white transition">{copied ? <CheckIcon /> : <CopyIcon />}</button></div>
                </div>
                
                {/* Header Row */}
                <div className="flex items-center bg-gray-900/70 border-b border-gray-700 flex-shrink-0 pr-2">
                    <SortableHeader sortKey="name" width="w-[25%]">Наименование</SortableHeader>
                    <div className="px-4 py-3 font-bold text-gray-400 uppercase text-xs w-[30%]">Адрес</div>
                    <SortableHeader sortKey="city" width="w-[15%]">Город</SortableHeader>
                    <SortableHeader sortKey="fact" width="w-[10%]">Объем</SortableHeader>
                    <SortableHeader sortKey="rm" width="w-[10%]">РМ</SortableHeader>
                    <SortableHeader sortKey="brand" width="w-[10%]">Бренд</SortableHeader>
                </div>

                {/* Virtualized Body */}
                <div className="flex-grow">
                    <AutoSizer>
                        {({ height, width }: { height: number; width: number }) => (
                            <FixedSizeList
                                height={height}
                                itemCount={sortedData.length}
                                itemSize={48} // Row height
                                width={width}
                                itemData={sortedData}
                            >
                                {({ index, style, data }: any) => (
                                    <ClientRow 
                                        client={data[index]} 
                                        onStartEdit={onStartEdit} 
                                        style={style} 
                                    />
                                )}
                            </FixedSizeList>
                        )}
                    </AutoSizer>
                    {filteredData.length === 0 && (<div className="text-center py-10 text-gray-500 absolute w-full top-40"><p>Нет клиентов, соответствующих вашим фильтрам.</p></div>)}
                </div>
                
                <div className="p-2 bg-gray-900/50 border-t border-gray-700 text-xs text-gray-500 flex justify-between items-center flex-shrink-0">
                    <span>Показано {sortedData.length} записей</span>
                    <span className="italic">Используется виртуализация для быстродействия</span>
                </div>
            </div>
        </Modal>
    );
};

export default ClientsListModal;
