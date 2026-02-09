
import React, { useMemo } from 'react';
import { AggregatedDataRow } from '../../types';
import { BrainIcon, TargetIcon, TrendingUpIcon } from '../icons';
import { performParetoAnalysis } from '../../utils/analytics';

interface RoiGenomeProps {
    data: AggregatedDataRow[];
}

interface ParetoItem {
    name: string;
    value: number;
}

const RoiGenome: React.FC<RoiGenomeProps> = ({ data }) => {
    
    // Prepare data for Pareto Analysis (By RM Growth Potential)
    const paretoData = useMemo(() => {
        const rmPotentialMap = new Map<string, number>();
        data.forEach(d => {
            const current = rmPotentialMap.get(d.rm) || 0;
            rmPotentialMap.set(d.rm, current + d.growthPotential);
        });
        
        const items = Array.from(rmPotentialMap.entries()).map(([name, value]) => ({ name, value }));
        return performParetoAnalysis(items);
    }, [data]);

    if (data.length === 0) {
        return <div className="text-center text-gray-500 mt-20">Пожалуйста, сначала загрузите данные в модуле ADAPTA.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-200 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">ROI GENOME <span className="text-gray-400 font-normal text-lg">/ Стратегия</span></h2>
                    <p className="text-gray-500 text-sm mt-1">Интеллектуальный слой. Определение стратегических приоритетов (Принцип Парето 20/80).</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Executive Summary Card */}
                <div className="lg:col-span-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-white rounded-xl text-indigo-600 shadow-md border border-indigo-100">
                            <BrainIcon />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">Стратегический Инсайт</h3>
                            <p className="text-gray-600 text-sm mt-1 max-w-xl">
                                Согласно анализу ROI Genome, <strong>{paretoData.top20.length}</strong> из ваших РМ контролируют <strong>80%</strong> всего доступного потенциала роста. 
                                Фокус на этих территориях даст максимальный возврат инвестиций (ROI).
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-gray-500 uppercase tracking-wider font-bold">Общий Потенциал Роста</div>
                        <div className="text-3xl font-mono font-bold text-indigo-700">
                            {new Intl.NumberFormat('ru-RU').format(Math.round(paretoData.cutoffValue / 0.8))} кг
                        </div>
                    </div>
                </div>

                {/* Top Priorities (The 20%) */}
                <div className="lg:col-span-2 bg-white backdrop-blur-xl border border-emerald-100 rounded-2xl p-6 shadow-md">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <TargetIcon small /> Топ Приоритеты (Tier 1)
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">Эти РМ обладают наибольшим запасом для роста. Рекомендуется: Aggressive Investment.</p>
                    
                    <div className="space-y-3">
                        {paretoData.top20.map((item: ParetoItem, idx: number) => (
                            <div key={item.name} className="flex items-center p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <div className="w-8 h-8 flex items-center justify-center bg-emerald-100 text-emerald-600 font-bold rounded-lg mr-4">
                                    {idx + 1}
                                </div>
                                <div className="flex-grow">
                                    <h4 className="text-gray-900 font-bold">{item.name}</h4>
                                    <div className="w-full bg-gray-200 h-1.5 rounded-full mt-2">
                                        <div 
                                            className="bg-emerald-500 h-1.5 rounded-full" 
                                            style={{ width: `${(item.value / paretoData.top20[0].value) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="text-right min-w-[100px]">
                                    <div className="text-emerald-600 font-bold text-lg">
                                        +{new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(item.value)}
                                    </div>
                                    <div className="text-[10px] text-gray-400">потенциал</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Maintenance (The 80%) */}
                <div className="lg:col-span-1 bg-white backdrop-blur-xl border border-gray-200 rounded-2xl p-6 shadow-md">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUpIcon small /> Поддержка (Tier 2)
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">Остальные территории. Рекомендуется: Maintenance Strategy.</p>
                    
                    <div className="overflow-y-auto max-h-[400px] custom-scrollbar pr-2 space-y-2">
                        {paretoData.bottom80.map((item: ParetoItem) => (
                            <div key={item.name} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-100 last:border-0">
                                <span className="text-gray-700 text-sm">{item.name}</span>
                                <span className="text-gray-500 text-xs font-mono">+{new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(item.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoiGenome;
