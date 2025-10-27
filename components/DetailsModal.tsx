
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AggregatedDataRow, PotentialClient, OkbDataRow } from '../types';
import Modal from './Modal';
import DetailChart from './DetailChart';
import InteractiveMap from './InteractiveMap';
import { streamClientInsights } from '../services/aiService';
import { LoaderIcon, CopyIcon, CheckIcon } from './icons';
import { normalizeString } from '../utils/dataUtils';
// @ts-ignore
import Markdown from 'react-markdown';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
    okbData: OkbDataRow[];
}

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data, okbData }) => {
    const [insights, setInsights] = useState('');
    const [isLoadingInsights, setIsLoadingInsights] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [potentialClients, setPotentialClients] = useState<PotentialClient[]>([]);
    const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    
    const abortControllerRef = useRef<AbortController | null>(null);

    const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU').format(num);

    const getInsights = useCallback(() => {
        if (!data) return;

        // Abort previous request if it's running
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        setInsights('');
        setIsLoadingInsights(true);
        setError(null);

        streamClientInsights(
            data,
            (chunk) => setInsights(prev => prev + chunk),
            (err) => {
                setError(`Ошибка при получении рекомендаций: ${err.message}`);
                setIsLoadingInsights(false);
            },
            signal
        ).finally(() => {
            setIsLoadingInsights(false);
        });

    }, [data]);

    useEffect(() => {
        if (isOpen && data) {
            // Find potential clients in the same city from OKB
            const normalizedCity = data.city.toLowerCase();
            const clientsInCity = okbData
                .filter(okb => (okb['Юридический адрес'] || '').toLowerCase().includes(normalizedCity))
                .map(okb => ({
                    name: okb['Наименование полное'],
                    address: okb['Юридический адрес'],
                    type: okb['Вид деятельности (ОКВЭД)'],
                    lat: okb['Широта'],
                    lon: okb['Долгота'],
                }))
                .slice(0, 50); // Limit to 50 for performance
            setPotentialClients(clientsInCity);
            
            // Auto-fetch insights when modal opens
            getInsights();
        } else {
            // Cleanup on close
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            setInsights('');
            setError(null);
            setIsLoadingInsights(false);
            setPotentialClients([]);
        }

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [isOpen, data, okbData, getInsights]);

    const handleCopyToClipboard = () => {
        if (!data) return;
        const textToCopy = `
Анализ клиента: ${data.clientName}
Город: ${data.city}
Бренд: ${data.brand}
РМ: ${data.rm}
Факт: ${formatNumber(data.fact)}
Потенциал: ${formatNumber(data.potential)}
Потенциал Роста: ${formatNumber(data.growthPotential)} (${data.growthPercentage.toFixed(1)}%)
---
AI Рекомендации:
${insights.replace(/<br\s*\/?>/gi, '\n')}
        `.trim();
        navigator.clipboard.writeText(textToCopy);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    if (!data) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детальный анализ: ${data.clientName}`}>
            <div className="max-h-[75vh] overflow-y-auto custom-scrollbar pr-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column: Data & Chart */}
                    <div className="space-y-6">
                        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                            <h4 className="text-lg font-bold text-white mb-3">Ключевые показатели</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <strong className="text-gray-400">РМ:</strong> <span className="text-white">{data.rm}</span>
                                <strong className="text-gray-400">Город:</strong> <span className="text-white">{data.city}</span>
                                <strong className="text-gray-400">Бренд:</strong> <span className="text-white">{data.brand}</span>
                                <strong className="text-gray-400">Регион:</strong> <span className="text-white">{data.region}</span>
                                <strong className="text-gray-400">Факт:</strong> <span className="text-success font-mono">{formatNumber(data.fact)}</span>
                                <strong className="text-gray-400">Потенциал:</strong> <span className="text-accent font-mono">{formatNumber(data.potential)}</span>
                                <strong className="text-gray-400">Рост (абс.):</strong> <span className="text-warning font-mono">{formatNumber(data.growthPotential)}</span>
                                <strong className="text-gray-400">Рост (%):</strong> <span className="text-warning font-mono">{data.growthPercentage.toFixed(1)}%</span>
                            </div>
                        </div>
                        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 h-64">
                             <DetailChart fact={data.fact} potential={data.potential} />
                        </div>
                    </div>

                    {/* Right Column: AI Insights */}
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex flex-col">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-lg font-bold text-white">AI Рекомендации (Gemini)</h4>
                             <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopyToClipboard}
                                    className="p-1.5 text-gray-400 hover:text-white transition-colors"
                                    title="Копировать отчет"
                                >
                                    {isCopied ? <CheckIcon /> : <CopyIcon />}
                                </button>
                                <button onClick={getInsights} disabled={isLoadingInsights} className="bg-accent hover:bg-accent-dark text-white text-xs font-bold py-1 px-3 rounded-md transition disabled:opacity-50">
                                    {isLoadingInsights ? '...' : 'Обновить'}
                                </button>
                            </div>
                        </div>
                        <div className="prose prose-invert prose-sm text-gray-300 flex-grow overflow-y-auto custom-scrollbar pr-2">
                            {isLoadingInsights && !insights && (
                                <div className="flex items-center justify-center h-full">
                                    <LoaderIcon /> <span className="ml-2">Генерация рекомендаций...</span>
                                </div>
                            )}
                            {error && <p className="text-danger">{error}</p>}
                            <Markdown>{insights}</Markdown>
                        </div>
                    </div>

                    {/* Bottom Row: Map & Potential Clients */}
                    <div className="lg:col-span-2 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-lg font-bold text-white mb-3">Карта и Потенциальные клиенты в г. {data.city}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[400px]">
                            <div className="md:col-span-2 h-full rounded-md overflow-hidden">
                                <InteractiveMap city={data.city} clients={potentialClients} selectedClientKey={selectedClientKey} />
                            </div>
                            <div className="h-full overflow-y-auto custom-scrollbar">
                                <ul className="space-y-2">
                                    {potentialClients.map((client, idx) => (
                                        <li key={idx} 
                                            onMouseEnter={() => client.lat && setSelectedClientKey(`${client.lat},${client.lon}`)}
                                            onMouseLeave={() => setSelectedClientKey(null)}
                                            className="p-2 bg-gray-800/50 rounded-md text-xs cursor-pointer hover:bg-indigo-500/20"
                                        >
                                            <p className="font-bold text-white truncate">{client.name}</p>
                                            <p className="text-gray-400 truncate">{client.type}</p>
                                        </li>
                                    ))}
                                    {potentialClients.length === 0 && <p className="text-gray-500 text-sm">Потенциальные клиенты не найдены в ОКБ.</p>}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default DetailsModal;
