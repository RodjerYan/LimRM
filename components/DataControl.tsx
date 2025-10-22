import React from 'react';
import { LoadingState } from '../types';
import { LoaderIcon } from './icons';

interface DataControlProps {
    onStart: () => void;
    loadingState: LoadingState;
}

const DataControl: React.FC<DataControlProps> = ({ onStart, loadingState }) => {
    const isLoading = loadingState.status !== 'idle' && loadingState.status !== 'done' && loadingState.status !== 'error';

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">1</span>
                Анализ данных
            </h2>
            <div className="relative">
                <button
                    onClick={onStart}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-accent to-accent-dark hover:opacity-90 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center"
                >
                    {isLoading ? (
                        <>
                            <LoaderIcon />
                            <span className="ml-2">Обработка...</span>
                        </>
                    ) : (
                        <span>Проанализировать рынок</span>
                    )}
                </button>
            </div>
            {(loadingState.status !== 'idle' || loadingState.text) && (
                 <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span className="truncate pr-2">{loadingState.text}</span>
                        {loadingState.progress > 0 && <span>{Math.round(loadingState.progress)}%</span>}
                    </div>
                    <div className="w-full bg-gray-900/50 rounded-full h-2">
                        <div
                            className="bg-gradient-to-r from-accent to-accent-dark h-2 rounded-full transition-all duration-300"
                            style={{ width: `${loadingState.progress}%` }}
                        ></div>
                    </div>
                </div>
            )}
             <p className="text-xs text-gray-500 mt-3 text-center">
                Запускает анализ на основе данных из мастер-базы Google Sheets.
            </p>
        </div>
    );
};

export default DataControl;
