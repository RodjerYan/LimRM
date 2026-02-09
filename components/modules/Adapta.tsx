
import React, { useState, useMemo, useEffect } from 'react';
import FileUpload from '../FileUpload';
import OKBManagement from '../OKBManagement';
import OutlierDetailsModal from '../OutlierDetailsModal';
import Modal from '../Modal';
import { OkbStatus, WorkerResultPayload, AggregatedDataRow, FileProcessingState, CloudLoadParams, MapPoint } from '../../types';
import { CheckIcon, AlertIcon, DataIcon, InfoIcon, SuccessIcon, ChannelIcon, LoaderIcon, SearchIcon, UsersIcon, FactIcon } from '../icons';
import { detectOutliers } from '../../utils/analytics';

interface AdaptaProps {
    processingState: FileProcessingState;
    // Updated prop for forcing update
    onForceUpdate?: () => void;
    onFileProcessed: (data: WorkerResultPayload) => void;
    onProcessingStateChange: (isLoading: boolean, message: string) => void;
    okbData: any[];
    okbStatus: OkbStatus | null;
    onOkbStatusChange: (status: OkbStatus) => void;
    onOkbDataChange: (data: any[]) => void;
    disabled: boolean;
    unidentifiedCount: number;
    onUnidentifiedClick?: () => void; 
    activeClientsCount: number;
    uploadedData?: AggregatedDataRow[]; 
    dbStatus?: 'empty' | 'ready' | 'loading';
    onStartEdit?: (client: MapPoint) => void;
    
    // Date Props (Analysis)
    startDate: string;
    endDate: string;
    onStartDateChange: (date: string) => void;
    onEndDateChange: (date: string) => void;

    // Load Props (Sync)
    loadStartDate?: string;
    loadEndDate?: string;
    onLoadStartDateChange?: (date: string) => void;
    onLoadEndDateChange?: (date: string) => void;
}

interface OutlierItem {
    row: AggregatedDataRow;
    zScore: number;
    reason: string;
}

