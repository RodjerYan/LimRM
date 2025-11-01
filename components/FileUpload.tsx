import React, { useState, useRef, useCallback } from 'react';
import { WorkerMessage, AggregatedDataRow, OkbStatus } from '../types';
import { formatETR } from '../utils/timeUtils';

interface FileUploadProps {
    onFileProcessed: (data: AggregatedDataRow[]) => void;
    onProcessingStateChange: (isLoading: boolean, message: string) => void;
    okbData: any[];
    okbStatus: OkbStatus | null;
    disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileProcessed, onProcessingStateChange, okbData, okbStatus, disabled }) => {
    const [fileName, setFileName] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('Загрузите файл с данными');
    const [etr, setEtr] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const startTimeRef = useRef<number | null>(null);

    const processFile = useCallback((file: File) => {
        onProcessingStateChange(true, 'Начало обработки...');
        setFileName(file.name);
        setProgress(0);
        setMessage('Инициализация воркера...');
        setEtr(null);
        startTimeRef.current = Date.now();

        if (workerRef.current) {
            workerRef.current.terminate();
        }

        workerRef.current = new Worker(new URL('../services/processing.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
            const { type, payload } = e.data;
            switch (type) {
                case 'progress':
                    setProgress(payload.percentage);
                    setMessage(payload.message);
                    if (startTimeRef.current && payload.percentage > 0 && payload.percentage < 100) {
                        const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
                        const totalTime = (elapsedTime / payload.percentage) * 100;
                        setEtr(totalTime - elapsedTime);
                    } else {
                        setEtr(null);
                    }
                    break;
                case 'result':
                    onFileProcessed(payload);
                    onProcessingStateChange(false, `Файл "${file.name}" успешно обработан.`);
                    setMessage(`Обработка завершена!`);
                    setEtr(0);
                    break;
                case 'error':
                    onProcessingStateChange(false, `Ошибка при обработке файла: ${payload}`);
                    setMessage(`Ошибка: ${payload}`);
                    setEtr(null);
                    break;
                default:
                    break;
            }
        };

        workerRef.current.onerror = (e) => {
            console.error('Worker error:', e);
            onProcessingStateChange(false, `Критическая ошибка воркера: ${e.message}`);
            setMessage(`Критическая ошибка: ${e.message}`);
        };
        
        workerRef.current.postMessage({ file, okbData });
    }, [onFileProcessed, onProcessingStateChange, okbData]);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            processFile(file);
        }
    }, [processFile]);

    const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
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
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    }, [processFile]);

    const isProcessing = progress > 0 && progress < 100;

    return (
        <div className={`relative bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                 <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">1</span>
                Загрузка данных
            </h2>
            <div className="flex items-center justify-center w-full">
                <label 
                    htmlFor="dropzone-file" 
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragEnter}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg transition-colors ${
                        isProcessing ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${
                        isDragging ? 'border-accent bg-indigo-900/40' : 'border-gray-600 bg-gray-900/50 hover:bg-gray-800/60'
                    }`}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                        </svg>
                        <p className="mb-2 text-sm text-gray-400">
                            <span className="font-semibold text-accent">{isDragging ? 'Отпустите файл' : 'Нажмите для загрузки'}</span> или перетащите
                        </p>
                        <p className="text-xs text-gray-500">XLSX, XLS, CSV</p>
                    </div>
                    <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept=".xlsx, .xls, .csv" disabled={isProcessing} />
                </label>
            </div>
             <div className="mt-4 text-center text-xs text-gray-400 bg-gray-900/50 p-2 rounded-md border border-gray-700">
                💡 **Совет:** Для файлов размером более 10МБ рекомендуется использовать формат **CSV** для значительного ускорения обработки.
            </div>
            {fileName && (
                 <div className="mt-4">
                    <p className="text-sm text-gray-400 truncate">Файл: {fileName}</p>
                    <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
                        <div className="bg-accent h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <p className="text-xs text-gray-400">{message}</p>
                        {isProcessing && etr !== null && (
                            <p className="text-xs text-gray-500 font-mono">{formatETR(etr)}</p>
                        )}
                    </div>
                </div>
            )}
             {!okbStatus || okbStatus.status !== 'ready' ? (
                <div className="absolute inset-0 bg-card-bg/80 flex items-center justify-center rounded-2xl">
                    <p className="text-center text-warning p-4">Сначала загрузите и обновите<br />Общую Клиентскую Базу (ОКБ)</p>
                </div>
            ) : null}
        </div>
    );
};

export default FileUpload;