
import React, { useState, useMemo, useDeferredValue } from 'react';
import { AggregatedDataRow } from '../types';
import { findAddressInRow } from '../utils/dataUtils';
import { SortIcon, SortUpIcon, SortDownIcon, SearchIcon, CopyIcon, CheckIcon, WarningIcon } from './icons';

interface ResultsTableProps {
    data: AggregatedDataRow[];
    onRowClick: (row: AggregatedDataRow) => void;
    onPlanClick?: (row: AggregatedDataRow) => void;
    disabled: boolean;
    unidentifiedRowsCount: number;
    onUnidentifiedClick: () => void;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ data, onRowClick, onPlanClick, disabled, unidentifiedRowsCount, onUnidentifiedClick }) => {
    const [sortConfig, setSortConfig] = useState<{ key: keyof AggregatedDataRow | 'costScore'; direction: 'ascending' | 'descending' } | null>({ key: 'growthPotential', direction: 'descending' });
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const deferredSearchTerm = useDeferredValue(searchTerm); // OPTIMIZATION: Non-blocking search
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [copied, setCopied] = useState(false);

    // Mock Cost to Serve Calculation (Idea 6)
    // Memoized cost calculation to avoid re-computing on every render
    const enrichWithCost = useMemo(() => (row: AggregatedDataRow) => {
        const volumeFactor = row.fact > 500 ? 1 : (row.fact > 100 ? 2 : 3);
        const regionCost = (row.region || '').length % 3 + 1; 
        return (volumeFactor * regionCost) * 1.5; 
    }, []);

    const handleCopyToClipboard = () => {
        const tsv = [
            ['Группа', 'РМ', 'Регион', 'Бренд', 'Фасовка', 'Факт', 'Потенциал', 'Рост (абс.)', 'Рост (%)', 'Cost Score'].join('\t'),
            ...sortedData.map(row => [
                row.clientName, row.rm, row.region, row.brand, row.packaging,
                row.fact, row.potential, row.growthPotential, row.growthPercentage.toFixed(2), (row as any).costScore.toFixed(1)
            ].join('\t'))
        ].join('\n');
        navigator.clipboard.writeText(tsv).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const filteredData = useMemo(() => {
        const safeLower = (val: any) => (val || '').toString().toLowerCase();

        if (!deferredSearchTerm) return data.map(d => ({ ...d, costScore: enrichWithCost(d) }));
        const lowercasedFilter = deferredSearchTerm.toLowerCase().trim();
        
        return data.filter(item => {
            if (safeLower(item.clientName).includes(lowercasedFilter)) return true;
            if (safeLower(item.rm).includes(lowercasedFilter)) return true;
            if (safeLower(item.region).includes(lowercasedFilter)) return true;
            if (safeLower(item.brand).includes(lowercasedFilter)) return true;
            if (safeLower(item.packaging).includes(lowercasedFilter)) return true;
            
            // Check nested clients safely
            if (Array.isArray(item.clients)) {
                return item.clients.some(client => {
                    if (safeLower(client.address).includes(lowercasedFilter)) return true;
                    if (safeLower(client.name).includes(lowercasedFilter)) return true;
                    if (client.originalRow) {
                        const rawAddress = findAddressInRow(client.originalRow);
                        if (rawAddress && rawAddress.toLowerCase().includes(lowercasedFilter)) return true;
                    }
                    return false;
                });
            }
            return false;
        }).map(d => ({ ...d, costScore: enrichWithCost(d) }));
    }, [data, deferredSearchTerm, enrichWithCost]);

    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = (a as any)[sortConfig.key];
                const bValue = (b as any)[sortConfig.key];
                
                if (aValue === bValue) return 0;
                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;

                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
                }
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredData, sortConfig]);

    const requestSort = (key: keyof AggregatedDataRow | 'costScore') => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
        setCurrentPage(1);
    };

    const totalPages = Math.ceil(sortedData.length / rowsPerPage);
    const paginatedData = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const SortableHeader: React.FC<{ sortKey: keyof AggregatedDataRow | 'costScore'; children: React.ReactNode; title?: string }> = ({ sortKey, children, title }) => {
        const isSorted = sortConfig?.key === sortKey;
        const icon = isSorted ? (sortConfig?.direction === 'ascending' ? <SortUpIcon /> : <SortDownIcon />) : <SortIcon />;
        return (
            <th scope="col" className="px-4 py-3 cursor-pointer select-none" onClick={() => requestSort(sortKey)} title={title}>
                <div className="flex items-center gap-1.5">{children}<span className="w-4 h-4">{icon}</span></div>
            </th>
        );
    };

    const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

    if (disabled && data.length === 0) {
        return (
             <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 opacity-50">
                <h2 className="text-xl font-bold mb-4 text-white">Результаты Анализа</h2>
                <div className="text-center py-10 text-gray-400"><p>Загрузите и обработайте файл, чтобы увидеть данные.</p></div>
            </div>
        );
    }

    return (
        <div className={`bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-indigo-500/10 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white whitespace-nowrap">Результаты Анализа</h2>
                <div className="w-full md:w-auto flex items-center gap-3">
                    <button
                        onClick={onUnidentifiedClick}
                        className={`font-bold py-2 px-4 rounded-lg transition duration-200 flex items-center gap-2 flex-shrink-0 ${
                            unidentifiedRowsCount > 0 
                                ? 'bg-danger/80 hover:bg-danger text-white animate-pulse' 
                                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
                        }`}
                        title="Нажмите, чтобы просмотреть список адресов"
                    >
                        {unidentifiedRowsCount > 0 ? <WarningIcon/> : <CheckIcon small/>}
                        <span>
                            {unidentifiedRowsCount > 0 
                                ? `Неопределенные адреса (${unidentifiedRowsCount})` 
                                : `Все адреса распознаны`}
                        </span>
                    </button>

                    <div className="relative w-full md:w-64">
                        <input type="text" placeholder="Поиск по таблице..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full p-2 pl-10 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition" />
                         <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                    </div>
                    <button onClick={handleCopyToClipboard} title="Скопировать в буфер обмена (TSV)" className="p-2 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-300 hover:bg-indigo-500/20 hover:text-white transition">
                         {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0 backdrop-blur-sm">
                        <tr>
                            <th scope="col" className="px-4 py-3">Группа/Клиент</th>
                            <SortableHeader sortKey="rm">РМ</SortableHeader>
                            <SortableHeader sortKey="region">Регион</SortableHeader>
                            <SortableHeader sortKey="brand">Бренд</SortableHeader>
                            <SortableHeader sortKey="packaging">Фасовка</SortableHeader>
                            <SortableHeader sortKey="fact">Факт</SortableHeader>
                            <SortableHeader sortKey="potential">Потенциал</SortableHeader>
                            <SortableHeader sortKey="growthPotential">Рост</SortableHeader>
                            <SortableHeader sortKey="costScore" title="Стоимость обслуживания (Cost-to-Serve). Чем выше балл, тем дороже логистика и менеджмент.">Cost Score</SortableHeader>
                        </tr>
                    </thead>
                    <tbody>
                         {paginatedData.map((row: any) => (
                            <tr key={row.key} className="border-b border-gray-700 hover:bg-indigo-500/10 cursor-pointer" onClick={() => onRowClick(row)}>
                                <th scope="row" className="px-4 py-3 font-medium text-white whitespace-nowrap">
                                    {row.clientName || `${row.region || '?'}: ${row.brand || '?'}`}
                                </th>
                                <td className="px-4 py-3">{row.rm}</td>
                                <td className="px-4 py-3">{row.region}</td>
                                <td className="px-4 py-3 text-accent cursor-pointer hover:text-white hover:underline transition-colors font-medium" onClick={(e) => { if (onPlanClick) { e.stopPropagation(); onPlanClick(row); } }} title="Нажмите, чтобы увидеть расчет плана">{row.brand}</td>
                                <td className="px-4 py-3">{row.packaging}</td>
                                <td className="px-4 py-3 text-success font-semibold">{formatNumber(row.fact)}</td>
                                <td className="px-4 py-3 text-accent font-semibold">{formatNumber(row.potential)}</td>
                                <td className="px-4 py-3 text-warning font-bold">{formatNumber(row.growthPotential)}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full ${row.costScore > 8 ? 'bg-red-500' : row.costScore > 5 ? 'bg-yellow-500' : 'bg-emerald-500'}`} 
                                                style={{ width: `${Math.min(100, row.costScore * 10)}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-xs text-gray-400">{row.costScore.toFixed(1)}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {filteredData.length === 0 && (<div className="text-center py-10 text-gray-500"><p>Нет данных, соответствующих вашим фильтрам.</p></div>)}
            </div>
            
            {totalPages > 1 && (
                 <div className="p-4 flex flex-col md:flex-row justify-between items-center text-sm text-gray-400 border-t border-gray-700">
                     <div className="mb-2 md:mb-0">Показано {paginatedData.length} из {filteredData.length} записей</div>
                     <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-600 rounded-md disabled:opacity-50">Назад</button>
                        <span>Стр. {currentPage} из {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-600 rounded-md disabled:opacity-50">Вперед</button>
                        <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="p-1.5 bg-gray-900/50 border border-gray-600 rounded-md focus:ring-accent focus:border-accent">
                            <option value={15}>15 / стр</option><option value={30}>30 / стр</option><option value={50}>50 / стр</option>
                        </select>
                    </div>
                 </div>
            )}
        </div>
    );
};

export default React.memo(ResultsTable);