const Adapta: React.FC<AdaptaProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'ingest' | 'hygiene'>('ingest');
    const [selectedOutlier, setSelectedOutlier] = useState<OutlierItem | null>(null);
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
    const [channelSearchTerm, setChannelSearchTerm] = useState('');

    const healthScore = useMemo(() => {
        if (props.activeClientsCount === 0) return 0;
        const penalty = props.unidentifiedCount * 5; 
        const baseScore = 100;
        return Math.max(0, Math.round(baseScore - (penalty / props.activeClientsCount) * 100));
    }, [props.activeClientsCount, props.unidentifiedCount]);

    const healthColor = healthScore > 80 ? 'text-emerald-600' : healthScore > 50 ? 'text-amber-600' : 'text-red-600';
    const healthBorder = healthScore > 80 ? 'border-emerald-200' : healthScore > 50 ? 'border-amber-200' : 'border-red-200';

    // Helper to get client fact for the selected period
    // REACTIVE FILTERING: This runs whenever props.startDate/endDate changes.
    const getClientFact = (client: MapPoint) => {
        const hasFilter = !!(props.startDate || props.endDate);

        // If client has detailed monthly data, we MUST use it to respect the filter
        if (client.monthlyFact && Object.keys(client.monthlyFact).length > 0) {
            let sum = 0;
            
            // Normalize filter inputs to YYYY-MM for comparison with keys
            const filterStart = props.startDate ? props.startDate.substring(0, 7) : null;
            const filterEnd = props.endDate ? props.endDate.substring(0, 7) : null;

            Object.entries(client.monthlyFact).forEach(([date, val]) => {
                if (date === 'unknown') return; 
                
                // Compare YYYY-MM strings
                if (filterStart && date < filterStart) return;
                if (filterEnd && date > filterEnd) return;
                
                sum += val;
            });
            return sum;
        }
        
        return client.fact || 0;
    };

    // 1. FIX: Establish a Fixed Universe of Clients (Base Clients) based on CURRENT filter
    const baseClientKeys = useMemo(() => {
        const set = new Set<string>();
        if (props.uploadedData) {
            props.uploadedData.forEach(row => {
                row.clients.forEach(c => {
                    const fact = getClientFact(c);
                    // Include client if it has sales > 0 in the selected period
                    if (fact > 0.001) {
                        set.add(c.key);
                    }
                });
            });
        }
        return set;
    }, [props.uploadedData, props.startDate, props.endDate]);

    const outliers = useMemo<OutlierItem[]>(() => {
        if (!props.uploadedData || props.uploadedData.length === 0) return [];

        const relevantData = props.uploadedData.map(row => {
            const activeClients = row.clients.map(client => ({
                ...client,
                fact: getClientFact(client)
            })).filter(c => (c.fact || 0) > 0);

            const rowFact = activeClients.reduce((sum, c) => sum + (c.fact || 0), 0);

            return {
                ...row,
                clients: activeClients,
                fact: rowFact
            };
        }).filter(row => row.fact > 0); 

        return detectOutliers(relevantData);
    }, [props.uploadedData, props.startDate, props.endDate]);

    const channelStats = useMemo(() => {
        if (!props.uploadedData || props.uploadedData.length === 0) return [];
        const acc: Record<string, { uniqueKeys: Set<string>; volume: number }> = {};
        const globalUniqueKeys = new Set<string>();
        
        props.uploadedData.forEach(row => {
            row.clients.forEach(client => {
                // Use the pre-filtered base keys to ensure consistency
                if (!baseClientKeys.has(client.key)) return;

                const effectiveFact = getClientFact(client);
                
                const type = client.type || 'Не определен';
                if (!acc[type]) acc[type] = { uniqueKeys: new Set(), volume: 0 };
                
                acc[type].uniqueKeys.add(client.key);
                acc[type].volume += effectiveFact;
                globalUniqueKeys.add(client.key);
            });
        });
        
        const totalUniqueCount = globalUniqueKeys.size;
        return Object.entries(acc)
            .map(([name, data]) => ({
                name,
                count: data.uniqueKeys.size,
                volumeTons: data.volume / 1000,
                percentage: totalUniqueCount > 0 ? (data.uniqueKeys.size / totalUniqueCount) * 100 : 0
            }))
            .sort((a, b) => b.count - a.count);
    }, [props.uploadedData, props.startDate, props.endDate, baseClientKeys]);

    const groupedChannelData = useMemo(() => {
        if (!selectedChannel || !props.uploadedData) return null;
        const uniqueClientsInChannel = new Map<string, MapPoint & { totalFact: number }>();
        const safeLower = (val: any) => (val || '').toString().toLowerCase();
        
        props.uploadedData.forEach(row => {
            row.clients.forEach(c => {
                if (!baseClientKeys.has(c.key)) return;

                const effectiveFact = getClientFact(c);
                
                if ((c.type || 'Не определен') === selectedChannel) {
                    const search = channelSearchTerm.toLowerCase();
                    // Safer check for includes
                    if (!search || safeLower(c.name).includes(search) || safeLower(c.address).includes(search) || safeLower(c.rm).includes(search)) {
                        if (!uniqueClientsInChannel.has(c.key)) {
                            uniqueClientsInChannel.set(c.key, { ...c, totalFact: 0 });
                        }
                        const existing = uniqueClientsInChannel.get(c.key)!;
                        existing.totalFact += effectiveFact;
                    }
                }
            });
        });
        
        const hierarchy: Record<string, Record<string, (MapPoint & { totalFact: number })[]>> = {};
        uniqueClientsInChannel.forEach(c => {
            const rm = c.rm || 'Не указан';
            const city = c.city || 'Город не определен';
            if (!hierarchy[rm]) hierarchy[rm] = {};
            if (!hierarchy[rm][city]) hierarchy[rm][city] = [];
            hierarchy[rm][city].push(c);
        });
        return hierarchy;
    }, [selectedChannel, props.uploadedData, channelSearchTerm, props.startDate, props.endDate, baseClientKeys]);

    const rowsToDisplay = useMemo(() => {
        if (props.processingState.isProcessing) {
            return (props.processingState.totalRowsProcessed || 0).toLocaleString('ru-RU');
        }
        return baseClientKeys.size.toLocaleString('ru-RU');
    }, [props.processingState.isProcessing, props.processingState.totalRowsProcessed, baseClientKeys]);

    const coverageOkb = useMemo(() => {
        if (!props.okbStatus?.rowCount || props.okbStatus.rowCount === 0) return 0;
        return Math.min(100, Math.round((props.activeClientsCount / props.okbStatus.rowCount) * 100));
    }, [props.activeClientsCount, props.okbStatus?.rowCount]);

    const getChannelStyle = (index: number) => {
        // Updated colors for light theme compatibility
        if (index === 0) return { 
            text: 'text-indigo-600', 
            bar: 'bg-indigo-500', 
            badge: 'bg-indigo-50 text-indigo-600 border-indigo-200'
        };
        if (index === 1) return { 
            text: 'text-emerald-600', 
            bar: 'bg-emerald-500',
            badge: 'bg-emerald-50 text-emerald-600 border-emerald-200'
        };
        if (index === 2) return { 
            text: 'text-amber-600', 
            bar: 'bg-amber-500',
            badge: 'bg-amber-50 text-amber-600 border-amber-200'
        };
        return { 
            text: 'text-gray-600', 
            bar: 'bg-gray-400',
            badge: 'bg-gray-100 text-gray-600 border-gray-200'
        };
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-200 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">ADAPTA <span className="text-gray-400 font-normal text-lg">/ Live Streaming Engine</span></h2>
                    <p className="text-gray-500 text-sm mt-1">Интеллектуальная синхронизация с облаком. Данные обновляются инкрементально в фоновом режиме.</p>
                </div>
                <div className="flex space-x-2">
                    <button onClick={() => setActiveTab('ingest')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'ingest' ? 'bg-black text-white' : 'bg-white text-gray-500 border border-gray-200 hover:text-black'}`}>Cloud Sync</button>
                    <button onClick={() => setActiveTab('hygiene')} disabled={props.activeClientsCount === 0} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'hygiene' ? 'bg-black text-white' : 'bg-white text-gray-500 border border-gray-200 hover:text-black disabled:opacity-50'}`}>Качество (DQ)</button>
                </div>
            </div>

            {activeTab === 'ingest' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-6">
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-md relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                {props.processingState.isProcessing ? (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 animate-pulse">
                                        <LoaderIcon className="w-3 h-3" />
                                        <span className="text-[9px] font-bold uppercase">Streaming</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm"></div>
                                        <span className="text-[9px] font-bold uppercase">Online</span>
                                    </div>
                                )}
                            </div>
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <DataIcon small /> Облачный Движок
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${props.dbStatus === 'ready' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-gray-100 text-gray-400'}`}>
                                        {props.dbStatus === 'ready' ? <SuccessIcon /> : <InfoIcon />}
                                    </div>
                                    <div>
                                        <div className="text-gray-900 font-bold text-lg leading-none">
                                            {props.dbStatus === 'ready' ? 'Live Index: OK' : 'No Index Found'}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {props.activeClientsCount.toLocaleString()} уник. ТТ
                                        </div>
                                    </div>
                                </div>
                                {props.processingState.isProcessing && (
                                    <div className="pt-2">
                                        <div className="flex justify-between text-[10px] text-gray-500 mb-1 font-bold uppercase">
                                            <span>Прогресс индексации</span>
                                            <span className="text-indigo-600">{Math.round(props.processingState.progress)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${props.processingState.progress}%` }}></div>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2 italic leading-tight">{props.processingState.message}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <OKBManagement onStatusChange={props.onOkbStatusChange} onDataChange={props.onOkbDataChange} status={props.okbStatus} disabled={props.disabled} />
                        
                        <FileUpload 
                            processingState={props.processingState} 
                            onForceUpdate={props.onForceUpdate} 
                            okbStatus={props.okbStatus} 
                            disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'} 
                            loadStartDate={props.loadStartDate}
                            loadEndDate={props.loadEndDate}
                            onLoadStartDateChange={props.onLoadStartDateChange}
                            onLoadEndDateChange={props.onLoadEndDateChange}
                        />
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        <div className={`bg-white p-6 rounded-2xl border ${healthBorder} shadow-lg relative`}>
                            {props.processingState.isProcessing && <div className="absolute top-0 left-0 w-full h-1 bg-indigo-50"><div className="h-full bg-indigo-200 animate-shimmer" style={{width: '30%'}}></div></div>}
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                Качество загруженных данных
                                <span className={`text-2xl font-mono ${healthColor} ml-auto`}>{healthScore}%</span>
                            </h3>
                            
                            <div className="w-full bg-gray-100 rounded-full h-2 mb-6 overflow-hidden">
                                <div className={`h-full transition-all duration-1000 ease-out ${healthScore > 80 ? 'bg-emerald-500' : healthScore > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${healthScore}%` }}></div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">ОБРАБОТАНО ЗАПИСЕЙ</div>
                                    <div className="text-xl font-bold text-gray-900 font-mono">{rowsToDisplay}</div>
                                    <div className="flex items-center gap-1 text-[9px] text-gray-400 mt-2 italic">
                                        {props.processingState.isProcessing ? 'Чтение снимка...' : (props.startDate || props.endDate ? 'Отфильтровано' : 'Всего в системе')}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Уникальных ТТ</div>
                                    <div className="text-xl font-bold text-gray-900 font-mono">{props.activeClientsCount.toLocaleString()}</div>
                                    <div className="flex items-center gap-1 text-[9px] text-emerald-600 mt-2 uppercase font-bold">● Гео-объектов</div>
                                </div>
                                
                                {/* UNIDENTIFIED CARD - NOW CLICKABLE */}
                                <div 
                                    className={`bg-gray-50 p-4 rounded-xl border border-gray-200 transition-all ${props.onUnidentifiedClick ? 'cursor-pointer hover:bg-white hover:shadow-md hover:border-gray-300 group' : ''}`}
                                    onClick={props.onUnidentifiedClick}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Неопознанные</div>
                                        {props.onUnidentifiedClick && <div className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500"><SearchIcon small/></div>}
                                    </div>
                                    <div className={`text-xl font-bold font-mono ${props.unidentifiedCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {props.unidentifiedCount.toLocaleString()}
                                    </div>
                                    <div className="flex items-center gap-1 text-[9px] mt-2 uppercase font-bold">
                                        {props.unidentifiedCount > 0 ? (
                                            <span className="text-amber-600">⚠️ Ошибка разбора</span>
                                        ) : (
                                            <span className="text-emerald-600">✔ Все ОК</span>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Охват ОКБ</div>
                                    <div className="text-xl font-bold text-gray-900 font-mono">{coverageOkb}%</div>
                                    <div className="flex items-center gap-1 text-[9px] text-indigo-600 mt-2 uppercase font-bold">Доля рынка</div>
                                </div>
                            </div>
                        </div>

                        {/* Minimalist Channel Structure Grid */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
                                        <ChannelIcon small />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-800 tracking-wide uppercase">Структура Каналов</h3>
                                        <p className="text-[10px] text-gray-500">Физические адреса (Уник. ТТ)</p>
                                    </div>
                                </div>
                            </div>
                            {channelStats.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                    {channelStats.map((stat, idx) => {
                                        const style = getChannelStyle(idx);
                                        return (
                                            <div 
                                                key={idx} 
                                                className="group relative p-3.5 rounded-lg bg-gray-50 border border-gray-100 hover:border-gray-300 hover:bg-white transition-all cursor-pointer shadow-sm hover:shadow-md"
                                                onClick={() => { setSelectedChannel(stat.name); setChannelSearchTerm(''); }}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-black border ${style.badge}`}>
                                                            {stat.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium text-gray-700 group-hover:text-black transition-colors">{stat.name}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono mt-0.5">{stat.volumeTons.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т.</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-base font-bold text-gray-900 font-mono tracking-tight">{stat.count.toLocaleString()}</div>
                                                        <div className={`text-[10px] font-bold ${style.text}`}>{stat.percentage.toFixed(1)}%</div>
                                                    </div>
                                                </div>
                                                
                                                {/* Ultra-slim progress bar */}
                                                <div className="w-full bg-gray-200 h-[2px] rounded-full overflow-hidden">
                                                    <div className={`h-full ${style.bar} transition-all duration-1000 ease-out`} style={{ width: `${stat.percentage}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="h-32 flex flex-col items-center justify-center text-gray-400 border border-dashed border-gray-200 rounded-lg bg-gray-50">
                                    <p className="text-xs font-mono">Нет данных</p>
                                </div>
                            )}
                        </div>

                        <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800">
                            <strong className="block mb-1 text-indigo-700 flex items-center gap-2"><InfoIcon small /> Технология Online Preview:</strong>
                            Вы можете использовать аналитику, пока данные синхронизируются в фоне. Система обновляет расчеты в реальном времени при получении новых блоков строк.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-lg">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Статистический Анализ (Z-Score)</h3>
                            <p className="text-sm text-gray-500 mb-4">Автоматическое выявление аномалий в продажах. Инструмент DQ (Data Quality).</p>
                            <div className="flex items-center gap-2 text-amber-700 text-sm bg-amber-50 p-3 rounded-lg border border-amber-100"><AlertIcon small /><span>Найдено аномалий: <strong>{outliers.length}</strong></span></div>
                        </div>
                    </div>
                    <div className="lg:col-span-2">
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 h-full overflow-hidden flex flex-col shadow-lg">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Детализация Аномалий</h3>
                            <div className="flex-grow overflow-y-auto custom-scrollbar">
                                {outliers.length > 0 ? (
                                    <table className="w-full text-left text-sm">
                                        <thead className="text-gray-500 border-b border-gray-200 sticky top-0 bg-white/90 backdrop-blur"><tr><th className="pb-2 pl-2">Клиент/Группа</th><th className="pb-2">Факт</th><th className="pb-2">Z-Score</th><th className="pb-2">Диагноз</th></tr></thead>
                                        <tbody className="text-gray-600 divide-y divide-gray-100">
                                            {outliers.map((item: OutlierItem, idx: number) => (
                                                <tr key={idx} onClick={() => setSelectedOutlier(item)} className="hover:bg-gray-50 cursor-pointer transition-colors" title="Нажмите для разбора"><td className="py-3 pl-2 font-medium text-gray-900 flex items-center gap-2">{item.row.clientName}<span className="text-xs text-gray-400">↗</span></td><td className="py-3 font-mono">{new Intl.NumberFormat('ru-RU').format(item.row.fact)}</td><td className={`py-3 font-mono font-bold ${Math.abs(item.zScore) > 3 ? 'text-red-600' : 'text-amber-600'}`}>{item.zScore.toFixed(2)}</td><td className="py-3 text-xs text-gray-500">{item.reason}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-gray-400"><CheckIcon /><p className="mt-2">Статистических аномалий не обнаружено.</p></div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {selectedChannel && (
                <Modal isOpen={!!selectedChannel} onClose={() => setSelectedChannel(null)} title={<div className="flex flex-col"><span className="text-xl font-bold text-gray-900">Канал: {selectedChannel}</span><span className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Детализация уник. адресов по РМ и городам</span></div>} maxWidth="max-w-5xl">
                    <div className="space-y-4">
                        <div className="relative mb-6">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400"><SearchIcon small /></div>
                            <input type="text" placeholder="Поиск по адресу, названию ТТ или менеджеру..." value={channelSearchTerm} onChange={(e) => setChannelSearchTerm(e.target.value)} className="w-full bg-white border border-gray-300 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                            {groupedChannelData && Object.keys(groupedChannelData).length > 0 ? (
                                <div className="space-y-8">
                                    {Object.entries(groupedChannelData).sort((a,b) => a[0].localeCompare(b[0])).map(([rm, cities]) => (
                                        <div key={rm} className="space-y-4">
                                            <div className="sticky top-0 bg-white/95 backdrop-blur z-10 py-2 border-b border-gray-200 flex justify-between items-center"><h4 className="text-sm font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2"><div className="p-1 bg-indigo-50 rounded-md border border-indigo-100"><UsersIcon small /></div> {rm}</h4><span className="text-[10px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-200 font-bold">{Object.values(cities).flat().length} ТТ</span></div>
                                            <div className="pl-4 space-y-6">
                                                {Object.entries(cities).sort((a,b) => a[0].localeCompare(b[0])).map(([city, clients]) => (
                                                    <div key={city} className="space-y-2">
                                                        <h5 className="text-xs font-bold text-gray-700 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>{city}</h5>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {clients.map((client, cIdx) => (
                                                                <div key={cIdx} className="bg-gray-50 p-3 rounded-lg border border-gray-200 hover:border-indigo-200 hover:bg-white hover:shadow-sm transition-all flex justify-between items-start gap-4 group"><div className="min-w-0"><div className="text-xs font-bold text-gray-900 truncate" title={client.name}>{client.name}</div><div className="text-[10px] text-gray-500 mt-1 truncate cursor-pointer hover:text-indigo-600 flex items-center gap-1 transition-colors" onClick={() => props.onStartEdit?.(client)}><span className="opacity-0 group-hover:opacity-100 transition-opacity">📍</span>{client.address}</div></div><div className="flex flex-col items-end shrink-0"><div className="text-[11px] font-mono font-bold text-emerald-600">{(client.totalFact || 0).toLocaleString('ru-RU')} <span className="text-[9px] text-gray-400 font-normal">кг</span></div><div className="text-[9px] text-gray-400 mt-0.5 uppercase font-bold tracking-tighter">{client.brand || 'Уникальная ТТ'}</div></div></div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <div className="py-20 text-center text-gray-400 flex flex-col items-center gap-2"><SearchIcon /><p className="text-sm">Адреса не найдены по вашему запросу</p></div>}
                        </div>
                    </div>
                </Modal>
            )}

            {selectedOutlier && <OutlierDetailsModal isOpen={!!selectedOutlier} onClose={() => setSelectedOutlier(null)} item={selectedOutlier} />}
        </div>
    );
};

export default Adapta;
