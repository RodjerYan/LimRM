import React, { useState, useMemo, useEffect } from 'react';
import Modal from './Modal';
import { AggregatedDataRow, PotentialClient } from '../types';
import InteractiveMap from './InteractiveMap';
import { parseRussianAddress } from '../services/addressParser';
import { LoaderIcon } from './icons';

type ClientWithRegion = PotentialClient & { parsedRegion: string };

const PMAnalysisModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
}> = ({ isOpen, onClose, data }) => {
    
    const [activeTab, setActiveTab] = useState<'current' | 'potential'>('current');
    const [selectedRegion, setSelectedRegion] = useState<string>('Все регионы');
    const [selectedBrand, setSelectedBrand] = useState<string>('Все бренды');
    
    const [clientsWithParsedRegions, setClientsWithParsedRegions] = useState<{
        current: ClientWithRegion[];
        potential: ClientWithRegion[];
    } | null>(null);
    const [isParsing, setIsParsing] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            // Reset state on close
            setSelectedRegion('Все регионы');
            setSelectedBrand('Все бренды');
            setActiveTab('current');
            setClientsWithParsedRegions(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!data) {
            setClientsWithParsedRegions(null);
            return;
        }

        let isMounted = true;
        const parseAllAddresses = async () => {
            setIsParsing(true);
            
            const parseList = async (list: PotentialClient[]): Promise<ClientWithRegion[]> => {
                const promises = list.map(client => 
                    parseRussianAddress(client.address).then(parsed => ({ ...client, parsedRegion: parsed.region }))
                );
                return Promise.all(promises);
            };

            const [parsedCurrent, parsedPotential] = await Promise.all([
                parseList(data.currentClients || []),
                parseList(data.potentialClients || [])
            ]);

            if (isMounted) {
                setClientsWithParsedRegions({ current: parsedCurrent, potential: parsedPotential });
                setIsParsing(false);
            }
        };

        parseAllAddresses();
        return () => { isMounted = false; };
    }, [data]);

    const { regions, brands } = useMemo(() => {
        if (!data) return { regions: [], brands: [] };

        const allParsedClients = [
            ...(clientsWithParsedRegions?.current || []),
            ...(clientsWithParsedRegions?.potential || [])
        ];
        
        const regionSet = new Set(allParsedClients.map(c => c.parsedRegion).filter(r => r !== 'Регион не определен'));
        const brandSet = new Set(data.brand?.split(', ').filter(Boolean) || []);
        
        return {
            regions: ['Все регионы', ...Array.from(regionSet).sort()],
            brands: ['Все бренды', ...Array.from(brandSet).sort()]
        };
    }, [data, clientsWithParsedRegions]);
    
    const filteredClients = useMemo(() => {
        if (!clientsWithParsedRegions) return { current: [], potential: [] };

        const filterList = (list: ClientWithRegion[]) => {
            return list.filter(client => 
                (selectedRegion === 'Все регионы' || client.parsedRegion === selectedRegion)
            );
        };
        return {
            current: filterList(clientsWithParsedRegions.current),
            potential: filterList(clientsWithParsedRegions.potential),
        }
    }, [clientsWithParsedRegions, selectedRegion]);

    if (!data) return null;

    const listToDisplay = activeTab === 'current' ? filteredClients.current : filteredClients.potential;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детальный анализ РМ: ${data.groupName}`}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[60vh]">
                <div className="lg:col-span-1 flex flex-col space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex-1">
                            <label htmlFor="region-filter" className="block text-sm font-medium text-gray-300 mb-1">Регион</label>
                            <select id="region-filter" value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}
                                className="w-full p-2.5 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white transition-colors">
                                {regions.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label htmlFor="brand-filter" className="block text-sm font-medium text-gray-300 mb-1">Бренд</label>
                            <select id="brand-filter" value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}
                                className="w-full p-2.5 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white transition-colors">
                                {brands.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <div className="border-b border-gray-700">
                            <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                                <button onClick={() => setActiveTab('current')} className={`${activeTab === 'current' ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}>
                                    Текущие ({filteredClients.current.length})
                                </button>
                                <button onClick={() => setActiveTab('potential')} className={`${activeTab === 'potential' ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}>
                                    Потенциальные ({filteredClients.potential.length})
                                </button>
                            </nav>
                        </div>
                    </div>

                    {isParsing ? (
                        <div className="flex-grow flex items-center justify-center text-gray-400 bg-gray-900/50 rounded-lg border border-gray-700">
                             <LoaderIcon /> <span className="ml-2">Анализ адресов...</span>
                        </div>
                    ) : (
                        <div className="flex-grow overflow-y-auto custom-scrollbar bg-gray-900/50 p-2 rounded-lg border border-gray-700 max-h-[45vh] lg:max-h-[calc(60vh-150px)]">
                            {listToDisplay.length > 0 ? (
                                <ul className="divide-y divide-gray-700">
                                    {listToDisplay.map((client, index) => (
                                        <li key={`${client.address}-${index}`} 
                                            className="p-3 transition-colors duration-150 hover:bg-indigo-500/10">
                                            <p className="font-semibold text-white truncate">{client.name}</p>
                                            <p className="text-xs text-gray-400 truncate">{client.address}</p>
                                            <p className="text-xs text-gray-500">{client.type}</p>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-center text-gray-500 py-10">Нет клиентов для отображения.</div>
                            )}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-2 bg-gray-900/50 p-2 rounded-lg border border-gray-700 min-h-[400px] lg:min-h-0">
                    <InteractiveMap 
                        currentClients={filteredClients.current}
                        potentialClients={filteredClients.potential}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default PMAnalysisModal;
