import React, { useState, useEffect, useCallback } from 'react';
import { LoaderIcon } from './icons';

interface OKBStatus {
    lastUpdated: string | null;
    isUpdating: boolean;
    rowCount: number;
}

interface UpdateProgress {
    progress: number;
    status: string;
}

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<OKBStatus | null>(null);
    const [progress, setProgress] = useState<UpdateProgress | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchStatus = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const res = await fetch('/api/get-okb-status');
            if (!res.ok) {
                throw new Error('Не удалось получить статус ОКБ');
            }
            const data: OKBStatus = await res.json();
            setStatus(data);
            if (!data.isUpdating) {
                setProgress(null);
            }
        } catch (error: any) {
            console.error(error);
            if (isInitial) addNotification(error.message, 'error');
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [addNotification]);

    const fetchProgress = useCallback(async () => {
        if (!status?.isUpdating) return;
        try {
            const res = await fetch('/api/get-okb-update-progress');
            if (res.status === 404) { // Update finished between polls
                fetchStatus();
                return;
            }
            if (!res.ok) {
                 throw new Error('Ошибка при получении прогресса');
            }
            const data: UpdateProgress = await res.json();
            setProgress(data);
        } catch (error) {
            console.error(error);
            // Stop polling on error by fetching final status
            fetchStatus();
        }
    }, [status?.isUpdating, fetchStatus]);

    useEffect(() => {
        fetchStatus(true);
    }, [fetchStatus]);

    useEffect(() => {
        if (status?.isUpdating) {
            const intervalId = setInterval(fetchProgress, 2500); // Poll every 2.5 seconds
            return () => clearInterval(intervalId);
        }
    }, [status?.isUpdating, fetchProgress]);

    const handleUpdate = async () => {
        if (status?.isUpdating || isLoading) {
            addNotification('Обновление уже запущено.', 'info');
            return;
        }

        const confirmation = window.confirm(
            'Вы уверены, что хотите запустить обновление базы ОКБ? Этот процесс может занять несколько минут и перезапишет текущие данные.'
        );

        if (!confirmation) return;

        setStatus(prev => prev ? { ...prev, isUpdating: true } : { lastUpdated: null, isUpdating: true, rowCount: 0 });
        setProgress({ progress: 0, status: 'Запуск процесса...' });

        try {
            const res = await fetch('/api/update-okb', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Не удалось запустить обновление');
            }
            addNotification('Процесс обновления базы ОКБ запущен.', 'success');
            // Status will be updated via polling
        } catch (error: any) {
            console.error(error);
            addNotification(`Ошибка при запуске обновления: ${error.message}`, 'error');
            fetchStatus(); // Reset status from server on failure
        }
    };

    const isUpdating = status?.isUpdating || false;
    const lastUpdatedDate = status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString('ru-RU') : 'Никогда';

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">0</span>
                Управление базой ОКБ
            </h2>
            <div className="space-y-4">
                <div>
                    <button
                        onClick={handleUpdate}
                        disabled={isUpdating || isLoading}
                        className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:opacity-90 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center"
                    >
                        {isUpdating || isLoading ? (
                            <>
                                <LoaderIcon />
                                <span className="ml-2">Обновление...</span>
                            </>
                        ) : (
                            <span>Обновить базу ОКБ</span>
                        )}
                    </button>
                </div>

                {isUpdating && progress && (
                     <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span className="truncate pr-2">{progress.status}</span>
                            <span>{Math.round(progress.progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-900/50 rounded-full h-2">
                            <div
                                className="bg-gradient-to-r from-purple-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress.progress}%` }}
                            ></div>
                        </div>
                    </div>
                )}
                
                <div className="text-sm text-gray-400 text-center pt-2">
                    <p>Последнее обновление: <span className="font-semibold text-accent">{isLoading ? 'Загрузка...' : lastUpdatedDate}</span></p>
                    <p>Количество записей: <span className="font-semibold text-white">{isLoading ? '...' : (status?.rowCount ?? 0)}</span></p>
                </div>
                 <p className="text-xs text-gray-500 mt-2">
                    Данные для ОКБ (Общая Клиентская База) загружаются из Google Sheets после сканирования OpenStreetMap. Обновление может занять несколько минут.
                </p>
            </div>
        </div>
    );
};

export default OKBManagement;
