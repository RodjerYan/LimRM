
import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import { MapPoint, PotentialClient } from '../types';
import { SearchIcon, FactIcon, PotentialIcon, UsersIcon, LoaderIcon } from './icons';
import { getMarketData } from '../utils/marketData';

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
}> = ({ data, type, title, count, totalVolume, onRowClick }) => {
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

// --- VK Stats Component ---
const VkDemographics: React.FC<{ regionName: string }> = ({ regionName }) => {
    const [stats, setStats] = useState<{ avgAge: number; sampleSize: number; city: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modelData = useMemo(() => getMarketData(regionName), [regionName]);

    const fetchVkData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Using unified geocode endpoint with action=vk_demographics
            const res = await fetch(`/api/geocode?action=vk_demographics&region=${encodeURIComponent(regionName)}`);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Ошибка запроса VK API');
            }
            const data = await res.json();
            setStats(data);
        } catch (e) {
            console.error(e);
            setError((e as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-[#0077FF]/10 border border-[#0077FF]/30 p-4 rounded-xl flex flex-col gap-3">
            <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-6 h-6 bg-[#0077FF] text-white rounded flex items-center justify-center font-bold text-xs">VK</span>
                    Демография региона
                </h4>
                {!stats && !isLoading && (
                    <button 
                        onClick={fetchVkData}
                        className="text-xs bg-[#0077FF] hover:bg-[#0066CC] text-white px-3 py-1.5 rounded transition-colors"
                    >
                        Запросить реальные данные
                    </button>
                )}
            </div>

            {isLoading && (
                <div className="flex items-center gap-2 text-xs text-[#0077FF] animate-pulse">
                    <LoaderIcon /> Анализ профилей пользователей VK...
                </div>
            )}

            {error && (
                <div className="text-xs text-red-400">
                    Не удалось получить данные VK: {error}
                </div>
            )}

            {stats && (
                <div className="grid grid-cols-2 gap-4 mt-1">
                    <div className="bg-gray-900/50 p-2 rounded border border-[#0077FF]/20">
                        <div className="text-[10px] text-gray-400 uppercase">Средний возраст (VK)</div>
                        <div className="text-xl font-bold text-white">
                            {stats.avgAge ? stats.avgAge : '—'} <span className="text-sm font-normal text-gray-500">лет</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                            Выборка: {stats.sampleSize} чел. (г. {stats.city})
                        </div>
                    </div>
                    <div className="bg-gray-900/50 p-2 rounded border border-gray-700 opacity-70">
                        <div className="text-[10px] text-gray-400 uppercase">Модель (Росстат)</div>
                        <div className="text-xl font-bold text-gray-300">
                            {modelData.avgOwnerAge} <span className="text-sm font-normal text-gray-500">лет</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                            Разница: {stats.avgAge ? (stats.avgAge - modelData.avgOwnerAge).toFixed(1) : '—'}
                        </div>
                    </div>
                </div>
            )}
            
            {!stats && !isLoading && !error && (
                <p className="text-xs text-gray-400">
                    Нажмите кнопку выше, чтобы получить актуальный средний возраст аудитории региона, используя API ВКонтакте (анализ случайной выборки открытых профилей).
                </p>
            )}
        </div>
    );
};


const RegionDetailsModal: React.FC<RegionDetailsModalProps> = ({ isOpen, onClose, rmName, regionName, activeClients, potentialClients, onEditClient }) => {
    
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
            maxWidth="max-w-[96vw]"
        >
            <div className="flex flex-col h-[80vh] gap-4">
                {/* Analytics Bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
                     <VkDemographics regionName={regionName} />
                     {/* Placeholder for future analytics */}
                     <div className="hidden md:block col-span-2 bg-gray-900/30 border border-gray-700/50 rounded-xl p-4 flex items-center justify-center text-gray-500 text-sm">
                        Здесь может быть ваша реклама или график динамики продаж :)
                     </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-grow overflow-hidden">
                    <ClientTable 
                        type="active" 
                        title="Активные Клиенты" 
                        data={sortedActive} 
                        count={sortedActive.length}
                        totalVolume={totalActiveVolume}
                        onRowClick={onEditClient ? (item) => onEditClient(item as MapPoint) : undefined}
                    />
                    <ClientTable 
                        type="potential" 
                        title="Свободный Потенциал (ОКБ)" 
                        data={sortedPotential} 
                        count={sortedPotential.length}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default RegionDetailsModal;
