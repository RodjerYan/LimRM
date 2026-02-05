
import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { RMMetrics } from '../types';
import { streamRMInsights } from '../services/aiService';
import { LoaderIcon, TrendingUpIcon, TargetIcon, SearchIcon } from './icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface RMAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    rmData: RMMetrics | null;
    baseRate: number;
    dateRange?: string; // New Prop
}

const RMAnalysisModal: React.FC<RMAnalysisModalProps> = ({ isOpen, onClose, rmData, baseRate, dateRange }) => {
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (isOpen && rmData) {
            fetchAnalysis();
        } else {
            // Cleanup when closed
            setAnalysis('');
            setError(null);
            setIsLoading(false);
            abortControllerRef.current?.abort();
        }
    }, [isOpen, rmData]);

    const fetchAnalysis = () => {
        if (!rmData) return;

        // Cancel previous request if any
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setIsLoading(true);
        setAnalysis('');
        setError(null);

        streamRMInsights(
            rmData,
            baseRate,
            (chunk) => setAnalysis(prev => prev + chunk),
            (err) => {
                if (err.name !== 'AbortError') {
                    setError(`Ошибка при получении анализа: ${err.message}`);
                }
                setIsLoading(false);
            },
            abortControllerRef.current.signal,
            dateRange // Pass the date range
        ).finally(() => {
            setIsLoading(false);
        });
    };

    if (!rmData) return null;

    const sanitizedHtml = DOMPurify.sanitize(marked.parse(analysis) as string);
    const isHighGrowth = rmData.recommendedGrowthPct > baseRate;
    
    const headerColor = isHighGrowth ? 'text-emerald-400' : (rmData.recommendedGrowthPct < baseRate ? 'text-amber-400' : 'text-indigo-400');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Анализ плана: ${rmData.rmName}`} maxWidth="max-w-5xl">
            <div className="space-y-6">
                {/* Key Metrics Header */}
                <div className="grid grid-cols-3 gap-4 bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                    <div className="text-center border-r border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">Доля рынка</div>
                        <div className="text-xl font-bold text-white">{rmData.marketShare.toFixed(1)}%</div>
                    </div>
                    <div className="text-center border-r border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">Базовый план</div>
                        <div className="text-xl font-bold text-gray-300">{baseRate}%</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-gray-400 mb-1">Индивидуальный план</div>
                        <div className={`text-2xl font-bold ${headerColor}`}>
                            {rmData.recommendedGrowthPct > 0 ? '+' : ''}{rmData.recommendedGrowthPct.toFixed(1)}%
                        </div>
                    </div>
                </div>

                {/* AI Analysis Content */}
                <div className="bg-card-bg/50 p-6 rounded-xl border border-indigo-500/20 min-h-[200px] relative">
                    <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
                        <h3 className="text-lg font-bold text-indigo-300 flex items-center gap-2">
                            <div className="p-1 bg-indigo-500/20 rounded-lg"><TrendingUpIcon /></div>
                            AI Анализ Рынка (Google Grounding)
                        </h3>
                        {isLoading && (
                            <div className="flex items-center gap-2 text-xs text-cyan-400 animate-pulse">
                                <SearchIcon small />
                                <span>
                                    {dateRange 
                                        ? `Поиск данных за период: ${dateRange}...` 
                                        : 'Поиск актуальных данных в Интернете...'}
                                </span>
                            </div>
                        )}
                    </div>

                    {error ? (
                        <div className="text-center py-8">
                            <p className="text-danger mb-4">{error}</p>
                            <button onClick={fetchAnalysis} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white text-sm">
                                Повторить
                            </button>
                        </div>
                    ) : (
                        <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed">
                            {!analysis && isLoading ? (
                                <div className="space-y-3 animate-pulse">
                                    <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                                    <div className="h-4 bg-gray-700 rounded w-full"></div>
                                    <div className="h-4 bg-gray-700 rounded w-5/6"></div>
                                    <div className="text-xs text-gray-500 pt-2">Анализ конкурентов...</div>
                                </div>
                            ) : (
                                <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                            )}
                        </div>
                    )}
                </div>
                
                <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg flex items-start gap-3">
                    <div className="text-yellow-500 mt-1"><TargetIcon small/></div>
                    <div className="text-xs text-gray-300">
                        <strong className="text-yellow-400 block mb-1">Как читать это обоснование:</strong>
                        Алгоритм учитывает эффект "низкой базы" и реальные рыночные тренды, найденные через Google Search. Если доля рынка мала, потенциал роста огромен, и стандартных {baseRate}% недостаточно.
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default RMAnalysisModal;
