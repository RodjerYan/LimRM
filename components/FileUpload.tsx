
import React from 'react';
import { OkbStatus, FileProcessingState } from '../types';
import { formatETR } from '../utils/timeUtils';
import { DataIcon, BrainIcon } from './icons';

interface FileUploadProps {
    processingState: FileProcessingState;
    onForceUpdate?: () => void;
    okbStatus: OkbStatus | null;
    disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ processingState, onForceUpdate, okbStatus, disabled }) => {
    
    // Derived state from global props
    const { isProcessing, progress, message, fileName, backgroundMessage, startTime } = processingState;
    const isBlocked = disabled || !okbStatus || okbStatus.status !== 'ready';
    const showBaseMissingOverlay = (!okbStatus || okbStatus.status !== 'ready') && !isProcessing && !fileName;
    
    const isAnalyzing = isProcessing && progress >= 80;

    let etr: number | null = null;
    if (isProcessing && startTime && progress > 0 && progress < 100) {
        const elapsedTime = (Date.now() - startTime) / 1000;
        const totalTime = (elapsedTime / progress) * 100;
        etr = totalTime - elapsedTime;
    }

    return (
        <div className={`relative group transition-all duration-500 ${isBlocked ? 'opacity-50 grayscale' : ''}`}>
             {!isBlocked && <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>}
            
            <div className="relative bg-gray-900/80 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full text-white font-bold shadow-lg ring-2 ring-white/10 ${isBlocked ? 'bg-gray-700' : 'bg-gradient-to-br from-purple-500 to-pink-600 shadow-purple-500/30'}`}>
                        2
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white leading-tight">Данные Продаж</h2>
                        <p className="text-xs text-gray-400">Источник: Cloud Snapshots (JSON)</p>
                    </div>
                </div>

                {/* Content Area - Pure Cloud Logic */}
                <div className="flex flex-col w-full border-2 border-dashed border-emerald-500/20 bg-emerald-900/5 rounded-xl p-4 relative overflow-hidden transition-all min-h-[160px]">
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

                    {isProcessing ? (
                        <div className="flex flex-col items-center justify-center h-full animate-pulse z-10 py-6">
                            {isAnalyzing ? (
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 text-emerald-400 mb-2"><BrainIcon /></div>
                                    <p className="text-sm font-bold text-emerald-300">Финализация данных...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-3"></div>
                                    <p className="text-sm font-medium text-emerald-100">Синхронизация JSON...</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="z-10 flex flex-col gap-4 justify-center h-full">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/20 shrink-0">
                                    <DataIcon small/>
                                </div>
                                <div className="flex-grow">
                                    <h3 className="text-sm font-bold text-emerald-100">Актуализация</h3>
                                    <p className="text-[10px] text-gray-400">Только быстрые снимки (Snapshots)</p>
                                </div>
                            </div>

                            <button 
                                onClick={onForceUpdate}
                                disabled={disabled}
                                className="group bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none w-full mt-2"
                            >
                                <span className="capitalize">Синхронизировать</span>
                                <svg className="w-4 h-4 opacity-70 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            </button>
                        </div>
                    )}
                    
                    {/* Progress Background */}
                    {progress > 0 && !isAnalyzing && (
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-700/50">
                            <div 
                                className="bg-gradient-to-r from-emerald-400 to-teal-400 h-full transition-all duration-300 ease-linear shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    )}
                </div>

                {/* Status & Progress Details */}
                {isProcessing && (
                    <div className="mt-4 bg-gray-800/40 rounded-xl p-3 border border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <p className="text-gray-200 font-medium truncate max-w-[70%]" title={fileName || 'Cloud Snapshot'}>
                                {fileName || `Cloud Snapshot`}
                            </p>
                            <span className="text-xs font-mono text-purple-300 bg-purple-900/30 px-1.5 py-0.5 rounded">{Math.round(progress)}%</span>
                        </div>
                        
                        <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-300 ease-linear relative shimmer-effect ${
                                    isAnalyzing 
                                        ? 'bg-gradient-to-r from-cyan-400 to-blue-500' // Analysis color
                                        : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                                }`}
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>

                        <div className="flex justify-between items-center text-xs pt-1">
                            <p className="text-gray-400 max-w-[85%] overflow-hidden whitespace-nowrap text-ellipsis" title={message}>{message}</p>
                            {etr !== null && !isAnalyzing && (
                                <p className="text-indigo-300 font-mono ml-2 flex-shrink-0">{formatETR(etr)}</p>
                            )}
                            {progress === 100 && message.includes("заверш") && (
                                <p className="text-emerald-400 font-bold flex items-center gap-1 ml-2 flex-shrink-0">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                    Готово
                                </p>
                            )}
                        </div>
                        
                        {backgroundMessage && (
                            <div className="mt-2 text-[10px] text-cyan-300 bg-cyan-900/20 px-2 py-1 rounded border border-cyan-500/20 flex items-center gap-2">
                               <div className="animate-spin w-2 h-2 border border-cyan-400 border-t-transparent rounded-full"></div> 
                               <span className="truncate max-w-full">{backgroundMessage}</span>
                            </div>
                        )}
                    </div>
                )}

                {showBaseMissingOverlay && (
                    <div className="absolute inset-0 z-20 bg-gray-900/60 backdrop-blur-[2px] flex items-center justify-center rounded-2xl border border-white/5">
                        <div className="bg-gray-800/90 p-4 rounded-xl border border-yellow-500/30 shadow-xl text-center max-w-[80%]">
                            <p className="text-yellow-400 text-sm font-medium">Сначала загрузите базу (Шаг 1)</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(FileUpload);
