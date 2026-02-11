
import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import { MapPoint, PotentialClient } from '../types';
import { SearchIcon, FactIcon, PotentialIcon, ExportIcon } from './icons';

interface RegionDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rmName: string;
    regionName: string;
    activeClients: MapPoint[];
    potentialClients: PotentialClient[];
    onEditClient?: (client: MapPoint) => void;
}

const ClientTable: React.FC<{ 
    data: any[]; 
    type: 'active' | 'potential'; 
    title: string; 
    count: number;
    totalVolume?: number; 
    onRowClick?: (item: any) => void;
    onExport?: () => void;
}> = ({ data, type, title, count, totalVolume, onRowClick, onExport }) => {
    const [search, setSearch] = useState('');

    const filteredData = useMemo(() => {
        if (!search) return data;
        const lower = search.toLowerCase();
        return data.filter(item => 
            (item.name || '').toLowerCase().includes(lower) || 
            (item.address || '').toLowerCase().includes(lower)
        );
    }, [data, search]);

    const isGreen = type === 'active';
    const headerColor = isGreen ? 'text-emerald-700' : 'text-indigo-700';
    const bgColor = isGreen ? 'bg-emerald-50' : 'bg-indigo-50';
    const borderColor = isGreen ? 'border-emerald-100' : 'border-indigo-100';

    return (
        <div className={`flex flex-col h-full bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm`}>
            <div className={`p-5 border-b ${borderColor} ${bgColor}`}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className={`font-black text-lg flex items-center gap-2 ${headerColor}`}>
                        {isGreen ? <FactIcon small /> : <PotentialIcon small />}
                        {title}
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold bg-white border border-slate-200 px-2.5 py-1 rounded-xl text-slate-600 shadow-sm">
                            {count} ТТ
                        </span>
                        {onExport && (
                            <button 
                                onClick={onExport} 
                                className="p-1.5 bg-white rounded-xl text-slate-500 hover:text-indigo-600 transition-colors border border-slate-200 hover:border-indigo-300 shadow-sm"
                                title="Скачать список (XLSX)"
                            >
                                <ExportIcon small />
                            </button>
                        )}
                    </div>
                </div>
                {isGreen && totalVolume !== undefined && (
                    <div className="text-sm text-slate-600 mb-4 font-medium">
                        Общий объем: <span className="text-emerald-700 font-black font-mono">{new Intl.NumberFormat('ru-RU').format(totalVolume)} кг</span>
                    </div>
                )}
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Поиск..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none transition-all"
                    />
                    <div className="absolute left-3 top-2 text-slate-400"><SearchIcon /></div>
                </div>
            </div>
            
            <div className="flex-grow overflow-y-auto custom-scrollbar p-0 bg-white">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-100">
                        <tr>
                            <th className="px-5 py-3">Наименование</th>
                            <th className="px-5 py-3">Адрес</th>
                            {isGreen && <th className="px-5 py-3 text-center">Канал</th>}
                            <th className="px-5 py-3 text-right">{isGreen ? 'Факт (кг)' : 'Тип'}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredData.length > 0 ? (
                            filteredData.map((item, idx) => (
                                <tr 
                                    key={idx} 
                                    className={`hover:bg-slate-50 transition-colors group ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onRowClick && onRowClick(item)}
                                >
                                    <td className="px-5 py-3 font-bold text-slate-900 max-w-[200px] truncate group-hover:text-indigo-700 transition-colors" title={item.name}>
                                        {item.name}
                                    </td>
                                    <td className="px-5 py-3 text-slate-500 font-medium max-w-[280px] truncate" title={item.address}>
                                        {item.address}
                                    </td>
                                    {isGreen && (
                                        <td className="px-5 py-3 text-center text-slate-400 font-bold text-[9px] uppercase tracking-wider truncate max-w-[120px]" title={item.type}>
                                            {item.type || '—'}
                                        </td>
                                    )}
                                    <td className={`px-5 py-3 text-right font-mono font-bold ${isGreen ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {isGreen ? new Intl.NumberFormat('ru-RU').format(item.fact || 0) : (item.type || 'н/д')}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={isGreen ? 4 : 3} className="text-center py-10 text-slate-400 font-medium">
                                    Нет данных
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const RegionDetailsModal: React.FC<RegionDetailsModalProps> = ({ isOpen, onClose, rmName, regionName, activeClients, potentialClients, onEditClient }) => {
    
    const totalActiveVolume = activeClients.reduce((sum, c) => sum + (c.fact || 0), 0);
    const sortedActive = [...activeClients].sort((a, b) => (b.fact || 0) - (a.fact || 0));
    const sortedPotential = [...potentialClients].sort((a, b) => a.name.localeCompare(b.name));

    const totalUniverse = sortedActive.length + sortedPotential.length;
    const coveragePct = totalUniverse > 0 ? (sortedActive.length / totalUniverse) * 100 : 0;

    const handleExport = (data: any[], filenamePrefix: string) => {
        const isPotential = filenamePrefix.includes("Uncovered");
        let exportData;
        if (isPotential) {
            exportData = data.map(item => ({ 'Наименование': item.name, 'Адрес': item.address, 'Тип/Канал': item.type, 'Регион': regionName, 'Менеджер': rmName }));
        } else {
            exportData = data.map(item => ({ 'Наименование': item.name, 'Адрес': item.address, 'Тип/Канал': item.type, 'Факт (кг)': item.fact || 0, 'Регион': regionName, 'Менеджер': rmName }));
        }
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        XLSX.writeFile(wb, `${filenamePrefix}_${regionName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={
                <div className="flex flex-col w-full pr-12">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-xl font-black text-slate-900 tracking-tight">Детализация: {regionName}</span>
                            <span className="text-sm text-indigo-600 font-bold mt-1 block">Менеджер: {rmName}</span>
                        </div>
                        {/* Coverage Badge */}
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Покрытие</div>
                            <div className="flex items-center gap-3">
                                <span className="text-3xl font-mono font-black text-slate-900 tracking-tighter">{coveragePct.toFixed(1)}%</span>
                                <div className="text-[10px] text-slate-500 font-bold flex flex-col items-end leading-tight bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                                    <span>{sortedActive.length} из {totalUniverse}</span>
                                    <span>точек</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full h-2 bg-slate-200 rounded-full mt-4 overflow-hidden flex shadow-inner">
                        <div className="bg-emerald-500 h-full shadow-[0_0_10px_rgba(16,185,129,0.4)]" style={{ width: `${coveragePct}%` }} title="Активные"></div>
                        <div className="bg-indigo-200/50 h-full" style={{ width: `${100 - coveragePct}%` }} title="Свободный потенциал"></div>
                    </div>
                </div>
            }
            maxWidth="max-w-[96vw]"
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[70vh]">
                <ClientTable 
                    type="active" 
                    title="Активные Клиенты (АКБ)" 
                    data={sortedActive} 
                    count={sortedActive.length}
                    totalVolume={totalActiveVolume}
                    onRowClick={onEditClient ? (item) => onEditClient(item as MapPoint) : undefined}
                    onExport={() => handleExport(sortedActive, "Active_Clients")}
                />
                <ClientTable 
                    type="potential" 
                    title="Свободный Потенциал (ОКБ)" 
                    data={sortedPotential} 
                    count={sortedPotential.length}
                    onExport={() => handleExport(sortedPotential, "Uncovered_Potential")}
                />
            </div>
        </Modal>
    );
};

export default RegionDetailsModal;
