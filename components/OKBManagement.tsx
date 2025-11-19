import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { OkbDataRow, OkbStatus } from '../types';
import { LoaderIcon, SuccessIcon, ErrorIcon } from './icons';

interface OKBManagementProps {
    onStatusChange: (status: OkbStatus) => void;
    onDataChange: (data: OkbDataRow[]) => void;
    status: OkbStatus | null;
    disabled: boolean;
}

// FIX: Convert the component to use `forwardRef` to accept a ref from its parent.
const OKBManagement = forwardRef<{ fetchData: () => Promise<void> }, OKBManagementProps>(({ onStatusChange, onDataChange, status, disabled }, ref) => {
    const [isFetching, setIsFetching] = useState(false);

    useEffect(() => {
        // On mount, if the status hasn't been set by a parent, initialize it to the default idle state.
        if (!status) {
            onStatusChange({ status: 'idle', message: 'Загрузите данные ОКБ для начала работы.' });
        }
    }, [onStatusChange, status]);


    const handleFetchData = async () => {
        setIsFetching(true);
        onStatusChange({ status: 'loading', message: 'Загрузка данных ОКБ... Это может занять до минуты.' });
        try {
            const response = await fetch('/api/get-okb');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || errorData.error || `Ошибка при загрузке ОКБ: ${response.statusText}`);
            }
            const data: OkbDataRow[] = await response.json();
            onDataChange(data);
            onStatusChange({
                status: 'ready',
                message: `ОКБ успешно загружена.`,
                timestamp: new Date().toISOString(),
                rowCount: data.length,
                coordsCount: data.filter(d => d.lat && d.lon).length,
            });
        } catch (error) {
            onStatusChange({ status: 'error', message: (error as Error).message });
        } finally {
            setIsFetching(false);
        }
    };

    // FIX: Expose the `fetchData` function to the parent component using `useImperativeHandle`.
    useImperativeHandle(ref, () => ({
        fetchData: handleFetchData
    }));

    const isLoading = isFetching || status?.status === 'loading';
    const isReady = status?.status === 'ready';

    const getStatusIcon = () => {
        if (isLoading) return <LoaderIcon />;
        if (status?.status === 'error') return <div className="w-5 h-5 text-danger"><ErrorIcon /></div>;
        if (isReady) return <div className="w-5 h-5 text-success"><SuccessIcon /></div>;
        return null;
    };
    
    const getStatusText = () => {
        if (isLoading) return status?.message || 'Загрузка...';
        if (status?.status === 'error') return status.message || 'Произошла ошибка';
        if (isReady) return status.message || 'Данные готовы';
        return status?.message || 'Ожидание';
    }

    return (
        <div className={`bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10`}>
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                 <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">0</span>
                База Клиентов (ОКБ)
            </h2>
            <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Статус:</span>
                    <div className="flex items-center gap-2 text-right">
                        {getStatusIcon()}
                        <span className={`font-semibold ${isReady ? 'text-success' : status?.status === 'error' ? 'text-danger' : 'text-white'}`}>
                           {getStatusText()}
                        </span>
                    </div>
                </div>
                {status?.timestamp && (
                     <div className="flex justify-between items-center">
                        <span className="text-gray-400">Версия от:</span>
                        <span className="text-white font-mono text-xs">{new Date(status.timestamp).toLocaleString('ru-RU')}</span>
                    </div>
                )}
                {status?.rowCount !== undefined && (
                     <div className="flex justify-between items-center">
                        <span className="text-gray-400">Записей:</span>
                        <span className="text-white font-semibold">{status.rowCount.toLocaleString('ru-RU')}</span>
                    </div>
                )}
                 {status?.coordsCount !== undefined && (
                     <div className="flex justify-between items-center">
                        <span className="text-gray-400">С координатами:</span>
                        <span className="text-white font-semibold">{status.coordsCount.toLocaleString('ru-RU')}</span>
                    </div>
                )}
            </div>
            <button
                onClick={handleFetchData}
                disabled={isLoading || disabled}
                className="w-full mt-5 bg-accent hover:bg-accent-dark disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg transition duration-200"
            >
                {isLoading ? 'Загрузка...' : (isReady ? 'Обновить ОКБ' : 'Загрузить ОКБ')}
            </button>
        </div>
    );
});

export default OKBManagement;