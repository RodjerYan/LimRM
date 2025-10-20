import React from 'react';
import { AggregatedDataRow } from '../types';
import { formatLargeNumber } from '../utils/dataUtils';

interface PlanningModuleProps {
    data: AggregatedDataRow[];
}

const PlanningModule: React.FC<PlanningModuleProps> = ({ data }) => {
    if (data.length === 0) {
        return (
             <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 h-full flex items-center justify-center">
                <p className="text-gray-500 italic">Данные для планирования появятся после загрузки и фильтрации.</p>
            </div>
        );
    }
    
    // Example logic: Find top 3 opportunities
    const topOpportunities = [...data]
        .sort((a, b) => b.growthPotential - a.growthPotential)
        .slice(0, 3);


    return (
        <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 h-full">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">3</span>
                Планирование и Фокус
            </h2>
            <div className="space-y-4">
                 <h3 className="text-lg font-semibold text-amber-400">Ключевые точки роста:</h3>
                 {topOpportunities.length > 0 ? (
                    <ul className="space-y-3">
                        {topOpportunities.map(item => (
                            <li key={item.key} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                                <p className="font-bold text-white">{item.city} / {item.brand}</p>
                                <p className="text-sm text-gray-400">РМ: {item.rm}</p>
                                <p className="text-sm text-success mt-1">Потенциал роста: <span className="font-mono">{formatLargeNumber(item.growthPotential)} кг</span></p>
                            </li>
                        ))}
                    </ul>
                 ) : (
                    <p className="text-gray-500">Нет данных для отображения.</p>
                 )}
                 <div className="text-xs text-gray-500 pt-4 border-t border-gray-700 mt-4">
                    <p>Этот модуль автоматически выделяет наиболее перспективные направления для фокусировки усилий на основе потенциала роста.</p>
                </div>
            </div>
        </div>
    );
};

export default PlanningModule;
