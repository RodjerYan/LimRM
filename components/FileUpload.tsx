import React, { useRef } from 'react';
import { LoadingState } from '../types';
import { LoaderIcon } from './icons';

interface FileUploadProps {
    onFileSelect: (file: File) => void;
    loadingState: LoadingState;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, loadingState }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isLoading = loadingState.status !== 'idle' && loadingState.status !== 'done' && loadingState.status !== 'error';

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileSelect(file);
        }
        // Reset file input to allow re-uploading the same file
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-3">
                <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">1</span>
                Загрузка данных
            </h2>
            <div className="relative">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-accent to-purple-600 hover:from-accent-hover hover:to-purple-500 disabled:bg-gray-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-accent/20 flex items-center justify-center"
                >
                    {isLoading ? (
                        <>
                            <LoaderIcon />
                            <span className="ml-2">Обработка...</span>
                        </>
                    ) : (
                        <span>Выбрать файл (.xlsx, .csv)</span>
                    )}
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    disabled={isLoading}
                />
            </div>
            {(loadingState.status !== 'idle' || loadingState.text) && (
                 <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span className="truncate pr-2">{loadingState.text}</span>
                        <span>{Math.round(loadingState.progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-900/50 rounded-full h-2.5">
                        <div
                            className="bg-gradient-to-r from-accent to-purple-500 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${loadingState.progress}%` }}
                        ></div>
                    </div>
                    {loadingState.etr && (
                        <p className="text-center text-xs text-accent-hover mt-2 animate-pulse">
                            {loadingState.etr}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default FileUpload;