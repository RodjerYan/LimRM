import React from 'react';
import FileUpload from '../FileUpload';
import OKBManagement from '../OKBManagement';
import { OkbStatus, WorkerResultPayload } from '../../types';
import { CheckIcon, WarningIcon } from '../icons';

interface AdaptaProps {
    onFileProcessed: (data: WorkerResultPayload) => void;
    onProcessingStateChange: (isLoading: boolean, message: string) => void;
    okbData: any[];
    okbStatus: OkbStatus | null;
    onOkbStatusChange: (status: OkbStatus) => void;
    onOkbDataChange: (data: any[]) => void;
    disabled: boolean;
    unidentifiedCount: number;
    activeClientsCount: number;
}

const Adapta: React.FC<AdaptaProps> = (props) => {
    // Calculate a mock "Data Quality Score" based on props
    const calculateHealthScore = () => {
        if (props.activeClientsCount === 0) return 0;
        const penalty = props.unidentifiedCount * 5; // Heavy penalty for unidentified
        const baseScore = 100;
        return Math.max(0, Math.round(baseScore - (penalty / props.activeClientsCount) * 100));
    };

    const healthScore = calculateHealthScore();
    const healthColor = healthScore > 80 ? 'text-emerald-400' : healthScore > 50 ? 'text-amber-400' : 'text-red-400';
    const healthBorder = healthScore > 80 ? 'border-emerald-500/30' : healthScore > 50 ? 'border-amber-500/30' : 'border-red-500/30';

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">ADAPTA <span className="text-gray-500 font-normal text-lg">/ Управление данными</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Автоматизированная загрузка, очистка и стандартизация данных.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6">
                    <OKBManagement 
                        onStatusChange={props.onOkbStatusChange}
                        onDataChange={props.onOkbDataChange}
                        status={props.okbStatus}
                        disabled={props.disabled}
                    />
                    <FileUpload 
                        onFileProcessed={props.onFileProcessed}
                        onProcessingStateChange={props.onProcessingStateChange}
                        okbData={props.okbData}
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
        </div>
    );
};

export default Adapta;