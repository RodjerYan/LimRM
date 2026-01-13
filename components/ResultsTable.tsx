
import React, { useState, useMemo } from 'react';
import * as ReactWindow from 'react-window';
import { AggregatedDataRow } from '../types';
import { findAddressInRow } from '../utils/dataUtils';
import { SortIcon, SortUpIcon, SortDownIcon, SearchIcon, CopyIcon, CheckIcon, WarningIcon } from './icons';

// FIX: Locally define ListChildComponentProps to resolve "has no exported member" error
interface ListChildComponentProps {
    index: number;
    style: React.CSSProperties;
    data?: any;
    isScrolling?: boolean;
}

// FIX: Use wildcard import and cast to avoid "has no exported member" error for FixedSizeList
const List = (ReactWindow as any).FixedSizeList;

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
    const [searchTerm, setSearchTerm] = useState('');
    const [copied, setCopied] = useState(false);

    // Mock Cost to Serve Calculation
    const enrichWithCost = (row: AggregatedDataRow) => {
        const volumeFactor = row.fact > 500 ? 1 : (row.fact > 100 ? 2 : 3);
        const regionCost = row.region.length % 3 + 1; 
        return (volumeFactor * regionCost) * 1.5; 
    };

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
        if (!searchTerm) return data.map(d => ({ ...d, costScore: enrichWithCost(d) }));
        const lowercasedFilter = searchTerm.toLowerCase().trim();
        
        return data.filter(item => {
            if (item.clientName.toLowerCase().includes(lowercasedFilter)) return true;
            if (item.rm.toLowerCase().includes(lowercasedFilter)) return true;
            if (item.region.toLowerCase().includes(lowercasedFilter)) return true;
            if (item.brand.toLowerCase().includes(lowercasedFilter)) return true;
            if (item.packaging.toLowerCase().includes(lowercasedFilter)) return true;
            return item.clients.some(client => {
                if (client.address.toLowerCase().includes(lowercasedFilter)) return true;
                if (client.name.toLowerCase().includes(lowercasedFilter)) return true;
                if (client.originalRow) {
                    const rawAddress = findAddressInRow(client.originalRow);
                    if (rawAddress && rawAddress.toLowerCase().includes(lowercasedFilter)) return true;
                }
                return false;
            });
        }).map(d => ({ ...d, costScore: enrichWithCost(d) }));
    }, [data, searchTerm]);

    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = (a as any)[sortConfig.key];
                const bValue = (b as any)[sortConfig.key];
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
    };

    const SortableHeader: React.FC<{ sortKey: keyof AggregatedDataRow | 'costScore'; children: React.ReactNode; title?: string; widthClass: string }> = ({ sortKey, children, title, widthClass }) => {
        const isSorted = sortConfig?.key === sortKey;
        const icon = isSorted ? (sortConfig?.direction === 'ascending' ? <SortUpIcon /> : <SortDownIcon />) : <SortIcon />;
        return (
            <div className={`px-4 py-3 cursor-pointer select-none font-semibold uppercase text-xs flex items-center gap-1.5 ${widthClass}`} onClick={() => requestSort(sortKey)} title={title}>
                {children}<span className="w-4 h-4">{icon}</span>
            </div>
        );
    };

    const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);

    const Row = ({ index, style }: ListChildComponentProps) => {
        const row: any = sortedData[index];
        return (
            <div style={style} className="flex border-b border-gray-700 hover:bg-indigo-500/10 cursor-pointer transition-colors items-center" onClick={() => onRowClick(row)}>
                <div className="px-4 py-3 font-medium text-white whitespace-nowrap w-[20%] truncate" title={row.clientName}>{row.clientName}</div>
                <div className="px-4 py-3 w-[10%] truncate" title={row.rm}>{row.rm}</div>
                <div className="px-4 py-3 w-[10%] truncate" title={row.region}>{row.region}</div>
                <div className="px-4 py-3 w-[10%] text-accent cursor-pointer hover:text-white hover:underline transition-colors font-medium truncate" onClick={(e) => { if (onPlanClick) { e.stopPropagation(); onPlanClick(row); } }} title={row.brand}>{row.brand}</div>
                <div className="px-4 py-3 w-[10%] truncate" title={row.packaging}>{row.packaging}</div>
                <div className="px-4 py-3 w-[10%] text-success font-semibold text-right">{formatNumber(row.fact)}</div>
                <div className="px-4 py-3 w-[10%] text-accent font-semibold text-right">{formatNumber(row.potential)}</div>
                <div className="px-4 py-3 w-[10%] text-warning font-bold text-right">{formatNumber(row.growthPotential)}</div>
                <div className="px-4 py-3 w-[10%]">
                    <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full ${row.costScore > 8 ? 'bg-red-500' : row.costScore > 5 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, row.costScore * 10)}%` }}></div>
                        </div>
                        <span className="text-xs text-gray-400">{row.costScore.toFixed(1)}</span>
                    </div>
                </div>
            </div>
        );
    };

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
                <h2 className="text-xl font-bold text-white whitespace-nowrap">Результаты Анализа <span className="text-sm font-normal text-gray-400">({sortedData.length})</span></h2>
                <div className="w-full md:w-auto flex items-center gap-3">
                    {unidentifiedRowsCount > 0 && (
                        <button onClick={onUnidentifiedClick} className="bg-danger/80 hover:bg-danger text-white font-bold py-2 px-4 rounded-lg transition duration-200 flex items-center gap-2 animate-pulse flex-shrink-0" title="Нажмите, чтобы исправить адреса">
                            <WarningIcon/> <span>Неопределенные ({unidentifiedRowsCount})</span>
                        </button>
                    )}
                    <div className="relative w-full md:w-64">
                        <input type="text" placeholder="Поиск..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 pl-10 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition" />
                         <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
                    </div>
                    <button onClick={handleCopyToClipboard} title="Скопировать" className="p-2 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-300 hover:bg-indigo-500/20 hover:text-white transition">
                         {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                </div>
            </div>
            
            {/* Header */}
            <div className="flex bg-gray-900/70 border-b border-gray-700 text-gray-400">
                <div className="px-4 py-3 font-semibold uppercase text-xs w-[20%]">Группа/Клиент</div>
                <SortableHeader sortKey="rm" widthClass="w-[10%]">РМ</SortableHeader>
                <SortableHeader sortKey="region" widthClass="w-[10%]">Регион</SortableHeader>
                <SortableHeader sortKey="brand" widthClass="w-[10%]">Бренд</SortableHeader>
                <SortableHeader sortKey="packaging" widthClass="w-[10%]">Фасовка</SortableHeader>
                <SortableHeader sortKey="fact" widthClass="w-[10%] justify-end">Факт</SortableHeader>
                <SortableHeader sortKey="potential" widthClass="w-[10%] justify-end">Потенциал</SortableHeader>
                <SortableHeader sortKey="growthPotential" widthClass="w-[10%] justify-end">Рост</SortableHeader>
                <SortableHeader sortKey="costScore" widthClass="w-[10%]" title="Cost-to-Serve">Cost Score</SortableHeader>
            </div>

            {/* Virtual List */}
            <div className="w-full h-[600px] bg-gray-900/20">
                {sortedData.length > 0 ? (
                    <List
                        height={600}
                        itemCount={sortedData.length}
                        itemSize={50}
                        width="100%"
                        className="custom-scrollbar"
                    >
                        {Row}
                    </List>
                ) : (
                    <div className="text-center py-20 text-gray-500"><p>Нет данных.</p></div>
                )}
            </div>
        </div>
    );
};

export default ResultsTable;
