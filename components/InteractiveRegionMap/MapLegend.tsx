
import React from 'react';
import { OverlayMode } from './types';

export const MapLegend: React.FC<{ mode: OverlayMode }> = React.memo(({ mode }) => {
    if (mode === 'abc') {
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    ABC Анализ (Вклад)
                </h4>
                <div className="space-y-1.5">
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.6)]"></span>
                        <span className="text-xs font-bold text-gray-800">A (80% Выручки)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.6)]"></span>
                        <span className="text-xs font-medium text-gray-600">B (15% Выручки)</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 mr-2 rounded-full bg-gray-400"></span>
                        <span className="text-xs text-gray-500">C (5% Выручки)</span>
                    </div>
                </div>
            </div>
        );
    }
    if (mode === 'pets') {
        const tooltip = "Преобладание владельцев кошек или собак в регионе на основе статистики продаж кормов и демографических данных.";
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    Преобладание питомцев
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#8b5cf6', opacity: 0.7}}></span>
                        <span className="text-xs">Кошки (&gt; 55%)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#64748b', opacity: 0.5}}></span>
                        <span className="text-xs">Баланс</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f97316', opacity: 0.7}}></span>
                        <span className="text-xs">Собаки (&gt; 55%)</span>
                    </div>
                </div>
            </div>
        );
    }
    if (mode === 'competitors') {
        const tooltip = "Условный индекс (0-100), учитывающий плотность зоо-ритейла, присутствие федеральных сетей и активность крупных игроков.";
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    Конкуренция
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#ef4444', opacity: 0.7}}></span>
                        <span className="text-xs">Агрессивная (&gt;80)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f97316', opacity: 0.5}}></span>
                        <span className="text-xs">Умеренная (50-80)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#3b82f6', opacity: 0.3}}></span>
                        <span className="text-xs">Слабая (&lt;50)</span>
                    </div>
                </div>
            </div>
        );
    }
    if (mode === 'age') {
        const tooltip = "Средний медианный возраст владельца животного в регионе по данным Росстата и демографической статистики СНГ.";
        return (
            <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
                <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    Возраст владельцев
                </h4>
                <div className="space-y-1">
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#10b981', opacity: 0.7}}></span>
                        <span className="text-xs">Молодые (&lt;35)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f59e0b', opacity: 0.5}}></span>
                        <span className="text-xs">Средний (35-45)</span>
                    </div>
                    <div className="flex items-center" title={tooltip}>
                        <span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#8b5cf6', opacity: 0.5}}></span>
                        <span className="text-xs">Старший (&gt;45)</span>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="p-3 bg-white/95 backdrop-blur-md rounded-lg border border-gray-200 text-gray-900 max-w-[200px] shadow-lg">
            <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-gray-500">Статус ТТ</h4>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-emerald-500 shadow-sm"></span>
                <span className="text-xs font-medium">Активна (&lt;6 мес)</span>
            </div>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-amber-500 shadow-sm"></span>
                <span className="text-xs font-medium">Риск (6-12 мес)</span>
            </div>
            <div className="flex items-center mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-red-500 shadow-sm"></span>
                <span className="text-xs font-medium">Потеряна (&gt;12 мес)</span>
            </div>
            <div className="flex items-center mb-1.5 mt-2 pt-2 border-t border-gray-200">
                <span className="inline-block w-3 h-3 rounded-full mr-2 bg-blue-500 shadow-sm"></span>
                <span className="text-xs font-medium">Потенциал (ОКБ)</span>
            </div>
        </div>
    );
});