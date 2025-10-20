import React from 'react';
import { BriefcaseIcon } from './icons';
import { RMPerformanceAnalysis } from '../types';

interface PlanningModuleProps {
    analysis: RMPerformanceAnalysis | null;
    isLoading: boolean;
}

const PlanningModule: React.FC<PlanningModuleProps> = ({ analysis, isLoading }) => {
    
    if (isLoading) {
         return (
             <div className="bg-card-bg/70 p-6 rounded-2xl text-center animate-pulse">
                <p className="text-gray-400">AI-Планировщик составляет рекомендации...</p>
             </div>
        );
    }

    if (!analysis) {
        return (
             <div className="bg-card-bg/70 p-6 rounded-2xl">
                 <h3 className="text-xl font-bold mb-2 text-white flex items-center gap-2">
                    <BriefcaseIcon />
                    Модуль Планирования
                </h3>
                <p className="text-gray-500">Загрузите и отфильтруйте данные, чтобы запустить AI-планировщик для конкретного РМ.</p>
             </div>
        );
    }

    return (
        <div className="bg-card-bg/70 p-6 rounded-2xl border border-indigo-500/20 animate-fade-in">
            <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <BriefcaseIcon />
                План развития для: <span className="text-accent">{analysis.rmName}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-900/50 p-3 rounded-lg">
                    <p className="text-gray-400">Категория РМ</p>
                    <p className="font-bold text-lg text-amber-400">{analysis.category}</p>
                </div>
                 <div className="bg-gray-900/50 p-3 rounded-lg">
                    <p className="text-gray-400">Реализация потенциала</p>
                    <p className="font-bold text-lg text-white">{analysis.realizationRate.toFixed(1)}%</p>
                </div>
            </div>
             <div className="mt-4 bg-gray-900/50 p-4 rounded-lg">
                <p className="text-gray-300 font-semibold">Рекомендация по росту:</p>
                <p className="text-2xl font-bold text-success my-1">+ {analysis.recommendedIncrease.toLocaleString('ru-RU')} кг/ед</p>
                <p className="text-xs text-gray-400 mt-2">
                    <span className="font-semibold">Обоснование:</span> {analysis.justification}
                </p>
            </div>
        </div>
    );
};

export default PlanningModule;
