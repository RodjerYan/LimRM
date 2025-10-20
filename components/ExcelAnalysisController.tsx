import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { processJsonData } from '../services/dataProcessor';
import { RawDataRow } from '../types';
import { LoaderIcon, LargeSuccessIcon, LargeErrorIcon } from './icons';

interface ExcelAnalysisControllerProps {
    onAnalysisStart: (rawJsonData: any[], csvString: string) => void;
    onDataProcessed: (result: { 
        processedData: RawDataRow[], 
        uniqueLocations: Set<string>, 
        existingClientsByRegion: Record<string, string[]> 
    }) => void;
    onAnalysisError: (error: Error) => void;
    isBusy: boolean;
}

const ExcelAnalysisController: React.FC<ExcelAnalysisControllerProps> = ({ 
    onAnalysisStart, 
    onDataProcessed,
    onAnalysisError,
    isBusy 
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [fileContent, setFileContent] = useState<{jsonData: any[], csvString: string} | null>(null);
    const [parseState, setParseState] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle');
    const [parseError, setParseError] = useState<string | null>(null);

    const handleFileParse = useCallback((acceptedFile: File) => {
        setFile(acceptedFile);
        setParseState('parsing');
        setParseError(null);
        setFileContent(null);

        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) throw new Error("Не удалось прочитать файл.");

                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                const csvString = XLSX.utils.sheet_to_csv(worksheet);

                if (jsonData.length === 0) {
                    throw new Error("Файл пуст или имеет неверный формат. Убедитесь, что данные находятся на первом листе.");
                }
                
                setFileContent({ jsonData, csvString });
                setParseState('success');
            } catch (err: any) {
                setParseError(err.message || "Не удалось обработать Excel файл. Попробуйте сохранить его как CSV и загрузить снова.");
                setParseState('error');
                onAnalysisError(err);
            }
        };

        reader.onerror = () => {
             const error = new Error("Ошибка чтения файла.");
             setParseError(error.message);
             setParseState('error');
             onAnalysisError(error);
        };
        
        reader.readAsArrayBuffer(acceptedFile);
    }, [onAnalysisError]);


    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            handleFileParse(acceptedFiles[0]);
        }
    }, [handleFileParse]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv'],
        },
        multiple: false,
        disabled: isBusy,
    });
    
    const handleProcessData = () => {
        if (!fileContent) return;
        try {
            const result = processJsonData(fileContent.jsonData);
            onDataProcessed(result);
        } catch (error: any) {
            onAnalysisError(error);
        }
    };

    const handleAiAnalysis = () => {
        if (!fileContent) return;
        onAnalysisStart(fileContent.jsonData, fileContent.csvString);
    };

    const getStatusIcon = () => {
        switch (parseState) {
            case 'parsing': return <LoaderIcon />;
            case 'success': return <LargeSuccessIcon className="w-8 h-8 text-success" />;
            case 'error': return <LargeErrorIcon className="w-8 h-8 text-danger" />;
            default: return null;
        }
    };
    
    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white">Панель управления анализом</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-200 ${isDragActive ? 'border-accent bg-accent/10' : 'border-gray-600 hover:border-accent'}`}>
                    <input {...getInputProps()} />
                     {isBusy ? (
                        <p className="text-gray-400">Идет анализ...</p>
                    ) : (
                        isDragActive ?
                            <p className="text-accent font-semibold">Отпустите файл для загрузки</p> :
                            <p className="text-gray-400">Перетащите сюда Excel/CSV файл или <span className="text-accent font-semibold">нажмите для выбора</span></p>
                    )}
                </div>
                
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg min-h-[50px]">
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">{getStatusIcon()}</div>
                        <div className="flex-grow">
                            {file && <p className="text-sm font-medium text-white truncate" title={file.name}>{file.name}</p>}
                            {parseState === 'error' && <p className="text-xs text-danger">{parseError}</p>}
                            {parseState === 'success' && <p className="text-xs text-success">Файл успешно прочитан. {fileContent?.jsonData.length} строк.</p>}
                        </div>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={handleProcessData}
                            disabled={isBusy || parseState !== 'success'}
                            className="w-full bg-gradient-to-r from-accent to-purple-600 hover:from-accent-hover hover:to-purple-500 text-white font-bold py-2.5 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-500 disabled:to-gray-600"
                        >
                            Анализ и Расчет Плана
                        </button>
                         <button
                            onClick={handleAiAnalysis}
                            disabled={isBusy || parseState !== 'success'}
                            className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-bold py-2.5 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-500 disabled:to-gray-600"
                        >
                            Gemini AI-Анализ
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExcelAnalysisController;
