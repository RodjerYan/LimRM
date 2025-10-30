import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Modal from './Modal';
import DetailChart from './DetailChart';
import { AggregatedDataRow, OkbDataRow } from '../types';
import { streamClientInsights } from '../services/aiService';
import { LoaderIcon } from './icons';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
    okbData: OkbDataRow[]; // Kept for potential future use, but not used in the grouped view
}

const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU').format(num);

const AiInsightSection: React.FC<{ data: AggregatedDataRow }> = ({ data }) => {
    const [insight, setInsight] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!data) return;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        setInsight('');
        setError(null);
        setIsLoading(true);

        streamClientInsights(
            data,
            (chunk) => setInsight(prev => prev + chunk),
            (err) => {
                setError(`Не удалось получить рекомендации от AI: ${err.message}`);
                setIsLoading(false);
            },
            signal
        ).finally(() => {
            setIsLoading(false);
        });

        return () => {
            abortControllerRef.current?.abort();
        };
    }, [data]);

    const sanitizedHtml = DOMPurify.sanitize(marked.parse(insight) as string);

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 min-h-[150px]">
            <h4 className="font-bold text-lg mb-2 text-accent">Рекомендации от Gemini</h4>
            {isLoading && !insight && (
                <div className="flex items-center justify-center h-full text-gray-400">
                    <LoaderIcon />
                    <span className="ml-2">Анализ данных...</span>
                </div>
            )}
            {error && <p className="text-danger text-sm">{error}</p>}
            <div className="prose prose-invert prose-sm max-w-none text-slate-300" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
        </div>
    );
};

const GroupedClientsList: React.FC<{ clients: string[] | undefined }> = ({ clients }) => {
    if (!clients || clients.length === 0) {
        return null;
    }
    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <h4 className="font-bold text-lg mb-3 text-cyan-400">Клиенты в группе ({clients.length})</h4>
            <ul className="max-h-48 overflow-y-auto custom-scrollbar text-sm space-y-1 pr-2">
                {clients.map((client, index) => (
                    <li key={index} className="text-slate-300 bg-gray-800/50 p-1.5 rounded-md truncate" title={client}>
                        {client}
                    </li>
                ))}
            </ul>
        </div>
    );
};

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data }) => {
    if (!data) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детальная информация: ${data.clientName}`}>
            <div className="space-y-6">
                {/* Top Section: Metrics and AI Insights */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                             <h4 className="font-bold text-lg mb-3 text-indigo-400">Ключевые показатели группы</h4>
                             <div className="grid grid-cols-2 gap-4 text-center">
                                 <div>
                                     <p className="text-sm text-gray-400">Суммарный Факт</p>
                                     <p className="text-2xl font-bold text-success">{formatNumber(data.fact)}</p>
                                 </div>
                                 <div>
                                     <p className="text-sm text-gray-400">Суммарный Потенциал</p>
                                     <p className="text-2xl font-bold text-accent">{formatNumber(data.potential)}</p>
                                 </div>
                                 <div>
                                     <p className="text-sm text-gray-400">Рост (абс.)</p>
                                     <p className="text-2xl font-bold text-warning">{formatNumber(data.growthPotential)}</p>
                                 </div>
                                 <div>
                                     <p className="text-sm text-gray-400">Рост (%)</p>
                                     <p className="text-2xl font-bold text-warning">{data.growthPercentage.toFixed(1)}%</p>
                                 </div>
                             </div>
                        </div>
                        <GroupedClientsList clients={data.clients} />
                    </div>
                     <AiInsightSection data={data} />
                </div>

                {/* Bottom Section: Chart */}
                <div>
                    <h4 className="font-bold text-lg mb-2 text-indigo-400">Факт vs Потенциал</h4>
                    <div className="h-64 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                         <DetailChart fact={data.fact} potential={data.potential} />
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default DetailsModal;