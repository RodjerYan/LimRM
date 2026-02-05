
import React from 'react';
import { UpdateJobStatus } from '../types';
import { LoaderIcon, CheckIcon, ErrorIcon } from './icons';

interface DataUpdateOverlayProps {
    jobStatus: UpdateJobStatus | null;
}

const DataUpdateOverlay: React.FC<DataUpdateOverlayProps> = ({ jobStatus }) => {
    if (!jobStatus) {
        return null;
    }

    const { status, message, progress } = jobStatus;

    const getIcon = () => {
        switch (status) {
            case 'processing':
            case 'pending':
                return <LoaderIcon className="w-12 h-12 text-indigo-400" />;
            case 'completed':
                return <CheckIcon className="w-12 h-12 text-emerald-400" />;
            case 'error':
                return <ErrorIcon className="w-12 h-12 text-red-400" />;
            default:
                return null;
        }
    };
    
    const getProgressBarColor = () => {
        switch (status) {
            case 'completed':
                return 'bg-emerald-500';
            case 'error':
                return 'bg-red-500';
            default:
                return 'bg-indigo-500';
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/80 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-lg bg-gray-800/50 p-8 rounded-2xl shadow-2xl border border-white/10 text-center">
                <div className="mx-auto w-fit mb-6">
                    {getIcon()}
                </div>

                <h2 className="text-xl font-bold text-white mb-2">
                    {status === 'pending' && 'Ожидание запуска...'}
                    {status === 'processing' && 'Обновление данных...'}
                    {status === 'completed' && 'Обновление завершено!'}
                    {status === 'error' && 'Ошибка обновления'}
                </h2>

                <p className="text-sm text-gray-400 mb-6 min-h-[40px]">{message}</p>

                <div className="w-full bg-gray-700/50 rounded-full h-2.5 overflow-hidden">
                    <div
                        className={`h-2.5 rounded-full transition-all duration-500 ease-out ${getProgressBarColor()}`}
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>

                {status === 'completed' && (
                    <p className="text-xs text-gray-500 mt-4 animate-pulse">
                        Перезагрузка приложения для применения новых данных...
                    </p>
                )}
            </div>
        </div>
    );
};

export default DataUpdateOverlay;