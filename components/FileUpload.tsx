import React, { useRef } from 'react';
import { LoadingState } from '../types';
import { PulsingLoader, LargeSuccessIcon, LargeErrorIcon } from './icons';

interface FileUploadProps {
    onFileSelect: (file: File) => void;
    loadingState: LoadingState;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, loadingState }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { status, progress, text, etr } = loadingState;
    const isProcessing = status === 'reading' || status === 'fetching' || status === 'aggregating';

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileSelect(file);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const renderContent = () => {
        switch (status) {
            case 'done':
                return (
                    <div className="text-center animate-scale-in">
                        <LargeSuccessIcon className="mx-auto h-14 w-14 text-success" />
                        <p className="mt-2 text-lg font-semibold text-white">Анализ завершен!</p>
                    </div>
                );
            case 'error':
                return (
                    <div className="text-center animate-scale-in">
                        <LargeErrorIcon className="mx-auto h-14 w-14 text-danger" />
                        <p className="mt-2 text-lg font-semibold text-danger">Ошибка</p>
                        <p className="text-xs text-gray-400 mt-1 px-2 line-clamp-2">{text}</p>
                    </div>
                );
            case 'reading':
            case 'fetching':
            case 'aggregating':
                return (
                    <div className="w-full animate-fade-in">
                        <div className="flex justify-between text-xs text-gray-300 mb-1">
                            <span className="truncate pr-2">{text}</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-900/50 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-accent to-purple-500 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-center items-center mt-3">
                            {etr ? (
                                <p className="text-center text-xs text-accent-hover animate-pulse">{etr}</p>
                            ) : (
                                <PulsingLoader />
                            )}
                        </div>
                    </div>
                );
            case 'idle':
            default:
                return (
                    <div className="relative animate-fade-in">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProcessing}
                            className="w-full bg-gradient-to-r from-accent to-purple-600 hover:from-accent-hover hover:to-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-accent/20 flex items-center justify-center"
                        >
                            <span>Выбрать файл (.xlsx, .csv)</span>
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".xlsx, .xls, .csv"
                            className="hidden"
                            disabled={isProcessing}
                        />
                    </div>
                );
        }
    };

    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white">
                Загрузка данных
            </h2>
            <div className="relative h-[84px] flex flex-col justify-center items-center transition-all duration-300">
                {renderContent()}
            </div>
        </div>
    );
};

export default FileUpload;