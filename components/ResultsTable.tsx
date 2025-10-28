

import React, { useState, useMemo } from 'react';
import { AggregatedDataRow } from '../types';
import { SortIcon, SortUpIcon, SortDownIcon, SearchIcon, CopyIcon, CheckIcon } from './icons';

const ResultsTable: React.FC<{
    data: AggregatedDataRow[];
    onRowClick: (row: AggregatedDataRow) => void;
    disabled: boolean;
}> = ({ data, onRowClick, disabled }) => {
    const [sortConfig, setSortConfig] = useState<{ key: keyof AggregatedDataRow; direction: 'ascending' | 'descending' } | null>({ key: 'growthPotential', direction: 'descending' });
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [copied, setCopied] = useState(false);

    const handleCopyToClipboard = () => {
        const sortedForExport = sortedData; // Use currently sorted/filtered data
        const tsv = [
            // Header
            ['Группа', 'РМ', 'Город', 'Бренд', 'Факт', 'Потенциал', 'Рост (абс.)', 'Рост (%)'].join('\t'),
            // Rows
            ...sortedForExport.map(row => [
                row.clientName,
                row.rm,
                row.city,
                row.brand,
                row.fact,
                row.potential,
                row.growthPotential,
                row.growthPercentage.toFixed(2),
            ].join('\t'))
        ].join('\n');

        navigator.clipboard.writeText(tsv).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(err => {
            console.error('Failed to copy data to clipboard:', err);
        });
    };

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const lowercasedFilter = searchTerm.toLowerCase();
        return data.filter(item =>
            item.clientName.toLowerCase().includes(lowercasedFilter) ||
            item.rm.toLowerCase().includes(lowercasedFilter) ||
            item.city.toLowerCase().includes(lowercasedFilter) ||
            item.brand.toLowerCase().includes(lowercasedFilter)
        );
    }, [data, searchTerm]);

    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    if (aValue < bValue) {
                        return sortConfig.direction === 'ascending' ? -1 : 1;
                    }
                    if (aValue > bValue) {
                        return sortConfig.direction === 'ascending' ? 1 : -1;
                    }
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredData, sortConfig]);

    const requestSort = (key: keyof AggregatedDataRow) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
        setCurrentPage(1);
    };

    const totalPages = Math.ceil(sortedData.length / rowsPerPage);
    const paginatedData = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const SortableHeader: React.FC<{ sortKey: keyof AggregatedDataRow; children: React.ReactNode }> = ({ sortKey, children }) => {
        const isSorted = sortConfig?.key === sortKey;
        const icon = isSorted
            ? (sortConfig?.direction === 'ascending' ? <SortUpIcon /> : <SortDownIcon />)
            : <SortIcon />;
        return (
            <th scope="col" className="px-4 py-3 cursor-pointer select-none" onClick={() => requestSort(sortKey)}>
                <div className="flex items-center gap-1.5">
                    {children}
                    <span className="w-4 h-4">{icon}</span>
                </div>
            </th>
        );
    };

    const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

    if (disabled && data.length === 0) {
        return (
             <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 opacity-50">
                <h2 className="text-xl font-bold mb-4 text-white">Результаты Анализа</h2>
                <div className="text-center py-10 text-gray-400">
                    <p>Загрузите и обработайте файл, чтобы увидеть данные.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-indigo-500/10 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Table Header */}
            <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white whitespace-nowrap">Результаты Анализа</h2>
                <div className="w-full md:w-auto flex items-center gap-3">
                    <div className="relative w-full md:w-64">
                        <input
                            type="text"
                            placeholder="Поиск по таблице..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full p-2 pl-10 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                        />
                         <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <SearchIcon />
                        </div>
                    </div>
                    <button
                        onClick={handleCopyToClipboard}
                        title="Скопировать в буфер обмена (TSV)"
                        className="p-2 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-300 hover:bg-indigo-500/20 hover:text-white transition"
                    >
                         {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0 backdrop-blur-sm">
                        <tr>
                            <th scope="col" className="px-4 py-3">Группа/Клиент</th>
                            <SortableHeader sortKey="rm">РМ</SortableHeader>
                            <SortableHeader sortKey="city">Город</SortableHeader>
                            <SortableHeader sortKey="brand">Бренд</SortableHeader>
                            <SortableHeader sortKey="fact">Факт</SortableHeader>
                            <SortableHeader sortKey="potential">Потенциал</SortableHeader>
                            <SortableHeader sortKey="growthPotential">Рост (абс.)</SortableHeader>
                            <SortableHeader sortKey="growthPercentage">Рост (%)</SortableHeader>
                        </tr>
                    </thead>
                    <tbody>
                         {paginatedData.map((row) => (
                            <tr key={row.key} className="border-b border-gray-700 hover:bg-indigo-500/10 cursor-pointer" onClick={() => onRowClick(row)}>
                                <th scope="row" className="px-4 py-3 font-medium text-white whitespace-nowrap">{row.clientName}</th>
                                <td className="px-4 py-3">{row.rm}</td>
                                <td className="px-4 py-3">{row.city}</td>
                                <td className="px-4 py-3">{row.brand}</td>
                                <td className="px-4 py-3 text-success font-semibold">{formatNumber(row.fact)}</td>
                                <td className="px-4 py-3 text-accent font-semibold">{formatNumber(row.potential)}</td>
                                <td className="px-4 py-3 text-warning font-bold">{formatNumber(row.growthPotential)}</td>
                                <td className="px-4 py-3 text-warning font-bold">{row.growthPercentage.toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {filteredData.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        <p>Нет данных, соответствующих вашим фильтрам.</p>
                    </div>
                )}
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
                 <div className="p-4 flex flex-col md:flex-row justify-between items-center text-sm text-gray-400 border-t border-gray-700">
                     <div className="mb-2 md:mb-0">
                         Показано {paginatedData.length} из {filteredData.length} записей
                     </div>
                     <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-600 rounded-md disabled:opacity-50">Назад</button>
                        <span>Стр. {currentPage} из {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-600 rounded-md disabled:opacity-50">Вперед</button>
                        <select
                            value={rowsPerPage}
                            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                            className="p-1.5 bg-gray-900/50 border border-gray-600 rounded-md focus:ring-accent focus:border-accent"
                        >
                            <option value={15}>15 / стр</option>
                            <option value={30}>30 / стр</option>
                            <option value={50}>50 / стр</option>
                        </select>
                    </div>
                 </div>
            )}

        </div>
    );
};

export default ResultsTable;