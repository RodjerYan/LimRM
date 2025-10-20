import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { LargeSuccessIcon, LargeErrorIcon } from './icons';

interface FileUploadProps {
    onFileUpload: (data: any[], fileName: string, rawCsv: string) => void;
    onProcessingStart: () => void;
    disabled: boolean;
    uploadError: string | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, onProcessingStart, disabled, uploadError }) => {
    const [fileName, setFileName] = useState<string | null>(null);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (disabled || acceptedFiles.length === 0) return;

        onProcessingStart();
        setFileName(acceptedFiles[0].name);

        const file = acceptedFiles[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) throw new Error("Не удалось прочитать файл.");

                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    defval: "" // Ensure empty cells are handled gracefully
                });
                
                // Also get raw CSV for Gemini analysis
                const rawCsv = XLSX.utils.sheet_to_csv(worksheet);

                onFileUpload(jsonData, file.name, rawCsv);

            } catch (error: any) {
                onFileUpload([], file.name, ''); // Trigger error state in parent
            }
        };
        
        reader.onerror = () => {
             onFileUpload([], file.name, ''); // Trigger error state in parent
        };

        reader.readAsBinaryString(file);
    }, [onFileUpload, onProcessingStart, disabled]);

    const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv'],
        },
        multiple: false,
        disabled
    });

    const getBorderColor = () => {
        if (uploadError) return 'border-danger';
        if (fileName && !uploadError) return 'border-success';
        if (isDragAccept) return 'border-accent';
        if (isDragReject) return 'border-danger';
        if (isDragActive) return 'border-accent-hover';
        return 'border-border-color';
    };

    return (
        <div 
            {...getRootProps()} 
            className={`relative p-6 rounded-2xl shadow-lg border-2 border-dashed transition-all duration-300 cursor-pointer text-center group ${getBorderColor()} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent'}`}
        >
            <input {...getInputProps()} />
            
            <div className="flex flex-col items-center justify-center">
                {uploadError ? (
                    <>
                        <div className="w-16 h-16 text-danger mb-3"><LargeErrorIcon className="w-full h-full" /></div>
                        <p className="text-lg font-semibold text-danger">Ошибка при обработке файла</p>
                        <p className="text-sm text-red-400/80">{uploadError}</p>
                    </>
                ) : fileName ? (
                     <>
                        <div className="w-16 h-16 text-success mb-3"><LargeSuccessIcon className="w-full h-full" /></div>
                        <p className="text-lg font-semibold text-success">Файл успешно загружен!</p>
                        <p className="text-sm text-gray-400 truncate max-w-xs">{fileName}</p>
                     </>
                ) : (
                    <>
                        <svg className="w-12 h-12 text-gray-400 mb-3 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        <p className="text-lg font-semibold text-white">
                            {isDragActive ? "Отпустите файл..." : "Перетащите файл сюда"}
                        </p>
                        <p className="text-sm text-gray-500">или кликните для выбора</p>
                        <p className="text-xs text-gray-600 mt-2">Поддерживаются форматы: XLSX, XLS, CSV</p>
                    </>
                )}
            </div>
        </div>
    );
};

export default FileUpload;
