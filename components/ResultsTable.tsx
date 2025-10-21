import React, { useState } from 'react';
import { AggregatedDataRow, SortConfig } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';
import * as XLSX from 'xlsx';
import DetailsModal from './DetailsModal';
import { SortIcon, SortUpIcon, SortDownIcon, SearchIcon, ExportIcon } from './icons';

interface ResultsTableProps {
    data: AggregatedDataRow[];
    isLoading: boolean;
    sortConfig: SortConfig;
    requestSort: (key: keyof AggregatedDataRow) => void;
    searchTerm: string;
    onSearchChange: (value: string) => void;
}

const TableHeader: React.FC<{
    sortConfig: SortConfig;
    requestSort: (key: keyof AggregatedDataRow) => void;
}> = ({ sortConfig, requestSort }) => {
    const headers: { key: keyof AggregatedDataRow, label: string, align: 'text-left' | 'text-center' | 'text-right' }[] = [
        { key: 'rm', label: 'РМ', align: 'text-left' },
        { key: 'brand', label: 'Бренд', align: 'text-left' },
        { key: 'city', label: 'Город', align: 'text-left' },
        { key: 'potentialTTs', label: 'ОКБ (шт)', align: 'text-center' },
        { key: 'fact', label: 'Факт (кг/ед)', align: 'text-right' },
        { key: 'potential', label: 'Потенциал (кг/ед)', align: 'text-right' },
        { key: 'growthPotential', label: 'Рост (кг/ед)', align: 'text-right' },
        { key: 'growthRate', label: 'Рост (%)', align: 'text-right' },
    ];

    const getSortIcon = (key: keyof AggregatedDataRow) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <SortIcon />;
        }
        if (sortConfig.direction === 'ascending') {
            return <SortUpIcon />;
        }
        return <SortDownIcon />;
    };

    const getJustifyClass = (align: string) => {
        if (align === 'text-center') return 'justify-center';
        if (align === 'text-right') return 'justify-end';
        return 'justify-start';
    };

    return (
        <thead className="bg-gray-900/60 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
                {headers.map(({ key, label, align }) => (
                    <th 
                        key={key} 
                        className={`px-4 py-3 ${align} text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer select-none`}
                        onClick={() => requestSort(key)}
                    >
                        <div className={`flex items-center ${getJustifyClass(align)}`}>
                            <span>{label}</span>
                            <span className="ml-1.5 w-4 h-4">{getSortIcon(key)}</span>
                        </div>
                    </th>
                ))}
            </tr>
        </thead>
    );
};

const TableRow: React.FC<{ item: AggregatedDataRow, onRowClick: (item: AggregatedDataRow) => void }> = ({ item, onRowClick }) => {
    return (
        <tr onClick={() => onRowClick(item)} className="hover:bg-gray-700/50 transition duration-150 cursor-pointer border-l-2 border-transparent hover:border-accent">
            <td className="px-4 py-3 text-sm font-medium text-white text-left">{item.rm}</td>
            <td className="px-4 py-3 text-sm text-gray-300 text-left">{item.brand}</td>
            <td className="px-4 py-3 text-sm text-gray-300 text-left">{item.city}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-300 font-mono">{item.potentialTTs}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right">{formatLargeNumber(item.fact)}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right">{formatLargeNumber(item.potential)}</td>
            <td className={`px-4 py-3 whitespace-nowrap text-sm font-bold ${item.growthPotential >= 0 ? 'text-green-400' : 'text-danger'} text-right`}>
                {formatLargeNumber(item.growthPotential)}
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-yellow-400 font-semibold text-right">
                 <div className="group relative inline-block">
                  {item.growthRate.toFixed(2)}%
                  <div className="absolute bottom-full mb-2 w-64 p-2 text-xs bg-gray-900 text-white rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 left-1/2 -translate-x-1/2">
                    Рост рассчитан на основе текущего факта, потенциала города ({item.potentialTTs} ТТ) и фактора насыщения рынка.
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900"></div>
                  </div>
                </div>
            </td>
        </tr>
    );
};

