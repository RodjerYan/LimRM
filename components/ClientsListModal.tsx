
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import * as ReactWindow from 'react-window';
import AutoSizerPkg from 'react-virtualized-auto-sizer';
import Modal from './Modal';
import { MapPoint } from '../types';
import { SearchIcon, CopyIcon, CheckIcon, SortIcon, SortUpIcon, SortDownIcon, LoaderIcon, ErrorIcon, ExportIcon, AlertIcon } from './icons';

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

const ClientRow: React.FC<{ client: MapPoint; onStartEdit: (client: MapPoint) => void; style: React.CSSProperties }> = ({ client, onStartEdit, style }) => {
    const [showSuccess, setShowSuccess] = useState(false);
    const [showError, setShowError] = useState(false);
    const prevGeocoding = useRef(client.isGeocoding);

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
        <div 
            style={style} 
            className={`border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-center text-[13px] text-slate-700 ${isChurnRisk ? 'bg-red-50' : ''}`}
        >
            <div className="px-4 py-2 font-semibold text-slate-900 leading-tight flex items-center gap-2 w-[25%] truncate">
                {client.name}
                {isChurnRisk && <span title="Риск оттока" className="text-red-500"><AlertIcon small /></span>}
            </div>
            <div 
                className="px-4 py-2 text-slate-600 cursor-pointer w-[30%] truncate hover:text-indigo-700 transition-colors"
                onClick={() => onStartEdit(client)} 
                title={client.address}
            >
                <div className="flex items-center gap-2">
                    {client.isGeocoding && <div className="text-indigo-500 animate-spin flex-shrink-0"><LoaderIcon small/></div>}
                    {showSuccess && <div className="text-emerald-500 flex-shrink-0 animate-pulse"><CheckIcon small/></div>}
                    {showError && <div className="text-red-500 flex-shrink-0 animate-pulse"><ErrorIcon small/></div>}
                    <span className={`${client.isGeocoding ? "text-slate-500 italic" : ""} truncate`}>
                        {client.address}
                    </span>
                </div>
            </div>
            <div className="px-4 py-2 w-[15%] truncate text-slate-500">{client.city}</div>
            <div className="px-4 py-2 font-mono tabular-nums text-emerald-700 font-semibold text-right w-[10%]">{formatNumber(client.fact)}</div>
            <div className="px-4 py-2 w-[10%] truncate text-slate-500">{client.rm}</div>
            <div className="px-4 py-2 w-[10%] truncate text-slate-500">{client.brand}</div>
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
    
    const SortableHeader: React.FC<{ sortKey: keyof MapPoint; width: string; children: React.ReactNode }> = ({ sortKey, width, children }) => { 
        const isSorted = sortConfig?.key === sortKey; 
        const icon = isSorted ? (sortConfig?.direction === 'ascending' ? <SortUpIcon /> : <SortDownIcon />) : <SortIcon />; 
        return (
            <div 
                className={`px-4 py-3 cursor-pointer select-none font-semibold text-slate-500 uppercase text-[10px] tracking-[0.18em] flex items-center gap-1.5 hover:text-slate-800 transition-colors ${width}`} 
                onClick={() => requestSort(sortKey)}
            >
                {children}<span className="w-3 h-3">{icon}</span>
            </div>
        ); 
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-7xl">
            <div className="flex flex-col h-[70vh]">
                {showAbcLegend && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 border-b border-slate-200 text-xs text-slate-500 flex-shrink-0">
                        <div className="flex flex-col gap-1"><strong className="text-amber-500 text-sm">A (Лидеры)</strong><span>Немногочисленные клиенты, которые приносят 80% всей выручки.</span></div>
                        <div className="flex flex-col gap-1"><strong className="text-emerald-500 text-sm">B (Середняки)</strong><span>Клиенты, обеспечивающие следующие 15% выручки.</span></div>
                        <div className="flex flex-col gap-1"><strong className="text-slate-500 text-sm">C (Аутсайдеры)</strong><span>"Длинный хвост", дающий всего 5% выручки.</span></div>
                        <div className="flex flex-col gap-1 bg-red-50 p-2 rounded border border-red-100"><strong className="text-red-500 text-sm flex items-center gap-1"><AlertIcon small/> Зона Риска</strong><span>Клиенты A/B с аномально низким фактом. Проверьте отток!</span></div>
                    </div>
                )}
                <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-200 flex-shrink-0 bg-white">
                    <div className="relative w-full md:w-auto flex-grow">
                        <input 
                            type="text" 
                            placeholder="Поиск по клиентам..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            className="w-full h-10 px-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition outline-none font-normal" 
                        />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400"><SearchIcon /></div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={handleExportXLSX} title="Выгрузить в Excel" className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition shadow-sm"><ExportIcon /></button>
                        <button onClick={handleCopyToClipboard} title="Скопировать в буфер обмена (TSV)" className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition shadow-sm">{copied ? <CheckIcon /> : <CopyIcon />}</button>
                    </div>
                </div>
                
                {/* Header Row */}
                <div className="flex items-center bg-slate-50/80 border-b border-slate-200 flex-shrink-0 pr-2 backdrop-blur-sm">
                    <SortableHeader sortKey="name" width="w-[25%]">Наименование</SortableHeader>
                    <div className="px-4 py-3 font-semibold text-slate-500 uppercase text-[10px] tracking-[0.18em] w-[30%]">Адрес</div>
                    <SortableHeader sortKey="city" width="w-[15%]">Город</SortableHeader>
                    <SortableHeader sortKey="fact" width="w-[10%]">Объем</SortableHeader>
                    <SortableHeader sortKey="rm" width="w-[10%]">РМ</SortableHeader>
                    <SortableHeader sortKey="brand" width="w-[10%]">Бренд</SortableHeader>
                </div>

                {/* Virtualized Body */}
                <div className="flex-grow bg-white relative">
                    {filteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <p className="font-medium">Нет клиентов, соответствующих вашим фильтрам.</p>
                            <p className="text-xs text-slate-400 mt-1">Попробуйте изменить запрос или фильтры.</p>
                        </div>
                    ) : (
                        <AutoSizer>
                            {({ height, width }: { height: number; width: number }) => (
                                <FixedSizeList
                                    height={height}
                                    itemCount={sortedData.length}
                                    itemSize={48} 
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
                    )}
                </div>
                
                <div className="p-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center flex-shrink-0">
                    <span>Показано {sortedData.length} записей</span>
                    <span className="italic">Используется виртуализация</span>
                </div>
            </div>
        </Modal>
    );
};

export default ClientsListModal;
