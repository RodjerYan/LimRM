import React, { useState, useEffect } from 'react';
import { AggregatedDataRow, PotentialClient } from '../types';
import Modal from './Modal';
import { formatLargeNumber, formatPercentage } from '../utils/dataUtils';
import { generateAiSummaryStream } from '../services/aiService';
import { FactIcon, PotentialIcon, GrowthIcon, UsersIcon, TargetIcon, CopyIcon, CheckIcon, TrendingUpIcon } from './icons';
import ReactMarkdown from 'react-markdown';
import DetailChart from './DetailChart';
import InteractiveMap from './InteractiveMap';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
}

const StatCard: React.FC<{ title: string, value: string, icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="flex items-start p-4 bg-gray-900/50 rounded-lg">
        <div className="text-accent mr-4 mt-1 flex-shrink-0">{icon}</div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-lg font-bold text-white">{value}</p>
        </div>
    </div>
);

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, data }) => {
    const [aiSummary, setAiSummary] = useState<string>('');
    const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
    const [selectedClient, setSelectedClient] = useState<PotentialClient | null>(null);

    useEffect(() => {
        if (isOpen && data) {
            setIsLoadingSummary(true);
            setAiSummary('');
            const getSummary = async function* () {
                yield* generateAiSummaryStream(data);
            }

            const stream = getSummary();
            const processStream = async () => {
                let fullText = '';
                for await (const chunk of stream) {
                    fullText += chunk;
                    setAiSummary(fullText);
                }
                setIsLoadingSummary(false);
            };
            processStream();
        }
    }, [isOpen, data]);

    if (!data) return null;

    const handleClientSelect = (client: PotentialClient) => {
        setSelectedClient(client);
    };

    const clientKey = selectedClient?.lat && selectedClient?.lon ? `${selectedClient.lat},${selectedClient.lon}` : null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детализация: ${data.city} / ${data.brand}`}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[80vh] overflow-y-hidden">

                {/* Left Column: Stats & AI Summary */}
                <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <StatCard title="Текущий Факт" value={formatLargeNumber(data.fact)} icon={<FactIcon small />} />
                        <StatCard title="Потенциал" value={formatLargeNumber(data.potential)} icon={<PotentialIcon small />} />
                        <StatCard title="Потенциал Роста" value={formatLargeNumber(data.growthPotential)} icon={<GrowthIcon small />} />
                        <StatCard title="Темп Роста" value={isFinite(data.growthRate) ? formatPercentage(data.growthRate) : '∞'} icon={<TrendingUpIcon small />} />
                        <StatCard title="Кол-во ТТ" value={String(data.potentialTTs)} icon={<UsersIcon small />} />
                        <StatCard title="РМ" value={data.rm} icon={<TargetIcon small />} />
                    </div>

                    <div className="bg-gray-900/50 p-4 rounded-lg">
                        <h4 className="text-lg font-bold mb-2 text-white">AI-Аналитик</h4>
                        {isLoadingSummary && <div className="text-gray-400 animate-pulse">Генерация выводов...</div>}
                        <div className="prose prose-invert prose-sm text-gray-300 max-w-none">
                             <ReactMarkdown>{aiSummary}</ReactMarkdown>
                        </div>
                    </div>
                     <div className="bg-gray-900/50 p-4 rounded-lg">
                        <h4 className="text-lg font-bold mb-2 text-white">Сравнение Факт / Потенциал</h4>
                        <div className="h-48">
                            <DetailChart fact={data.fact} potential={data.potential} />
                        </div>
                    </div>
                </div>

                {/* Right Column: Map & Clients */}
                <div className="lg:col-span-2 flex flex-col gap-6 min-h-0">
                    <div className="bg-gray-900/50 rounded-lg h-1/2 min-h-[300px] border border-gray-700">
                       <InteractiveMap city={data.city} clients={data.potentialClients} selectedClientKey={clientKey} cityCenter={data.cityCenter} />
                    </div>
                    <div className="bg-gray-900/50 p-4 rounded-lg flex-grow flex flex-col min-h-0">
                        <h4 className="text-lg font-bold mb-2 text-white">Потенциальные Клиенты ({data.potentialTTs})</h4>
                        <div className="overflow-y-auto flex-grow custom-scrollbar">
                             <ul className="divide-y divide-gray-700">
                                {data.potentialClients.map((client, index) => (
                                    <ClientListItem key={index} client={client} onSelect={handleClientSelect} isSelected={selectedClient === client}/>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

            </div>
        </Modal>
    );
};

const ClientListItem: React.FC<{ client: PotentialClient, onSelect: (client: PotentialClient) => void, isSelected: boolean }> = ({ client, onSelect, isSelected }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`${client.name}, ${client.address}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <li 
            onClick={() => onSelect(client)}
            className={`p-3 hover:bg-indigo-500/20 cursor-pointer rounded-md transition-colors ${isSelected ? 'bg-indigo-500/30' : ''}`}
        >
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-white">{client.name}</p>
                    <p className="text-sm text-gray-400">{client.type}</p>
                    <p className="text-xs text-gray-500 mt-1">{client.address}</p>
                </div>
                <button onClick={handleCopy} className="text-gray-500 hover:text-accent p-2 rounded-full transition-colors flex-shrink-0">
                    {copied ? <CheckIcon /> : <CopyIcon />}
                </button>
            </div>
        </li>
    );
};

export default DetailsModal;
