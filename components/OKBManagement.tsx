import React, { useState, useEffect, useCallback } from 'react';
import { LoaderIcon } from './icons';

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface OKBStatus {
    rowCount: number;
    modifiedTime: string;
}

interface UpdateProgress {
    text: string;
    isUpdating: boolean;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<OKBStatus | null>(null);
    const [isLoadingStatus, setIsLoadingStatus] = useState(true);
    const [progress, setProgress] = useState<UpdateProgress>({ text: '', isUpdating: false });

    const fetchStatus = useCallback(async () => {
        setIsLoadingStatus(true);
        try {
            const response = await fetch('/api/get-okb-status');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Не удалось получить статус ОКБ.');
            }
            const data: OKBStatus = await response.json();
            setStatus(data);
        } catch (error: any) {
            console.error('Error fetching OKB status:', error);
            addNotification(error.message, 'error');
            setStatus(null);
        } finally {
            setIsLoadingStatus(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const processUpdateStep = useCallback(async (body: object) => {
        try {
            const response = await fetch('/api/update-okb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || errorData.message || 'Ошибка на сервере при обновлении ОКБ.');
            }
            
            const data = await response.json();

            // Only update progress text if a message is provided
            if (data.message) {
                 setProgress({ text: data.message, isUpdating: true });
            }

            if (data.status === 'processing' && data.nextAction) {
                // Schedule next step to allow UI to update and avoid deep recursion stack
                setTimeout(() => processUpdateStep(data.nextAction), 200);
            } else if (data.status === 'complete') {
                addNotification(data.message || 'База ОКБ успешно обновлена!', 'success');
                setProgress({ text: '', isUpdating: false });
                fetchStatus(); // Refresh status after update
            } else if (data.status === 'error') {
                throw new Error(data.message || 'Произошла ошибка во время обновления.');
            } else if (!data.nextAction && data.status === 'processing') {
                // Handle cases where the server is processing but doesn't return a next action immediately
                // This could be a final processing step before 'complete'
                console.log("Processing continues on server...");
            } else if (data.status !== 'complete' && data.status !== 'processing') {
                 throw new Error(`Неизвестный статус от сервера: ${data.status}`);
            }

        } catch (error: any) {
            console.error('Update process failed:', error);
            addNotification(error.message, 'error');
            setProgress({ text: '', isUpdating: false });
        }
    }, [addNotification, fetchStatus]);

    const handleStartUpdate = useCallback(() => {
        if (progress.isUpdating) return;
        
        const confirmed = window.confirm(
            'Вы уверены, что хотите запустить полное обновление базы клиентов?\n\n' +
            'Этот процесс полностью очистит текущую таблицу и заполнит ее новыми данными из открытых источников. ' +
            'Это может занять несколько минут. Не закрывайте вкладку до завершения.'
        );
      
        if (confirmed) {
            setProgress({ text: 'Инициализация процесса обновления...', isUpdating: true });
            processUpdateStep({ action: 'startUpdate' });
        }
    }, [progress.isUpdating, processUpdateStep]);

    const formatStatus = () => {
        if (isLoadingStatus) return 'Загрузка статуса...';
        if (!status || typeof status.rowCount !== 'number') return 'Статус неизвестен';
        
        const lastModified = new Date(status.modifiedTime).toLocaleString('ru-RU');
        return `В базе ${status.rowCount} строк. Обновлено: ${lastModified}`;
    };

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-2 text-white">
                Управление базой (ОКБ)
            </h2>
             <p className="text-xs text-gray-400 mb-4 h-4 truncate" title={formatStatus()}>{formatStatus()}</p>
            
            <button
                onClick={handleStartUpdate}
                disabled={progress.isUpdating || isLoadingStatus}
                className="w-full bg-transparent border border-amber-500/50 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-amber-400 font-bold py-2.5 px-4 rounded-lg transition duration-200 flex items-center justify-center"
            >
                {progress.isUpdating ? (
                    <>
                        <LoaderIcon />
                        <span className="ml-2">Обновление...</span>
                    </>
                ) : (
                    <span>Обновить базу ОКБ</span>
                )}
            </button>
            {progress.isUpdating && (
                <div className="mt-4 text-center h-4">
                    <p className="text-sm text-gray-300 animate-pulse">{progress.text}</p>
                </div>
            )}
             <p className="text-xs text-gray-500 mt-3 text-center">
                Полностью перезагружает и геокодирует данные из Google. Может занять несколько минут.
            </p>
        </div>
    );
};

export default OKBManagement;
