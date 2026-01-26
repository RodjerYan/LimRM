
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
    const headerColor = isGreen ? 'text-emerald-400' : 'text-blue-400';
    const bgColor = isGreen ? 'bg-emerald-500/10' : 'bg-blue-500/10';
    const borderColor = isGreen ? 'border-emerald-500/20' : 'border-blue-500/20';

    return (
        <div className={`flex flex-col h-full bg-gray-900/50 rounded-xl border ${borderColor} overflow-hidden`}>
            <div className={`p-4 border-b ${borderColor} ${bgColor}`}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className={`font-bold text-lg flex items-center gap-2 ${headerColor}`}>
                        {isGreen ? <FactIcon small /> : <PotentialIcon small />}
                        {title}
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-gray-900 px-2 py-1 rounded text-gray-300">
                            {count} ТТ
                        </span>
                        {onExport && (
                            <button 
                                onClick={onExport} 
                                className="p-1.5 bg-gray-900 rounded-lg text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-500"
                                title="Скачать список (XLSX)"
                            >
                                <ExportIcon small />
                            </button>
                        )}
                    </div>
                </div>
                {isGreen && totalVolume !== undefined && (
                    <div className="text-sm text-gray-400 mb-3">
                        Общий объем: <span className="text-white font-bold">{new Intl.NumberFormat('ru-RU').format(totalVolume)} кг</span>
                    </div>
                )}
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Поиск..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg py-1.5 pl-8 pr-2 text-xs text-white focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="absolute left-2.5 top-1.5 text-gray-500"><SearchIcon /></div>
                </div>
            </div>
            
            <div className="flex-grow overflow-y-auto custom-scrollbar p-0">
                <table className="w-full text-left text-xs">
                    <thead className="bg-gray-800/50 text-gray-400 sticky top-0 backdrop-blur-sm">
                        <tr>
                            <th className="px-4 py-2">Наименование</th>
                            <th className="px-4 py-2">Адрес</th>
                            {isGreen && <th className="px-4 py-2 text-center">Канал продаж</th>}
                            <th className="px-4 py-2 text-right">{isGreen ? 'Факт (кг)' : 'Тип'}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filteredData.length > 0 ? (
                            filteredData.map((item, idx) => (
                                <tr 
                                    key={idx} 
                                    className={`hover:bg-white/5 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onRowClick && onRowClick(item)}
                                >
                                    <td className="px-4 py-2 font-medium text-gray-300 max-w-[220px] truncate" title={item.name}>
                                        {item.name}
                                    </td>
                                    <td className="px-4 py-2 text-gray-500 max-w-[350px] truncate" title={item.address}>
                                        {item.address}
                                    </td>
                                    {isGreen && (
                                        <td className="px-4 py-2 text-center text-gray-400 text-[10px] uppercase tracking-wider truncate max-w-[150px]" title={item.type}>
                                            {item.type || '—'}
                                        </td>
                                    )}
                                    <td className={`px-4 py-2 text-right font-mono ${isGreen ? 'text-emerald-300' : 'text-gray-400'}`}>
                                        {isGreen ? new Intl.NumberFormat('ru-RU').format(item.fact || 0) : (item.type || 'н/д')}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={isGreen ? 4 : 3} className="text-center py-8 text-gray-500">
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

    // Sort active by Fact descending
    const sortedActive = [...activeClients].sort((a, b) => (b.fact || 0) - (a.fact || 0));
    // Sort potential by Name
    const sortedPotential = [...potentialClients].sort((a, b) => a.name.localeCompare(b.name));

    const totalUniverse = sortedActive.length + sortedPotential.length;
    const coveragePct = totalUniverse > 0 ? (sortedActive.length / totalUniverse) * 100 : 0;

    const handleExport = (data: any[], filenamePrefix: string) => {
        // Определяем, являются ли данные списком потенциальных клиентов
        const isPotential = filenamePrefix.includes("Uncovered");

        let exportData;

        if (isPotential) {
            // Для потенциальных клиентов убираем колонку с фактом
            exportData = data.map(item => ({
                'Наименование': item.name,
                'Адрес': item.address,
                'Тип/Канал': item.type,
                'Регион': regionName,
                'Менеджер': rmName
            }));
        } else {
            // Для активных клиентов оставляем все как есть
            exportData = data.map(item => ({
                'Наименование': item.name,
                'Адрес': item.address,
                'Тип/Канал': item.type,
                'Факт (кг)': item.fact || 0,
                'Регион': regionName,
                'Менеджер': rmName
            }));
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
                            <span className="text-xl font-bold">Детализация: {regionName}</span>
                            <span className="text-sm text-indigo-400 font-normal mt-1 block">Менеджер: {rmName}</span>
                        </div>
                        {/* Coverage Badge */}
                        <div className="text-right">
                            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Покрытие</div>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-mono font-bold text-white">{coveragePct.toFixed(1)}%</span>
                                <div className="text-[10px] text-gray-400 flex flex-col items-end leading-tight">
                                    <span>{sortedActive.length} из {totalUniverse}</span>
                                    <span>точек</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full h-1.5 bg-gray-800 rounded-full mt-3 overflow-hidden flex">
                        <div className="bg-emerald-500 h-full" style={{ width: `${coveragePct}%` }} title="Активные"></div>
                        <div className="bg-blue-500/50 h-full" style={{ width: `${100 - coveragePct}%` }} title="Свободный потенциал"></div>
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
