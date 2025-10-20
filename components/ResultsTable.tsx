import React, { useState } from 'react';
import { AggregatedDataRow, SortConfig } from '../types';
import { formatLargeNumber } from '../services/utils/dataUtils';
import * as XLSX from 'xlsx';
import DetailsModal from './DetailsModal';
import { SortIcon, SortUpIcon, SortDownIcon, SearchIcon, ExportIcon, ArrowUpIcon, ArrowDownIcon } from './icons';

interface ResultsTableProps {
    data: AggregatedDataRow[];
    isLoading: boolean;
    sortConfig: SortConfig;
    requestSort: (key: keyof AggregatedDataRow) => void;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    baseIncreasePercent: number;
    onBaseIncreaseChange: (value: number) => void;
}

const TableHeader: React.FC<{
    sortConfig: SortConfig;
    requestSort: (key: keyof AggregatedDataRow) => void;
}> = ({ sortConfig, requestSort }) => {
    const headers: { key: keyof AggregatedDataRow, label: string, align: 'text-left' | 'text-center' | 'text-right' }[] = [
        { key: 'rm', label: 'РМ', align: 'text-left' },
        { key: 'brand', label: 'Бренд', align: 'text-left' },
        { key: 'city', label: 'Регион', align: 'text-left' },
        { key: 'potentialTTs', label: 'ОКБ (шт)', align: 'text-center' },
        { key: 'fact', label: 'Факт (кг/ед)', align: 'text-right' },
        { key: 'newPlan', label: 'Новый План', align: 'text-right' },
        { key: 'potential', label: 'Потенциал', align: 'text-right' },
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
                        className={`px-4 py-3 ${align} text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-white`}
                        onClick={() => requestSort(key)}
                    >
                        <div className={`flex items-center gap-1.5 ${getJustifyClass(align)}`}>
                            <span>{label}</span>
                            <span className="w-4 h-4">{getSortIcon(key)}</span>
                        </div>
                    </th>
                ))}
            </tr>
        </thead>
    );
};

