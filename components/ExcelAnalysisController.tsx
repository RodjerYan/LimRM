import React from 'react';
import { getGeminiSalesAnalysis } from '../services/aiService';
import { GeminiAnalysisResult } from '../types';

interface ExcelAnalysisControllerProps {
    rawCsvData: string | null;
    analysisState: {
        loading: boolean;
        data: GeminiAnalysisResult | null;
        error: string | null;
    };
    setAnalysisState: React.Dispatch<React.SetStateAction<{
        loading: boolean;
        data: GeminiAnalysisResult | null;
        error: string | null;
    }>>;
}

const ExcelAnalysisController: React.FC<ExcelAnalysisControllerProps> = ({ rawCsvData, analysisState, setAnalysisState }) => {

    const handleRunAnalysis = async () => {
        if (!rawCsvData || analysisState.loading) return;

        setAnalysisState({ loading: true, data: null, error: null });
        try {
            const result = await getGeminiSalesAnalysis(rawCsvData);
            setAnalysisState({ loading: false, data: result, error: null });
        } catch (error: any) {
            setAnalysisState({ loading: false, data: null, error: error.message || 'Произошла неизвестная ошибка' });
        }
    };

    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold text-white mb-4">Глубокий AI-Анализ Файла</h2>
            <p className="text-sm text-gray-400 mb-5">
                Запустите полный анализ исходного файла с помощью Gemini, чтобы получить сводную информацию, выявить лидеров, аномалии и получить прогноз.
            </p>
            <button
                onClick={handleRunAnalysis}
                disabled={!rawCsvData || analysisState.loading}
                className="w-full bg-gradient-to-r from-accent to-purple-600 hover:from-accent-hover hover:to-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-accent/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-500 disabled:to-gray-600 disabled:shadow-none"
            >
                {analysisState.loading ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Анализ...
                    </>
                ) : (
                   'Запустить анализ Gemini'
                )}
            </button>
             {analysisState.data && (
                <p className="text-xs text-success/80 mt-3 text-center">Анализ успешно завершен.</p>
            )}
             {analysisState.error && (
                <p className="text-xs text-danger/80 mt-3 text-center">Ошибка: {analysisState.error}</p>
            )}
        </div>
    );
};

export default ExcelAnalysisController;
