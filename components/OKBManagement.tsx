import React, { useState, useEffect, useCallback } from 'react';

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface OKBStatus {
    rowCount: number;
    modifiedTime: string;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<OKBStatus | null>(null);
    const [isLoadingStatus, setIsLoadingStatus] = useState(true);

    const fetchStatus = useCallback(async () => {
        setIsLoadingStatus(true);
        try {
            const response = await fetch('/api/get-okb-status');
            
            if (!response.ok) {
                let errorMessage = `Ошибка ${response.status}: ${response.statusText}.`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.details || errorData.message || errorMessage;
                } catch {
                     // Parsing failed, use raw text
                }
                throw new Error(errorMessage);
            }

            const data: OKBStatus = await response.json();
            setStatus(data);

        } catch (error: any) {
            console.error('Error fetching OKB status:', error);
            const finalErrorMessage = error.message.includes('Failed to fetch') 
                ? 'Ошибка сети: Не удалось получить статус базы ОКБ.'
                : error.message;

            addNotification(finalErrorMessage, 'error');
            setStatus(null);
        } finally {
            setIsLoadingStatus(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchStatus();
        // Refresh the status periodically to keep it up-to-date
        const intervalId = setInterval(fetchStatus, 60000); // Refresh every 60 seconds
        return () => clearInterval(intervalId); // Cleanup interval on component unmount
    }, [fetchStatus]);


    const formatStatus = () => {
        if (isLoadingStatus) return 'Загрузка статуса...';
        if (!status || typeof status.rowCount !== 'number') return 'Статус неизвестен';
        
        const lastModified = new Date(status.modifiedTime).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        return `В базе ${status.rowCount} строк. Обновлено: ${lastModified}`;
    };

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-2 text-white">
                Статус базы (ОКБ)
            </h2>
            <div 
                className={`h-10 p-2.5 rounded-lg flex items-center justify-center transition-colors ${isLoadingStatus ? 'bg-gray-700/30 shimmer-effect' : 'bg-gray-900/50'}`}
                title={formatStatus()}
            >
                <p className="text-sm text-gray-300 truncate">{formatStatus()}</p>
            </div>
             <p className="text-xs text-gray-500 mt-3 text-center">
                Эта база данных обновляется автоматически по расписанию. 
                Ручное управление доступно в <a href={`https://docs.google.com/spreadsheets/d/1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s/edit`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Google Sheet</a>.
            </p>
        </div>
    );
};

export default OKBManagement;
