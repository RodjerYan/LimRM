import React, { useState, useCallback, useEffect, useRef } from 'react';
import { LoaderIcon } from './icons';

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'updating'>('loading');
    const [lastUpdate, setLastUpdate] = useState<string>('...');
    const [totalRecords, setTotalRecords] = useState<string>('...');
    
    // Состояния для процесса обновления
    const [updateProgress, setUpdateProgress] = useState(0);
    const [updateText, setUpdateText] = useState('');
    const [currentRegion, setCurrentRegion] = useState('');
    const eventSourceRef = useRef<EventSource | null>(null);

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
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
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
        // Очистка при размонтировании компонента
        return () => {
            eventSourceRef.current?.close();
        };
    }, [fetchStatus]);
    
    const handleUpdate = () => {
        if (status === 'updating') return;
        
        setStatus('updating');
        setUpdateProgress(0);
        setUpdateText('Инициализация процесса...');
        setCurrentRegion('');

        // Закрываем предыдущее соединение, если оно было
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource('/api/update-okb');
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            addNotification('Соединение с сервером установлено, начинаем сбор данных.', 'info');
        };

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setUpdateProgress(data.progress);
            setUpdateText(data.text);
            if (data.region) {
                setCurrentRegion(data.region);
            }
            if (data.progress === 100) {
                eventSource.close();
                addNotification('Сбор данных успешно завершен!', 'success');
                setStatus('success');
                setTimeout(fetchStatus, 2000); // Обновляем статус через 2 секунды
            }
        };

        eventSource.onerror = () => {
            addNotification('Произошла ошибка соединения с сервером. Обновление прервано.', 'error');
            setStatus('error');
            eventSource.close();
        };
    };

    const getStatusText = () => {
        if (status === 'updating') return <span className="text-yellow-400 animate-pulse">Обновление...</span>;
        if (status === 'loading') return <span className="text-gray-400 animate-pulse">Загрузка...</span>;
        if (status === 'error') return <span className="text-danger">Ошибка</span>;
        return <span className="text-success">Готово</span>;
    };

    const isButtonDisabled = status === 'loading' || status === 'updating';

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Управление базой ОКБ</h2>
            {status !== 'updating' ? (
                <div className="space-y-2 text-sm text-gray-300 mb-6">
                    <div className="flex justify-between items-center"><span>Статус:</span><span className="font-semibold">{getStatusText()}</span></div>
                    <div className="flex justify-between items-center"><span>Последнее обновление:</span><span className="font-semibold">{lastUpdate}</span></div>
                    <div className="flex justify-between items-center"><span>Всего записей:</span><span className="font-semibold">{totalRecords}</span></div>
                </div>
            ) : (
                <div className="mb-6 h-[72px] flex flex-col justify-center">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span className="truncate pr-2 font-medium text-white">{currentRegion ? `Регион: ${currentRegion}` : 'Подготовка...'}</span>
                        <span className="font-semibold text-white">{Math.round(updateProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-900/50 rounded-full h-2.5">
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${updateProgress}%` }}></div>
                    </div>
                    <p className="text-center text-xs text-gray-400 mt-2 truncate">{updateText}</p>
                </div>
            )}
            
            <button
                onClick={handleUpdate}
                disabled={isButtonDisabled}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center"
            >
                {status === 'updating' && <LoaderIcon />}
                <span className={status === 'updating' ? 'ml-2' : ''}>Собрать и обновить базу ОКБ</span>
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
                Запускает полный сбор данных по всем регионам РФ и СНГ.
            </p>
        </div>
    );
};

export default OKBManagement;
