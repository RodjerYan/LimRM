import React from 'react';
import Modal from './Modal';
import { AggregatedDataRow } from '../types';
import InteractiveMap from './InteractiveMap';

const formatNumber = (num: number) => new Intl.NumberFormat('ru-RU').format(num);

const DetailsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedDataRow | null;
}> = ({ isOpen, onClose, data }) => {
    if (!data) return null;

    const currentClientsWithCoords = data.currentClients.filter(c => c.lat && c.lon);
    const potentialClientsWithCoords = data.potentialClients.filter(c => c.lat && c.lon);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Детальная информация по РМ: ${data.groupName}`}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Section: Metrics */}
                <div className="lg:col-span-1 space-y-4">
                     <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                         <h4 className="font-bold text-lg mb-3 text-indigo-400">Ключевые показатели РМ</h4>
                         <div className="space-y-3 text-sm">
                             <div className="flex justify-between items-center">
                                 <span className="text-gray-400">Суммарный Факт:</span>
                                 <span className="text-lg font-bold text-success">{formatNumber(data.fact)}</span>
                             </div>
                             <div className="flex justify-between items-center">
                                 <span className="text-gray-400">Суммарный Потенциал:</span>
                                 <span className="text-lg font-bold text-accent">{formatNumber(data.potential)}</span>
                             </div>
                             <div className="flex justify-between items-center">
                                 <span className="text-gray-400">Потенциал Роста:</span>
                                 <span className="text-lg font-bold text-warning">{formatNumber(data.growthPotential)} ({data.growthPercentage.toFixed(1)}%)</span>
                             </div>
                         </div>
                    </div>
                     <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                         <h4 className="font-bold text-lg mb-3 text-cyan-400">Клиентская база</h4>
                          <div className="space-y-3 text-sm">
                             <div className="flex justify-between items-center">
                                 <span className="text-gray-400">Текущие клиенты (на карте):</span>
                                 <span className="text-lg font-bold text-success">{currentClientsWithCoords.length}</span>
                             </div>
                             <div className="flex justify-between items-center">
                                 <span className="text-gray-400">Потенциальные клиенты (на карте):</span>
                                 <span className="text-lg font-bold text-danger">{potentialClientsWithCoords.length}</span>
                             </div>
                              <div className="flex justify-between items-center">
                                 <span className="text-gray-400">Всего в ОКБ по регионам:</span>
                                 <span className="text-lg font-bold text-white">{data.potentialClients.length}</span>
                             </div>
                         </div>
                    </div>
                     <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 text-xs text-gray-400">
                        <p>На карте отображены текущие (зеленые) и потенциальные (красные) клиенты с известными координатами. Наведите на маркер для получения подробной информации.</p>
                    </div>
                </div>

                {/* Right Section: Map */}
                <div className="lg:col-span-2 bg-gray-900/50 p-2 rounded-lg border border-gray-700">
                    <InteractiveMap 
                        currentClients={currentClientsWithCoords}
                        potentialClients={potentialClientsWithCoords}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default DetailsModal;