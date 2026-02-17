
import React, { useState, useMemo } from 'react';
import { AggregatedDataRow, SummaryMetrics, OkbStatus, MapPoint, OkbDataRow } from '../types';
import { TargetIcon, CalculatorIcon, TrendingUpIcon, UsersIcon, SearchIcon, ArrowLeftIcon, FactIcon } from './icons';
import Modal from './Modal';
import ClientsListModal from './ClientsListModal';
import RMAnalysisModal from './RMAnalysisModal';

interface RMDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow[];
    metrics: SummaryMetrics | null;
    okbRegionCounts: { [key: string]: number };
    mode: 'page' | 'modal';
    okbData: OkbDataRow[];
    okbStatus: OkbStatus | null;
    onEditClient: (client: MapPoint) => void;
    startDate: string;
    endDate: string;
}

export const RMDashboard: React.FC<RMDashboardProps> = ({ 
    isOpen, onClose, data, metrics, okbRegionCounts, mode, okbData, okbStatus, onEditClient, startDate, endDate 
}) => {
    const [expandedRM, setExpandedRM] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAbc, setSelectedAbc] = useState<{ rm: string, category: 'A'|'B'|'C' } | null>(null);
    const [selectedAnalysisRM, setSelectedAnalysisRM] = useState<any | null>(null);

    // Aggregate Data by RM
    const rmMetrics = useMemo(() => {
        const rms: Record<string, any> = {};

        data.forEach(row => {
            const rmName = row.rm;
            if (!rms[rmName]) {
                rms[rmName] = {
                    rmName,
                    totalFact: 0,
                    clients: new Map<string, MapPoint>(),
                    regions: new Set<string>(),
                    rowsCount: 0
                };
            }
            
            rms[rmName].totalFact += row.fact;
            rms[rmName].rowsCount += 1;
            rms[rmName].regions.add(row.region);
            
            row.clients.forEach(c => {
                if (!rms[rmName].clients.has(c.key)) {
                    rms[rmName].clients.set(c.key, c);
                }
            });
        });

        return Object.values(rms).map(rm => {
            const clients = Array.from(rm.clients.values()) as MapPoint[];
            const totalClients = clients.length;
            
            // ABC Logic
            const countA = clients.filter(c => c.abcCategory === 'A').length;
            const countB = clients.filter(c => c.abcCategory === 'B').length;
            const countC = clients.filter(c => c.abcCategory === 'C').length;
            
            const factA = clients.filter(c => c.abcCategory === 'A').reduce((s, c) => s + (c.fact || 0), 0);
            const factB = clients.filter(c => c.abcCategory === 'B').reduce((s, c) => s + (c.fact || 0), 0);
            const factC = clients.filter(c => c.abcCategory === 'C').reduce((s, c) => s + (c.fact || 0), 0);

            // Market Share
            // Sum OKB counts for regions where RM operates
            let totalOkbInRegions = 0;
            rm.regions.forEach((reg: string) => {
                totalOkbInRegions += (okbRegionCounts[reg] || 0);
            });
            const marketShare = totalOkbInRegions > 0 ? totalClients / totalOkbInRegions : 0;

            const avgFactPerClient = totalClients > 0 ? rm.totalFact / totalClients : 0;
            const avgSkuPerClient = totalClients > 0 ? rm.rowsCount / totalClients : 0;
            const avgSalesPerSku = rm.rowsCount > 0 ? rm.totalFact / rm.rowsCount : 0;

            // Simple Plan Logic (Stub for visualization)
            const recommendedGrowthPct = marketShare < 0.2 ? 25 : (marketShare < 0.4 ? 15 : 5);

            return {
                ...rm,
                totalClients,
                countA, countB, countC,
                factA, factB, factC,
                marketShare,
                avgFactPerClient,
                avgSkuPerClient,
                avgSalesPerSku,
                recommendedGrowthPct
            };
        }).sort((a: any, b: any) => b.totalFact - a.totalFact);
    }, [data, okbRegionCounts]);

    const filteredRMs = useMemo(() => {
        return rmMetrics.filter((rm: any) => rm.rmName.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [rmMetrics, searchTerm]);

    const handleShowAbcClients = (rmName: string, category: 'A' | 'B' | 'C') => {
        setSelectedAbc({ rm: rmName, category });
    };

    const getSelectedAbcClients = () => {
        if (!selectedAbc) return [];
        const rm = rmMetrics.find((r: any) => r.rmName === selectedAbc.rm);
        if (!rm) return [];
        const clients = Array.from(rm.clients.values()) as MapPoint[];
        return clients.filter(c => c.abcCategory === selectedAbc.category);
    };

    const formatNum = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

    if (mode === 'page' && !isOpen) return null;

    return (
        <div className={`fixed inset-0 z-50 bg-white overflow-hidden flex flex-col ${mode === 'modal' ? 'rounded-2xl m-8 shadow-2xl border' : ''}`}>
            {/* Header */}
            <div className="px-8 py-5 border-b border-gray-200 flex justify-between items-center bg-white z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <ArrowLeftIcon />
                    </button>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900">Дашборд План/Факт</h2>
                        <p className="text-sm text-gray-500">Декомпозиция по Региональным Менеджерам</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Поиск менеджера..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl w-64 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                        <div className="absolute left-3 top-2.5 text-gray-400"><SearchIcon small /></div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-grow overflow-y-auto custom-scrollbar p-8 bg-gray-50/30">
                <div className="space-y-6">
                    {filteredRMs.map((rm: any) => (
                        <div key={rm.rmName} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
                            {/* Card Header */}
                            <div className="p-6 cursor-pointer" onClick={() => setExpandedRM(expandedRM === rm.rmName ? null : rm.rmName)}>
                                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="flex items-center gap-4 w-full md:w-1/3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-md ${expandedRM === rm.rmName ? 'bg-indigo-600' : 'bg-gray-400'}`}>
                                            {rm.rmName.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">{rm.rmName}</h3>
                                            <div className="text-xs text-gray-500 mt-1 flex gap-2">
                                                <span>{rm.totalClients} клиентов</span>
                                                <span className="text-gray-300">•</span>
                                                <span>{rm.regions.size} регионов</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between w-full md:w-2/3 gap-8">
                                        <div className="text-center">
                                            <div className="text-xs text-gray-400 uppercase font-bold mb-1">Факт продаж</div>
                                            <div className="text-2xl font-black text-gray-900">{formatNum(rm.totalFact)} <span className="text-sm text-gray-400 font-medium">кг</span></div>
                                        </div>
                                        
                                        <div className="text-center hidden sm:block">
                                            <div className="text-xs text-gray-400 uppercase font-bold mb-1">Доля (M.Share)</div>
                                            <div className={`text-xl font-bold ${(rm.marketShare * 100) > 30 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                {(rm.marketShare * 100).toFixed(1)}%
                                            </div>
                                        </div>

                                        <div className="text-center hidden lg:block">
                                            <div className="text-xs text-gray-400 uppercase font-bold mb-1">Реком. Рост</div>
                                            <div className="text-xl font-bold text-indigo-600">
                                                +{rm.recommendedGrowthPct}%
                                            </div>
                                        </div>

                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setSelectedAnalysisRM(rm); }}
                                            className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                                        >
                                            <TrendingUpIcon small />
                                            AI Анализ
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {expandedRM === rm.rmName && (
                                <div className="border-t border-gray-200 bg-gray-50/50 p-6 animate-fade-in-down">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                            <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2"><TargetIcon small /> Эффективность Клиентской Базы</h4>
                                            <div className="space-y-4">
                                                {/* Updated Colors for Category A */}
                                                <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors" onClick={() => handleShowAbcClients(rm.rmName, 'A')} title="Показать список клиентов категории A">
                                                    <span className="text-xs text-emerald-500 font-bold underline decoration-dotted underline-offset-2">Категория A (80% объема)</span>
                                                    <span className="text-xs text-gray-700">{rm.countA} клиентов / {new Intl.NumberFormat('ru-RU').format(rm.factA)} кг</span>
                                                </div>
                                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${(rm.factA / rm.totalFact) * 100}%` }}></div></div>
                                                
                                                {/* Updated Colors for Category B */}
                                                <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors" onClick={() => handleShowAbcClients(rm.rmName, 'B')} title="Показать список клиентов категории B">
                                                    <span className="text-xs text-amber-500 font-bold underline decoration-dotted underline-offset-2">Категория B (15% объема)</span>
                                                    <span className="text-xs text-gray-700">{rm.countB} клиентов / {new Intl.NumberFormat('ru-RU').format(rm.factB)} кг</span>
                                                </div>
                                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(rm.factB / rm.totalFact) * 100}%` }}></div></div>
                                                
                                                <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors" onClick={() => handleShowAbcClients(rm.rmName, 'C')} title="Показать список клиентов категории C">
                                                    <span className="text-xs text-gray-400 font-bold underline decoration-dotted underline-offset-2">Категория C (5% объема)</span>
                                                    <span className="text-xs text-gray-700">{rm.countC} клиентов / {new Intl.NumberFormat('ru-RU').format(rm.factC)} кг</span>
                                                </div>
                                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-gray-400" style={{ width: `${(rm.factC / rm.totalFact) * 100}%` }}></div></div>
                                            </div>
                                        </div>
                                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                            <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2"><CalculatorIcon small /> KPI и Качество Продаж</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100"><div className="text-xs text-gray-500 mb-1">Доля рынка (Покрытие)</div><div className="text-lg font-bold text-gray-900">{(rm.marketShare * 100).toFixed(1)}%</div><div className="text-[10px] text-gray-400 mt-1">от всей базы ОКБ</div></div>
                                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100"><div className="text-xs text-gray-500 mb-1">Средний чек (Объем)</div><div className="text-lg font-bold text-gray-900">{new Intl.NumberFormat('ru-RU').format(Math.round(rm.avgFactPerClient))} кг</div><div className="text-[10px] text-gray-400 mt-1">на 1 активную ТТ</div></div>
                                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100"><div className="text-xs text-gray-500 mb-1">Ширина полки (SKU)</div><div className="text-lg font-bold text-gray-900">{rm.avgSkuPerClient?.toFixed(1)}</div><div className="text-[10px] text-gray-400 mt-1">ср. позиций в точке</div></div>
                                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100"><div className="text-xs text-gray-500 mb-1">Качество (Velocity)</div><div className="text-lg font-bold text-gray-900">{new Intl.NumberFormat('ru-RU').format(Math.round(rm.avgSalesPerSku || 0))} кг</div><div className="text-[10px] text-gray-400 mt-1">продаж на 1 SKU</div></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Modals */}
            <ClientsListModal 
                isOpen={!!selectedAbc} 
                onClose={() => setSelectedAbc(null)} 
                title={`Клиенты категории ${selectedAbc?.category} (${selectedAbc?.rm})`}
                clients={getSelectedAbcClients()}
                onClientSelect={onEditClient}
                onStartEdit={(c) => {
                    onEditClient(c);
                    setSelectedAbc(null); // Close list to focus on edit
                }}
                showAbcLegend
            />

            <RMAnalysisModal 
                isOpen={!!selectedAnalysisRM} 
                onClose={() => setSelectedAnalysisRM(null)} 
                rmData={selectedAnalysisRM}
                baseRate={15}
                dateRange={startDate && endDate ? `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}` : undefined}
            />
        </div>
    );
};
