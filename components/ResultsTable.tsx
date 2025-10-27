
import React, { useState, useMemo, useCallback } from 'react';
import { AggregatedDataRow } from '../types';
import { SortIcon, SortUpIcon, SortDownIcon, SearchIcon, ExportIcon } from './icons';
import { exportToExcel } from '../utils/dataUtils';

type SortKey = keyof AggregatedDataRow;
type SortDirection = 'asc' | 'desc';

const formatNumber = (num: number, digits = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(num);

const ResultsTable: React.FC<{ data: AggregatedDataRow[]; onRowClick: (row: AggregatedDataRow) => void; disabled: boolean }> = ({ data, onRowClick, disabled }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('growthPotential');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 15;

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const lowercasedFilter = searchTerm.toLowerCase();
        return data.filter(item =>
            item.rm.toLowerCase().includes(lowercasedFilter) ||
            item.clientName.toLowerCase().includes(lowercasedFilter) ||
            item.brand.toLowerCase().includes(lowercasedFilter) ||
            item.city.toLowerCase().includes(lowercasedFilter)
        );
    }, [data, searchTerm]);

    const sortedData = useMemo(() => {
        return [...filteredData].sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredData, sortKey, sortDirection]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * rowsPerPage;
        return sortedData.slice(startIndex, startIndex + rowsPerPage);
    }, [sortedData, currentPage, rowsPerPage]);

    const totalPages = Math.ceil(sortedData.length / rowsPerPage);

    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('desc');
        }
        setCurrentPage(1);
    }, [sortKey]);

    const handleExport = () => {
        exportToExcel(sortedData, `Анализ_потенциала_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const SortableHeader: React.FC<{ sortKeyName: SortKey; children: React.ReactNode; className?: string }> = ({ sortKeyName, children, className }) => (
        <th className={`px-4 py-3 cursor-pointer select-none ${className}`} onClick={() => handleSort(sortKeyName)}>
            <div className="flex items-center gap-2">
                {children}
                <span className="w-4 h-4">
                    {sortKey === sortKeyName ? (sortDirection === 'asc' ? <SortUpIcon /> : <SortDownIcon />) : <SortIcon />}
                </span>
            </div>
        </th>
    );

    if (disabled && data.length === 0) {
        return (
            <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 text-center text-gray-400">
                Загрузите и обработайте файл, чтобы увидеть результаты.
            </div>
        );
    }

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold text-white">Детализированные данные</h2>
                <div className="w-full sm:w-auto flex items-center gap-2">
                    <div className="relative w-full sm:w-64">
                        <input
                            type="text"
                            placeholder="Поиск..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full p-2.5 pl-10 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                        />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                    </div>
                     <button onClick={handleExport} title="Экспорт в Excel" className="p-2.5 bg-gray-900/50 border border-gray-700 rounded-lg text-gray-300 hover:bg-indigo-500/20 hover:text-white transition">
                        <ExportIcon />
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/50">
                        <tr>
                            <SortableHeader sortKeyName="clientName" className="w-1/4">Клиент</SortableHeader>
                            <SortableHeader sortKeyName="rm">РМ</SortableHeader>
                            <SortableHeader sortKeyName="brand">Бренд</SortableHeader>
                            <SortableHeader sortKeyName="city">Город</SortableHeader>
                            <SortableHeader sortKeyName="fact" className="text-right">Факт</SortableHeader>
                            <SortableHeader sortKeyName="potential" className="text-right">Потенциал</SortableHeader>
                            <SortableHeader sortKeyName="growthPotential" className="text-right">Рост (абс.)</SortableHeader>
                            <SortableHeader sortKeyName="growthPercentage" className="text-right">Рост (%)</SortableHeader>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row) => (
                            <tr key={row.key} onClick={() => onRowClick(row)} className="border-b border-gray-700 hover:bg-indigo-500/10 cursor-pointer transition-colors">
                                <td className="px-4 py-3 font-medium text-white truncate max-w-xs">{row.clientName}</td>
                                <td className="px-4 py-3">{row.rm}</td>
                                <td className="px-4 py-3">{row.brand}</td>
                                <td className="px-4 py-3">{row.city}</td>
                                <td className="px-4 py-3 text-right text-success font-mono">{formatNumber(row.fact)}</td>
                                <td className="px-4 py-3 text-right text-accent font-mono">{formatNumber(row.potential)}</td>
                                <td className="px-4 py-3 text-right text-warning font-mono font-bold">{formatNumber(row.growthPotential)}</td>
                                <td className="px-4 py-3 text-right text-warning font-mono">{formatNumber(row.growthPercentage, 1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {paginatedData.length === 0 && (
                <p className="text-center py-8 text-gray-500">Нет данных для отображения. Попробуйте изменить фильтры или поиск.</p>
            )}
            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 text-sm text-gray-400">
                    <p>Страница {currentPage} из {totalPages}</p>
                    <div className="flex gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50">Назад</button>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50">Вперед</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResultsTable;
