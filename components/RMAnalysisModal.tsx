
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
    dateRange?: string;
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
            setAnalysis('');
            setError(null);
            setIsLoading(false);
            abortControllerRef.current?.abort();
        }
    }, [isOpen, rmData]);

    const fetchAnalysis = () => {
        if (!rmData) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
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
            dateRange
        ).finally(() => setIsLoading(false));
    };

    if (!rmData) return null;

    const sanitizedHtml = DOMPurify.sanitize(marked.parse(analysis) as string);
    const isHighGrowth = rmData.recommendedGrowthPct > baseRate;
    
    const headerColor = isHighGrowth ? 'text-emerald-600' : (rmData.recommendedGrowthPct < baseRate ? 'text-amber-500' : 'text-indigo-600');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Анализ плана: ${rmData.rmName}`} maxWidth="max-w-5xl">
            <div className="space-y-6">
                {/* Key Metrics Header */}
                <div className="grid grid-cols-3 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <div className="text-center border-r border-slate-200">
                        <div className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">Доля рынка</div>
                        <div className="text-2xl font-black text-slate-900">{rmData.marketShare.toFixed(1)}%</div>
                    </div>
                    <div className="text-center border-r border-slate-200">
                        <div className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">Базовый план</div>
                        <div className="text-2xl font-black text-slate-700">{baseRate}%</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">Индивидуальный</div>
                        <div className={`text-2xl font-black ${headerColor}`}>
                            {rmData.recommendedGrowthPct > 0 ? '+' : ''}{rmData.recommendedGrowthPct.toFixed(1)}%
                        </div>
                    </div>
                </div>

                {/* AI Analysis Content */}
                <div className="bg-white p-8 rounded-3xl border border-indigo-100 shadow-lg min-h-[200px] relative">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                        <h3 className="text-lg font-bold text-indigo-700 flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-xl"><TrendingUpIcon /></div>
                            AI Анализ Рынка (Google Grounding)
                        </h3>
                        {isLoading && (
                            <div className="flex items-center gap-2 text-xs text-indigo-500 font-bold animate-pulse">
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
                            <p className="text-red-600 mb-4 font-bold">{error}</p>
                            <button onClick={fetchAnalysis} className="bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl text-slate-700 text-sm font-bold transition-colors">
                                Повторить
                            </button>
                        </div>
                    ) : (
                        <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed font-medium">
                            {!analysis && isLoading ? (
                                <div className="space-y-4 animate-pulse">
                                    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                                    <div className="h-4 bg-slate-200 rounded w-full"></div>
                                    <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                                    <div className="text-xs text-slate-400 pt-2 font-bold uppercase">Анализ конкурентов...</div>
                                </div>
                            ) : (
                                <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                            )}
                        </div>
                    )}
                </div>
                
                <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl flex items-start gap-3">
                    <div className="text-amber-500 mt-1"><TargetIcon small/></div>
                    <div className="text-xs text-amber-900 leading-relaxed">
                        <strong className="text-amber-700 block mb-1 uppercase tracking-wide">Как читать это обоснование:</strong>
                        Алгоритм учитывает эффект "низкой базы" и реальные рыночные тренды, найденные через Google Search. Если доля рынка мала, потенциал роста огромный, и стандартных {baseRate}% недостаточно.
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default RMAnalysisModal;
