import React, { useState, useEffect, useCallback } from 'react';
import { LoaderIcon } from './icons';

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'updating'>('loading');
    const [lastUpdate, setLastUpdate] = useState<string>('...');
    const [totalRecords, setTotalRecords] = useState<string>('...');

    const fetchStatus = useCallback(async () => {
        setStatus('loading');
        try {
            const response = await fetch('/api/get-okb-status');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Не удалось получить статус базы.');
            }
            const data = await response.json();
            
            setLastUpdate(new Date(data.modifiedTime).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }));
            setTotalRecords(data.rowCount.toLocaleString('ru-RU'));
            setStatus('success');
        } catch (error: any) {
            console.error('Failed to fetch OKB status:', error);
            addNotification(`Ошибка получения статуса: ${error.message}`, 'error');
            setStatus('error');
            setLastUpdate('Ошибка');
            setTotalRecords('Ошибка');
        }
    }, [addNotification]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);
    
    const handleUpdate = async () => {
        if (status === 'updating' || status === 'loading') return;
        
        setStatus('updating');
        addNotification('Запрос на обновление базы отправлен. Процесс может занять до 5 минут.', 'info');

        try {
            const response = await fetch('/api/update-okb', { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Ошибка при запуске обновления.');
            }
            
            addNotification('Процесс обновления успешно запущен в фоновом режиме!', 'success');
            
            // Give the backend a moment to start, then check status again
            setTimeout(() => {
                fetchStatus();
            }, 30000); // Check status after 30 seconds to see if modifiedTime has changed

        } catch (error: any) {
            console.error('Failed to start OKB update:', error);
            addNotification(error.message, 'error');
            setStatus('error'); // Revert status on failure
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'loading': return <span className="text-gray-400 animate-pulse">Загрузка...</span>;
            case 'updating': return <span className="text-yellow-400 animate-pulse">Обновление...</span>;
            case 'error': return <span className="text-danger">Ошибка</span>;
            case 'success': return <span className="text-success">Готово</span>;
            default: return '...';
        }
    };

    const isButtonDisabled = status === 'loading' || status === 'updating';

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Управление базой ОКБ</h2>
            <div className="space-y-2 text-sm text-gray-300 mb-6">
                <div className="flex justify-between items-center">
                    <span>Статус:</span>
                    <span className="font-semibold">{getStatusText()}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span>Последнее обновление:</span>
                    <span className="font-semibold">{lastUpdate}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span>Всего записей:</span>
                    <span className="font-semibold">{totalRecords}</span>
                </div>
            </div>
            
            <button
                onClick={handleUpdate}
                disabled={isButtonDisabled}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center"
                aria-live="polite"
            >
                {status === 'updating' && <LoaderIcon />}
                <span className={status === 'updating' ? 'ml-2' : ''}>Обновить координаты в ОКБ</span>
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
                Обновляет геолокацию для записей без координат в Google Sheets.
            </p>
        </div>
    );
};

export default OKBManagement;
