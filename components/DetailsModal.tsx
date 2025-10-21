

import React, { useState, useMemo, useEffect } from 'react';
import { AggregatedDataRow } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';
import { generateAiSummaryStream } from '../services/aiService';
import Modal from './Modal';
import InteractiveMap from './InteractiveMap';
import { LoaderIcon, FactIcon, PotentialIcon, GrowthIcon, CopyIcon, CheckIcon } from './icons';


const CodeCopyButton: React.FC<{ code: string }> = ({ code }) => {
    const [isCopied, setIsCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2500);
        });
    };
    return (
        <button
            onClick={handleCopy}
            className={`absolute top-2 right-2 flex items-center text-xs py-1 px-2 rounded-md transition-all duration-200 ${
                isCopied 
                ? 'bg-green-500/20 text-success cursor-default' 
                : 'bg-gray-700/50 hover:bg-gray-600/70 text-gray-300 opacity-0 group-hover:opacity-100'
            }`}
            aria-label="Скопировать код"
        >
            {isCopied ? <CheckIcon /> : <CopyIcon />}
            <span className="ml-1.5 whitespace-nowrap">{isCopied ? 'Скопировано!' : 'Копировать'}</span>
        </button>
    );
};


// A component to render markdown-like text from Gemini, with support for code blocks
const AiSummaryDisplay: React.FC<{ text: string }> = ({ text }) => {
    const elements = useMemo(() => {
        const result: React.ReactNode[] = [];
        const lines = text.split('\n');
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            if (line.startsWith('```')) {
                let codeContent = '';
                i++; // Move past the opening ```
                while (i < lines.length && !lines[i].startsWith('```')) {
                    codeContent += lines[i] + '\n';
                    i++;
                }
                i++; // Move past the closing ```
                const trimmedCode = codeContent.trim();
                result.push(
                    <pre key={`code-${i}`} className="bg-gray-900 p-4 rounded-md my-4 text-sm text-white overflow-x-auto custom-scrollbar relative group">
                        <CodeCopyButton code={trimmedCode} />
                        <code>{trimmedCode}</code>
                    </pre>
                );
                continue;
            }
            
            if (line.startsWith('### ')) {
                result.push(<h3 key={i} className="text-lg font-semibold text-accent mt-4 mb-2">{line.substring(4)}</h3>);
            } else if (line.startsWith('## ')) {
                result.push(<h2 key={i} className="text-xl font-bold text-white mt-4 mb-2">{line.substring(3)}</h2>);
            } else if (line.startsWith('# ')) {
                result.push(<h1 key={i} className="text-2xl font-extrabold text-white mt-4 mb-2">{line.substring(2)}</h1>);
            } else if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
                const items = [];
                let currentLine = lines[i];
                while(i < lines.length && currentLine && (currentLine.trim().startsWith('* ') || currentLine.trim().startsWith('- '))) {
                    const html = currentLine.trim().substring(2).replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
                    items.push(<li key={`${i}-${items.length}`} dangerouslySetInnerHTML={{ __html: html }} />);
                    i++;
                    currentLine = lines[i];
                }
                result.push(<ul key={`list-${i}`} className="ml-5 list-disc space-y-1 my-2">{items}</ul>);
                continue; 
            } else {
                 const html = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
                 if (html.trim()) {
                    result.push(<p key={i} className="mb-2" dangerouslySetInnerHTML={{ __html: html }} />);
                 }
            }
            i++;
        }
        return result;
    }, [text]);

    return <div className="prose prose-invert text-gray-300 max-w-none">{elements}</div>;
};



const AiAnalysis: React.FC<{ data: AggregatedDataRow, className?: string }> = ({ data, className }) => {
    const [summary, setSummary] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        const streamSummary = async () => {
            setIsLoading(true);
            setSummary('');
            try {
                for await (const chunk of generateAiSummaryStream(data)) {
                    setSummary(prev => prev + chunk);
                }
            } catch (error) {
                console.error("AI summary streaming failed:", error);
                setSummary("### Ошибка\n\nНе удалось получить аналитическую справку.");
            } finally {
                setIsLoading(false);
            }
        };

        if (data) {
          streamSummary();
        }
    }, [data]);

    const handleCopy = () => {
        if (navigator.clipboard && summary) {
            // Strip markdown for a cleaner paste
            const plainText = summary
                .replace(/```typescript/g, '')
                .replace(/```/g, '')
                .replace(/\*\*/g, '')
                .replace(/### |## |# /g, '')
                .replace(/^- |^\* /gm, '');
            navigator.clipboard.writeText(plainText).then(() => {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2500);
            });
        }
    };

    return (
        <div className={`bg-gray-900/50 p-6 rounded-xl border border-gray-700 h-full flex flex-col ${className}`}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-white">
                    Gemini: AI-Аналитик
                </h3>
                <button
                    onClick={handleCopy}
                    disabled={isLoading || !summary}
                    className={`flex items-center text-sm py-1.5 px-3 rounded-md transition-all duration-200 disabled:opacity-50 ${
                        isCopied 
                        ? 'bg-green-500/20 text-success cursor-default' 
                        : 'bg-gray-700/50 hover:bg-gray-600/70 text-gray-300'
                    }`}
                    aria-label="Скопировать анализ"
                >
                    {isCopied ? <CheckIcon /> : <CopyIcon />}
                    <span className="ml-2 whitespace-nowrap">{isCopied ? 'Скопировано!' : 'Копировать'}</span>
                </button>
            </div>
            {isLoading && !summary && (
                <div className="flex-grow flex items-center justify-center">
                    <LoaderIcon />
                    <span className="ml-3 text-gray-400">Анализ данных...</span>
                </div>
            )}
            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
               <AiSummaryDisplay text={summary} />
               {isLoading && <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1"></span>}
            </div>
        </div>
    );
};

