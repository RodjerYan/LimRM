
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { LoaderIcon, InfoIcon } from './icons';
import { formatETR } from '../utils/timeUtils';

const BATCH_SIZE = 5; // How many geocoding requests to send in parallel
const DELAY_BETWEEN_BATCHES = 1100; // Delay in ms to respect Nominatim's usage policy (max 1 req/sec)

interface OKBStatus {
    rowCount: number;
    lastUpdated: string | null;
}

interface OKBManagementProps {
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Helper to format date string
const formatLastUpdated = (dateString: string | null) => {
    if (!dateString) return 'Неизвестно';
    try {
        return new Intl.DateTimeFormat('ru-RU', {
            dateStyle: 'long',
            timeStyle: 'medium',
        }).format(new Date(dateString));
    } catch {
        return 'Неверный формат даты';
    }
};


const OKBManagement: React.FC<OKBManagementProps> = ({ addNotification }) => {
    const [status, setStatus] = useState<OKBStatus | null>(null);
    const [isLoadingStatus, setIsLoadingStatus] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ value: 0, text: '', etr: '' });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const processingStartTime = useRef<number>(0);

    const fetchStatus = useCallback(async () => {
        setIsLoadingStatus(true);
        try {
            const response = await fetch('/api/get-okb-status');
            if (!response.ok) throw new Error('Не удалось получить статус базы.');
            const data: OKBStatus = await response.json();
            setStatus(data);
        } catch (error: any) {
            addNotification(error.message, 'error');
            setStatus(null);
        } finally {
            setIsLoadingStatus(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const geocodeAddress = async (address: string, city: string): Promise<{ lat: string; lon: string }> => {
        try {
            const query = `${address}, ${city}`;
            const response = await fetch(`/api/nominatim-proxy?q=${encodeURIComponent(query)}`);
            if (!response.ok) return { lat: '', lon: '' };
            const data = await response.json();
            if (data && data.length > 0) {
                return { lat: data[0].lat, lon: data[0].lon };
            }
            return { lat: '', lon: '' };
        } catch {
            return { lat: '', lon: '' };
        }
    };
    
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            processAndUploadFile(file);
        }
        if(fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const processAndUploadFile = async (file: File) => {
        setIsProcessing(true);
        processingStartTime.current = Date.now();
        setProgress({ value: 0, text: 'Чтение файла...', etr: '' });

        try {
            // 1. Parse Excel file
            const reader = new FileReader();
            const data = await new Promise<ArrayBuffer>((resolve, reject) => {
                reader.onload = e => resolve(e.target?.result as ArrayBuffer);
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            });
            
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json: any[] = XLSX.utils.sheet_to_json(worksheet);

            if (json.length === 0) throw new Error("Файл пуст.");
            
            // 2. Geocode addresses in batches
            const geocodedData = [];
            for (let i = 0; i < json.length; i += BATCH_SIZE) {
                const batch = json.slice(i, i + BATCH_SIZE);
                const promises = batch.map(async (row) => {
                    const address = String(row['Адрес'] || '').trim();
                    const city = String(row['Регион'] || '').trim(); // Assuming region column is the city for geocoding context
                    const coords = await geocodeAddress(address, city);
                    return {
                        'Название': String(row['Название'] || 'N/A').trim(),
                        'Адрес': address,
                        'Телефон': String(row['Телефон'] || '').trim(),
                        'Тип': String(row['Тип'] || 'N/A').trim(),
                        'Регион': city,
                        'Широта': coords.lat,
                        'Долгота': coords.lon,
                    };
                });
                
                const processedBatch = await Promise.all(promises);
                geocodedData.push(...processedBatch);

                // Update progress
                const percent = Math.min(((i + BATCH_SIZE) / json.length) * 90, 90);
                const elapsedTime = (Date.now() - processingStartTime.current) / 1000;
                const speed = (i + BATCH_SIZE) / elapsedTime;
                const remaining = json.length - (i + BATCH_SIZE);
                const etrSeconds = speed > 0 ? remaining / speed : Infinity;

                setProgress({ 
                    value: percent, 
                    text: `Геокодирование: ${i + BATCH_SIZE} / ${json.length}`,
                    etr: formatETR(etrSeconds)
                });
                
                if (i + BATCH_SIZE < json.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }
            }

            // 3. Upload to server
            setProgress({ value: 95, text: 'Загрузка данных на сервер...', etr: '' });
            const updateResponse = await fetch('/api/update-okb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geocodedData),
            });

            if (!updateResponse.ok) {
                const errorData = await updateResponse.json();
                throw new Error(errorData.details || 'Ошибка при обновлении базы данных.');
            }
            
            setProgress({ value: 100, text: 'Обновление завершено!', etr: '' });
            addNotification(`База ОКБ успешно обновлена. Загружено ${geocodedData.length} записей.`, 'success');
            
            await fetchStatus(); // Refresh status after successful update
        } catch (error: any) {
            console.error("OKB Processing Error:", error);
            addNotification(error.message, 'error');
        } finally {
            setIsProcessing(false);
            setProgress({ value: 0, text: '', etr: '' });
        }
    };


    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
            <h2 className="text-xl font-bold mb-4 text-white">Управление базой ОКБ</h2>
            
            <div className="space-y-3 text-sm mb-5 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Статус:</span>
                    {isLoadingStatus ? <LoaderIcon /> : (
                        status && status.rowCount > 0 ? <span className="font-semibold text-success">Загружена</span> : <span className="font-semibold text-warning">Пуста или Ошибка</span>
                    )}
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Записей:</span>
                    <span className="font-semibold text-white">{status?.rowCount ?? 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Обновлено:</span>
                    <span className="font-semibold text-white">{formatLastUpdated(status?.lastUpdated)}</span>
                </div>
            </div>

            <div className="relative">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-accent to-accent-dark hover:opacity-90 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center"
                >
                    {isProcessing ? (
                        <>
                            <LoaderIcon />
                            <span className="ml-2">Обработка...</span>
                        </>
                    ) : (
                        <span>Обновить базу ОКБ (.xlsx)</span>
                    )}
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".xlsx, .xls"
                    className="hidden"
                    disabled={isProcessing}
                />
            </div>
             {isProcessing && (
                 <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span className="truncate pr-2">{progress.text}</span>
                        <span>{Math.round(progress.value)}%</span>
                    </div>
                    <div className="w-full bg-gray-900/50 rounded-full h-2">
                        <div
                            className="bg-gradient-to-r from-accent to-accent-dark h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress.value}%` }}
                        ></div>
                    </div>
                    {progress.etr && (
                         <p className="text-center text-xs text-accent mt-2 animate-pulse">
                            {progress.etr}
                        </p>
                    )}
                </div>
            )}
            <div className="text-xs text-gray-500 mt-4 flex items-start gap-2">
                <span className="w-5 h-5 flex-shrink-0 text-yellow-400 pt-0.5">
                    <InfoIcon />
                </span>
                <span>
                    Загрузка нового файла полностью перезапишет существующую базу данных.
                    Файл должен содержать колонки: "Название", "Адрес", "Телефон", "Тип", "Регион".
                </span>
            </div>
        </div>
    );
};

export default OKBManagement;
