
import React, { useState } from 'react';
import { OkbStatus, FileProcessingState, CloudLoadParams } from '../types';
import { formatETR } from '../utils/timeUtils';
import { DataIcon, BrainIcon } from './icons';

interface FileUploadProps {
    processingState: FileProcessingState;
    onStartProcessing: (file: File) => void;
    onStartCloudProcessing?: (params: CloudLoadParams) => void;
    okbStatus: OkbStatus | null;
    disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ processingState, onStartCloudProcessing, okbStatus, disabled }) => {
    // Range State
    const [startYear, setStartYear] = useState<string>('2025');
    const [startMonth, setStartMonth] = useState<number>(1);
    const [endYear, setEndYear] = useState<string>('2025');
    const [endMonth, setEndMonth] = useState<number>(new Date().getMonth() + 1);

    const isBlocked = disabled || !okbStatus || okbStatus.status !== 'ready';
    const { isProcessing, progress, message, backgroundMessage, startTime } = processingState;
    const isAnalyzing = isProcessing && progress >= 80;

    const months = [
        { id: 1, name: 'Январь' }, { id: 2, name: 'Февраль' }, { id: 3, name: 'Март' },
        { id: 4, name: 'Апрель' }, { id: 5, name: 'Май' }, { id: 6, name: 'Июнь' },
        { id: 7, name: 'Июль' }, { id: 8, name: 'Август' }, { id: 9, name: 'Сентябрь' },
        { id: 10, name: 'Октябрь' }, { id: 11, name: 'Ноябрь' }, { id: 12, name: 'Декабрь' }
    ];

    const years = ['2024', '2025', '2026'];

    const handleLoadClick = () => {
        if (!onStartCloudProcessing) return;
        
        // Validation
        const startDate = new Date(parseInt(startYear), startMonth - 1);
        const endDate = new Date(parseInt(endYear), endMonth - 1);
        
        if (endDate < startDate) {
            alert('Дата окончания не может быть раньше даты начала');
            return;
        }

        onStartCloudProcessing({
            startYear,
            startMonth,
            endYear,
            endMonth
        });
    };

    let etr: number | null = null;
    if (isProcessing && startTime && progress > 0 && progress < 100) {
        const elapsedTime = (Date.now() - startTime) / 1000;
        const totalTime = (elapsedTime / progress) * 100;
        etr = totalTime - elapsedTime;
    }

    const getMonthName = (id: number) => months.find(m => m.id === id)?.name || '';

    return (
        <div className={`relative group transition-all duration-500 ${isBlocked ? 'opacity-50 grayscale' : ''}`}>
             {!isBlocked && <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>}
            
            <div className="relative bg-gray-900/80 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl">
                <div className="flex items-center gap-4 mb-6">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full text-white font-bold shadow-lg ring-2 ring-white/10 ${isBlocked ? 'bg-gray-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30'}`}>
                        2
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white leading-tight">Загрузка данных</h2>
                        <p className="text-xs text-gray-400">Источник: Облачное хранилище (Google Drive API)</p>
                    </div>
                </div>

                <div className="flex flex-col w-full border-2 border-dashed border-emerald-500/20 bg-emerald-900/5 rounded-xl p-5 relative overflow-hidden transition-all">
                    {isProcessing ? (
                        <div className="flex flex-col items-center justify-center h-full animate-pulse z-10 py-6 min-h-[180px]">
                            {isAnalyzing ? (
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 text-emerald-400 mb-2"><BrainIcon /></div>
                                    <p className="text-sm font-bold text-emerald-300">Финальная аналитика...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-3"></div>
                                    <p className="text-sm font-medium text-emerald-100">Извлечение данных из облака...</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="z-10 flex flex-col gap-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/20 shrink-0">
                                    <DataIcon small/>
                                </div>
                                <div className="flex-grow">
                                    <h3 className="text-sm font-bold text-emerald-100 uppercase tracking-widest">Параметры диапазона</h3>
                                    <p className="text-[10px] text-gray-400">Выберите период выборки из БД Limkorm</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Start Range */}
                                <div className="space-y-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                    <label className="text-[10px] text-emerald-400 uppercase font-bold tracking-tighter">Начало периода</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <select 
                                            value={startYear} 
                                            onChange={(e) => setStartYear(e.target.value)}
                                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                                        >
                                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                        <select 
                                            value={startMonth} 
                                            onChange={(e) => setStartMonth(Number(e.target.value))}
                                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                                        >
                                            {months.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* End Range */}
                                <div className="space-y-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                    <label className="text-[10px] text-emerald-400 uppercase font-bold tracking-tighter">Конец периода</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <select 
                                            value={endYear} 
                                            onChange={(e) => setEndYear(e.target.value)}
                                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                                        >
                                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                        <select 
                                            value={endMonth} 
                                            onChange={(e) => setEndMonth(Number(e.target.value))}
                                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                                        >
                                            {months.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleLoadClick}
                                disabled={isBlocked}
                                className="group bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-500/40 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed w-full mt-2 transform active:scale-95"
                            >
                                <span>Загрузить данные: {getMonthName(startMonth)} {startYear} — {getMonthName(endMonth)} {endYear}</span>
                                <svg className="w-5 h-5 opacity-70 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </button>
                        </div>
                    )}
                    
                    {progress > 0 && !isAnalyzing && (
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-700/50">
                            <div 
                                className="bg-gradient-to-r from-emerald-400 to-teal-400 h-full transition-all duration-300 ease-linear shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    )}
                </div>

                {isProcessing && (
                    <div className="mt-4 bg-gray-800/40 rounded-xl p-3 border border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <p className="text-gray-200 font-medium">Синхронизация диапазона периодов</p>
                            <span className="text-xs font-mono text-emerald-300 bg-emerald-900/30 px-1.5 py-0.5 rounded">{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-300 ease-linear relative shimmer-effect ${isAnalyzing ? 'bg-gradient-to-r from-cyan-400 to-blue-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}`}
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between items-center text-xs pt-1">
                            <p className="text-gray-400 italic truncate max-w-[80%]">{message}</p>
                            {etr !== null && !isAnalyzing && (
                                <p className="text-emerald-300 font-mono flex-shrink-0">{formatETR(etr)}</p>
                            )}
                        </div>
                        {backgroundMessage && (
                            <div className="mt-2 text-[10px] text-cyan-300 bg-cyan-900/20 px-2 py-1 rounded border border-cyan-500/20 flex items-center gap-2">
                               <div className="animate-spin w-2 h-2 border border-cyan-400 border-t-transparent rounded-full"></div> 
                               <span className="truncate">{backgroundMessage}</span>
                            </div>
                        )}
                    </div>
                )}

                {(!okbStatus || okbStatus.status !== 'ready') && !isProcessing && (
                    <div className="absolute inset-0 z-20 bg-gray-900/60 backdrop-blur-[2px] flex items-center justify-center rounded-2xl border border-white/5">
                        <div className="bg-gray-800/90 p-5 rounded-xl border border-yellow-500/30 shadow-2xl text-center max-w-[80%]">
                            <div className="text-yellow-500 text-3xl mb-2">⚠️</div>
                            <p className="text-yellow-400 text-sm font-bold uppercase tracking-widest">Требуется База</p>
                            <p className="text-gray-400 text-xs mt-1">Сначала загрузите реестр (Шаг 1)</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileUpload;