const SkeletonRow: React.FC = () => (
    <tr className="shimmer-effect">
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-3/4"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-2/3"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/4 mx-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2 ml-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2 ml-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2 ml-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/4 ml-auto"></div></td>
    </tr>
);

const ResultsTable: React.FC<ResultsTableProps> = ({ data, isLoading, sortConfig, requestSort, searchTerm, onSearchChange }) => {
    const [modalData, setModalData] = useState<AggregatedDataRow | null>(null);

    const handleRowClick = (item: AggregatedDataRow) => setModalData(item);
    const handleCloseModal = () => setModalData(null);
    
    const handleExport = () => {
        const headers = {
            rm: 'РМ',
            brand: 'Бренд',
            city: 'Город',
            potentialTTs: 'Общая Клиентская База (ОКБ, шт.)',
            fact: 'Факт (кг/ед)',
            potential: 'Потенциал (кг/ед)',
            growthPotential: 'Потенциал Роста (кг/ед)',
            growthRate: 'Рост (%)',
        };
        
        const exportData = data.map(row => ({
            [headers.rm]: row.rm,
            [headers.brand]: row.brand,
            [headers.city]: row.city,
            [headers.potentialTTs]: row.potentialTTs,
            [headers.fact]: Number(row.fact.toFixed(2)),
            [headers.potential]: Number(row.potential.toFixed(2)),
            [headers.growthPotential]: Number(row.growthPotential.toFixed(2)),
            [headers.growthRate]: `${row.growthRate.toFixed(2)}%`,
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Анализ_Рынка');

        const columnWidths = [
            { wch: 30 }, { wch: 25 }, { wch: 25 }, { wch: 35 },
            { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 15 },
        ];
        ws['!cols'] = columnWidths;

        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        ws['!autofilter'] = { ref: XLSX.utils.encode_range({s: range.s, e: {r: range.s.r, c: range.e.c }}) };

        const headerStyle = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "1F2937" } },
            alignment: { horizontal: "center", vertical: "center" }
        };

        for(let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({r:range.s.r, c:C});
            if(ws[cellAddress]) ws[cellAddress].s = headerStyle;
        }
        
        XLSX.writeFile(wb, 'Limkorm_Market_Analysis_Report.xlsx');
    };

    const renderBody = () => {
        if (isLoading) {
            return Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />);
        }
        if (data.length === 0) {
            return (<tr><td colSpan={8} className="p-6 text-center text-gray-400">Нет данных для отображения. Загрузите файл или измените фильтры/поиск.</td></tr>);
        }
        return data.map((item, index) => <TableRow key={`${item.rm}-${item.brand}-${item.city}-${index}`} item={item} onRowClick={handleRowClick} />);
    };

    return (
        <>
            <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-xl font-bold text-white">Детализированные результаты</h2>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-grow sm:flex-grow-0">
                            <input 
                                type="text"
                                placeholder="Поиск..."
                                value={searchTerm}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full sm:w-48 p-2.5 pl-10 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                            />
                             <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                <SearchIcon />
                            </div>
                        </div>
                         <button onClick={handleExport} className="p-2.5 bg-success/20 hover:bg-success/30 text-success font-bold rounded-lg transition duration-200" title="Экспорт в Excel (.xlsx)">
                            <ExportIcon />
                        </button>
                    </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden custom-scrollbar border border-gray-700/50 rounded-lg">
                    <table className="w-full divide-y divide-gray-800 table-fixed">
                        <TableHeader sortConfig={sortConfig} requestSort={requestSort} />
                        <tbody className="divide-y divide-gray-700/50">
                            {renderBody()}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalData && (
                <DetailsModal 
                    isOpen={!!modalData} 
                    onClose={handleCloseModal} 
                    data={modalData}
                />
            )}
        </>
    );
};

export default ResultsTable;