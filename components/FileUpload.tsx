
import React, { useState, useCallback } from 'react';
import { OkbStatus, FileProcessingState } from '../types';
import { formatETR } from '../utils/timeUtils';
import { DataIcon } from './icons';

interface FileUploadProps {
    // New Props from Global State
    processingState: FileProcessingState;
    onStartProcessing: (file: File) => void;
    // Updated: Callback for cloud processing now accepts a year
    onStartCloudProcessing?: (year: string) => void;
    
    okbStatus: OkbStatus | null;
    disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ processingState, onStartProcessing, onStartCloudProcessing, okbStatus, disabled }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [mode, setMode] = useState<'file' | 'cloud'>('file');
    const [selectedYear, setSelectedYear] = useState<string>('2025');

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
                            <p className="text-xs text-gray-400">Источник: {mode === 'file' ? 'Локальный файл (XLSX)' : `Google Sheets (${selectedYear})`}</p>
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
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mode === 'cloud' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
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
                    <div className="flex flex-col items-center justify-center w-full min-h-[12rem] border-2 border-dashed border-emerald-500/20 bg-emerald-900/5 rounded-xl p-6 relative overflow-hidden transition-all">
                        {/* Background decoration */}
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

                        {isProcessing ? (
                            <div className="flex flex-col items-center animate-pulse z-10">
                                <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-3"></div>
                                <p className="text-sm font-medium text-emerald-100">Синхронизация с облаком ({selectedYear})...</p>
                            </div>
                        ) : (
                            <div className="text-center z-10 flex flex-col items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-900/20">
                                    <DataIcon />
                                </div>
                                
                                <div className="space-y-1">
                                    <h3 className="text-sm font-bold text-emerald-100">Google Sheets Источник</h3>
                                    <p className="text-xs text-gray-400 max-w-[280px] mx-auto leading-relaxed">
                                        Выберите год для загрузки базы АКБ.
                                    </p>
                                </div>

                                {/* Year Selection Buttons */}
                                <div className="flex bg-gray-800/80 p-1 rounded-lg border border-emerald-500/20 backdrop-blur-sm">
                                    <button 
                                        onClick={() => setSelectedYear('2025')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${selectedYear === '2025' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        2025
                                    </button>
                                    <button 
                                        onClick={() => setSelectedYear('2026')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${selectedYear === '2026' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        2026
                                    </button>
                                </div>

                                <button 
                                    onClick={() => onStartCloudProcessing && onStartCloudProcessing(selectedYear)}
                                    disabled={disabled}
                                    className="group bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2.5 px-6 rounded-lg transition-all duration-200 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                >
                                    <span>Загрузить {selectedYear}</span>
                                    <svg className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                </button>
                            </div>
                        )}
                        
                        {/* Progress Background for Cloud */}
                        {progress > 0 && (
                            <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-700/50">
                                <div 
                                    className="bg-gradient-to-r from-emerald-400 to-teal-400 h-full transition-all duration-300 ease-linear shadow-[0_0_10px_rgba(52,211,153,0.5)]"
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
                                {fileName || `Google Sheets (${selectedYear})`}
                            </p>
                            <span className="text-xs font-mono text-purple-300 bg-purple-900/30 px-1.5 py-0.5 rounded">{Math.round(progress)}%</span>
                        </div>
                        
                        <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-300 ease-linear relative shimmer-effect ${mode === 'cloud' ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-indigo-400 to-purple-500'}`}
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
