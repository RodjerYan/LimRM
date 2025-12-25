
import React, { useState, useMemo } from 'react';
import FileUpload from '../FileUpload';
import OKBManagement from '../OKBManagement';
import OutlierDetailsModal from '../OutlierDetailsModal';
import { OkbStatus, WorkerResultPayload, AggregatedDataRow, FileProcessingState, CloudLoadParams } from '../../types';
import { CheckIcon, WarningIcon, AlertIcon, DataIcon, InfoIcon, SuccessIcon, ChannelIcon, LoaderIcon } from '../icons';
import { detectOutliers } from '../../utils/analytics';

interface AdaptaProps {
    processingState: FileProcessingState;
    onStartProcessing: (file: File) => void;
    onStartCloudProcessing?: (params: CloudLoadParams) => void;
    onFileProcessed: (data: WorkerResultPayload) => void;
    onProcessingStateChange: (isLoading: boolean, message: string) => void;
    okbData: any[];
    okbStatus: OkbStatus | null;
    onOkbStatusChange: (status: OkbStatus) => void;
    onOkbDataChange: (data: any[]) => void;
    disabled: boolean;
    unidentifiedCount: number;
    activeClientsCount: number;
    uploadedData?: AggregatedDataRow[]; 
    dbStatus?: 'empty' | 'ready' | 'loading';
}

interface OutlierItem {
    row: AggregatedDataRow;
    zScore: number;
    reason: string;
}

