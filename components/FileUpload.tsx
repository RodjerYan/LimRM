import React, { useState, useCallback } from 'react';

interface FileUploadProps {
    onFileProcessed: (data: any) => void;
    onProcessingStateChange: (isLoading: boolean, message: string) => void;
    disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileProcessed, onProcessingStateChange, disabled }) => {
    const [fileName, setFileName] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const processFile = useCallback(async (file: File) => {
        onProcessingStateChange(true, `Загрузка файла "${file.name}" на сервер...`);
        setFileName(file.name);

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                
                const response = await fetch('/api/process-sales-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileBase64: base64 }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.details || `Ошибка сервера: ${response.statusText}`);
                }

                const result = await response.json();
                onFileProcessed(result);
                onProcessingStateChange(false, 'Файл успешно загружен и поставлен в очередь на обработку.');
            };
            reader.onerror = (error) => {
                throw new Error('Не удалось прочитать файл.');
            };

        } catch (error) {
            onProcessingStateChange(false, `Ошибка при загрузке файла: ${(error as Error).message}`);
        }
    }, [onFileProcessed, onProcessingStateChange]);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            processFile(file);
        }
    }, [processFile]);

    const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (disabled) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    }, [processFile, disabled]);

    return (
        <div className={`relative bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                 <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">1</span>
                Загрузка данных
            </h2>
            <div className="flex items-center justify-center w-full">
                <label 
                    htmlFor="dropzone-file" 
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragEnter}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg transition-colors ${
                        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${
                        isDragging ? 'border-accent bg-indigo-900/40' : 'border-gray-600 bg-gray-900/50 hover:bg-gray-800/60'
                    }`}
                >
                    <div className="flex flex-col items-center justify-center text-center h-full">
                        <div className="pt-5 pb-6">
                            <svg className="w-8 h-8 mb-4 text-gray-500 mx-auto" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                            </svg>
                            <p className="mb-2 text-sm text-gray-400">
                                <span className="font-semibold text-accent">{isDragging ? 'Отпустите файл' : 'Нажмите для загрузки'}</span> или перетащите
                            </p>
                            <p className="text-xs text-gray-500">XLSX, XLS, CSV</p>
                        </div>
                    </div>
                    <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept=".xlsx, .xls, .csv" disabled={disabled} />
                </label>
            </div>
             <div className="mt-4 text-center text-xs text-gray-400 bg-gray-900/50 p-2 rounded-md border border-gray-700">
                💡 **Инфо:** Данные будут загружены в Google Таблицу для обработки. Координаты появятся в течение минуты.
            </div>
            {fileName && !disabled && (
                 <div className="mt-4 space-y-2">
                    <p className="text-sm text-gray-300 text-center">Файл для загрузки: <span className="font-medium text-white">{fileName}</span></p>
                </div>
            )}
        </div>
    );
};

export default FileUpload;
