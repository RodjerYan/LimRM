
import React, { useState, useEffect, useCallback } from 'react';
import { OkbDataRow, OkbStatus } from '../types';
import { LoaderIcon, SuccessIcon, ErrorIcon } from './icons';

interface OKBManagementProps {
    onStatusChange: (status: OkbStatus) => void;
    onDataChange: (data: OkbDataRow[]) => void;
    status: OkbStatus | null;
    disabled: boolean;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ onStatusChange, onDataChange, status, disabled }) => {
    const [isFetching, setIsFetching] = useState(false);

    const handleFetchData = useCallback(async (forceUpdate = false) => {
        setIsFetching(true);
        onStatusChange({ status: 'loading', message: forceUpdate ? 'Обновление с сервера...' : 'Подключение к серверу...' });
        
        try {
            // Updated Endpoint: /api/get-akb?mode=okb_data
            const url = `/api/get-akb?mode=okb_data&t=${Date.now()}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.error || `Ошибка сервера: ${response.status} ${response.statusText}`);
            }
            const data: OkbDataRow[] = await response.json();
            
            onDataChange(data);
            onStatusChange({
                status: 'ready',
                message: `ОКБ Онлайн (v5 Live)`,
                timestamp: new Date().toISOString(),
                rowCount: data.length,
                coordsCount: data.filter(d => d.lat && d.lon).length,
            });
        } catch (error) {
            console.error("OKB Load Error:", error);
            onStatusChange({ status: 'error', message: (error as Error).message });
        } finally {
            setIsFetching(false);
        }
    }, [onStatusChange, onDataChange]);

    useEffect(() => {
        if (!status || status.status === 'idle') {
            handleFetchData(false);
        }
    }, [status, handleFetchData]);

    const isLoading = isFetching || status?.status === 'loading';
    const isReady = status?.status === 'ready';
    const isError = status?.status === 'error';

    return (
        <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
            <div className="relative bg-white p-6 rounded-2xl border border-gray-200 shadow-lg">
                
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold shadow-md shadow-indigo-500/30">
                        1
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-gray-900 leading-tight">База Клиентов</h2>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[10px] text-indigo-700 font-mono font-bold">LIVE</span>
                        </div>
                        <p className="text-xs text-gray-500">Прямое подключение (60s Update)</p>
                    </div>
                </div>

                {/* Status Banner */}
                <div className={`mb-5 p-3 rounded-xl border flex items-center gap-3 transition-colors duration-300 ${
                    isError ? 'bg-red-50 border-red-200 text-red-800' : 
                    isReady ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 
                    'bg-gray-50 border-gray-200 text-gray-700'
                }`}>
                    <div className={`p-1.5 rounded-lg ${
                        isError ? 'bg-red-100 text-red-600' : 
                        isReady ? 'bg-emerald-100 text-emerald-600' : 
                        'bg-gray-200 text-gray-500'
                    }`}>
                        {isLoading ? <LoaderIcon /> : isError ? <div className="w-4 h-4"><ErrorIcon /></div> : isReady ? <div className="w-4 h-4"><SuccessIcon /></div> : <div className="w-4 h-4 rounded-full bg-gray-400" />}
                    </div>
                    <span className="text-sm font-medium truncate">
                        {status?.message || 'Ожидание подключения...'}
                    </span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Всего записей</p>
                        <p className="text-lg font-bold text-gray-900 font-mono">
                            {status?.rowCount ? status.rowCount.toLocaleString('ru-RU') : '—'}
                        </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">С координатами</p>
                        <p className="text-lg font-bold text-indigo-600 font-mono">
                            {status?.coordsCount ? status.coordsCount.toLocaleString('ru-RU') : '—'}
                        </p>
                    </div>
                    <div className="col-span-2 bg-gray-50 p-3 rounded-xl border border-gray-200 flex justify-between items-center">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Версия от</p>
                        <p className="text-xs font-medium text-gray-700 font-mono">
                            {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString('ru-RU') : '...'}
                        </p>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={() => handleFetchData(true)}
                    disabled={isLoading || disabled}
                    className="w-full relative overflow-hidden group/btn bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-3 px-4 rounded-xl transition-all duration-300 shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none"
                >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        {isLoading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                                Загрузка...
                            </>
                        ) : (
                            isReady ? 'Обновить данные' : 'Загрузить базу'
                        )}
                    </span>
                    {!isLoading && !disabled && (
                        <div className="absolute inset-0 h-full w-full scale-0 rounded-xl transition-all duration-300 group-hover/btn:scale-100 group-hover/btn:bg-white/10"></div>
                    )}
                </button>
            </div>
        </div>
    );
};

export default OKBManagement;
