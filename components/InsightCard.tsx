import React from 'react';
import { GeminiAnalysisResult } from '../types';
import { PulsingLoader } from './icons';

interface InsightCardProps {
    analysisState: {
        loading: boolean;
        data?: GeminiAnalysisResult | null;
        error?: string | null;
    }
}

const InsightCard: React.FC<InsightCardProps> = ({ analysisState }) => {
    const { loading, data, error } = analysisState;

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                    <PulsingLoader />
                    <p className="mt-3 text-sm">Gemini анализирует данные...</p>
                    <p className="text-xs text-gray-500 mt-1">Это может занять до 30 секунд.</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="text-center text-danger h-full flex flex-col justify-center">
                    <h4 className="font-semibold">Ошибка AI-Анализа</h4>
                    <p className="text-xs mt-1 text-red-400/80">{error}</p>
                </div>
            );
        }

        if (!data || !data.insights || data.insights.length === 0) {
             return (
                <div className="text-center text-gray-500 h-full flex items-center justify-center">
                    <p className="text-sm italic">Загрузите файл, чтобы получить AI-анализ и рекомендации.</p>
                </div>
            );
        }
        
        return (
            <ul className="space-y-3">
                {data.insights.map((insight, index) => (
                    <li key={index} className="flex items-start">
                        <span className="text-accent mr-3 mt-1">&#9679;</span>
                        <p className="text-gray-300 text-sm">{insight}</p>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white">
                AI-Анализ и Рекомендации
            </h2>
            <div className="relative min-h-[120px] overflow-y-auto custom-scrollbar pr-2">
                {renderContent()}
            </div>
        </div>
    );
};

export default InsightCard;
