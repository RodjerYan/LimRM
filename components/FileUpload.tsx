
import React, { useState, useCallback } from 'react';
import { OkbStatus, FileProcessingState } from '../types';
import { formatETR } from '../utils/timeUtils';
import { DataIcon } from './icons';

interface FileUploadProps {
    // New Props from Global State
    processingState: FileProcessingState;
    onStartProcessing: (file: File) => void;
    // Callback for cloud processing
    onStartCloudProcessing?: () => void;
    
    okbStatus: OkbStatus | null;
    disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ processingState, onStartProcessing, onStartCloudProcessing, okbStatus, disabled }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [mode, setMode] = useState<'file' | 'cloud'>('file');

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onStartProcessing(file);
        }
        event.target.value = '';
    }, [onStartProcessing]);

    const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled || mode === 'cloud') return;
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (disabled || mode === 'cloud') return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onStartProcessing(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    }, [onStartProcessing, disabled, mode]);

    // Derived state from global props
    const { isProcessing, progress, message, fileName, backgroundMessage, startTime } = processingState;
    const isBlocked = disabled || !okbStatus || okbStatus.status !== 'ready';
    const showBaseMissingOverlay = (!okbStatus || okbStatus.status !== 'ready') && !isProcessing && !fileName;

    // Calculate ETR locally based on startTime passed from global state
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
                {/* Header with Mode Switcher */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full text-white font-bold shadow-lg ring-2 ring-white/10 ${isBlocked ? 'bg-gray-700' : 'bg-gradient-to-br from-purple-500 to-pink-600 shadow-purple-500/30'}`}>
                            2
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white leading-tight">Загрузка данных</h2>
                            <p className="text-xs text-gray-400">Источник: {mode === 'file' ? 'Локальный файл (XLSX)' : 'Google Sheets (АКБ)'}</p>
                        </div>
                    </div>
                    
                    {!isProcessing && !isBlocked && (
                        <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
                            <button 
                                onClick={() => setMode('file')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mode === 'file' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                Файл
                            </button>
                            <button 
                                onClick={() => setMode('cloud')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mode === 'cloud' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                Облако
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                {mode === 'file' ? (
                    <div className="relative group/drop">
                        <label 
                            htmlFor="dropzone-file" 
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDragOver={handleDragEnter}
                            onDrop={handleDrop}
                            className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl transition-all duration-300 overflow-hidden ${
                                isProcessing ? 'cursor-wait border-indigo-500/50 bg-indigo-900/10' : 
                                isDragging ? 'border-purple-400 bg-purple-900/20 scale-[1.02] shadow-inner' : 
                                isBlocked ? 'cursor-not-allowed border-gray-700 bg-gray-800/50' :
                                'cursor-pointer border-gray-600 hover:border-purple-400/50 hover:bg-gray-800/80'
                            }`}
                        >
                            <div className="flex flex-col items-center justify-center text-center z-10 p-4">
                                {isProcessing ? (
                                    <div className="flex flex-col items-center animate-pulse">
                                        <div className="border-4 border-indigo-400 border-t-transparent rounded-full w-10 h-10 animate-spin mb-3"></div>
                                        <p className="text-sm font-medium text-white">Обработка файла...</p>
                                    </div>
                                ) : (
                                    <>
                                        <svg className={`w-10 h-10 mb-3 transition-colors duration-300 ${isDragging ? 'text-purple-400' : 'text-gray-500 group-hover/drop:text-purple-300'}`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                                        </svg>
                                        <p className="mb-1 text-sm text-gray-300">
                                            <span className="font-bold text-purple-400">Нажмите</span> или перетащите файл
                                        </p>
                                    </>
                                )}
                            </div>
                            {/* Progress Background */}
                            {progress > 0 && (
                                <div 
                                    className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            )}
                            <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept=".xlsx, .xls, .csv" disabled={isProcessing || isBlocked} />
                        </label>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center w-full h-40 border border-gray-700 bg-gray-800/30 rounded-xl p-6">
                        {isProcessing ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <div className="border-4 border-indigo-400 border-t-transparent rounded-full w-10 h-10 animate-spin mb-3"></div>
                                <p className="text-sm font-medium text-white">Загрузка из облака...</p>
                            </div>
                        ) : (
                            <div className="text-center">
                                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-500/30">
                                    <DataIcon />
                                </div>
                                <p className="text-sm text-gray-300 mb-4 max-w-xs mx-auto">
                                    Загрузить актуальную базу АКБ (Active Client Base) напрямую из подключенной Google Таблицы.
                                </p>
                                <button 
                                    onClick={onStartCloudProcessing}
                                    disabled={disabled}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20"
                                >
                                    Загрузить АКБ из Google Sheets
                                </button>
                            </div>
                        )}
                        {/* Progress Background for Cloud */}
                        {progress > 0 && (
                            <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden mt-auto">
                                <div 
                                    className="bg-gradient-to-r from-emerald-400 to-teal-500 h-full rounded-full transition-all duration-300 ease-linear relative shimmer-effect"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        )}
                    </div>
                )}

                {/* Status & Progress Details */}
                {(fileName || (mode === 'cloud' && isProcessing)) && (
                    <div className="mt-4 bg-gray-800/40 rounded-xl p-3 border border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <p className="text-gray-200 font-medium truncate max-w-[70%]" title={fileName || 'Cloud Data'}>
                                {fileName || 'Google Sheets Data'}
                            </p>
                            <span className="text-xs font-mono text-purple-300 bg-purple-900/30 px-1.5 py-0.5 rounded">{Math.round(progress)}%</span>
                        </div>
                        
                        <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className="bg-gradient-to-r from-indigo-400 to-purple-500 h-full rounded-full transition-all duration-300 ease-linear relative shimmer-effect"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>

                        <div className="flex justify-between items-center text-xs pt-1">
                            <p className="text-gray-400 truncate max-w-[65%]">{message}</p>
                            {isProcessing && etr !== null && (
                                <p className="text-indigo-300 font-mono">{formatETR(etr)}</p>
                            )}
                            {progress === 100 && message.includes("заверш") && (
                                <p className="text-emerald-400 font-bold flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                    Готово
                                </p>
                            )}
                        </div>
                        
                        {backgroundMessage && (
                            <div className="mt-2 text-[10px] text-cyan-300 bg-cyan-900/20 px-2 py-1 rounded border border-cyan-500/20 flex items-center gap-2">
                               <div className="animate-spin w-2 h-2 border border-cyan-400 border-t-transparent rounded-full"></div> 
                               {backgroundMessage}
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

export default FileUpload;
