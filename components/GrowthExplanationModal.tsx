
import React from 'react';
import Modal from './Modal';
import { PlanMetric } from '../types';
import { TrendingUpIcon, TargetIcon, CalculatorIcon } from './icons';

interface GrowthExplanationModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: PlanMetric | null;
    baseRate: number;
}

const GrowthExplanationModal: React.FC<GrowthExplanationModalProps> = ({ isOpen, onClose, data, baseRate }) => {
    if (!data || !data.factors) return null;

    const { factors, growthPct, name } = data;
    
    const getFactorColor = (val: number) => {
        if (val > 0) return 'text-emerald-400';
        if (val < 0) return 'text-red-400';
        return 'text-gray-500';
    };

    const getFactorSign = (val: number) => (val > 0 ? '+' : '');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Обоснование плана: ${name}`} maxWidth="max-w-2xl">
            <div className="space-y-6">
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                    <div>
                        <div className="text-xs text-gray-400 uppercase mb-1">Итоговый рост</div>
                        <div className={`text-3xl font-bold ${getFactorColor(growthPct)}`}>
                            {getFactorSign(growthPct)}{growthPct.toFixed(1)}%
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-400 uppercase mb-1">Расчетный план</div>
                        <div className="text-xl font-mono font-bold text-white">
                            {new Intl.NumberFormat('ru-RU').format(data.plan)} <span className="text-sm text-gray-500">кг</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                        <CalculatorIcon small /> Детализация формулы
                    </h4>
                    
                    <div className="bg-gray-800/40 rounded-lg divide-y divide-gray-700 border border-gray-700">
                        {/* Base */}
                        <div className="p-3 flex justify-between items-center">
                            <div>
                                <div className="text-sm text-white font-medium">Базовая ставка</div>
                                <div className="text-xs text-gray-500">Стандартное ежегодное повышение (инфляция + рынок)</div>
                            </div>
                            <div className="font-mono font-bold text-indigo-400">
                                {baseRate}%
                            </div>
                        </div>

                        {/* Share Adjustment */}
                        <div className="p-3 flex justify-between items-center">
                            <div>
                                <div className="text-sm text-white font-medium">Коррекция на Долю Рынка</div>
                                <div className="text-xs text-gray-500">
                                    {factors.share > 0 
                                        ? "Эффект низкой базы (рынок пустой, легко расти)" 
                                        : (factors.share < 0 ? "Эффект насыщения (доля высокая, расти сложно)" : "Доля рынка в норме")}
                                </div>
                            </div>
                            <div className={`font-mono font-bold ${getFactorColor(factors.share)}`}>
                                {getFactorSign(factors.share)}{factors.share.toFixed(1)}%
                            </div>
                        </div>

                        {/* Width (SKU) */}
                        <div className="p-3 flex justify-between items-center">
                            <div>
                                <div className="text-sm text-white font-medium">Расширение ассортимента (Width)</div>
                                <div className="text-xs text-gray-500">
                                    {factors.width > 0 
                                        ? "Мало SKU на точку. Требуется ввод новинок." 
                                        : "Ассортимент шире среднего. Бонус за качественную матрицу."}
                                </div>
                            </div>
                            <div className={`font-mono font-bold ${getFactorColor(factors.width)}`}>
                                {getFactorSign(factors.width)}{factors.width.toFixed(1)}%
                            </div>
                        </div>

                        {/* Velocity */}
                        <div className="p-3 flex justify-between items-center">
                            <div>
                                <div className="text-sm text-white font-medium">Качество продаж (Velocity)</div>
                                <div className="text-xs text-gray-500">
                                    {factors.velocity > 0 
                                        ? "Слабая оборачиваемость на SKU. Нужна ротация/промо." 
                                        : "Высокая оборачиваемость. Отличная работа с полкой."}
                                </div>
                            </div>
                            <div className={`font-mono font-bold ${getFactorColor(factors.velocity)}`}>
                                {getFactorSign(factors.velocity)}{factors.velocity.toFixed(1)}%
                            </div>
                        </div>

                        {/* Acquisition */}
                        <div className="p-3 flex justify-between items-center">
                            <div>
                                <div className="text-sm text-white font-medium">Захват Территории (Acquisition)</div>
                                <div className="text-xs text-gray-500">
                                    {factors.acquisition > 0 
                                        ? "Регион не покрыт. Задача на активный вход в новые точки (ОКБ)." 
                                        : "Покрытие стабильное."}
                                </div>
                            </div>
                            <div className={`font-mono font-bold ${getFactorColor(factors.acquisition)}`}>
                                {getFactorSign(factors.acquisition)}{factors.acquisition.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-indigo-900/20 p-4 rounded-lg border border-indigo-500/20 flex gap-3">
                    <div className="text-indigo-400 mt-0.5"><TargetIcon small /></div>
                    <div className="text-xs text-gray-300">
                        <strong className="block text-indigo-300 mb-1">Итоговая логика:</strong>
                        План формируется индивидуально. Если вы эффективно работаете (хорошие продажи на SKU), система ставит задачу на <strong>захват новых точек</strong>. Если покрытие есть, но продажи слабые — задача на <strong>ротацию ассортимента</strong>.
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default GrowthExplanationModal;
