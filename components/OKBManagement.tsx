import React, { useState, useEffect, useCallback } from 'react';
import { LoaderIcon } from './icons';

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface UpdateProgress {
    text: string;
    percent: number;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'updating'>('loading');
    const [lastUpdate, setLastUpdate] = useState<string>('...');
    const [totalRecords, setTotalRecords] = useState<string>('...');
    const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);

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
    
    const handleUpdate = useCallback(async () => {
        if (status === 'updating' || status === 'loading') return;
        
        setStatus('updating');
        setUpdateProgress({ text: 'Запуск процесса...', percent: 0 });
        addNotification('Запуск обновления базы ОКБ. Процесс разбит на части и может занять несколько минут.', 'info');

        const processNextBatch = async (startIndex = 0) => {
            try {
                // Для первого запроса используем 'startUpdate', для последующих - 'continueUpdate'
                const action = startIndex === 0 ? 'startUpdate' : 'continueUpdate';
                const body = { action, startIndex };

                const response = await fetch('/api/update-okb', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                
                // Важно сначала получить текст, чтобы иметь его для отладки в случае ошибки парсинга JSON
                const resultText = await response.text();
                if (!response.ok) {
                    let errorDetails = 'Не удалось выполнить шаг обновления.';
                    try {
                        // Попытка распарсить JSON из ошибки, если он есть
                        const errorJson = JSON.parse(resultText);
                        errorDetails = errorJson.details || errorJson.message || resultText;
                    } catch (e) {
                        // Если парсинг не удался, используем текст ответа как есть
                        errorDetails = resultText || errorDetails;
                    }
                    throw new Error(errorDetails);
                }
                
                const result = JSON.parse(resultText);
                
                if (result.status === 'error') {
                    throw new Error(result.message || 'Apps Script вернул ошибку во время обработки.');
                }

                // Рассчитываем процент выполнения на основе данных от GAS
                const progressPercent = result.total > 0 ? ((result.nextIndex || result.total) / result.total) * 100 : 100;
                setUpdateProgress({ text: result.message, percent: Math.min(progressPercent, 100) });

                // Если GAS говорит, что нужно продолжать, рекурсивно вызываем обработку следующего батча
                if (result.status === 'processing' && typeof result.nextIndex === 'number') {
                    await processNextBatch(result.nextIndex);
                } else if (result.status === 'complete') {
                    addNotification(`✅ База успешно обновлена! Всего обработано: ${result.total} записей.`, 'success');
                    setUpdateProgress(null);
                    await fetchStatus(); // Обновляем финальный статус после завершения
                } else {
                    // Если ответ от сервера некорректный
                    throw new Error('Получен неожиданный ответ от сервера.');
                }

            } catch (error: any) {
                console.error('Failed during OKB update batch processing:', error);
                addNotification(`❌ Ошибка обновления базы: ${error.message}`, 'error');
                setStatus('error');
                setUpdateProgress(null);
            }
        };

        // Запускаем процесс с самого начала (startIndex = 0)
        await processNextBatch(0);
    }, [status, addNotification, fetchStatus]);


    const getStatusText = () => {
        switch (status) {
            case 'loading': return <span className="text-gray-400 animate-pulse">Загрузка...</span>;
            case 'updating': return <span className="text-yellow-400 animate-pulse">Обновление базы...</span>;
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
                <span className={status === 'updating' ? 'ml-2' : ''}>
                    {status === 'updating' ? 'Обновление...' : 'Обновить координаты в ОКБ'}
                </span>
            </button>
            {updateProgress && (
                <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span className="truncate pr-2">{updateProgress.text}</span>
                        <span>{Math.round(updateProgress.percent)}%</span>
                    </div>
                    <div className="w-full bg-gray-900/50 rounded-full h-2.5">
                        <div
                            className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${updateProgress.percent}%` }}
                        ></div>
                    </div>
                </div>
            )}
            <p className="text-xs text-gray-500 mt-3 text-center">
                Обновляет геолокацию для записей без координат в Google Sheets.
            </p>
        </div>
    );
};

export default OKBManagement;