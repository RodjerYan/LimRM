import React, { useState, useMemo } from 'react';
import { AggregatedDataRow } from '../types';
import { formatLargeNumber, formatPercentage, sortData, SortDirection, SortKey } from '../utils/dataUtils';
import { SortIcon, SortUpIcon, SortDownIcon, SearchIcon } from './icons';

interface ResultsTableProps {
    data: AggregatedDataRow[];
    onRowClick: (rowData: AggregatedDataRow) => void;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ data, onRowClick }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('growthPotential');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('desc');
        }
    };

    const filteredData = useMemo(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        return data.filter(item => {
            return (
                item.rm.toLowerCase().includes(lowercasedFilter) ||
                item.city.toLowerCase().includes(lowercasedFilter) ||
                item.brand.toLowerCase().includes(lowercasedFilter)
            );
        });
    }, [data, searchTerm]);

    const sortedData = useMemo(() => {
        return sortData(filteredData, sortKey, sortDirection);
    }, [filteredData, sortKey, sortDirection]);

    const SortableHeader: React.FC<{ columnKey: SortKey; title: string; className?: string }> = ({ columnKey, title, className = '' }) => {
        const isSorting = sortKey === columnKey;
        return (
            <th className={`p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none ${className}`} onClick={() => handleSort(columnKey)}>
                <div className="flex items-center gap-2">
                    {title}
                    <div className="w-4 h-4">
                        {isSorting ? (sortDirection === 'asc' ? <SortUpIcon /> : <SortDownIcon />) : <SortIcon />}
                    </div>
                </div>
            </th>
        );
    };

    return (
        <div className="h-full flex flex-col">
            <div className="mb-4">
                 <div className="relative">
                    <input
                        type="text"
                        placeholder="Поиск по детальной таблице..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 w-full sm:w-72 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <SearchIcon />
                    </div>
                </div>
            </div>
            <div className="flex-grow overflow-auto custom-scrollbar">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-900/70 sticky top-0 backdrop-blur-sm">
                        <tr>
                            <SortableHeader columnKey="rm" title="РМ" />
                            <SortableHeader columnKey="city" title="Город" />
                            <SortableHeader columnKey="brand" title="Бренд" />
                            <SortableHeader columnKey="fact" title="Факт, кг/ед" className="text-right" />
                            <SortableHeader columnKey="potential" title="Потенциал, кг/ед" className="text-right" />
                            <SortableHeader columnKey="growthPotential" title="Рост, кг/ед" className="text-right" />
                            <SortableHeader columnKey="growthRate" title="Рост, %" className="text-right" />
                            <SortableHeader columnKey="potentialTTs" title="Потенц. ТТ, шт" className="text-right" />
                        </tr>
                    </thead>
                    <tbody className="bg-card-bg/50 divide-y divide-gray-800">
                        {sortedData.length > 0 ? sortedData.map((row) => (
                            <tr key={row.key} onClick={() => onRowClick(row)} className="hover:bg-indigo-500/10 cursor-pointer transition-colors duration-150">
                                <td className="p-3 text-sm text-white whitespace-nowrap">{row.rm}</td>
                                <td className="p-3 text-sm text-white whitespace-nowrap">{row.city}</td>
                                <td className="p-3 text-sm text-white whitespace-nowrap">{row.brand}</td>
                                <td className="p-3 text-sm text-gray-300 whitespace-nowrap text-right">{formatLargeNumber(row.fact)}</td>
                                <td className="p-3 text-sm text-gray-300 whitespace-nowrap text-right">{formatLargeNumber(row.potential)}</td>
                                <td className="p-3 text-sm text-success font-bold whitespace-nowrap text-right">{formatLargeNumber(row.growthPotential)}</td>
                                <td className={`p-3 text-sm font-bold whitespace-nowrap text-right ${row.growthRate > 50 ? 'text-success' : 'text-amber-400'}`}>
                                    {isFinite(row.growthRate) ? formatPercentage(row.growthRate) : '∞'}
                                </td>
                                <td className="p-3 text-sm text-accent whitespace-nowrap text-right">{formatLargeNumber(row.potentialTTs)}</td>
                            </tr>
                        )) : (
                             <tr>
                                <td colSpan={8} className="text-center p-8 text-gray-500">
                                    {data.length === 0 ? "Загрузите файл для начала анализа." : "Нет данных, соответствующих вашим фильтрам."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ResultsTable;