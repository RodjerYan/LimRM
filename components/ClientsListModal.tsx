import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { MapPoint } from '../types';
import { getCityFromAddress } from '../utils/cityParser';
import { SearchIcon } from './icons';

interface ClientsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: MapPoint[];
}

type GroupedClients = Record<string, MapPoint[]>;

const ClientsListModal: React.FC<ClientsListModalProps> = ({ isOpen, onClose, clients }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const groupedClients = useMemo<GroupedClients>(() => {
        if (!clients) return {};
        return clients.reduce((acc, client) => {
            const city = getCityFromAddress(client.address);
            if (!acc[city]) {
                acc[city] = [];
            }
            acc[city].push(client);
            return acc;
        }, {} as GroupedClients);
    }, [clients]);
    
    const filteredGroupedClients = useMemo<GroupedClients>(() => {
        const lowerSearchTerm = searchTerm.toLowerCase().trim();
        if (!lowerSearchTerm) {
            return groupedClients;
        }

        const filteredGroups: GroupedClients = {};

        for (const city in groupedClients) {
            const cityClients = groupedClients[city].filter(client => 
                client.name.toLowerCase().includes(lowerSearchTerm) ||
                client.address.toLowerCase().includes(lowerSearchTerm)
            );
            if (cityClients.length > 0) {
                filteredGroups[city] = cityClients;
            }
        }
        return filteredGroups;
    }, [groupedClients, searchTerm]);

    const sortedCities = Object.keys(filteredGroupedClients).sort((a, b) => a.localeCompare(b, 'ru'));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Список активных клиентов (${clients.length})`}>
            <div className="flex flex-col h-[70vh]">
                <div className="relative mb-4 flex-shrink-0">
                    <input
                        type="text"
                        placeholder="Поиск по наименованию или адресу..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-2.5 pl-10 bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                    />
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <SearchIcon />
                    </div>
                </div>
                
                <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
                    {sortedCities.length > 0 ? (
                        sortedCities.map(city => (
                            <div key={city} className="mb-6">
                                <h3 className="text-lg font-bold text-accent border-b-2 border-indigo-500/20 pb-2 mb-3 sticky top-0 bg-card-bg/95 backdrop-blur-sm z-10">
                                    {city} ({filteredGroupedClients[city].length})
                                </h3>
                                <ul className="space-y-3">
                                    {filteredGroupedClients[city].map((client) => (
                                            <li key={client.key} className="bg-gray-800/50 p-3 rounded-md">
                                                <p className="font-semibold text-white truncate" title={client.name}>{client.name}</p>
                                                <p className="text-sm text-gray-400 truncate" title={client.address}>{client.address}</p>
                                            </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-gray-400">
                            <p>Клиенты, соответствующие вашему запросу, не найдены.</p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ClientsListModal;