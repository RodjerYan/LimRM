import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    percentage: number;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<OKBStatus | null>(null);
    const [isLoadingStatus, setIsLoadingStatus] = useState(true);
    const [progress, setProgress] = useState<UpdateProgress>({ text: '', isUpdating: false, percentage: 0 });
    const [logs, setLogs] = useState<string[]>([]);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs to the bottom
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const fetchStatus = useCallback(async () => {
        setIsLoadingStatus(true);
        try {
            const response = await fetch('/api/get-okb-status');
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Ошибка ${response.status}: ${response.statusText}.`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.details || errorData.message || errorMessage;
                } catch {
                     errorMessage += ` Ответ сервера: ${errorText.substring(0, 150)}...`;
                }
                throw new Error(errorMessage);
            }

            const data: OKBStatus = await response.json();
            setStatus(data);

        } catch (error: any) {
            console.error('Error fetching OKB status:', error);
            let finalErrorMessage = error.message;

            if (error instanceof SyntaxError && error.message.toLowerCase().includes('json')) {
                finalErrorMessage = 'Критическая ошибка: Не удалось обработать ответ от Google. Вероятно, неверно настроены права доступа к Google Apps Script. Убедитесь, что веб-приложение опубликовано с доступом "Все" (Anyone).';
            }
            
            addNotification(finalErrorMessage, 'error');
            setStatus(null);
        } finally {
            setIsLoadingStatus(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const addLog = (message: string, type: 'INFO' | 'ERROR' = 'INFO') => {
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        setLogs(prev => [...prev, `[${timestamp}] [${type}] ${message}`]);
    };

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
            const message = data.message || '';
            
            if (message) addLog(message);
            
            let percentage = progress.percentage;

            if (data.stage === 'FETCHING_CITIES') {
                const cityMatch = message.match(/обработан город.*\((\d+)\/(\d+)\)/);
                if (cityMatch) {
                    const current = parseInt(cityMatch[1], 10);
                    const total = parseInt(cityMatch[2], 10);
                    percentage = (current / total) * 50;
                }
            } else if (data.stage === 'GEOCODING') {
                const geoMatch = message.match(/обработано (\d+)\/(\d+)/);
                 if (geoMatch) {
                    const current = parseInt(geoMatch[1], 10);
                    const total = parseInt(geoMatch[2], 10);
                    percentage = 50 + (current / total) * 50;
                }
            }
            
            setProgress({ text: message, isUpdating: true, percentage });

            if (data.status === 'processing_timeout' && data.nextAction) {
                setTimeout(() => processUpdateStep(data.nextAction), 5000); 
            } else if (data.status === 'processing' && data.nextAction) {
                setTimeout(() => processUpdateStep(data.nextAction), 200);
            } else if (data.status === 'complete') {
                const finalMessage = data.message || 'База ОКБ успешно обновлена!';
                addNotification(finalMessage, 'success');
                setProgress({ text: finalMessage, isUpdating: false, percentage: 100 });
                setTimeout(() => {
                     setProgress({ text: '', isUpdating: false, percentage: 0 });
                }, 4000);
                fetchStatus();
            } else if (data.status === 'error') {
                throw new Error(data.message || 'Произошла ошибка во время обновления.');
            }

        } catch (error: any) {
            console.error('Update process failed:', error);
            addLog(error.message, 'ERROR');
            addNotification(error.message, 'error');
            setProgress({ text: 'Ошибка!', isUpdating: false, percentage: progress.percentage });
        }
    }, [addNotification, fetchStatus, progress.percentage]);

    const handleStartUpdate = useCallback(() => {
        if (progress.isUpdating) return;
        
        const confirmed = window.confirm(
            'Вы уверены, что хотите запустить полное обновление базы клиентов?\n\n' +
            'Этот процесс полностью очистит текущую таблицу и заполнит ее новыми данными. ' +
            'Это может занять несколько минут. Не закрывайте вкладку до завершения.'
        );
      
        if (confirmed) {
            const initialMessage = 'Инициализация процесса...';
            setProgress({ text: initialMessage, isUpdating: true, percentage: 0 });
            setLogs([]); // Clear previous logs
            addLog(initialMessage);
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
                <div className="mt-4">
                    <p className="text-sm text-center text-gray-300 mb-2 truncate" title={progress.text}>{progress.text}</p>
                    <div className="w-full bg-gray-900/50 rounded-full h-2.5">
                        <div 
                            className="bg-gradient-to-r from-accent to-accent-dark h-2.5 rounded-full transition-all duration-300" 
                            style={{width: `${progress.percentage}%`}}
                        ></div>
                    </div>
                    <div ref={logContainerRef} className="mt-3 h-32 bg-gray-900/70 rounded-lg p-2.5 overflow-y-auto custom-scrollbar border border-gray-700">
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
                            {logs.join('\n')}
                        </pre>
                    </div>
                </div>
            )}
             <p className="text-xs text-gray-500 mt-3 text-center">
                Полностью перезагружает и геокодирует данные. Может занять несколько минут.
            </p>
        </div>
    );
};

export default OKBManagement;
