import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Modal from './Modal';
import DetailChart from './DetailChart';
import { AggregatedDataRow, OkbStatus } from '../types';
import { streamClientInsights } from '../services/aiService';
import { LoaderIcon, FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TrendingUpIcon, CalculatorIcon, CoverageIcon } from './icons';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
    okbStatus: OkbStatus | null;
}

// Local formatNumber utility
const formatNumber = (num: number, short = false) => {
    if (isNaN(num)) return '0';
    if (short) {
        if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)} млн`;
        if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)} тыс.`;
    }
    return num.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

// Local MetricCard component for modal-specific display
const MetricCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string; tooltip: string }> = ({ title, value, icon, color, tooltip }) => (
    <div title={tooltip} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 flex items-start space-x-3">
        <div className={`p-2 rounded-md ${color} bg-opacity-10`}>
           {React.cloneElement(icon as React.ReactElement<{ small?: boolean }>, { small: true })}
        </div>
        <div>
            <p className="text-xs text-gray-400">{title}</p>
            <p className="text-lg font-bold text-white">{value}</p>
        </div>
    </div>
);


const AiInsightSection: React.FC<{ data: AggregatedDataRow }> = ({ data }) => {
    const [insight, setInsight] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchInsights = useCallback(() => {
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
                if (err.name !== 'AbortError') {
                    setError(`Не удалось получить рекомендации от AI: ${err.message}. Попробуйте еще раз.`);
                }
                setIsLoading(false);
            },
            signal
        ).finally(() => {
            setIsLoading(false);
        });
    }, [data]);

    useEffect(() => {
        if (!data) return;

        fetchInsights();

        return () => {
            abortControllerRef.current?.abort();
        };
    }, [data, fetchInsights]);

    const sanitizedHtml = DOMPurify.sanitize(marked.parse(insight) as string);

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 min-h-[150px] flex flex-col">
            <h4 className="font-bold text-lg mb-2 text-accent">Рекомендации от Gemini</h4>
            <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar pr-2">
                {isLoading && !insight && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <LoaderIcon />
                        <span className="ml-2">Анализ данных...</span>
                    </div>
                )}
                {error && (
                    <div className="text-center">
                        <p className="text-danger text-sm mb-3">{error}</p>
                        <button
                            onClick={fetchInsights}
                            disabled={isLoading}
                            className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg transition duration-200 text-sm disabled:bg-gray-600"
                        >
                            {isLoading ? 'Загрузка...' : 'Попробовать снова'}
                        </button>
                    </div>
                )}
                <div className="prose prose-invert prose-sm max-w-none text-slate-300" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            </div>
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


const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data, okbStatus }) => {
    if (!data) return null;

    const isUnidentified = data.region?.toLowerCase().includes('не определен');
    
    const AnalyticsContent: React.FC = () => {
        const activeClients = data.clients?.length || 0;
        const avgFactPerClient = activeClients > 0 ? data.fact / activeClients : 0;
        const okbCoverage = (okbStatus?.rowCount && activeClients > 0) ? (activeClients / okbStatus.rowCount) * 100 : 0;

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                            <h4 className="font-bold text-lg mb-3 text-indigo-400">Ключевые показатели группы</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <MetricCard title="Общий Факт" value={formatNumber(data.fact, true)} icon={<FactIcon />} color="text-success" tooltip={`Текущий объем продаж по группе: ${formatNumber(data.fact, false)} кг/ед`} />
                                <MetricCard title="Общий Потенциал" value={formatNumber(data.potential, true)} icon={<PotentialIcon />} color="text-accent" tooltip={`Прогнозируемый объем рынка для группы: ${formatNumber(data.potential, false)} кг/ед`} />
                                <MetricCard title="Потенциал Роста" value={formatNumber(data.growthPotential, false)} icon={<GrowthIcon />} color="text-warning" tooltip={`Неосвоенный объем рынка для группы: ${formatNumber(data.growthPotential, false)} кг/ед`} />
                                <MetricCard title="Средний Рост" value={`${data.growthPercentage.toFixed(1)}%`} icon={<TrendingUpIcon />} color="text-yellow-400" tooltip="Средний процент неосвоенного потенциала по клиентам в группе" />
                                <MetricCard title="Активных Клиентов" value={formatNumber(activeClients, false)} icon={<UsersIcon />} color="text-cyan-400" tooltip="Количество уникальных ТТ в группе" />
                                <MetricCard title="Средний Факт (Клиент)" value={formatNumber(avgFactPerClient, false)} icon={<CalculatorIcon />} color="text-indigo-400" tooltip={`Средние продажи на одну ТТ в группе: ${formatNumber(avgFactPerClient, false)} кг/ед`} />
                                <MetricCard title="Покрытие ОКБ" value={`${okbCoverage.toFixed(1)}%`} icon={<CoverageIcon />} color="text-rose-400" tooltip={`Доля активных клиентов из общей базы (${activeClients} из ${okbStatus?.rowCount || 0})`} />
                            </div>
                        </div>
                        <GroupedClientsList clients={data.clients} />
                    </div>
                    <AiInsightSection data={data} />
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <h4 className="font-bold text-lg mb-3 text-emerald-400">Факт vs Потенциал</h4>
                    <div className="h-64">
                        <DetailChart fact={data.fact} potential={data.potential} />
                    </div>
                </div>
            </div>
        );
    };
    
    const UnidentifiedContent: React.FC = () => (
        <div className="space-y-6">
            <div className="bg-gray-900/50 p-6 rounded-lg border border-yellow-500/20 text-center">
                <h4 className="font-bold text-lg mb-2 text-warning">Аналитика недоступна</h4>
                <p className="text-gray-400">Эта запись относится к неопределенным адресам.</p>
                <p className="text-sm text-gray-500 mt-2">Пожалуйста, уточните адрес клиента, чтобы получить полные данные и рекомендации.</p>
            </div>
            <GroupedClientsList clients={data.clients} />
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детальная информация: ${data.clientName}`}>
            {isUnidentified ? <UnidentifiedContent /> : <AnalyticsContent />}
        </Modal>
    );
};

export default DetailsModal;