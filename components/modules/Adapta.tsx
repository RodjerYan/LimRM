
import React, { useState, useMemo } from 'react';
import FileUpload from '../FileUpload';
import OKBManagement from '../OKBManagement';
import OutlierDetailsModal from '../OutlierDetailsModal';
import { OkbStatus, WorkerResultPayload, AggregatedDataRow, FileProcessingState, CloudLoadParams } from '../../types';
import { CheckIcon, WarningIcon, AlertIcon, DataIcon, InfoIcon, SuccessIcon, ChannelIcon } from '../icons';
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

    // Расчет разбивки по каналам продаж
    const channelStats = useMemo(() => {
        if (!props.uploadedData || props.uploadedData.length === 0) return [];
        const counts: Record<string, number> = {};
        let total = 0;

        props.uploadedData.forEach(row => {
            row.clients.forEach(client => {
                const type = client.type || 'Не определен';
                counts[type] = (counts[type] || 0) + 1;
                total++;
            });
        });

        return Object.entries(counts)
            .map(([name, count]) => ({
                name,
                count,
                percentage: total > 0 ? (count / total) * 100 : 0
            }))
            .sort((a, b) => b.count - a.count);
    }, [props.uploadedData]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">ADAPTA <span className="text-gray-500 font-normal text-lg">/ Управление данными</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Автоматизация загрузки, валидации и стандартизации данных. Оценка качества и скоринг.</p>
                </div>
                <div className="flex space-x-2">
                    <button onClick={() => setActiveTab('ingest')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'ingest' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Загрузка</button>
                    <button onClick={() => setActiveTab('hygiene')} disabled={props.activeClientsCount === 0} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'hygiene' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white disabled:opacity-50'}`}>Диагностика</button>
                </div>
            </div>

            {activeTab === 'ingest' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-6">
                        {/* Статус локальной базы */}
                        <div className="bg-gray-900/80 p-5 rounded-2xl border border-white/10 shadow-xl">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <DataIcon small /> Локальное хранилище
                            </h3>
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${props.dbStatus === 'ready' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
                                    {props.dbStatus === 'ready' ? <SuccessIcon /> : <InfoIcon />}
                                </div>
                                <div>
                                    <div className="text-white font-bold text-lg">
                                        {props.dbStatus === 'ready' ? 'База подключена' : props.dbStatus === 'loading' ? 'Считывание...' : 'Хранилище пусто'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {props.dbStatus === 'ready' ? 'Доступ к 14к+ записям мгновенный' : 'Требуется синхронизация с облаком'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <OKBManagement onStatusChange={props.onOkbStatusChange} onDataChange={props.onOkbDataChange} status={props.okbStatus} disabled={props.disabled} />
                        <FileUpload processingState={props.processingState} onStartProcessing={props.onStartProcessing} onStartCloudProcessing={props.onStartCloudProcessing} okbStatus={props.okbStatus} disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'} />
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        <div className={`bg-gray-900/50 backdrop-blur-sm p-6 rounded-2xl border ${healthBorder} shadow-xl`}>
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                Качество данных (Health Score)
                                <span className={`text-2xl font-mono ${healthColor} ml-auto`}>{healthScore}%</span>
                            </h3>
                            
                            <div className="w-full bg-gray-800 rounded-full h-2 mb-6 overflow-hidden">
                                <div className={`h-full transition-all duration-1000 ease-out ${healthScore > 80 ? 'bg-emerald-500' : healthScore > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${healthScore}%` }}></div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Всего строк</div>
                                    <div className="text-xl font-bold text-gray-200">{props.processingState.totalRowsProcessed || (props.activeClientsCount > 0 ? props.activeClientsCount : '—')}</div>
                                    <div className="flex items-center gap-1 text-[9px] text-gray-500 mt-2"><DataIcon small /> Транзакции в файлах</div>
                                </div>
                                <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Уникальные ТТ</div>
                                    <div className="text-xl font-bold text-white">{props.activeClientsCount}</div>
                                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-2"><CheckIcon /> Проверено</div>
                                </div>
                                <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Неопознанные</div>
                                    <div className="text-xl font-bold text-white">{props.unidentifiedCount}</div>
                                    <div className="flex items-center gap-1 text-xs text-amber-400 mt-2"><WarningIcon /> Требуют внимания</div>
                                </div>
                                <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Покрытие ОКБ</div>
                                    <div className="text-xl font-bold text-white">{props.okbStatus?.coordsCount ? Math.round((props.activeClientsCount / props.okbStatus.coordsCount) * 100) : 0}%</div>
                                    <div className="flex items-center gap-1 text-xs text-indigo-400 mt-2">Анализ пробелов</div>
                                </div>
                            </div>
                        </div>

                        {/* НОВЫЙ БЛОК: Разбивку по каналам продаж */}
                        <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-2xl border border-white/5 shadow-xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <ChannelIcon small className="text-indigo-400" />
                                    Разбивка по каналам продаж
                                </h3>
                                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700 font-mono">
                                    Total n={props.activeClientsCount}
                                </span>
                            </div>

                            {channelStats.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                    {channelStats.map((stat, idx) => (
                                        <div key={idx} className="space-y-2 group">
                                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                                                <span className="text-gray-400 group-hover:text-indigo-300 transition-colors">{stat.name}</span>
                                                <span className="text-white font-mono">{stat.count} ТТ <span className="text-gray-500 font-normal">({stat.percentage.toFixed(1)}%)</span></span>
                                            </div>
                                            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                                                    style={{ width: `${stat.percentage}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-40 flex flex-col items-center justify-center text-gray-600 border border-dashed border-gray-800 rounded-xl">
                                    <InfoIcon className="mb-2 opacity-20" />
                                    <p className="text-sm">Данные о каналах появятся после загрузки</p>
                                </div>
                            )}

                            <div className="mt-8 p-4 bg-gray-800/30 border border-gray-700/50 rounded-xl flex items-start gap-4">
                                <div className="mt-0.5 text-gray-500"><InfoIcon small /></div>
                                <div className="text-[11px] text-gray-400 leading-relaxed italic">
                                    Классификация каналов сбыта (Зоо сети, Розница, Бридер канал) используется для уточнения алгоритмов 
                                    <strong> Smart Planning</strong> и выявления специфических трендов в каждом сегменте.
                                </div>
                            </div>
                        </div>

                        <div className="p-5 bg-indigo-900/20 border border-indigo-500/20 rounded-xl text-sm text-indigo-200 shadow-inner">
                            <strong className="block mb-2 text-indigo-100 flex items-center gap-2"><InfoIcon small /> Режим работы системы:</strong>
                            {props.dbStatus === 'ready' 
                                ? `Система использует локальную базу данных (моментальная загрузка). Каждые 60 секунд проводится проверка облака на наличие новых версий. Если данные изменятся, обновление произойдет автоматически.`
                                : "Локальная база отсутствует. Пожалуйста, инициируйте загрузку через кнопку «Облако» в блоке слева."}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700 shadow-xl">
                            <h3 className="text-lg font-bold text-white mb-4">Статистический Анализ (Z-Score)</h3>
                            <p className="text-sm text-gray-400 mb-4">Система автоматически находит отклонения в продажах, используя метод Z-оценки. Это помогает выявить ошибки ввода или найти скрытых "чемпионов".</p>
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
