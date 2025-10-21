import React, { useState, useEffect, useCallback } from 'react';
import { LoaderIcon } from './icons';

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface OkbStatus {
    rowCount: number;
    modifiedTime: string;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<OkbStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);

    const fetchStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/get-okb-status');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to fetch OKB status.');
            }
            const data: OkbStatus = await response.json();
            setStatus(data);
        } catch (error: any) {
            console.error(error);
            addNotification(`Ошибка загрузки статуса ОКБ: ${error.message}`, 'error');
            setStatus(null); // Reset status on error
        } finally {
            setIsLoading(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleUpdate = async () => {
        if (!confirm('Это действие полностью перезапишет базу данных ОКБ данными из OpenStreetMap. Это может занять несколько минут. Продолжить?')) {
            return;
        }
        setIsUpdating(true);
        addNotification('Запущен процесс обновления базы ОКБ. Это может занять до 5 минут...', 'info');
        try {
            const response = await fetch('/api/update-okb', { method: 'POST' });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.details || 'An unknown error occurred during the update process.');
            }
            
            addNotification('Процесс запущен в фоновом режиме. Данные появятся в таблице через несколько минут.', 'success');
            // Schedule a status refresh to see updated info later
            setTimeout(() => {
                fetchStatus();
            }, 10000); // Refresh after 10 seconds

        } catch (error: any) {
            console.error(error);
            addNotification(`Ошибка запуска обновления ОКБ: ${error.message}`, 'error');
        } finally {
            setIsUpdating(false);
        }
    };
    
    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        try {
            return new Intl.DateTimeFormat('ru-RU', {
                dateStyle: 'medium',
                timeStyle: 'short',
            }).format(new Date(dateString));
        } catch {
            return dateString;
        }
    };

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Управление базой ОКБ</h2>
            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-3 mb-4">
                {isLoading ? (
                    <div className="flex items-center text-gray-400">
                        <LoaderIcon /> <span className="ml-2">Загрузка статуса...</span>
                    </div>
                ) : status ? (
                    <>
                        <div>
                            <p className="text-sm text-gray-400">Всего записей в базе</p>
                            <p className="text-lg font-bold text-accent">{status.rowCount.toLocaleString('ru-RU')} шт.</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Последнее обновление</p>
                            <p className="text-lg font-bold text-gray-300">{formatDate(status.modifiedTime)}</p>
                        </div>
                    </>
                ) : (
                    <p className="text-danger text-center">Не удалось загрузить статус базы.</p>
                )}
            </div>
            <button
                onClick={handleUpdate}
                disabled={isUpdating || isLoading}
                className="w-full bg-gradient-to-r from-yellow-600 to-amber-500 hover:opacity-90 disabled:from-gray-600 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center"
            >
                {isUpdating ? (
                    <>
                        <LoaderIcon />
                        <span className="ml-2">Обновление...</span>
                    </>
                ) : (
                    <span>Обновить базу из OpenStreetMap</span>
                )}
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
                Обновление заменяет все данные в Google-таблице. Это может занять несколько минут.
            </p>
        </div>
    );
};

export default OKBManagement;