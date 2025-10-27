import React, { useState, useEffect, useCallback } from 'react';
import { OkbStatus } from '../types';
import { LoaderIcon, SuccessIcon, ErrorIcon, InfoIcon } from './icons';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface OKBManagementProps {
    onStatusChange: (status: OkbStatus) => void;
    onDataChange: (data: any[]) => void;
    status: OkbStatus | null;
    disabled: boolean;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ onStatusChange, onDataChange, status, disabled }) => {
    const [isFetching, setIsFetching] = useState(false);

    const getStatus = useCallback(async (showLoadingState: boolean) => {
        if (showLoadingState) {
            onStatusChange({ status: 'loading', message: 'Проверка статуса ОКБ...' });
        }
        try {
            const response = await fetch('/api/get-okb-status');
            if (!response.ok) {
                throw new Error('Не удалось получить статус ОКБ.');
            }
            const data = await response.json();
            onStatusChange({
                status: data.isReady ? 'ready' : 'idle',
                message: data.isReady ? `ОКБ обновлена: ${format(parseISO(data.lastModified), 'dd MMMM yyyy, HH:mm', { locale: ru })}` : 'ОКБ не загружена.',
                timestamp: data.lastModified,
                rowCount: data.rowCount,
            });
        } catch (error) {
            onStatusChange({ status: 'error', message: (error as Error).message });
        }
    }, [onStatusChange]);

    const fetchData = async () => {
        setIsFetching(true);
        onStatusChange({ status: 'loading', message: 'Загрузка данных из Google Sheets...' });
        try {
            const response = await fetch('/api/get-okb');
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
            }
            const data = await response.json();
            onDataChange(data.data);
            onStatusChange({ 
                status: 'ready', 
                message: 'Данные ОКБ успешно загружены и готовы к использованию.',
                timestamp: new Date().toISOString(),
                rowCount: data.data.length,
            });
        } catch (error) {
            onStatusChange({ status: 'error', message: `Ошибка загрузки ОКБ: ${(error as Error).message}` });
        } finally {
            setIsFetching(false);
        }
    };

    // Initial status check on component mount
    useEffect(() => {
        getStatus(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const renderStatusIcon = () => {
        if (!status) return null;
        switch (status.status) {
            case 'loading':
            case 'processing':
                return <LoaderIcon />;
            case 'ready':
                return <div className="w-5 h-5 text-success"><SuccessIcon /></div>;
            case 'error':
                return <div className="w-5 h-5 text-danger"><ErrorIcon /></div>;
            default:
                return <div className="w-5 h-5 text-warning"><InfoIcon /></div>;
        }
    };
    
    const isButtonDisabled = isFetching || disabled;

    return (
        <div className={`bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 transition-opacity ${isButtonDisabled ? 'opacity-60' : ''}`}>
            <h2 className="text-xl font-bold mb-4 text-white">Управление ОКБ</h2>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {renderStatusIcon()}
                    <div>
                         <p className="text-sm text-gray-300">
                            {status?.message || 'Проверка статуса...'}
                        </p>
                        {status?.status === 'ready' && status.rowCount && (
                             <p className="text-xs text-gray-500">Записей: {status.rowCount.toLocaleString('ru-RU')}</p>
                        )}
                    </div>
                </div>
                <button
                    onClick={fetchData}
                    disabled={isButtonDisabled}
                    className="bg-accent hover:bg-accent-dark disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition duration-200 text-sm whitespace-nowrap"
                >
                    {isFetching ? 'Обновление...' : 'Обновить'}
                </button>
            </div>
        </div>
    );
};

export default OKBManagement;
