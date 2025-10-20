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

const InfoBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <h4 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">{title}</h4>
        {children}
    </div>
);

const LeaderPill: React.FC<{ item: string; index: number }> = ({ item, index }) => {
    const colors = ['bg-amber-400/80', 'bg-slate-400/80', 'bg-orange-400/80'];
    const color = colors[index] || 'bg-gray-600/80';
    return (
        <span className={`text-xs font-bold text-white px-2 py-1 rounded-full ${color}`}>
            {index + 1}. {item}
        </span>
    );
};


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

        if (!data || !data.summary) {
             return (
                <div className="text-center text-gray-500 h-full flex items-center justify-center">
                    <p className="text-sm italic">Загрузите файл, чтобы получить AI-анализ и рекомендации.</p>
                </div>
            );
        }
        
        return (
            <div className="space-y-6">
                {data.summary && (data.summary.total_sales_amount || data.summary.total_sales_kg) && (
                    <InfoBlock title="Общая сводка">
                        <div className="flex flex-col sm:flex-row sm:gap-6 gap-2">
                             {data.summary.total_sales_amount && (
                                <div>
                                    <p className="text-lg font-bold text-success">{data.summary.total_sales_amount}</p>
                                    <p className="text-xs text-gray-500">Сумма продаж</p>
                                </div>
                             )}
                             {data.summary.total_sales_kg && (
                                <div>
                                    <p className="text-lg font-bold text-accent">{data.summary.total_sales_kg}</p>
                                    <p className="text-xs text-gray-500">Объем продаж</p>
                                </div>
                             )}
                        </div>
                    </InfoBlock>
                )}

                {data.leaders && (data.leaders.top_managers || data.leaders.top_brands) && (
                     <InfoBlock title="Лидеры">
                        <div className="flex flex-col gap-2">
                            {data.leaders.top_managers && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs text-gray-400 w-16">РМ:</span>
                                    {data.leaders.top_managers.slice(0, 3).map((m, i) => <LeaderPill key={m} item={m} index={i} />)}
                                </div>
                            )}
                             {data.leaders.top_brands && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs text-gray-400 w-16">Бренды:</span>
                                     {data.leaders.top_brands.slice(0, 3).map((b, i) => <LeaderPill key={b} item={b} index={i} />)}
                                </div>
                            )}
                        </div>
                    </InfoBlock>
                )}

                {data.forecast && data.forecast.predicted_sales && (
                     <InfoBlock title={`Прогноз на ${data.forecast.period || 'период'}`}>
                         <div>
                            <p className="text-lg font-bold text-info">{data.forecast.predicted_sales}</p>
                            <p className="text-xs text-gray-500">
                                Рост ~ <span className="font-semibold text-info/80">{data.forecast.predicted_growth_percent}</span>
                            </p>
                        </div>
                     </InfoBlock>
                )}
                
                {data.insights && data.insights.length > 0 && (
                    <InfoBlock title="Ключевые выводы">
                        <ul className="space-y-3">
                            {data.insights.map((insight, index) => (
                                <li key={index} className="flex items-start text-sm text-gray-300">
                                    <span className="text-accent-hover mr-3 mt-1 text-xs">&#11166;</span>
                                    <span>{insight}</span>
                                </li>
                            ))}
                        </ul>
                    </InfoBlock>
                )}
            </div>
        );
    };

    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white">
                AI-Анализ и Рекомендации
            </h2>
            <div className="relative min-h-[120px] max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                {renderContent()}
            </div>
        </div>
    );
};

export default InsightCard;