const Adapta: React.FC<AdaptaProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'ingest' | 'hygiene'>('ingest');
    const [selectedOutlier, setSelectedOutlier] = useState<OutlierItem | null>(null);

    const healthScore = useMemo(() => {
        if (props.activeClientsCount === 0) return 0;
        const penalty = props.unidentifiedCount * 5; 
        const baseScore = 100;
        return Math.max(0, Math.round(baseScore - (penalty / props.activeClientsCount) * 100));
    }, [props.activeClientsCount, props.unidentifiedCount]);

    const healthColor = healthScore > 80 ? 'text-emerald-400' : healthScore > 50 ? 'text-amber-400' : 'text-red-400';
    const healthBorder = healthScore > 80 ? 'border-emerald-500/30' : healthScore > 50 ? 'border-amber-500/30' : 'border-red-500/30';

    const outliers = useMemo<OutlierItem[]>(() => {
        if (!props.uploadedData || props.uploadedData.length === 0) return [];
        return detectOutliers(props.uploadedData);
    }, [props.uploadedData]);

    const channelStats = useMemo(() => {
        if (!props.uploadedData || props.uploadedData.length === 0) return [];
        const acc: Record<string, { count: number; volume: number }> = {};
        let totalCount = 0;

        props.uploadedData.forEach(row => {
            row.clients.forEach(client => {
                const type = client.type || 'Не определен';
                const clientFact = client.fact || 0;
                if (!acc[type]) acc[type] = { count: 0, volume: 0 };
                acc[type].count++;
                acc[type].volume += clientFact;
                totalCount++;
            });
        });

        return Object.entries(acc)
            .map(([name, data]) => ({
                name,
                count: data.count,
                volumeTons: data.volume / 1000,
                percentage: totalCount > 0 ? (data.count / totalCount) * 100 : 0
            }))
            .sort((a, b) => b.count - a.count);
    }, [props.uploadedData]);

    const rowsToDisplay = useMemo(() => {
        return (props.processingState.totalRowsProcessed || 0).toLocaleString('ru-RU');
    }, [props.processingState.totalRowsProcessed]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">ADAPTA <span className="text-gray-500 font-normal text-lg">/ Live Streaming Engine</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Интеллектуальная синхронизация с облаком. Данные обновляются инкрементально в фоновом режиме.</p>
                </div>
                <div className="flex space-x-2">
                    <button onClick={() => setActiveTab('ingest')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'ingest' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Cloud Sync</button>
                    <button onClick={() => setActiveTab('hygiene')} disabled={props.activeClientsCount === 0} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'hygiene' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white disabled:opacity-50'}`}>Качество (DQ)</button>
                </div>
            </div>

            {activeTab === 'ingest' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-6">
                        <div className="bg-gray-900/80 p-5 rounded-2xl border border-white/10 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                {props.processingState.isProcessing ? (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded-md border border-indigo-500/30 animate-pulse">
                                        <LoaderIcon className="w-3 h-3" />
                                        <span className="text-[9px] font-bold uppercase">Streaming</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]"></div>
                                        <span className="text-[9px] font-bold uppercase">Online</span>
                                    </div>
                                )}
                            </div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <DataIcon small /> Облачный Движок
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${props.dbStatus === 'ready' ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-gray-800 text-gray-500'}`}>
                                        {props.dbStatus === 'ready' ? <SuccessIcon /> : <InfoIcon />}
                                    </div>
                                    <div>
                                        <div className="text-white font-bold text-lg leading-none">
                                            {props.dbStatus === 'ready' ? 'Live Index: OK' : 'No Index Found'}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {props.activeClientsCount.toLocaleString()} ТТ в памяти
                                        </div>
                                    </div>
                                </div>
                                {props.processingState.isProcessing && (
                                    <div className="pt-2">
                                        <div className="flex justify-between text-[10px] text-gray-400 mb-1 font-bold uppercase">
                                            <span>Прогресс индексации</span>
                                            <span className="text-indigo-400">{Math.round(props.processingState.progress)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-500" style={{ width: `${props.processingState.progress}%` }}></div>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-2 italic leading-tight">{props.processingState.message}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <OKBManagement onStatusChange={props.onOkbStatusChange} onDataChange={props.onOkbDataChange} status={props.okbStatus} disabled={props.disabled} />
                        <FileUpload processingState={props.processingState} onStartProcessing={props.onStartProcessing} onStartCloudProcessing={props.onStartCloudProcessing} okbStatus={props.okbStatus} disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'} />
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        <div className={`bg-gray-900/50 backdrop-blur-sm p-6 rounded-2xl border ${healthBorder} shadow-xl relative`}>
                            {props.processingState.isProcessing && <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/10"><div className="h-full bg-indigo-500/40 animate-shimmer" style={{width: '30%'}}></div></div>}
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                Качество загруженных данных
                                <span className={`text-2xl font-mono ${healthColor} ml-auto`}>{healthScore}%</span>
                            </h3>
                            
                            <div className="w-full bg-gray-800 rounded-full h-2 mb-6 overflow-hidden">
                                <div className={`h-full transition-all duration-1000 ease-out ${healthScore > 80 ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : healthScore > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${healthScore}%` }}></div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50 hover:bg-gray-800/60 transition-colors">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Всего строк</div>
                                    <div className="text-xl font-bold text-gray-200 font-mono">{rowsToDisplay}</div>
                                    <div className="flex items-center gap-1 text-[9px] text-gray-500 mt-2 italic">
                                        {props.processingState.isProcessing ? 'Чтение файлов...' : 'Загружено из локальной БД'}
                                    </div>
                                </div>
                                <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Уникальных ТТ</div>
                                    <div className="text-xl font-bold text-white font-mono">{props.activeClientsCount.toLocaleString()}</div>
                                    <div className="flex items-center gap-1 text-[9px] text-emerald-400 mt-2 uppercase font-bold">● Гео-объектов</div>
                                </div>
                                <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Неопознанные</div>
                                    <div className="text-xl font-bold text-white font-mono">{props.unidentifiedCount.toLocaleString()}</div>
                                    <div className="flex items-center gap-1 text-[9px] text-amber-400 mt-2 uppercase font-bold">⚠️ Ошибка разбора</div>
                                </div>
                                <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Охват ОКБ</div>
                                    <div className="text-xl font-bold text-white font-mono">{props.okbStatus?.coordsCount ? Math.round((props.activeClientsCount / props.okbStatus.coordsCount) * 100) : 0}%</div>
                                    <div className="flex items-center gap-1 text-[9px] text-indigo-400 mt-2 uppercase font-bold">Анализ пробелов</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-2xl border border-white/5 shadow-xl">
                            <div className="flex items-center justify-between mb-8 border-b border-gray-800/50 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                                        <ChannelIcon small />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-white tracking-tight uppercase">Структура Каналов Продаж</h3>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-0.5">Данные извлекаются на лету</p>
                                    </div>
                                </div>
                            </div>

                            {channelStats.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                    {channelStats.map((stat, idx) => (
                                        <div key={idx} className="space-y-2 group">
                                            <div className="flex justify-between items-end">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-indigo-300 transition-colors">{stat.name}</span>
                                                    <span className="text-[9px] text-indigo-400 font-bold mt-0.5">{stat.volumeTons.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т.</span>
                                                </div>
                                                <span className="text-xs font-mono text-gray-300">
                                                    <strong className="text-white">{stat.count.toLocaleString()}</strong> 
                                                    <span className="text-gray-500 ml-1">({stat.percentage.toFixed(1)}%)</span>
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out"
                                                    style={{ width: `${stat.percentage}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-40 flex flex-col items-center justify-center text-gray-600 border border-dashed border-gray-800 rounded-xl bg-black/10">
                                    <p className="text-sm italic">Идет сканирование облачных файлов...</p>
                                </div>
                            )}
                        </div>

                        <div className="p-5 bg-indigo-900/10 border border-indigo-500/10 rounded-xl text-sm text-indigo-200">
                            <strong className="block mb-1 text-indigo-300 flex items-center gap-2"><InfoIcon small /> Технология Online Preview:</strong>
                            Вы можете переходить в разделы «Аналитика» и «Дашборд» не дожидаясь завершения фонового процесса. Приложение будет автоматически пересчитывать показатели по мере поступления новых данных из Google Drive.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700 shadow-xl">
                            <h3 className="text-lg font-bold text-white mb-4">Статистический Анализ (Z-Score)</h3>
                            <p className="text-sm text-gray-400 mb-4">Автоматическое выявление аномалий в продажах. Инструмент DQ (Data Quality).</p>
                            <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-900/20 p-3 rounded-lg border border-amber-500/20"><AlertIcon small /><span>Найдено аномалий: <strong>{outliers.length}</strong></span></div>
                        </div>
                    </div>
                    <div className="lg:col-span-2">
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700 h-full overflow-hidden flex flex-col shadow-xl">
                            <h3 className="text-lg font-bold text-white mb-4">Детализация Аномалий</h3>
                            <div className="flex-grow overflow-y-auto custom-scrollbar">
                                {outliers.length > 0 ? (
                                    <table className="w-full text-left text-sm">
                                        <thead className="text-gray-500 border-b border-gray-700 sticky top-0 bg-gray-900/90 backdrop-blur"><tr><th className="pb-2 pl-2">Клиент/Группа</th><th className="pb-2">Факт</th><th className="pb-2">Z-Score</th><th className="pb-2">Диагноз</th></tr></thead>
                                        <tbody className="text-gray-300 divide-y divide-gray-800">
                                            {outliers.map((item: OutlierItem, idx: number) => (
                                                <tr key={idx} onClick={() => setSelectedOutlier(item)} className="hover:bg-indigo-500/10 cursor-pointer transition-colors" title="Нажмите для разбора"><td className="py-3 pl-2 font-medium text-white flex items-center gap-2">{item.row.clientName}<span className="text-xs text-gray-500">↗</span></td><td className="py-3 font-mono">{new Intl.NumberFormat('ru-RU').format(item.row.fact)}</td><td className={`py-3 font-mono font-bold ${Math.abs(item.zScore) > 3 ? 'text-red-400' : 'text-amber-400'}`}>{item.zScore.toFixed(2)}</td><td className="py-3 text-xs text-gray-400">{item.reason}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-gray-500"><CheckIcon /><p className="mt-2">Статистических аномалий не обнаружено.</p></div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {selectedOutlier && <OutlierDetailsModal isOpen={!!selectedOutlier} onClose={() => setSelectedOutlier(null)} item={selectedOutlier} />}
        </div>
    );
};

export default Adapta;
