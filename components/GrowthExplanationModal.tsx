
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

// Helper to format large numbers
const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n);

const GrowthExplanationModal: React.FC<GrowthExplanationModalProps> = ({ isOpen, onClose, data, baseRate, zIndex }) => {
    if (!data || !data.factors || !data.details) return null;

    const { factors, details, growthPct, name } = data;
    const isHighGrowth = growthPct > baseRate;

    const getStatusColor = (val: number) => val > 0 ? 'text-emerald-400' : (val < 0 ? 'text-red-400' : 'text-gray-400');
    const getBgColor = (val: number) => val > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : (val < 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-800/50 border-gray-700');

    // Generate dynamic narratives based on data context
    const getNarrative = (type: 'share' | 'width' | 'velocity' | 'acquisition') => {
        switch (type) {
            case 'share':
                if (details.marketShare < 0.1) return "Регион практически пуст (Доля < 10%). Это «Голубой океан», где мы можем расти кратно.";
                if (details.marketShare > 0.4) return "Высокая доля рынка (> 40%). Дальнейший агрессивный рост невозможен без потери маржинальности (демпинга).";
                return "Стабильная рыночная позиция. Потенциал роста умеренный.";
            case 'width':
                if (details.mySku < details.globalSku * 0.8) return `Ассортимент узкий (${details.mySku.toFixed(1)} SKU) по сравнению со средним (${details.globalSku.toFixed(1)}). Необходимо вводить новинки.`;
                if (details.mySku > details.globalSku * 1.2) return "Отличная ширина полки. Мы уже продаем больше SKU, чем в среднем по стране.";
                return "Ассортимент соответствует стандартам компании.";
            case 'velocity':
                if (details.myVelocity < details.globalVelocity * 0.8) return `Продажи на 1 SKU низкие (${fmt(details.myVelocity)} кг). Это сигнал о проблемах с выкладкой или стоком.`;
                if (details.myVelocity > details.globalVelocity * 1.2) return `Высокая эффективность (${fmt(details.myVelocity)} кг/SKU). Клиенты лояльны, товар уходит быстро.`;
                return "Показатели оборачиваемости в норме.";
            case 'acquisition':
                if (details.rmEfficiencyRatio > 1.1) return "Вы — эффективный менеджер. Мы ожидаем, что вы сможете активно захватывать новые точки (Acquisition).";
                if (details.rmEfficiencyRatio < 0.8) return "Текущая эффективность ниже средней. Мы ставим консервативный план на привлечение новых клиентов.";
                return "Стандартный план по привлечению новых клиентов.";
        }
    };
    
    const tooltips = {
        total: "Итоговая цель роста (%) — это сумма базовой ставки (по умолчанию 15%) и всех этих поправочных коэффициентов. А План в килограммах — это результат применения итогового процента роста к текущему факту продаж.",
        marketShare: "Система оценивает, какую долю потенциальных клиентов (из базы ОКБ) в регионе вы уже обслуживаете. Если доля низкая, потенциал роста высокий, и план будет более агрессивным. Если доля высокая, рост замедляется.",
        skuWidth: "Алгоритм сравнивает среднее количество ваших товарных позиций (SKU) на одну торговую точку в регионе со средним показателем по всей компании. Если у вас в точках меньше SKU, чем в среднем, система видит потенциал роста за счет расширения ассортимента и увеличивает план.",
        velocity: "Сравниваются средние продажи на одну SKU (оборачиваемость) в регионе со средним по компании. Если продажи ниже, это сигнал о проблемах с выкладкой или стоком, но также и точка роста, что закладывается в план.",
        acquisition: "Этот фактор применяется, когда в регионе еще нет продаж. План на 'вход в регион' рассчитывается на основе общей эффективности менеджера и размера потенциального рынка."
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Аргументация плана: ${name}`} maxWidth="max-w-5xl" zIndex={zIndex}>
            <div className="space-y-8">
                
                {/* 1. EXECUTIVE SUMMARY */}
                <div className="bg-gray-900 p-6 rounded-2xl border border-indigo-500/30 flex flex-col md:flex-row justify-between items-center gap-6" title={tooltips.total}>
                    <div className="flex items-center gap-6">
                        {/* Increased size to w-32 h-32 and adjusted font size */}
                        <div className={`w-32 h-32 rounded-full flex items-center justify-center text-xl font-bold shadow-lg border-4 flex-shrink-0 ${isHighGrowth ? 'bg-emerald-900/50 border-emerald-500 text-emerald-400' : 'bg-indigo-900/50 border-indigo-500 text-indigo-400'}`}>
                            {growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}%
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Итоговая цель роста</h3>
                            <p className="text-sm text-gray-400 max-w-md">
                                Рассчитана на основе 4-х факторов эффективности. 
                                Базовая ставка компании: <span className="text-white font-bold">{baseRate}%</span>
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">План в килограммах</div>
                        <div className="text-3xl font-mono font-bold text-white tracking-tight">
                            {new Intl.NumberFormat('ru-RU').format(data.plan)} <span className="text-lg text-gray-600">кг</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* 2. MARKET SHARE FACTOR */}
                    <div className={`p-5 rounded-xl border flex flex-col ${getBgColor(factors.share)}`} title={tooltips.marketShare}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-gray-900/50 rounded-lg text-indigo-400"><UsersIcon small /></div>
                                <h4 className="font-bold text-white">Доля Рынка</h4>
                            </div>
                            <span className={`font-mono font-bold text-lg ${getStatusColor(factors.share)}`}>
                                {factors.share > 0 ? '+' : ''}{factors.share.toFixed(1)}% к плану
                            </span>
                        </div>
                        
                        <div className="flex-grow">
                            <p className="text-sm text-gray-300 mb-4 italic">
                                "{getNarrative('share')}"
                            </p>
                            
                            {/* Comparison Bar */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Ваша доля: <strong className="text-white">{(details.marketShare * 100).toFixed(1)}%</strong></span>
                                    <span>Норма: <strong className="text-gray-300">35%</strong></span>
                                </div>
                                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full ${details.marketShare > 0.35 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                        style={{ width: `${Math.min(100, details.marketShare * 100)}%` }}
                                    ></div>
                                    <div className="w-0.5 h-4 bg-white absolute top-0 left-[35%] opacity-50"></div> {/* Benchmark Line */}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. ACQUISITION FACTOR */}
                    <div className={`p-5 rounded-xl border flex flex-col ${getBgColor(factors.acquisition)}`} title={tooltips.acquisition}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-gray-900/50 rounded-lg text-indigo-400"><TargetIcon small /></div>
                                <h4 className="font-bold text-white">Захват (Acquisition)</h4>
                            </div>
                            <span className={`font-mono font-bold text-lg ${getStatusColor(factors.acquisition)}`}>
                                {factors.acquisition > 0 ? '+' : ''}{factors.acquisition.toFixed(1)}% к плану
                            </span>
                        </div>
                        
                        <div className="flex-grow">
                            <p className="text-sm text-gray-300 mb-4 italic">
                                "{getNarrative('acquisition')}"
                            </p>
                            <div className="text-xs text-gray-400 bg-gray-900/30 p-2 rounded border border-white/5">
                                Ваш рейтинг эффективности: <strong className="text-white">{details.rmEfficiencyRatio.toFixed(2)}x</strong> от среднего.
                                Чем выше рейтинг, тем больше новых точек мы ожидаем от вас.
                            </div>
                        </div>
                    </div>

                    {/* 4. WIDTH (SKU) FACTOR */}
                    <div className={`p-5 rounded-xl border flex flex-col ${getBgColor(factors.width)}`} title={tooltips.skuWidth}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-gray-900/50 rounded-lg text-indigo-400"><DataIcon small /></div>
                                <h4 className="font-bold text-white">Ширина (SKU)</h4>
                            </div>
                            <span className={`font-mono font-bold text-lg ${getStatusColor(factors.width)}`}>
                                {factors.width > 0 ? '+' : ''}{factors.width.toFixed(1)}% к плану
                            </span>
                        </div>
                        
                        <div className="flex-grow">
                            <p className="text-sm text-gray-300 mb-4 italic">
                                "{getNarrative('width')}"
                            </p>
                            
                            {/* Comparison Bar */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Вы: <strong className="text-white">{details.mySku.toFixed(1)}</strong></span>
                                    <span>Компания: <strong className="text-gray-300">{details.globalSku.toFixed(1)}</strong></span>
                                </div>
                                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-indigo-500" style={{ width: '50%' }}></div> {/* Just a visual balance */}
                                    <div 
                                        className={`h-full transition-all duration-500 ${details.mySku >= details.globalSku ? 'bg-emerald-500' : 'bg-red-500'}`} 
                                        style={{ width: `${Math.min(50, (details.mySku / (details.globalSku * 2)) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 5. VELOCITY FACTOR */}
                    <div className={`p-5 rounded-xl border flex flex-col ${getBgColor(factors.velocity)}`} title={tooltips.velocity}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-gray-900/50 rounded-lg text-indigo-400"><TrendingUpIcon small /></div>
                                <h4 className="font-bold text-white">Качество (Velocity)</h4>
                            </div>
                            <span className={`font-mono font-bold text-lg ${getStatusColor(factors.velocity)}`}>
                                {factors.velocity > 0 ? '+' : ''}{factors.velocity.toFixed(1)}% к плану
                            </span>
                        </div>
                        
                        <div className="flex-grow">
                            <p className="text-sm text-gray-300 mb-4 italic">
                                "{getNarrative('velocity')}"
                            </p>
                            
                            {/* Comparison Bar */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Вы: <strong className="text-white">{fmt(details.myVelocity)} кг</strong></span>
                                    <span>Компания: <strong className="text-gray-300">{fmt(details.globalVelocity)} кг</strong></span>
                                </div>
                                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden relative">
                                    <div 
                                        className={`h-full rounded-full ${details.myVelocity >= details.globalVelocity ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                        style={{ width: `${Math.min(100, (details.myVelocity / details.globalVelocity) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="bg-gray-800/50 border border-gray-700 p-4 rounded-xl flex gap-4 items-center">
                    <div className="text-gray-400"><CalculatorIcon /></div>
                    <div className="text-xs text-gray-400">
                        <strong>Примечание:</strong> Алгоритм "Умного Планирования" (Smart Planning Engine) использует бенчмаркинг. 
                        Мы сравниваем ваши показатели со средними по компании, чтобы найти точки роста (Gap Analysis). 
                        Если вы отстаете по ширине полки или качеству продаж, система автоматически добавляет план на "подтягивание" этих метрик.
                    </div>
                </div>

            </div>
        </Modal>
    );
};

export default GrowthExplanationModal;
