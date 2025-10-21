import React, { useState, useEffect, useCallback } from 'react';
import { LoaderIcon } from './icons';

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState({ loading: true, lastUpdated: '', rowCount: 0 });
    const [isUpdating, setIsUpdating] = useState(false);

    const fetchStatus = useCallback(async () => {
        setStatus(prev => ({ ...prev, loading: true }));
        try {
            const response = await fetch('/api/get-okb-status');
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.details || data.error || 'Не удалось получить статус ОКБ.');
            }
            setStatus({ loading: false, lastUpdated: data.modifiedTime, rowCount: data.rowCount });
        } catch (error: any) {
            console.error("Failed to fetch OKB status:", error);
            setStatus({ loading: false, lastUpdated: 'Ошибка', rowCount: 0 });
            addNotification(error.message, 'error');
        }
    }, [addNotification]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleUpdate = async () => {
        setIsUpdating(true);
        addNotification('Запущено обновление координат в базе ОКБ. Это может занять несколько минут...', 'info');
        try {
            const response = await fetch('/api/update-okb', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.details || data.error || 'Ошибка при обновлении ОКБ.');
            }
            addNotification(`Обновление завершено! Обновлено ${data.updated} записей.`, 'success');
            await fetchStatus(); // Refresh status after update
        } catch (error: any) {
            console.error("Failed to update OKB:", error);
            addNotification(error.message, 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Управление базой ОКБ</h2>
            <div className="space-y-3 text-sm text-gray-300">
                <div className="flex justify-between items-center">
                    <span>Статус:</span>
                    {status.loading 
                        ? <span className="text-gray-400">Загрузка...</span> 
                        : status.lastUpdated === 'Ошибка'
                            ? <span className="font-semibold text-danger">Ошибка загрузки</span>
                            : <span className="font-semibold text-success">Актуальна</span>
                    }
                </div>
                 <div className="flex justify-between items-center">
                    <span>Последнее обновление:</span>
                    <span className="font-mono text-xs">{status.loading ? '...' : status.lastUpdated || 'Нет данных'}</span>
                </div>
                 <div className="flex justify-between items-center">
                    <span>Всего записей:</span>
                    <span className="font-mono">{status.loading ? '...' : status.rowCount}</span>
                </div>
            </div>
            <button
                onClick={handleUpdate}
                disabled={isUpdating || status.loading}
                className="w-full mt-5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg transition duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center"
            >
                {isUpdating ? (
                    <>
                        <LoaderIcon />
                        <span className="ml-2">Обновление...</span>
                    </>
                ) : (
                    <span>Обновить координаты в ОКБ</span>
                )}
            </button>
             <p className="text-xs text-gray-500 mt-3 text-center">
                Обновляет геолокацию для записей без координат в Google Sheets.
            </p>
        </div>
    );
};

export default OKBManagement;
