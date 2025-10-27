import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Modal from './Modal';
import DetailChart from './DetailChart';
import InteractiveMap from './InteractiveMap';
import { AggregatedDataRow, OkbDataRow, PotentialClient } from '../types';
import { streamClientInsights } from '../services/aiService';
import { LoaderIcon } from './icons';
import { findBestOkbMatch, normalizeString } from '../utils/dataUtils';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
    okbData: OkbDataRow[];
}

const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU').format(num);

const AiInsightSection: React.FC<{ data: AggregatedDataRow }> = ({ data }) => {
    const [insight, setInsight] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!data) return;

        // Cancel any previous requests
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

const OkbInfoSection: React.FC<{ clientName: string; city: string; okbData: OkbDataRow[] }> = ({ clientName, city, okbData }) => {
    const matchedOkb = findBestOkbMatch(clientName, city, okbData.map(d => ({ ...d, normalizedName: normalizeString(d['Наименование']) })));

    if (!matchedOkb) {
        return <p className="text-sm text-gray-500 italic">Дополнительная информация из ОКБ не найдена.</p>;
    }
    
    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <h4 className="font-bold text-lg mb-3 text-cyan-400">Данные из ОКБ</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <p><strong className="text-gray-400">Юр. адрес:</strong> {matchedOkb['Юридический адрес'] || 'Нет данных'}</p>
                <p><strong className="text-gray-400">ИНН:</strong> {matchedOkb['ИНН'] || 'Нет данных'}</p>
                <p><strong className="text-gray-400">Регион:</strong> {matchedOkb['Регион'] || 'Нет данных'}</p>
                <p><strong className="text-gray-400">Статус:</strong> {matchedOkb['Статус'] || 'Нет данных'}</p>
            </div>
        </div>
    );
};

const PotentialClientsTable: React.FC<{ clients: PotentialClient[] | undefined; onClientHover: (key: string | null) => void }> = ({ clients, onClientHover }) => {
    if (!clients || clients.length === 0) {
        return <p className="text-sm text-gray-500 italic mt-2">Потенциальные клиенты поблизости не найдены.</p>;
    }
    return (
        <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2">
            <table className="w-full text-xs text-left text-gray-300">
                <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 sticky top-0">
                    <tr>
                        <th className="px-2 py-2">Название</th>
                        <th className="px-2 py-2">Тип</th>
                        <th className="px-2 py-2">Адрес</th>
                    </tr>
                </thead>
                <tbody>
                    {clients.map((client, index) => (
                        <tr 
                            key={index} 
                            className="border-b border-gray-700 hover:bg-indigo-500/10"
                            onMouseEnter={() => client.lat && client.lon && onClientHover(`${client.lat},${client.lon}`)}
                            onMouseLeave={() => onClientHover(null)}
                        >
                            <td className="px-2 py-1.5 font-medium text-white">{client.name}</td>
                            <td className="px-2 py-1.5">{client.type}</td>
                            <td className="px-2 py-1.5">{client.address}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data, okbData }) => {
    const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);

    if (!data) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детальная информация: ${data.clientName}`}>
            <div className="space-y-6">
                {/* Top Section: Metrics and AI Insights */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                             <h4 className="font-bold text-lg mb-3 text-indigo-400">Ключевые показатели</h4>
                             <div className="grid grid-cols-2 gap-4 text-center">
                                 <div>
                                     <p className="text-sm text-gray-400">Текущий Факт</p>
                                     <p className="text-2xl font-bold text-success">{formatNumber(data.fact)}</p>
                                 </div>
                                 <div>
                                     <p className="text-sm text-gray-400">Потенциал</p>
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
                        <OkbInfoSection clientName={data.clientName} city={data.city} okbData={okbData} />
                    </div>
                     <AiInsightSection data={data} />
                </div>

                {/* Bottom Section: Chart and Map */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-2">
                        <h4 className="font-bold text-lg mb-2 text-indigo-400">Факт vs Потенциал</h4>
                        <div className="h-64 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                             <DetailChart fact={data.fact} potential={data.potential} />
                        </div>
                    </div>
                    <div className="lg:col-span-3">
                        <h4 className="font-bold text-lg mb-2 text-indigo-400">Карта потенциальных клиентов</h4>
                        <div className="h-64 bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                            <InteractiveMap city={data.city} clients={data.potentialClients || []} selectedClientKey={selectedClientKey} />
                        </div>
                    </div>
                </div>

                 {/* Potential Clients Table */}
                <div>
                     <h4 className="font-bold text-lg mb-2 text-indigo-400">Потенциальные клиенты рядом</h4>
                     <PotentialClientsTable clients={data.potentialClients} onClientHover={setSelectedClientKey} />
                </div>
            </div>
        </Modal>
    );
};

export default DetailsModal;
