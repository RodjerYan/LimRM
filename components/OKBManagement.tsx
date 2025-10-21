import React, { useState } from 'react';
import { LoaderIcon } from './icons';

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleUpdateOKB = async () => {
        if (!confirm('Это запустит процесс полного обновления базы ОКБ, который может занять до 5 минут. Старые данные в Google-таблице будут стерты. Вы уверены?')) {
            return;
        }

        setIsLoading(true);
        addNotification('Запрос на обновление базы ОКБ отправлен. Процесс запущен в фоновом режиме...', 'info');

        try {
            const response = await fetch('/api/update-okb', { method: 'POST' });
            
            if (response.status === 202) {
                addNotification('Процесс обновления успешно запущен на сервере! Данные появятся в таблице в течение нескольких минут.', 'success');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server responded with status ${response.status}`);
            }

        } catch (error: any) {
            console.error("Failed to start OKB update:", error);
            addNotification(`Ошибка при запуске обновления: ${error.message}`, 'error');
        } finally {
            // The process runs in the background, so we can stop the client-side loader early.
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">0</span>
                База Потенциальных Клиентов (ОКБ)
            </h2>
             <p className="text-sm text-gray-400 mb-4">
                Нажмите кнопку, чтобы собрать актуальную базу всех ветклиник и зоомагазинов из открытых источников и сохранить ее в Google-таблицу. Этот процесс нужно выполнять периодически (например, раз в месяц).
            </p>
            <div className="relative">
                <button
                    onClick={handleUpdateOKB}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-yellow-600 to-amber-500 hover:opacity-90 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center"
                >
                    {isLoading ? (
                        <>
                            <LoaderIcon />
                            <span className="ml-2">Запуск обновления...</span>
                        </>
                    ) : (
                        <span>Обновить базу ОКБ</span>
                    )}
                </button>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">
                Процесс занимает 3-5 минут и выполняется на сервере.
            </p>
        </div>
    );
};

export default OKBManagement;
