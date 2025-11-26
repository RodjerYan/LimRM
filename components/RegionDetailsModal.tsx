
import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import { MapPoint, PotentialClient } from '../types';
import { SearchIcon, FactIcon, PotentialIcon } from './icons';

interface RegionDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rmName: string;
    regionName: string;
    activeClients: MapPoint[];
    potentialClients: PotentialClient[];
}

const ClientTable: React.FC<{ 
    data: any[]; 
    type: 'active' | 'potential'; 
    title: string; 
    count: number;
    totalVolume?: number; 
}> = ({ data, type, title, count, totalVolume }) => {
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
                    <span className="text-xs font-mono bg-gray-900 px-2 py-1 rounded text-gray-300">
                        {count} ТТ
                    </span>
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
                            <th className="px-4 py-2 text-right">{isGreen ? 'Факт (кг)' : 'Тип'}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filteredData.length > 0 ? (
                            filteredData.map((item, idx) => (
                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-2 font-medium text-gray-300 max-w-[150px] truncate" title={item.name}>
                                        {item.name}
                                    </td>
                                    <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate" title={item.address}>
                                        {item.address}
                                    </td>
                                    <td className={`px-4 py-2 text-right font-mono ${isGreen ? 'text-emerald-300' : 'text-gray-400'}`}>
                                        {isGreen ? new Intl.NumberFormat('ru-RU').format(item.fact || 0) : (item.type || 'н/д')}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={3} className="text-center py-8 text-gray-500">
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

const RegionDetailsModal: React.FC<RegionDetailsModalProps> = ({ isOpen, onClose, rmName, regionName, activeClients, potentialClients }) => {
    
    const totalActiveVolume = activeClients.reduce((sum, c) => sum + (c.fact || 0), 0);

    // Sort active by Fact descending
    const sortedActive = [...activeClients].sort((a, b) => (b.fact || 0) - (a.fact || 0));
    // Sort potential by Name
    const sortedPotential = [...potentialClients].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={
                <div className="flex flex-col">
                    <span className="text-xl font-bold">Детализация: {regionName}</span>
                    <span className="text-sm text-indigo-400 font-normal mt-1">Менеджер: {rmName}</span>
                </div>
            }
            maxWidth="max-w-6xl"
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[70vh]">
                <ClientTable 
                    type="active" 
                    title="Активные Клиенты" 
                    data={sortedActive} 
                    count={sortedActive.length}
                    totalVolume={totalActiveVolume}
                />
                <ClientTable 
                    type="potential" 
                    title="Свободный Потенциал (ОКБ)" 
                    data={sortedPotential} 
                    count={sortedPotential.length}
                />
            </div>
        </Modal>
    );
};

export default RegionDetailsModal;