const MetricCard: React.FC<{ title: string, value: string, icon: React.ReactNode, valueColor?: string, className?: string }> = ({ title, value, icon, valueColor = 'text-white', className }) => (
    <div className={`bg-gray-900/50 p-3 rounded-lg border border-gray-700 flex items-center ${className}`}>
        <div className="mr-3 text-accent">{icon}</div>
        <div>
            <p className="text-xs text-gray-400">{title}</p>
            <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
        </div>
    </div>
);


interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow;
}

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data }) => {
    // FIX: State to track the hovered client via a stable key (lat,lon string) instead of an index.
    const [hoveredClientKey, setHoveredClientKey] = useState<string | null>(null);

    const potentialClients = data.potentialClients;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Аналитический дашборд: ${data.city}`}>
            <div className="flex flex-col gap-4">
                {/* TOP ROW: Header + Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
                    <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 flex flex-col justify-center">
                        <h4 className="text-base font-semibold text-white truncate" title={data.rm}>
                            {data.rm}
                        </h4>
                        <p className="text-sm text-accent">{data.brand}</p>
                    </div>

                    <MetricCard 
                        title="Текущий Факт (кг/ед)"
                        value={formatLargeNumber(data.fact)}
                        icon={<FactIcon />}
                        valueColor="text-green-400"
                    />
                    <MetricCard 
                        title="Прогнозный Потенциал"
                        value={formatLargeNumber(data.potential)}
                        icon={<PotentialIcon />}
                        valueColor="text-blue-400"
                    />
                    <div className="bg-gray-900/50 p-3 rounded-lg border-2 border-yellow-500/50 shadow-md shadow-yellow-500/10 flex items-center">
                        <div className="mr-3 text-yellow-400"><GrowthIcon /></div>
                        <div>
                            <p className="text-xs text-gray-400">Потенциал Роста</p>
                            <div className="flex items-baseline gap-x-2">
                                <p className="text-xl font-bold text-yellow-400">{formatLargeNumber(data.growthPotential)}</p>
                                <p className="text-base font-bold text-red-400">{data.growthRate.toFixed(1)}%</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* BOTTOM ROW: AI Analysis + Map/Client List */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
                    <div className="lg:col-span-1">
                        <AiAnalysis data={data} className="h-[450px]" />
                    </div>
                    <div className="lg:col-span-1">
                        <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-700 h-[450px] flex flex-col">
                            <h3 className="text-xl font-semibold text-white mb-4 text-center">Карта Потенциальных Клиентов</h3>
                            <div className="relative flex-grow w-full min-h-0 rounded-lg overflow-hidden border border-gray-700 shadow-inner">
                                {/* FIX: Pass all clients and the hovered key to the map */}
                                <InteractiveMap city={data.city} clients={potentialClients} selectedClientKey={hoveredClientKey} />
                            </div>
                            <div className="mt-4 flex-shrink-0">
                                <h4 className="text-sm font-semibold text-gray-300 mb-2">
                                    {/* FIX: Display count of all potential clients. */}
                                    Список ({potentialClients.length} из {data.potentialTTs} шт.)
                                </h4>
                                <ul className="h-[140px] overflow-y-auto custom-scrollbar pr-2 space-y-1">
                                    {/* FIX: Render the list using the full array of potential clients. */}
                                    {potentialClients.length > 0 ? potentialClients.map((client, index) => {
                                        // Generate a unique, stable key only for clients with coordinates
                                        const clientKey = (client.lat && client.lon) ? `${client.lat},${client.lon}` : null;
                                        return (
                                            <li key={index} 
                                                // Only set the hover state if the client has a key (i.e., has coordinates)
                                                onMouseEnter={() => setHoveredClientKey(clientKey)} 
                                                onMouseLeave={() => setHoveredClientKey(null)}
                                                className="p-2 rounded-md hover:bg-indigo-500/20 cursor-pointer transition-colors text-sm"
                                            >
                                                <p className="font-semibold text-white truncate">{client.name || 'Без названия'}</p>
                                                <p className="text-xs text-gray-400 truncate">
                                                    {client.type}
                                                </p>
                                            </li>
                                        );
                                    }) : (
                                        <li className="text-sm text-gray-500 italic text-center py-4">Клиенты с точными координатами не найдены.</li>
                                    )}
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