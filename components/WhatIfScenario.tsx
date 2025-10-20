import React, { useState } from 'react';
import { AggregatedDataRow } from '../types';
import AIInsights from './AIInsights';
import { LoaderIcon } from './icons';

interface WhatIfScenarioProps {
    data: AggregatedDataRow[];
}

interface AiAnalysisResult {
    summary: string;
    insights: string[];
    forecasts: string[];
}

const WhatIfScenario: React.FC<WhatIfScenarioProps> = ({ data }) => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);

    const handleAnalyze = async () => {
        if (!prompt.trim()) {
            setError("Пожалуйста, введите сценарий для анализа.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setAnalysis(null);
        try {
            const response = await fetch('/api/gemini-analytics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tableData: data,
                    whatIfPrompt: prompt,
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Ошибка при получении AI-анализа');
            }
            const result: AiAnalysisResult = await response.json();
            setAnalysis(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (data.length === 0) {
        return (
             <div className="h-full flex items-center justify-center">
                <p className="text-gray-500 italic text-center">Данные для моделирования появятся после загрузки файла.</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar pr-2 space-y-6">
            <div>
                <h3 className="text-xl font-bold text-white mb-2">Моделирование сценариев "Что если?"</h3>
                <p className="text-sm text-gray-400 mb-4">
                    Опишите гипотетическую ситуацию, чтобы AI-аналитик оценил её влияние. 
                    Например: "Продажи бренда LimKorm Premium выросли на 15% в Москве" или "Что если мы откроем 5 новых ТТ в Санкт-Петербурге?".
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Введите ваш сценарий здесь..."
                        rows={2}
                        className="flex-grow p-2.5 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleAnalyze}
                        disabled={isLoading || !prompt.trim()}
                        className="bg-accent hover:opacity-90 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition duration-200 shadow-lg flex items-center justify-center"
                    >
                        {isLoading ? <LoaderIcon /> : 'Анализировать'}
                    </button>
                </div>
            </div>

            <AIInsights analysis={analysis} isLoading={isLoading} error={error} />
        </div>
    );
};

export default WhatIfScenario;