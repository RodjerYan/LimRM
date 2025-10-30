import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Modal from './Modal';
import DetailChart from './DetailChart';
import { AggregatedDataRow, OkbDataRow } from '../types';
import { callGrok } from '../services/grokService';
import { LoaderIcon } from './icons';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
    okbData: OkbDataRow[];
}

const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU').format(num);

/**
 * Creates a prompt for Grok based on a client's data.
 * @param clientData - The data for a single aggregated client row.
 * @returns A string prompt for the AI.
 */
const createGrokInsightPrompt = (clientData: AggregatedDataRow): string => {
    const formattedFact = new Intl.NumberFormat('ru-RU').format(clientData.fact);
    const formattedPotential = new Intl.NumberFormat('ru-RU').format(clientData.potential);
    const formattedGrowth = new Intl.NumberFormat('ru-RU').format(clientData.growthPotential);

    const isGroup = !!clientData.clients && clientData.clients.length > 0;
    const subject = isGroup ? 'группе клиентов' : 'клиенту';
    const subjectDataHeader = isGroup ? 'Данные о группе' : 'Данные о клиенте';
    const clientIdentifier = isGroup ? `Группа (${clientData.clients?.length} ТТ)` : 'Клиент';
    const clientName = isGroup ? `${clientData.clientName} (РМ: ${clientData.rm})` : clientData.clientName;

    return `
        Ты — эксперт-аналитик по продажам зоотоваров. Проанализируй данные по ${subject} и дай краткие, действенные рекомендации по увеличению продаж.
        Отвечай на русском языке. Ответ должен быть **ТОЛЬКО в формате Markdown**, без лишних вступлений и заключений.
        Используй списки для перечисления рекомендаций.

        **${subjectDataHeader}:**
        - **${clientIdentifier}:** ${clientName}
        - **Город/Регион:** ${clientData.city} / ${clientData.region}
        - **Бренд:** ${clientData.brand}
        - **Региональный менеджер (РМ):** ${clientData.rm}
        - **Текущие продажи (Факт):** ${formattedFact} кг/ед.
        - **Общий потенциал рынка:** ${formattedPotential} кг/ед.
        - **Потенциал роста:** ${formattedGrowth} кг/ед. (${clientData.growthPercentage.toFixed(1)}%)

        **Твоя задача:**
        1.  Определи 2-3 ключевых фактора, которые могут способствовать росту для этой ${isGroup ? 'группы' : 'ТТ'}.
        2.  Предложи 3-4 конкретных шага или тактики для РМ для реализации этого потенциала (например: предложить новые продукты, провести обучение, запустить маркетинговую акцию).
        3.  Будь кратким и четким. Вывод должен быть готов для отображения пользователю.
    `;
};


const AiInsightSection: React.FC<{ data: AggregatedDataRow }> = ({ data }) => {
    const [insight, setInsight] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (!data) return;

        const fetchInsights = async (retries = 3) => {
            if (!isMounted.current) return;

            // Set initial state only on the first attempt
            if (retries === 3) {
                setInsight('');
                setError(null);
                setIsLoading(true);
            }

            try {
                const prompt = createGrokInsightPrompt(data);
                const result = await callGrok([
                    { role: "system", content: "Ты — аналитик. Отвечай **ТОЛЬКО** Markdown без вступлений." },
                    { role: "user", content: prompt }
                ]);
                if (isMounted.current) {
                    setInsight(result);
                    setIsLoading(false);
                }
            } catch (err) {
                 if (retries > 0 && isMounted.current) {
                    setTimeout(() => fetchInsights(retries - 1), 1000); // Retry
                 } else if (isMounted.current) {
                    setError(`Ошибка Grok после нескольких попыток: ${(err as Error).message}`);
                    setIsLoading(false);
                }
            }
        };

        fetchInsights();

    }, [data]);

    const sanitizedHtml = DOMPurify.sanitize(marked.parse(insight) as string);

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 min-h-[150px]">
            <h4 className="font-bold text-lg mb-2 text-blue-400">Рекомендации от Grok</h4>
            {isLoading && (
                <div className="flex items-center justify-center h-full text-gray-400">
                    <LoaderIcon />
                    <span className="ml-2">Анализ данных...</span>
                </div>
            )}
            {error && <p className="text-danger text-sm">{error}</p>}
            {!isLoading && !error && (
                 <div className="prose prose-invert prose-sm max-w-none text-slate-300" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            )}
        </div>
    );
};

const GroupedClientsList: React.FC<{ clients: string[] | undefined }> = ({ clients }) => {
    const clientList = clients ?? [];
    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <h4 className="font-bold text-lg mb-3 text-cyan-400">Клиенты в группе ({clientList.length})</h4>
            {clientList.length > 0 ? (
                <ul className="max-h-48 overflow-y-auto custom-scrollbar text-sm space-y-1 pr-2">
                    {clientList.map((client, index) => (
                        <li key={index} className="text-slate-300 bg-gray-800/50 p-1.5 rounded-md truncate" title={client}>
                            {client}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-500 text-sm py-4 text-center">Нет отдельных клиентов в этой группе.</p>
            )}
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