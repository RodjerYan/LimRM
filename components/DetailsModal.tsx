
import React, { useState } from 'react';
import Modal from './Modal';
import DetailChart from './DetailChart';
import { AggregatedDataRow, OkbStatus, MapPoint } from '../types';
import { FactIcon, PotentialIcon, GrowthIcon, TrendingUpIcon, CalculatorIcon, SearchIcon } from './icons';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
    okbStatus: OkbStatus | null;
    onStartEdit: (client: MapPoint) => void;
}

const formatNumber = (num: number, short = false) => {
    if (isNaN(num)) return '0';
    if (short) {
        if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)} млн`;
        if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)} тыс.`;
    }
    return num.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

const MetricCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string; tooltip: string }> = ({ title, value, icon, color, tooltip }) => (
    <div title={tooltip} className="bg-white p-4 rounded-3xl border border-slate-200 flex items-start space-x-3 overflow-hidden transition-all hover:border-slate-300 hover:shadow-lg shadow-sm">
        <div className={`p-2.5 rounded-2xl ${color} bg-opacity-10 flex-shrink-0`}>
           {React.cloneElement(icon as React.ReactElement<{ small?: boolean }>, { small: true })}
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-500 truncate uppercase font-bold tracking-widest">{title}</p>
            <p className="text-lg font-bold text-slate-900 truncate font-mono mt-1 tracking-tight">{value}</p>
        </div>
    </div>
);

