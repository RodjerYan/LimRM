// Fix: Declare the 'Excel' global object to resolve TypeScript errors
// because the type definitions are not being found by the build environment.
declare const Excel: any;

import React, { useState } from 'react';
import { RawDataRow } from '../types';
import { processJsonData } from '../services/dataProcessor'; 
import Papa from 'papaparse';
import { PulsingLoader } from './icons';

interface ExcelAnalysisControllerProps {
    onAnalysisStart: (rawJsonData: any[], csvString: string) => void;
    onDataProcessed: (result: { processedData: RawDataRow[], uniqueLocations: Set<string>, existingClientsByRegion: Record<string, string[]> }) => void;
    onAnalysisError: (error: Error) => void;
    isBusy: boolean;
}

const ExcelAnalysisController: React.FC<ExcelAnalysisControllerProps> = ({ onAnalysisStart, onDataProcessed, onAnalysisError, isBusy }) => {
    const [statusText, setStatusText] = useState('');

    const handleAnalyzeClick = async () => {
        setStatusText('Считываю данные из Excel...');
        try {
            await Excel.run(async (context) => {
                const range = context.workbook.getSelectedRange();
                range.load("values");
                await context.sync();

                const values = range.values as (string | number | boolean)[][];

                if (!values || values.length < 2) {
                    throw new Error("Выделенный диапазон слишком мал. Выделите таблицу с заголовками и хотя бы одной строкой данных.");
                }

                setStatusText('Преобразую данные...');
                const headers = values[0].map(String);
                const jsonData = values.slice(1).map(row => {
                    const obj: { [key: string]: any } = {};
                    headers.forEach((header, index) => {
                        obj[header] = row[index];
                    });
                    return obj;
                });
                
                const csvString = Papa.unparse(jsonData);

                // Start AI analysis early
                onAnalysisStart(jsonData, csvString);

                setStatusText('Обрабатываю структуру...');
                const processedResult = processJsonData(jsonData);
                onDataProcessed(processedResult);
                
                setStatusText('');
            });
        } catch (error: any) {
            console.error("Excel analysis error:", error);
            const friendlyMessage = error.message || "Не удалось прочитать данные из выделенного диапазона.";
            setStatusText(`Ошибка: ${friendlyMessage}`);
            onAnalysisError(new Error(friendlyMessage));
        }
    };

    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white">
                Анализ данных из Excel
            </h2>
            <div className="relative h-[60px] flex flex-col justify-center items-center transition-all duration-300">
                {isBusy ? (
                    <div className="text-center">
                        <PulsingLoader />
                        <p className="text-xs text-gray-400 mt-2">{statusText || 'Идет анализ...'}</p>
                    </div>
                ) : (
                    <button
                        onClick={handleAnalyzeClick}
                        disabled={isBusy}
                        className="w-full bg-gradient-to-r from-accent to-purple-600 hover:from-accent-hover hover:to-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-accent/20 flex items-center justify-center"
                    >
                        <span>Анализировать выделенные данные</span>
                    </button>
                )}
                 {statusText && !isBusy && <p className="text-xs text-danger mt-2">{statusText}</p>}
            </div>
        </div>
    );
};

export default ExcelAnalysisController;