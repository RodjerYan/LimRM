
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
        <div className="sticky top-0 z-30 bg-primary-dark/95 backdrop-blur-md border-b border-gray-800 px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-6">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${dbStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Local DB</span>
                    </div>
                    <span className="text-xs font-bold text-white">{dbStatus === 'ready' ? 'Ready' : 'Syncing...'}</span>
                </div>
                {isCloudSaving && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30 text-xs font-bold animate-pulse">
                        <LoaderIcon className="w-3 h-3" />
                        <span>Сохранение в облако...</span>
                    </div>
                )}
                {queueLength > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/30 text-xs font-bold animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                        <span>Очередь: {queueLength}</span>
                    </div>
                )}
                {!isCloudSaving && processingState.isProcessing && (
                    <div className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-bold text-indigo-300 animate-pulse">
                        {processingState.message} {Math.round(processingState.progress)}%
                    </div>
                )}
            </div>
            <div className="flex items-center gap-4 text-right">
                {activeModule === 'amp' && (
                     <button 
                        onClick={onStartDataUpdate}
                        disabled={!!updateJobStatus && updateJobStatus.status !== 'completed' && updateJobStatus.status !== 'error'}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-all disabled:opacity-50 disabled:cursor-wait"
                        title="Запустить фоновый процесс обновления рыночных данных на сервере."
                    >
                        <CloudDownloadIcon className="w-4 h-4" />
                        <span>Запустить обновление рыночных данных</span>
                    </button>
                )}
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 uppercase font-bold">Активных ТТ</span>
                    <span className="text-emerald-400 font-mono font-bold text-base">{activeClientsCount.toLocaleString()}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white">L</div>
            </div>
        </div>
    );
};