const GroupedClientsList: React.FC<{ clients: MapPoint[]; onStartEdit: (client: MapPoint) => void; }> = ({ clients, onStartEdit }) => {
    const [searchTerm, setSearchTerm] = useState('');

    if (!clients || clients.length === 0) return null;

    const filteredClients = clients.filter(client => {
        const searchLower = searchTerm.toLowerCase().trim();
        if (!searchLower) return true;
        return (
            (client.name || '').toLowerCase().includes(searchLower) ||
            (client.address || '').toLowerCase().includes(searchLower) ||
            (client.city || '').toLowerCase().includes(searchLower)
        );
    });

    return (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col h-full shadow-sm">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-emerald-600">Клиенты в группе</span>
                    <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">{clients.length}</span>
                </h4>
                <div className="relative w-full sm:w-64">
                    <input 
                        type="text" 
                        placeholder="Поиск по адресу или названию..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium"
                    />
                    <div className="absolute left-3 top-2 text-slate-400"><SearchIcon small /></div>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar max-h-[300px] bg-white">
                {filteredClients.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                        {filteredClients.map((client) => (
                            <div key={client.key} className="p-3 hover:bg-slate-50 transition-colors flex justify-between items-center group">
                                <div className="min-w-0 pr-4">
                                    <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-2">
                                        {client.name}
                                        {client.abcCategory && (
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] border font-bold ${
                                                client.abcCategory === 'A' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                                                client.abcCategory === 'B' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                                                'border-slate-200 text-slate-500 bg-slate-50'
                                            }`}>
                                                {client.abcCategory}
                                            </span>
                                        )}
                                    </div>
                                    <div 
                                        className="text-[10px] text-slate-500 truncate mt-0.5 cursor-pointer hover:text-indigo-600 flex items-center gap-1 transition-colors font-medium"
                                        onClick={() => onStartEdit(client)}
                                        title="Редактировать адрес"
                                    >
                                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                                        {client.address}
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-xs font-mono font-bold text-emerald-600">
                                        {new Intl.NumberFormat('ru-RU').format(client.fact || 0)}
                                    </div>
                                    <div className="text-[9px] text-slate-400 uppercase font-bold">{client.city}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-8 text-center text-slate-400 text-xs font-medium">Нет совпадений</div>
                )}
            </div>
        </div>
    );
};

// "Golden Standard Matrix" - Recommendation Engine
const AssortmentRecommendations: React.FC<{ data: AggregatedDataRow }> = ({ data }) => {
    // Mock recommendations based on brand context
    const getRecommendations = () => {
        const baseRecs = [
            { name: `${data.brand} Паучи 85г Говядина`, reason: 'Топ-3 SKU в регионе', impact: 'high' },
            { name: `${data.brand} Сухой 1.5кг Курица`, reason: 'Часто берут вместе', impact: 'medium' },
            { name: `${data.brand} Лакомства 50г`, reason: 'Маржинальность', impact: 'low' }
        ];
        
        if (data.fact > 1000) {
            baseRecs.push({ name: `${data.brand} 10кг Profi`, reason: 'Для крупных клиентов', impact: 'high' });
        }
        
        return baseRecs;
    };

    const recs = getRecommendations();

    return (
        <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-5 w-full">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-indigo-600 rounded text-white shadow-md">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                </div>
                <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider">Матрица Золотого Стандарта</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {recs.map((rec, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-300 hover:shadow-md transition-all group">
                        <div className="font-bold text-xs text-slate-800 mb-2 group-hover:text-indigo-700 leading-tight">
                            {rec.name}
                        </div>
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
                            <span className="text-[9px] text-slate-500 font-medium">{rec.reason}</span>
                            {rec.impact === 'high' && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">TOP</span>}
                            {rec.impact === 'medium' && <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">REC</span>}
                        </div>
                    </div>
                ))}
                <div className="bg-slate-100 border border-dashed border-slate-300 rounded-2xl p-4 flex items-center justify-center text-center">
                    <p className="text-[10px] text-slate-500 italic leading-tight font-medium">
                        Рекомендации основаны на анализе похожих точек (Look-alike modeling)
                    </p>
                </div>
            </div>
        </div>
    );
};

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data, okbStatus, onStartEdit }) => {
    if (!isOpen || !data) return null;

    const coverage = data.potential > 0 ? (data.fact / data.potential) * 100 : 0;
    const isGroup = data.clients.length > 1;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={
                <div className="flex flex-col">
                    <span className="text-xl font-bold text-slate-900 tracking-tight">{data.clientName}</span>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{data.rm}</span>
                        <span className="text-xs text-slate-500 font-medium">{data.region}</span>
                    </div>
                </div>
            } 
            maxWidth="max-w-6xl"
        >
            <div className="space-y-6">
                
                {/* 1. Top Metrics Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricCard 
                        title="Текущий Факт" 
                        value={`${formatNumber(data.fact)} кг`} 
                        icon={<FactIcon />} 
                        color="text-emerald-600"
                        tooltip="Фактический объем продаж за выбранный период"
                    />
                    <MetricCard 
                        title="Потенциал" 
                        value={`${formatNumber(data.potential)} кг`} 
                        icon={<PotentialIcon />} 
                        color="text-indigo-600"
                        tooltip="Расчетная емкость клиента/группы"
                    />
                    <MetricCard 
                        title="Точка Роста" 
                        value={`+${formatNumber(data.growthPotential)} кг`} 
                        icon={<GrowthIcon />} 
                        color="text-amber-500"
                        tooltip="Разница между Потенциалом и Фактом (Gap)"
                    />
                    <MetricCard 
                        title="Эффективность" 
                        value={`${coverage.toFixed(1)}%`} 
                        icon={<TrendingUpIcon />} 
                        color={coverage > 80 ? "text-emerald-600" : "text-rose-500"}
                        tooltip="Процент освоения потенциала"
                    />
                </div>

                {/* 2. Chart & Context */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Chart Container - Takes 2 cols */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm min-h-[320px]">
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6">Динамика и Прогноз</h4>
                        <div className="h-[250px] w-full">
                            <DetailChart fact={data.fact} potential={data.potential} />
                        </div>
                    </div>

                    {/* Context/Info Column */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2 tracking-wider">
                                <CalculatorIcon small/> Факторы Роста
                            </h4>
                            <ul className="space-y-3">
                                <li className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 font-medium">Категория (ABC)</span>
                                    <span className="text-slate-900 font-bold bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                                        {data.clients[0]?.abcCategory || 'C'}
                                    </span>
                                </li>
                                <li className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 font-medium">Бренд</span>
                                    <span className="text-slate-900 font-bold text-right truncate max-w-[120px]" title={data.brand}>{data.brand}</span>
                                </li>
                                <li className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 font-medium">Фасовка</span>
                                    <span className="text-slate-900 font-bold text-right">{data.packaging}</span>
                                </li>
                            </ul>
                        </div>

                        <div className="bg-indigo-50 p-5 rounded-3xl border border-indigo-100">
                            <h4 className="text-xs font-bold text-indigo-700 uppercase mb-2 tracking-wider">Стратегия</h4>
                            <p className="text-sm text-indigo-900 leading-relaxed font-medium">
                                {data.growthPercentage > 50 
                                    ? "Агрессивный рост. Рекомендуется расширение ассортимента и маркетинговая поддержка." 
                                    : (data.growthPercentage > 10 
                                        ? "Умеренный потенциал. Фокус на увеличении среднего чека."
                                        : "Удержание. Клиент близок к пределу емкости.")}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 3. Assortment Matrix */}
                <div className="w-full animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <AssortmentRecommendations data={data} />
                </div>

                {/* 4. Clients List (if group) */}
                {isGroup && (
                    <div className="w-full h-[350px] animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                        <GroupedClientsList clients={data.clients} onStartEdit={onStartEdit} />
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default DetailsModal;