const TableRow: React.FC<{ item: AggregatedDataRow, onRowClick: (item: AggregatedDataRow) => void }> = ({ item, onRowClick }) => {
    const newPlanGrowthKg = item.newPlan && item.fact ? item.newPlan - item.fact : 0;
    const newPlanGrowthPercent = item.newPlan && item.fact > 0 ? (newPlanGrowthKg / item.fact) * 100 : 0;

    return (
        <tr onClick={() => onRowClick(item)} className="hover:bg-accent/10 transition duration-150 cursor-pointer border-b border-border-color">
            <td className="px-4 py-3 text-sm font-medium text-white text-left truncate">{item.rm}</td>
            <td className="px-4 py-3 text-sm text-gray-300 text-left truncate">{item.brand}</td>
            <td className="px-4 py-3 text-sm text-gray-300 text-left truncate">{item.city}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-300 font-mono">{item.potentialTTs}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right font-mono">{formatLargeNumber(item.fact)}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-accent font-bold text-right font-mono">
                {item.newPlan ? (
                    <div className="flex flex-col items-end leading-tight">
                        <span>{formatLargeNumber(item.newPlan)}</span>
                        {item.fact > 0 && item.newPlan > item.fact && (
                            <span className="text-xs text-accent-hover/70 font-normal mt-0.5 flex items-center gap-1">
                                <ArrowUpIcon /> (+{newPlanGrowthPercent.toFixed(1)}%)
                            </span>
                        )}
                    </div>
                ) : '-'}
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-info text-right font-mono">{formatLargeNumber(item.potential)}</td>
            <td className={`px-4 py-3 whitespace-nowrap text-sm font-bold text-right font-mono ${newPlanGrowthKg >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatLargeNumber(newPlanGrowthKg)}
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-warning font-semibold text-right font-mono">
                {newPlanGrowthPercent.toFixed(2)}%
            </td>
        </tr>
    );
};

const SkeletonRow: React.FC = () => (
    <tr className="shimmer-effect border-b border-border-color">
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-3/4"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-2/3"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/4 mx-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2 ml-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2 ml-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2 ml-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/2 ml-auto"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-700/50 rounded w-1/4 ml-auto"></div></td>
    </tr>
);

const ResultsTable: React.FC<ResultsTableProps> = ({ data, isLoading, sortConfig, requestSort, searchTerm, onSearchChange, baseIncreasePercent, onBaseIncreaseChange }) => {
    const [modalData, setModalData] = useState<AggregatedDataRow | null>(null);

    const handleRowClick = (item: AggregatedDataRow) => setModalData(item);
    const handleCloseModal = () => setModalData(null);
    
    const handleExport = () => {
        const headers = {
            rm: 'РМ',
            brand: 'Бренд',
            city: 'Город',
            activeTT: 'Активные ТТ (шт)',
            potentialTTs: 'Общая Клиентская База (ОКБ, шт.)',
            fact: 'Факт (кг/ед)',
            newPlan: 'Новый План (кг/ед)',
            potential: 'Потенциал (кг/ед)',
            growthPotential: 'Потенциал Роста (кг/ед)',
            growthRate: 'Рост (%)',
        };
        
        const exportData = data.map(row => ({
            [headers.rm]: row.rm,
            [headers.brand]: row.brand,
            [headers.city]: row.city,
            [headers.activeTT]: row.activeTT,
            [headers.potentialTTs]: row.potentialTTs,
            [headers.fact]: Number(row.fact.toFixed(2)),
            [headers.newPlan]: row.newPlan ? Number(row.newPlan.toFixed(2)) : 0,
            [headers.potential]: Number(row.potential.toFixed(2)),
            [headers.growthPotential]: Number(row.growthPotential.toFixed(2)),
            [headers.growthRate]: `${row.growthRate.toFixed(2)}%`,
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Анализ_Рынка_План');

        ws['!cols'] = [
            { wch: 30 }, { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 35 },
            { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 28 }, { wch: 15 },
        ];

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

    const handleBaseIncreaseInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '') {
            onBaseIncreaseChange(0);
            return;
        }
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
            onBaseIncreaseChange(numValue);
        }
    };

    const renderBody = () => {
        if (isLoading) {
            return Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />);
        }
        if (data.length === 0) {
            return (<tr><td colSpan={9} className="p-6 text-center text-gray-400">Нет данных для отображения. Загрузите файл или измените фильтры/поиск.</td></tr>);
        }
        return data.map((item, index) => <TableRow key={`${item.rm}-${item.brand}-${item.city}-${index}`} item={item} onRowClick={handleRowClick} />);
    };

    return (
        <>
            <div className="bg-card-bg/80 backdrop-blur-sm p-4 sm:p-6 rounded-2xl shadow-lg border border-border-color">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-xl font-bold text-white whitespace-nowrap self-start sm:self-center">Детализированные результаты</h2>
                    <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
                        <div className="relative group">
                            <label htmlFor="baseIncreaseInput" className="absolute -top-2 left-2 text-xs text-gray-400 bg-card-bg px-1 hidden sm:block">Базовый рост</label>
                            <input
                                id="baseIncreaseInput"
                                aria-label="Базовый рост в процентах"
                                type="number"
                                value={baseIncreasePercent}
                                onChange={handleBaseIncreaseInputChange}
                                title="Базовый рост (%)"
                                className="w-28 p-2.5 bg-gray-900/50 border border-border-color rounded-lg focus:ring-2 focus:ring-accent-focus focus:border-accent text-white placeholder-gray-500 transition text-center"
                                min="0"
                                step="0.1"
                                disabled={isLoading || data.length === 0}
                            />
                        </div>
                        <div className="relative flex-grow sm:flex-grow-0">
                            <input 
                                type="text"
                                placeholder="Поиск..."
                                value={searchTerm}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full sm:w-48 p-2.5 pl-10 bg-gray-900/50 border border-border-color rounded-lg focus:ring-2 focus:ring-accent-focus focus:border-accent text-white placeholder-gray-500 transition"
                            />
                             <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                <SearchIcon />
                            </div>
                        </div>
                         <button onClick={handleExport} title="Экспорт в Excel" disabled={data.length === 0} className="p-2.5 bg-success/20 hover:bg-success/30 text-success font-bold rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                            <ExportIcon />
                        </button>
                    </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto overflow-x-auto custom-scrollbar border border-border-color rounded-lg">
                    <table className="w-full min-w-[1000px] table-fixed">
                        <TableHeader sortConfig={sortConfig} requestSort={requestSort} />
                        <tbody className="divide-y divide-border-color">
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