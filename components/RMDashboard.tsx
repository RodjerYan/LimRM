
import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import { AggregatedDataRow, MapPoint, SummaryMetrics, OkbStatus, OkbDataRow } from '../types';
import * as XLSX from 'xlsx';
import { ExportIcon, BrainIcon, SearchIcon } from './icons';

// --- Helper to extract SKUs from clients ---
const getUniqueSkus = (clients: MapPoint[]): string[] => {
    const skus = new Set<string>();
    clients.forEach(c => {
        // Try to find SKU in original row
        const row = c.originalRow || {};
        const sku = row['Номенклатура'] || row['Товар'] || row['SKU'] || row['Продукция'];
        if (sku) skus.add(String(sku));
    });
    return Array.from(skus).sort();
};

// --- Helper to extract Channels ---
const getUniqueChannels = (clients: MapPoint[]): string[] => {
    const channels = new Set<string>();
    clients.forEach(c => {
        if (c.type) channels.add(c.type);
    });
    return Array.from(channels).sort();
};

const BrandPackagingModal = ({ isOpen, onClose, regionName, brandName, rows, onAnalyze }: {
    isOpen: boolean;
    onClose: () => void;
    regionName: string;
    brandName: string;
    rows: AggregatedDataRow[];
    onAnalyze: (row: AggregatedDataRow) => void;
}) => {
    const totalFact = rows.reduce((sum, r) => sum + r.fact, 0);
    const totalPlan = rows.reduce((sum, r) => sum + r.potential, 0); // Using potential as plan proxy for now

    const handleExportXLSX = () => {
        const data = rows.map(r => ({
            'Фасовка': r.packaging,
            'SKU': getUniqueSkus(r.clients).join(', '),
            'Каналы': getUniqueChannels(r.clients).join(', '),
            'Факт': r.fact,
            'План': r.potential,
            'Рост': r.growthPotential
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Детализация");
        XLSX.writeFile(wb, `Details_${regionName}_${brandName}.xlsx`);
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Детализация ${regionName}: ${brandName}`} 
            maxWidth="max-w-[75vw]"
        >
            <div className="space-y-4">
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex justify-between items-center text-sm shadow-sm backdrop-blur-sm">
                    <div className="flex gap-8 items-center">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Фасовок</span>
                            <span className="text-white font-bold text-lg">{rows.length}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-700"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Общий Факт</span>
                            <span className="text-emerald-400 font-mono font-bold text-lg">{new Intl.NumberFormat('ru-RU').format(totalFact)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Общий План</span>
                            <span className="text-white font-mono font-bold text-lg">{new Intl.NumberFormat('ru-RU').format(totalPlan)}</span>
                        </div>
                    </div>
                    <button 
                        onClick={handleExportXLSX}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-lg transition-all border border-emerald-500/50 shadow-lg hover:shadow-emerald-500/20"
                    >
                        <ExportIcon />
                        Выгрузить в XLSX
                    </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900/40 shadow-inner">
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full text-sm text-left table-fixed">
                            <thead className="bg-gray-800/90 text-gray-400 font-semibold text-xs uppercase tracking-wider sticky top-0 z-20 backdrop-blur-md shadow-sm">
                                <tr>
                                    <th className="px-6 py-4 w-40 text-gray-300">Фасовка</th>
                                    <th className="px-6 py-4 w-auto">SKU (Ассортимент)</th>
                                    <th className="px-6 py-4 w-48 text-gray-300">Канал</th>
                                    <th className="px-6 py-4 w-32 text-right">Инд. Рост</th>
                                    <th className="px-6 py-4 w-32 text-right">Факт</th>
                                    <th className="px-6 py-4 w-32 text-right">План 2026</th>
                                    <th className="px-6 py-4 w-24 text-center">Анализ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-gray-300">
                                {rows.map((row) => {
                                    const skus = getUniqueSkus(row.clients);
                                    const channels = getUniqueChannels(row.clients);
                                    const growthPct = row.growthPercentage;

                                    return (
                                        <tr key={row.key} className="hover:bg-gray-800/60 transition-colors group align-top">
                                            <td className="px-6 py-4 font-bold text-white whitespace-nowrap bg-gray-900/30">
                                                {row.packaging}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="max-h-40 overflow-y-auto custom-scrollbar pr-2">
                                                    {skus.length > 0 ? (
                                                        <ul className="text-xs text-gray-400 space-y-1.5">
                                                            {skus.map((sku, idx) => (
                                                                <li key={idx} className="leading-relaxed flex items-start gap-2">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1.5 flex-shrink-0 group-hover:bg-indigo-500 transition-colors"></span>
                                                                    <span className="group-hover:text-gray-200 transition-colors">{sku}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-xs text-gray-600 italic">Не указано</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-indigo-300 font-medium">
                                                {channels.length > 0 ? (
                                                    <div className="flex flex-col gap-2">
                                                        {channels.map((ch, idx) => (
                                                            <div key={idx} className="border-b border-indigo-500/10 last:border-0 pb-1 last:pb-0 break-words whitespace-normal">
                                                                {ch}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono whitespace-nowrap align-middle">
                                                <span className={`font-bold ${growthPct > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-gray-300 whitespace-nowrap align-middle">
                                                {new Intl.NumberFormat('ru-RU').format(row.fact)}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-white font-bold whitespace-nowrap bg-gray-800/10 align-middle">
                                                {new Intl.NumberFormat('ru-RU').format(row.potential)}
                                            </td>
                                            <td className="px-6 py-4 text-center align-middle">
                                                <button
                                                    onClick={() => onAnalyze(row)}
                                                    className="p-2 bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition-all border border-indigo-500/20 hover:border-indigo-500 shadow-sm hover:shadow-indigo-500/40 active:scale-95"
                                                    title="Получить анализ от Джемини"
                                                >
                                                    <BrainIcon small />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    mode?: 'modal' | 'page';
    okbRegionCounts?: { [key: string]: number } | null;
    okbData?: OkbDataRow[];
    metrics?: SummaryMetrics | null;
    okbStatus?: OkbStatus | null;
    onActiveClientsClick?: () => void;
    onEditClient?: (client: MapPoint) => void;
}

export const RMDashboard: React.FC<RMDashboardProps> = ({ isOpen, onClose, data, mode = 'modal' }) => {
    const [selectedBrand, setSelectedBrand] = useState<{region: string, brand: string} | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const groupedData = useMemo(() => {
        const groups: Record<string, Record<string, AggregatedDataRow[]>> = {};
        data.forEach((row: AggregatedDataRow) => {
            if (!groups[row.region]) groups[row.region] = {};
            if (!groups[row.region][row.brand]) groups[row.region][row.brand] = [];
            groups[row.region][row.brand].push(row);
        });
        return groups;
    }, [data]);

    const regions = Object.keys(groupedData).sort();

    const content = (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Панель Регионального Менеджера</h2>
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Поиск..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="absolute right-3 top-2.5 text-gray-500"><SearchIcon small /></div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {regions.filter(r => r.toLowerCase().includes(searchTerm.toLowerCase())).map(region => (
                    <div key={region} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                        <h3 className="text-lg font-bold text-white mb-3">{region}</h3>
                        <div className="space-y-2">
                            {Object.keys(groupedData[region]).map(brand => {
                                const brandRows = groupedData[region][brand];
                                const brandFact = brandRows.reduce((sum, r) => sum + r.fact, 0);
                                return (
                                    <div 
                                        key={brand} 
                                        onClick={() => setSelectedBrand({ region, brand })}
                                        className="flex justify-between items-center p-2 bg-gray-900/50 rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
                                    >
                                        <span className="text-indigo-300 font-medium">{brand}</span>
                                        <span className="text-white font-mono">{new Intl.NumberFormat('ru-RU').format(brandFact)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {selectedBrand && (
                <BrandPackagingModal
                    isOpen={!!selectedBrand}
                    onClose={() => setSelectedBrand(null)}
                    regionName={selectedBrand.region}
                    brandName={selectedBrand.brand}
                    rows={groupedData[selectedBrand.region][selectedBrand.brand]}
                    onAnalyze={(row) => console.log('Analyze', row)}
                />
            )}
        </div>
    );

    if (mode === 'page') {
        return <div className="p-6">{content}</div>;
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="RM Dashboard" maxWidth="max-w-7xl">
            {content}
        </Modal>
    );
};
