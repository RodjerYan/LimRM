import React, { useState, useEffect } from 'react';
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

    useEffect(() => {
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

    const isLoading = isFetching || status?.status === 'loading';
    const isReady = status?.status === 'ready';
    const isError = status?.status === 'error';

    return (
        <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-gray-900/80 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl">
                
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/30 ring-2 ring-white/10">
                        1
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white leading-tight">База Клиентов (ОКБ)</h2>
                        <p className="text-xs text-gray-400">Источник данных для анализа</p>
                    </div>
                </div>

                {/* Status Banner */}
                <div className={`mb-5 p-3 rounded-xl border flex items-center gap-3 transition-colors duration-300 ${
                    isError ? 'bg-red-500/10 border-red-500/20 text-red-200' : 
                    isReady ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' : 
                    'bg-gray-800/50 border-gray-700 text-gray-300'
                }`}>
                    <div className={`p-1.5 rounded-lg ${
                        isError ? 'bg-red-500/20' : 
                        isReady ? 'bg-emerald-500/20' : 
                        'bg-gray-700'
                    }`}>
                        {isLoading ? <LoaderIcon /> : isError ? <div className="w-4 h-4"><ErrorIcon /></div> : isReady ? <div className="w-4 h-4"><SuccessIcon /></div> : <div className="w-4 h-4 rounded-full bg-gray-500" />}
                    </div>
                    <span className="text-sm font-medium truncate">
                        {status?.message || 'Ожидание действий...'}
                    </span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-gray-800/40 p-3 rounded-xl border border-white/5">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Всего записей</p>
                        <p className="text-lg font-bold text-white font-mono">
                            {status?.rowCount ? status.rowCount.toLocaleString('ru-RU') : '—'}
                        </p>
                    </div>
                    <div className="bg-gray-800/40 p-3 rounded-xl border border-white/5">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">С координатами</p>
                        <p className="text-lg font-bold text-indigo-300 font-mono">
                            {status?.coordsCount ? status.coordsCount.toLocaleString('ru-RU') : '—'}
                        </p>
                    </div>
                    <div className="col-span-2 bg-gray-800/40 p-3 rounded-xl border border-white/5 flex justify-between items-center">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Версия от</p>
                        <p className="text-xs font-medium text-gray-300 font-mono">
                            {status?.timestamp ? new Date(status.timestamp).toLocaleString('ru-RU') : 'Не загружена'}
                        </p>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={handleFetchData}
                    disabled={isLoading || disabled}
                    className="w-full relative overflow-hidden group/btn bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold py-3 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-indigo-900/20 transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
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