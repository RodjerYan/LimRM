
import React from 'react';
import Modal from './Modal';
import { PlanMetric } from '../types';
import { TargetIcon, TrendingUpIcon, UsersIcon, CalculatorIcon, DataIcon } from './icons';

interface GrowthExplanationModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: PlanMetric | null;
    baseRate: number;
    zIndex?: string;
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n);

const GrowthExplanationModal: React.FC<GrowthExplanationModalProps> = ({ isOpen, onClose, data, baseRate, zIndex }) => {
    if (!data || !data.factors || !data.details) return null;

    const { factors, details, growthPct, name } = data;
    const isHighGrowth = growthPct > baseRate;

    const getStatusColor = (val: number) => val > 0 ? 'text-emerald-600' : (val < 0 ? 'text-red-600' : 'text-slate-400');
    const getBgColor = (val: number) => val > 0 ? 'bg-emerald-50 border-emerald-200' : (val < 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200');

    const getNarrative = (type: 'share' | 'width' | 'velocity' | 'acquisition') => {
        switch (type) {
            case 'share':
                if (details.marketShare < 0.1) return "Регион практически пуст (Доля < 10%). Это «Голубой океан», где мы можем расти кратно.";
                if (details.marketShare > 0.4) return "Высокая доля рынка (> 40%). Дальнейший агрессивный рост невозможен без потери маржинальности.";
                return "Стабильная рыночная позиция. Потенциал роста умеренный.";
            case 'width':
                if (details.mySku < details.globalSku * 0.8) return `Ассортимент узкий (${details.mySku.toFixed(1)} SKU) по сравнению со средним (${details.globalSku.toFixed(1)}).`;
                if (details.mySku > details.globalSku * 1.2) return "Отличная ширина полки. Мы уже продаем больше SKU, чем в среднем по стране.";
                return "Ассортимент соответствует стандартам компании.";
            case 'velocity':
                if (details.myVelocity < details.globalVelocity * 0.8) return `Продажи на 1 SKU низкие (${fmt(details.myVelocity)} кг). Сигнал о проблемах с выкладкой или стоком.`;
                if (details.myVelocity > details.globalVelocity * 1.2) return `Высокая эффективность (${fmt(details.myVelocity)} кг/SKU). Клиенты лояльны, товар уходит быстро.`;
                return "Показатели оборачиваемости в норме.";
            case 'acquisition':
                if (details.rmEfficiencyRatio > 1.1) return "Вы — эффективный менеджер. Мы ожидаем активного захвата новых точек (Acquisition).";
                if (details.rmEfficiencyRatio < 0.8) return "Текущая эффективность ниже средней. Ставим консервативный план на привлечение.";
                return "Стандартный план по привлечению новых клиентов.";
        }
    };
    
    const tooltips = {
        total: "Итоговая цель роста (%) — это сумма базовой ставки и всех поправочных коэффициентов.",
        marketShare: "Доля рынка: если доля низкая, потенциал роста высокий.",
        skuWidth: "Ширина полки: если SKU меньше среднего, есть потенциал расширения.",
        velocity: "Качество продаж: средние продажи на 1 SKU в сравнении с компанией.",
        acquisition: "Вход в регион: план на захват новых точек."
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Аргументация плана: ${name}`} maxWidth="max-w-5xl" zIndex={zIndex}>
            <div className="space-y-8">
                
                {/* 1. EXECUTIVE SUMMARY */}
                <div className="bg-white p-6 rounded-3xl border border-indigo-200 shadow-lg flex flex-col md:flex-row justify-between items-center gap-6" title={tooltips.total}>
                    <div className="flex items-center gap-6">
                        <div className={`w-32 h-32 rounded-full flex items-center justify-center text-xl font-black shadow-md border-4 flex-shrink-0 ${isHighGrowth ? 'bg-emerald-50 border-emerald-400 text-emerald-600' : 'bg-indigo-50 border-indigo-400 text-indigo-600'}`}>
                            {growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}%
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">Итоговая цель роста</h3>
                            <p className="text-sm text-slate-500 max-w-md font-medium">
                                Рассчитана на основе 4-х факторов эффективности. 
                                Базовая ставка компании: <span className="text-slate-800 font-bold">{baseRate}%</span>
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">План в килограммах</div>
                        <div className="text-3xl font-mono font-black text-slate-900 tracking-tight">
                            {new Intl.NumberFormat('ru-RU').format(data.plan)} <span className="text-lg text-slate-400 font-medium">кг</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* 2. MARKET SHARE FACTOR */}
                    <div className={`p-6 rounded-2xl border flex flex-col shadow-sm ${getBgColor(factors.share)}`} title={tooltips.marketShare}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl text-indigo-600 shadow-sm border border-slate-100"><UsersIcon small /></div>
                                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Доля Рынка</h4>
                            </div>
                            <span className={`font-mono font-bold text-lg ${getStatusColor(factors.share)}`}>
                                {factors.share > 0 ? '+' : ''}{factors.share.toFixed(1)}%
                            </span>
                        </div>
                        
                        <div className="flex-grow">
                            <p className="text-sm text-slate-600 mb-4 italic leading-relaxed">"{getNarrative('share')}"</p>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-500 font-medium">
                                    <span>Ваша доля: <strong className="text-slate-900">{(details.marketShare * 100).toFixed(1)}%</strong></span>
                                    <span>Норма: <strong className="text-slate-700">35%</strong></span>
                                </div>
                                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden relative">
                                    <div 
                                        className={`h-full rounded-full ${details.marketShare > 0.35 ? 'bg-amber-400' : 'bg-blue-500'}`}
                                        style={{ width: `${Math.min(100, details.marketShare * 100)}%` }}
                                    ></div>
                                    <div className="w-0.5 h-4 bg-slate-900 absolute top-0 left-[35%] opacity-30"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. ACQUISITION FACTOR */}
                    <div className={`p-6 rounded-2xl border flex flex-col shadow-sm ${getBgColor(factors.acquisition)}`} title={tooltips.acquisition}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl text-indigo-600 shadow-sm border border-slate-100"><TargetIcon small /></div>
                                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Захват (Acquisition)</h4>
                            </div>
                            <span className={`font-mono font-bold text-lg ${getStatusColor(factors.acquisition)}`}>
                                {factors.acquisition > 0 ? '+' : ''}{factors.acquisition.toFixed(1)}%
                            </span>
                        </div>
                        
                        <div className="flex-grow">
                            <p className="text-sm text-slate-600 mb-4 italic leading-relaxed">"{getNarrative('acquisition')}"</p>
                            <div className="text-xs text-slate-500 bg-white/60 p-3 rounded-xl border border-slate-200/50 font-medium">
                                Ваш рейтинг эффективности: <strong className="text-indigo-700">{details.rmEfficiencyRatio.toFixed(2)}x</strong> от среднего.
                            </div>
                        </div>
                    </div>

                    {/* 4. WIDTH (SKU) FACTOR */}
                    <div className={`p-6 rounded-2xl border flex flex-col shadow-sm ${getBgColor(factors.width)}`} title={tooltips.skuWidth}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl text-indigo-600 shadow-sm border border-slate-100"><DataIcon small /></div>
                                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Ширина (SKU)</h4>
                            </div>
                            <span className={`font-mono font-bold text-lg ${getStatusColor(factors.width)}`}>
                                {factors.width > 0 ? '+' : ''}{factors.width.toFixed(1)}%
                            </span>
                        </div>
                        
                        <div className="flex-grow">
                            <p className="text-sm text-slate-600 mb-4 italic leading-relaxed">"{getNarrative('width')}"</p>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-500 font-medium">
                                    <span>Вы: <strong className="text-slate-900">{details.mySku.toFixed(1)}</strong></span>
                                    <span>Компания: <strong className="text-slate-700">{details.globalSku.toFixed(1)}</strong></span>
                                </div>
                                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-indigo-200" style={{ width: '50%' }}></div>
                                    <div 
                                        className={`h-full transition-all duration-500 ${details.mySku >= details.globalSku ? 'bg-emerald-500' : 'bg-red-400'}`} 
                                        style={{ width: `${Math.min(50, (details.mySku / (details.globalSku * 2)) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 5. VELOCITY FACTOR */}
                    <div className={`p-6 rounded-2xl border flex flex-col shadow-sm ${getBgColor(factors.velocity)}`} title={tooltips.velocity}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl text-indigo-600 shadow-sm border border-slate-100"><TrendingUpIcon small /></div>
                                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Качество (Velocity)</h4>
                            </div>
                            <span className={`font-mono font-bold text-lg ${getStatusColor(factors.velocity)}`}>
                                {factors.velocity > 0 ? '+' : ''}{factors.velocity.toFixed(1)}%
                            </span>
                        </div>
                        
                        <div className="flex-grow">
                            <p className="text-sm text-slate-600 mb-4 italic leading-relaxed">"{getNarrative('velocity')}"</p>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-500 font-medium">
                                    <span>Вы: <strong className="text-slate-900">{fmt(details.myVelocity)} кг</strong></span>
                                    <span>Компания: <strong className="text-slate-700">{fmt(details.globalVelocity)} кг</strong></span>
                                </div>
                                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden relative">
                                    <div 
                                        className={`h-full rounded-full ${details.myVelocity >= details.globalVelocity ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                        style={{ width: `${Math.min(100, (details.myVelocity / details.globalVelocity) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex gap-4 items-center shadow-sm">
                    <div className="text-slate-400"><CalculatorIcon /></div>
                    <div className="text-xs text-slate-600 font-medium">
                        <strong>Примечание:</strong> Алгоритм "Умного Планирования" (Smart Planning Engine) использует бенчмаркинг. 
                        Мы сравниваем ваши показатели со средними по компании, чтобы найти точки роста (Gap Analysis).
                    </div>
                </div>

            </div>
        </Modal>
    );
};

export default GrowthExplanationModal;
