
import React, { useState, useMemo } from 'react';
import FileUpload from '../FileUpload';
import OKBManagement from '../OKBManagement';
import OutlierDetailsModal from '../OutlierDetailsModal';
import { OkbStatus, WorkerResultPayload, AggregatedDataRow, FileProcessingState } from '../../types';
import { CheckIcon, WarningIcon, AlertIcon } from '../icons';
import { detectOutliers } from '../../utils/analytics';

interface AdaptaProps {
    // Global Processing Props
    processingState: FileProcessingState;
    onStartProcessing: (file: File) => void;

    // Legacy/Data Props
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
}

interface OutlierItem {
    row: AggregatedDataRow;
    zScore: number;
    reason: string;
}

const Adapta: React.FC<AdaptaProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'ingest' | 'hygiene'>('ingest');
    const [selectedOutlier, setSelectedOutlier] = useState<OutlierItem | null>(null);

    // Calculate a mock "Data Quality Score" based on props
    const healthScore = useMemo(() => {
        if (props.activeClientsCount === 0) return 0;
        const penalty = props.unidentifiedCount * 5; // Heavy penalty for unidentified
        const baseScore = 100;
        return Math.max(0, Math.round(baseScore - (penalty / props.activeClientsCount) * 100));
    }, [props.activeClientsCount, props.unidentifiedCount]);

    const healthColor = healthScore > 80 ? 'text-emerald-400' : healthScore > 50 ? 'text-amber-400' : 'text-red-400';
    const healthBorder = healthScore > 80 ? 'border-emerald-500/30' : healthScore > 50 ? 'border-amber-500/30' : 'border-red-500/30';

    // Perform outlier analysis
    const outliers = useMemo<OutlierItem[]>(() => {
        if (!props.uploadedData || props.uploadedData.length === 0) return [];
        return detectOutliers(props.uploadedData);
    }, [props.uploadedData]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">ADAPTA <span className="text-gray-500 font-normal text-lg">/ Управление данными</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Автоматизация загрузки, валидации и стандартизации данных. Оценка качества и скоринг.</p>
                </div>
                <div className="flex space-x-2">
                    <button 
                        onClick={() => setActiveTab('ingest')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'ingest' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                        Загрузка
                    </button>
                    <button 
                        onClick={() => setActiveTab('hygiene')}
                        disabled={props.activeClientsCount === 0}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'hygiene' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white disabled:opacity-50'}`}
                    >
                        Диагностика
                    </button>
                </div>
            </div>

            {activeTab === 'ingest' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-6">
                        <OKBManagement 
                            onStatusChange={props.onOkbStatusChange}
                            onDataChange={props.onOkbDataChange}
                            status={props.okbStatus}
                            disabled={props.disabled}
                        />
                        <FileUpload 
                            // New props for global state
                            processingState={props.processingState}
                            onStartProcessing={props.onStartProcessing}
                            
                            // Data dependencies
                            okbStatus={props.okbStatus}
                            disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'}
                        />
                    </div>

                    <div className="lg:col-span-2">
                        <div className={`bg-gray-900/50 backdrop-blur-sm p-6 rounded-2xl border ${healthBorder} h-full`}>
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                Качество данных (Health Score)
                                <span className={`text-2xl font-mono ${healthColor} ml-auto`}>{healthScore}%</span>
                            </h3>
                            
                            <div className="w-full bg-gray-800 rounded-full h-2 mb-6">
                                <div 
                                    className={`h-2 rounded-full transition-all duration-1000 ${healthScore > 80 ? 'bg-emerald-500' : healthScore > 50 ? 'bg-amber-500' : 'bg-red-500'}`} 
                                    style={{ width: `${healthScore}%` }}
                                ></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                                    <div className="text-xs text-gray-400 uppercase mb-1">Активные записи</div>
                                    <div className="text-xl font-bold text-white">{props.activeClientsCount}</div>
                                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-2">
                                        <CheckIcon /> Проверено
                                    </div>
                                </div>
                                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                                    <div className="text-xs text-gray-400 uppercase mb-1">Неопознанные</div>
                                    <div className="text-xl font-bold text-white">{props.unidentifiedCount}</div>
                                    <div className="flex items-center gap-1 text-xs text-amber-400 mt-2">
                                        <WarningIcon /> Требуют внимания
                                    </div>
                                </div>
                                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                                    <div className="text-xs text-gray-400 uppercase mb-1">Покрытие ОКБ</div>
                                    <div className="text-xl font-bold text-white">
                                        {props.okbStatus?.coordsCount ? Math.round((props.activeClientsCount / props.okbStatus.coordsCount) * 100) : 0}%
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-indigo-400 mt-2">
                                        Анализ пробелов
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 p-4 bg-indigo-900/20 border border-indigo-500/20 rounded-xl text-sm text-indigo-200">
                                <strong className="block mb-1 text-indigo-100">Диагностика данных:</strong>
                                {props.unidentifiedCount > 0 
                                    ? "Обнаружены записи с неоднозначными гео-данными. Пожалуйста, используйте инструмент очистки в разделе Аналитика, чтобы исправить их для повышения точности моделирования."
                                    : "Качество данных оптимально. Готово к моделированию в AMP и сценарному планированию в PROPHET."}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700">
                            <h3 className="text-lg font-bold text-white mb-4">Статистический Анализ (Z-Score)</h3>
                            <p className="text-sm text-gray-400 mb-4">
                                Система автоматически находит отклонения в продажах, используя метод Z-оценки. 
                                Это помогает выявить ошибки ввода (слишком большие/малые числа) или найти скрытых "чемпионов".
                            </p>
                            <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-900/20 p-3 rounded-lg border border-amber-500/20">
                                <AlertIcon small />
                                <span>Найдено аномалий: <strong>{outliers.length}</strong></span>
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-2">
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700 h-full overflow-hidden flex flex-col">
                            <h3 className="text-lg font-bold text-white mb-4">Детализация Аномалий (Нажмите для разбора)</h3>
                            <div className="flex-grow overflow-y-auto custom-scrollbar">
                                {outliers.length > 0 ? (
                                    <table className="w-full text-left text-sm">
                                        <thead className="text-gray-500 border-b border-gray-700 sticky top-0 bg-gray-900/90 backdrop-blur">
                                            <tr>
                                                <th className="pb-2 pl-2">Клиент/Группа</th>
                                                <th className="pb-2">Факт</th>
                                                <th className="pb-2">Z-Score</th>
                                                <th className="pb-2">Диагноз</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-300 divide-y divide-gray-800">
                                            {outliers.map((item: OutlierItem, idx: number) => (
                                                <tr 
                                                    key={idx} 
                                                    onClick={() => setSelectedOutlier(item)}
                                                    className="hover:bg-indigo-500/10 cursor-pointer transition-colors"
                                                    title="Нажмите, чтобы увидеть список ТТ и причины отклонения"
                                                >
                                                    <td className="py-3 pl-2 font-medium text-white flex items-center gap-2">
                                                        {item.row.clientName}
                                                        <span className="text-xs text-gray-500">↗</span>
                                                    </td>
                                                    <td className="py-3 font-mono">{new Intl.NumberFormat('ru-RU').format(item.row.fact)}</td>
                                                    <td className={`py-3 font-mono font-bold ${Math.abs(item.zScore) > 3 ? 'text-red-400' : 'text-amber-400'}`}>
                                                        {item.zScore.toFixed(2)}
                                                    </td>
                                                    <td className="py-3 text-xs text-gray-400">{item.reason}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                                        <CheckIcon />
                                        <p className="mt-2">Статистических аномалий не обнаружено.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Outlier Details Modal */}
            {selectedOutlier && (
                <OutlierDetailsModal
                    isOpen={!!selectedOutlier}
                    onClose={() => setSelectedOutlier(null)}
                    item={selectedOutlier}
                />
            )}
        </div>
    );
};

export default Adapta;
