import React, { useState, useMemo, useCallback } from 'react';
import { AggregatedDataRow } from '../types';
import { SortIcon, SortUpIcon, SortDownIcon, SearchIcon, ExportIcon, CopyIcon, CheckIcon } from './icons';

type SortConfig = {
    key: keyof AggregatedDataRow;
    direction: 'ascending' | 'descending';
} | null;

const formatNumber = (num: number, digits = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(num);

const copyToClipboard = (text: string, callback: () => void) => {
    navigator.clipboard.writeText(text).then(() => {
        callback();
    });
};

const HeaderCell: React.FC<{
    label: string;
    sortKey: keyof AggregatedDataRow;
    sortConfig: SortConfig;
    onSort: (key: keyof AggregatedDataRow) => void;
    className?: string;
}> = ({ label, sortKey, sortConfig, onSort, className = '' }) => {
    const isSorted = sortConfig?.key === sortKey;
    const icon = isSorted
        ? (sortConfig?.direction === 'ascending' ? <SortUpIcon /> : <SortDownIcon />)
        : <SortIcon />;

    return (
        <th className={`px-4 py-3 cursor-pointer select-none ${className}`} onClick={() => onSort(sortKey)}>
            <div className="flex items-center gap-2">
                {label}
                <div className="w-4 h-4">{icon}</div>
            </div>
        </th>
    );
};

const ResultsTable: React.FC<{
    data: AggregatedDataRow[];
    onRowClick: (row: AggregatedDataRow) => void;
    disabled: boolean;
}> = ({ data, onRowClick, disabled }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'growthPotential', direction: 'descending' });
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const itemsPerPage = 15;

    const handleSort = (key: keyof AggregatedDataRow) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredData = useMemo(() => {
        let sortableData = [...data];

        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            sortableData = sortableData.filter(item =>
                item.clientName.toLowerCase().includes(lowercasedFilter) ||
                item.rm.toLowerCase().includes(lowercasedFilter) ||
                item.city.toLowerCase().includes(lowercasedFilter) ||
                item.brand.toLowerCase().includes(lowercasedFilter)
            );
        }

        if (sortConfig !== null) {
            sortableData.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
                }
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    return sortConfig.direction === 'ascending'
                        ? aValue.localeCompare(bValue, 'ru')
                        : bValue.localeCompare(aValue, 'ru');
                }
                return 0;
            });
        }
        return sortableData;
    }, [data, sortConfig, searchTerm]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedAndFilteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [sortedAndFilteredData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(sortedAndFilteredData.length / itemsPerPage);

    const exportToCSV = useCallback(() => {
        const headers = ['Клиент', 'РМ', 'Бренд', 'Город', 'Регион', 'Факт', 'Потенциал', 'Потенциал роста', 'Рост %'];
        const rows = sortedAndFilteredData.map(row => [
            `"${row.clientName.replace(/"/g, '""')}"`,
            row.rm,
            row.brand,
            row.city,
            row.region,
            row.fact,
            row.potential,
            row.growthPotential,
            row.growthPercentage.toFixed(2),
        ].join(','));
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "growth_potential_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [sortedAndFilteredData]);
    
    const handleCopy = (rowKey: string) => {
        const row = data.find(r => r.key === rowKey);
        if(!row) return;

        const textToCopy = `Клиент: ${row.clientName}\nГород: ${row.city}\nРМ: ${row.rm}\nФакт: ${formatNumber(row.fact)}\nПотенциал: ${formatNumber(row.potential)}\nРост: ${formatNumber(row.growthPotential)} (${formatNumber(row.growthPercentage, 1)}%)`;
        
        copyToClipboard(textToCopy, () => {
             setCopiedKey(rowKey);
             setTimeout(() => setCopiedKey(null), 2000);
        });
    }

    if (disabled && data.length === 0) {
        return (
            <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 text-center text-gray-400">
                {disabled ? 'Загрузите и отфильтруйте данные, чтобы увидеть результаты.' : 'Загрузка...'}
            </div>
        );
    }
    
    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold text-white">Результаты Анализа</h2>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <input
                            type="text"
                            placeholder="Поиск..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full p-2.5 pl-10 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                        />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <SearchIcon />
                        </div>
                    </div>
                    <button onClick={exportToCSV} className="bg-accent hover:bg-accent-dark text-white font-bold py-2.5 px-4 rounded-lg transition duration-200 flex items-center gap-2">
                        <ExportIcon />
                        <span className="hidden sm:inline">Экспорт</span>
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/70">
                        <tr>
                            <HeaderCell label="Клиент" sortKey="clientName" sortConfig={sortConfig} onSort={handleSort} />
                            <HeaderCell label="РМ" sortKey="rm" sortConfig={sortConfig} onSort={handleSort} />
                            <HeaderCell label="Город" sortKey="city" sortConfig={sortConfig} onSort={handleSort} />
                            <HeaderCell label="Факт" sortKey="fact" sortConfig={sortConfig} onSort={handleSort} className="text-right" />
                            <HeaderCell label="Потенциал" sortKey="potential" sortConfig={sortConfig} onSort={handleSort} className="text-right" />
                            <HeaderCell label="Рост (абс.)" sortKey="growthPotential" sortConfig={sortConfig} onSort={handleSort} className="text-right" />
                            <HeaderCell label="Рост (%)" sortKey="growthPercentage" sortConfig={sortConfig} onSort={handleSort} className="text-right" />
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map(row => (
                            <tr
                                key={row.key}
                                className="border-b border-gray-700 hover:bg-indigo-500/10 cursor-pointer"
                                onClick={() => onRowClick(row)}
                            >
                                <td className="px-4 py-3 font-medium text-white">{row.clientName}</td>
                                <td className="px-4 py-3">{row.rm}</td>
                                <td className="px-4 py-3">{row.city}</td>
                                <td className="px-4 py-3 text-right text-success">{formatNumber(row.fact)}</td>
                                <td className="px-4 py-3 text-right text-accent">{formatNumber(row.potential)}</td>
                                <td className="px-4 py-3 text-right text-warning font-semibold">{formatNumber(row.growthPotential)}</td>
                                <td className="px-4 py-3 text-right text-warning">{formatNumber(row.growthPercentage, 1)}%</td>
                                <td className="px-4 py-3 text-center">
                                     <button onClick={(e) => { e.stopPropagation(); handleCopy(row.key); }} title="Копировать сводку" className="text-gray-400 hover:text-white transition-colors">
                                        {copiedKey === row.key ? <CheckIcon /> : <CopyIcon />}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {paginatedData.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        <p>Нет данных для отображения.</p>
                        <p className="text-sm">Попробуйте изменить фильтры или поисковый запрос.</p>
                    </div>
                 )}
            </div>

            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                    <span className="text-sm text-gray-400">
                        Страница {currentPage} из {totalPages} (Всего: {sortedAndFilteredData.length})
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                        >
                            Назад
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                        >
                            Вперед
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResultsTable;
