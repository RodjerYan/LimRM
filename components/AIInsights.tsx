import React from "react";
import { LoaderIcon } from './icons';

interface AiAnalysisResult {
    summary: string;
    insights: string[];
    forecasts: string[];
}

interface AIInsightsProps {
    analysis: AiAnalysisResult | null;
    isLoading: boolean;
    error: string | null;
}

const AIInsights: React.FC<AIInsightsProps> = ({ analysis, isLoading, error }) => {
    if (isLoading) {
        return (
            <div className="p-6 rounded-lg bg-gray-900/50 text-center animate-pulse flex items-center justify-center gap-3">
                <LoaderIcon />
                <span className="text-lg text-gray-400">AI-Аналитик изучает данные...</span>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="p-6 rounded-lg bg-red-900/30 text-danger text-center">
                <strong>Ошибка AI-Аналитика:</strong> {error}
            </div>
        );
    }

    if (!analysis) return null;

    return (
        <div className="p-6 rounded-lg bg-indigo-900/30 border border-accent/30 space-y-5 animate-fade-in">
            <h2 className="text-2xl font-bold text-accent flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 001.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                Выводы AI-Аналитика
            </h2>
            
            {analysis.summary && (
                <div>
                    <h4 className="font-semibold text-white mb-1.5 text-lg">Общая картина</h4>
                    <p className="text-md text-gray-300">{analysis.summary}</p>
                </div>
            )}
             
            {analysis.insights && analysis.insights.length > 0 && (
                <div>
                    <h4 className="font-semibold text-white mb-2 text-lg">Ключевые инсайты</h4>
                    <ul className="list-disc list-inside space-y-1.5 text-md text-gray-300 marker:text-accent">
                        {analysis.insights.map((insight, i) => <li key={i}>{insight}</li>)}
                    </ul>
                </div>
            )}
             
            {analysis.forecasts && analysis.forecasts.length > 0 && (
                <div>
                    <h4 className="font-semibold text-white mb-2 text-lg">Прогнозы</h4>
                    <ul className="list-disc list-inside space-y-1.5 text-md text-gray-300 marker:text-accent">
                        {analysis.forecasts.map((forecast, i) => <li key={i}>{forecast}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default AIInsights;