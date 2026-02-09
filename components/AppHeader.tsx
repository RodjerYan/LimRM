
import React from 'react';
import { LoaderIcon, CloudDownloadIcon } from './icons';
import { FileProcessingState, UpdateJobStatus } from '../types';

interface AppHeaderProps {
    dbStatus: 'empty' | 'ready' | 'loading';
    isCloudSaving: boolean;
    processingState: FileProcessingState;
    activeModule: string;
    updateJobStatus: UpdateJobStatus | null;
    onStartDataUpdate: () => void;
    activeClientsCount: number;
    queueLength?: number; // Added queue feedback
}

export const AppHeader: React.FC<AppHeaderProps> = ({ 
    dbStatus, 
    isCloudSaving, 
    processingState, 
    activeModule, 
    updateJobStatus, 
    onStartDataUpdate, 
    activeClientsCount,
    queueLength = 0
}) => {
    return (
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-6">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${dbStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Local DB</span>
                    </div>
                    <span className="text-xs font-bold text-gray-800">{dbStatus === 'ready' ? 'Ready' : 'Syncing...'}</span>
                </div>
                {isCloudSaving && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full border border-blue-100 text-xs font-bold animate-pulse">
                        <LoaderIcon className="w-3 h-3" />
                        <span>Сохранение в облако...</span>
                    </div>
                )}
                {queueLength > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 text-xs font-bold animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                        <span>Очередь: {queueLength}</span>
                    </div>
                )}
                {!isCloudSaving && processingState.isProcessing && (
                    <div className="px-4 py-1.5 bg-yellow-50 border border-yellow-200 rounded-full text-[10px] font-bold text-yellow-700 animate-pulse">
                        {processingState.message} {Math.round(processingState.progress)}%
                    </div>
                )}
            </div>
            <div className="flex items-center gap-4 text-right">
                {activeModule === 'amp' && (
                     <button 
                        onClick={onStartDataUpdate}
                        disabled={!!updateJobStatus && updateJobStatus.status !== 'completed' && updateJobStatus.status !== 'error'}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:text-black transition-all disabled:opacity-50 disabled:cursor-wait shadow-sm"
                        title="Запустить фоновый процесс обновления рыночных данных на сервере."
                    >
                        <CloudDownloadIcon className="w-4 h-4" />
                        <span>Запустить обновление рыночных данных</span>
                    </button>
                )}
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Активных ТТ</span>
                    <span className="text-gray-900 font-mono font-bold text-base">{activeClientsCount.toLocaleString()}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center font-bold text-white shadow-md">
                    L
                </div>
            </div>
        </div>
    );
};
