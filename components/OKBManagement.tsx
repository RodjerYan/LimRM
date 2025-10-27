import React, { useState, useEffect } from 'react';
import { OkbStatus } from '../types';
import { LoaderIcon, SuccessIcon, ErrorIcon, InfoIcon } from './icons';

interface OKBManagementProps {
    onStatusChange: (status: OkbStatus) => void;
    onDataChange: (data: any[]) => void;
    status: OkbStatus | null;
    disabled: boolean;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ onStatusChange, onDataChange, status, disabled }) => {
    const [isLoading, setIsLoading] = useState(false);

    const fetchStatus = async () => {
        try {
            const response = await fetch('/api/get-okb-status');
            if (!response.ok) throw new Error('Failed to fetch status');
            const data: OkbStatus = await response.json();
            onStatusChange(data);
        } catch (error) {
            console.error("Error fetching OKB status:", error);
            onStatusChange({ lastUpdated: null, status: 'error', message: 'Не удалось получить статус ОКБ' });
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        onStatusChange({ ...(status || { lastUpdated: null, status: 'idle' }), status: 'updating', message: 'Загрузка данных...' });
        try {
            const response = await fetch('/api/get-okb');
            if (!response.ok) throw new Error('Failed to fetch OKB data');
            const data = await response.json();
            if(!data || !Array.isArray(data.data)) throw new Error('Invalid data format received');
            onDataChange(data.data);
            const newStatus = { lastUpdated: new Date().toISOString(), status: 'ready' as const, message: `Данные обновлены. Записей: ${data.data.length}` };
            onStatusChange(newStatus);
        } catch (error) {
            console.error("Error fetching OKB data:", error);
            onStatusChange({ ...(status || { lastUpdated: null, status: 'idle' }), status: 'error', message: 'Ошибка при загрузке данных ОКБ' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus(); // Initial status fetch on component mount
    }, []);

    const getStatusContent = () => {
        if (!status) {
            return { icon: <LoaderIcon />, text: 'Получение статуса...', color: 'text-gray-400' };
        }
        switch (status.status) {
            case 'ready':
                return { icon: <SuccessIcon />, text: 'ОКБ загружена и готова к работе', color: 'text-success' };
            case 'updating':
                return { icon: <LoaderIcon />, text: 'Идет обновление ОКБ...', color: 'text-blue-400' };
            case 'error':
                return { icon: <ErrorIcon />, text: status.message || 'Ошибка при работе с ОКБ', color: 'text-danger' };
            case 'idle':
            default:
                return { icon: <InfoIcon />, text: 'ОКБ не загружена. Нажмите "Обновить"', color: 'text-warning' };
        }
    };

    const { icon, text, color } = getStatusContent();
    const lastUpdatedDate = status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString('ru-RU') : 'никогда';

    return (
        <div className={`bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 transition-opacity ${disabled ? 'opacity-50' : ''}`}>
             <h2 className="text-xl font-bold mb-4 text-white">Управление ОКБ</h2>
             <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className={`flex items-center gap-2 ${color}`}>
                        <div className="w-5 h-5 flex-shrink-0">{icon}</div>
                        <p className="font-semibold">{text}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 pl-7">Последнее обновление: {lastUpdatedDate}</p>
                </div>
                 <button
                    onClick={fetchData}
                    disabled={isLoading || disabled}
                    className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-6 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto flex-shrink-0"
                >
                    {isLoading ? 'Обновление...' : 'Обновить ОКБ'}
                </button>
             </div>
        </div>
    );
};

export default OKBManagement;
