import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AggregatedDataRow } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';
import { generateAiSummaryStream } from '../services/aiService';
import Modal from './Modal';
import InteractiveMap from './InteractiveMap';
import { LoaderIcon, FactIcon, PotentialIcon, GrowthIcon, CopyIcon, CheckIcon, ExportIcon, ArrowUpIcon, ArrowDownIcon, TargetIcon, UsersIcon } from './icons';


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

    return <div className="prose prose-invert text-gray-300 max-w-none break-words">{elements}</div>;
};



const AiAnalysis: React.FC<{ data: AggregatedDataRow }> = ({ data }) => {
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
        <div className="bg-gray-900/50 p-4 sm:p-6 rounded-xl border border-border-color h-full flex flex-col">
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
            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar min-h-0">
               {isLoading && !summary ? (
                   <div className="flex h-full items-center justify-center">
                       <LoaderIcon />
                       <span className="ml-3 text-gray-400">Анализ данных...</span>
                   </div>
               ) : (
                   <>
                       <AiSummaryDisplay text={summary} />
                       {isLoading && <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1"></span>}
                   </>
               )}
            </div>
        </div>
    );
};

const MetricCard: React.FC<{ title: string, value: string | React.ReactNode, icon: React.ReactNode, className?: string, valueClassName?: string }> = ({ title, value, icon, className = '', valueClassName = '' }) => (
    <div className={`bg-gray-900/50 p-4 rounded-lg border border-border-color flex items-center gap-4 ${className}`}>
        <div className="text-accent text-opacity-80">{icon}</div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <div className={`text-xl font-bold text-slate-100 ${valueClassName}`}>{value}</div>
        </div>
    </div>
);


interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow;
}

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data }) => {
    const [hoveredClientKey, setHoveredClientKey] = useState<string | null>(null);

    const potentialClients = data.potentialClients;

    const handleExport = () => {
        if (!potentialClients || potentialClients.length === 0) {
            return;
        }

        const headers = {
            name: 'Название',
            type: 'Тип',
            address: 'Адрес',
            lat: 'Широта',
            lon: 'Долгота',
        };

        const exportData = potentialClients.map(client => ({
            [headers.name]: client.name,
            [headers.type]: client.type,
            [headers.address]: client.address,
            [headers.lat]: client.lat ?? '',
            [headers.lon]: client.lon ?? '',
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Потенциальные клиенты');

        ws['!cols'] = [
            { wch: 40 }, // Название
            { wch: 20 }, // Тип
            { wch: 60 }, // Адрес
            { wch: 15 }, // Широта
            { wch: 15 }, // Долгота
        ];

        const safeRegionName = data.city.replace(/[^a-zа-я0-9]/gi, '_').toLowerCase();
        XLSX.writeFile(wb, `Potential_Clients_${safeRegionName}.xlsx`);
    };
    
    const newPlanGrowthKg = data.newPlan && data.fact ? data.newPlan - data.fact : 0;
    const newPlanGrowthPercent = data.newPlan && data.fact > 0 ? (newPlanGrowthKg / data.fact) * 100 : 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Аналитический дашборд: ${data.city}`}>
            <div className="flex flex-col gap-6">
                {/* TOP ROW: Header + Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                     <div className="bg-gray-900/50 p-4 rounded-lg border border-border-color flex flex-col justify-center col-span-1">
                        <h4 className="text-lg font-semibold text-white truncate" title={data.rm}>
                            {data.rm}
                        </h4>
                        <p className="text-base text-accent">{data.brand}</p>
                    </div>
                    <MetricCard title="Текущий Факт (кг/ед)" value={formatLargeNumber(data.fact)} icon={<FactIcon />} valueClassName="text-success" />
                    <MetricCard title="Новый План (кг/ед)" value={
                        <div className="flex items-center gap-2">
                            <span>{formatLargeNumber(data.newPlan || 0)}</span>
                            {newPlanGrowthPercent > 0 && (
                                <span className="text-sm font-medium text-accent-hover flex items-center gap-1">
                                    <ArrowUpIcon small/> {newPlanGrowthPercent.toFixed(1)}%
                                </span>
                            )}
                        </div>
                    } icon={<TargetIcon />} valueClassName="text-accent" />
                     <MetricCard title="Потенциал Роста" value={formatLargeNumber(data.growthPotential)} icon={<GrowthIcon />} valueClassName="text-warning"/>
                </div>

                {/* MAIN CONTENT: AI Analysis + Map/Client List */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-2 min-w-0 h-[500px]">
                        <AiAnalysis data={data} />
                    </div>
                    <div className="lg:col-span-3 min-w-0">
                        <div className="bg-gray-900/50 p-4 sm:p-6 rounded-xl border border-border-color h-[500px] flex flex-col">
                            <h3 className="text-xl font-semibold text-white mb-4 text-center">Карта и Список Потенциальных Клиентов</h3>
                            <div className="relative flex-grow w-full min-h-0 rounded-lg overflow-hidden border border-border-color shadow-inner">
                                <InteractiveMap city={data.city} clients={potentialClients} selectedClientKey={hoveredClientKey} cityCenter={data.cityCenter} />
                            </div>
                            <div className="mt-4 flex-shrink-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                        <UsersIcon small />
                                        <span>Список ({potentialClients.length} из {data.totalMarketTTs} шт.)</span>
                                    </h4>
                                    <button
                                        onClick={handleExport}
                                        disabled={potentialClients.length === 0}
                                        className="flex items-center text-xs py-1 px-2.5 rounded-md transition-colors bg-success/20 hover:bg-success/30 text-success disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Экспорт в Excel (.xlsx)"
                                    >
                                        <ExportIcon />
                                        <span className="ml-1.5">Экспорт</span>
                                    </button>
                                </div>
                                <ul className="h-[120px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                    {potentialClients.length > 0 ? potentialClients.map((client, index) => {
                                        const clientKey = (client.lat && client.lon) ? `${client.lat},${client.lon}` : null;
                                        return (
                                            <li key={index} 
                                                onMouseEnter={() => clientKey && setHoveredClientKey(clientKey)} 
                                                onMouseLeave={() => clientKey && setHoveredClientKey(null)}
                                                className={`p-2 rounded-md hover:bg-accent/20 cursor-pointer transition-colors text-sm ${hoveredClientKey === clientKey ? 'bg-accent/20' : ''}`}
                                            >
                                                <p className="font-semibold text-white truncate">{client.name || 'Без названия'}</p>
                                                <p className="text-xs text-gray-400 truncate">
                                                    {client.type}
                                                </p>
                                            </li>
                                        );
                                    }) : (
                                        <li className="text-sm text-gray-500 italic text-center py-4">Клиенты не найдены AI-аналитиком.</li>
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