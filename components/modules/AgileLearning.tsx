
import React, { useState, useMemo } from 'react';
import { AggregatedDataRow } from '../../types';
import { LabIcon, TargetIcon } from '../icons';
import { calculateSimilarity } from '../../utils/analytics';

interface AgileLearningProps {
    data: AggregatedDataRow[];
}

const AgileLearning: React.FC<AgileLearningProps> = ({ data }) => {
    const [selectedRegion, setSelectedRegion] = useState<string>('');
    
    // Extract unique regions and calculate their metrics for matching
    const regionMetrics = useMemo(() => {
        const metricsMap = new Map<string, { volume: number; growth: number; potential: number }>();
        
        data.forEach(d => {
            if (!metricsMap.has(d.region)) {
                metricsMap.set(d.region, { volume: 0, growth: 0, potential: 0 });
            }
            const m = metricsMap.get(d.region)!;
            m.volume += d.fact;
            m.potential += d.potential;
            m.growth += d.growthPotential; // Accumulate absolute growth
        });

        // Convert to array and calculate final growth % per region
        const result: { name: string; volume: number; growth: number; potential: number }[] = [];
        metricsMap.forEach((val, key) => {
            const growthPct = val.potential > 0 ? (val.growth / val.potential) * 100 : 0;
            result.push({ name: key, volume: val.volume, growth: growthPct, potential: val.potential });
        });
        return result;
    }, [data]);

    const maxVolume = useMemo(() => Math.max(...regionMetrics.map(r => r.volume)), [regionMetrics]);

    // Find control candidates using Euclidean distance
    const controlCandidates = useMemo(() => {
        if (!selectedRegion) return [];
        const target = regionMetrics.find(r => r.name === selectedRegion);
        if (!target) return [];

        return regionMetrics
            .filter(r => r.name !== selectedRegion)
            .map(candidate => {
                const similarity = calculateSimilarity(target, candidate, maxVolume);
                return { ...candidate, similarity };
            })
            .sort((a, b) => b.similarity - a.similarity) // Highest score first
            .slice(0, 3);
    }, [selectedRegion, regionMetrics, maxVolume]);

    if (data.length === 0) {
        return <div className="text-center text-gray-500 mt-20">Пожалуйста, сначала загрузите данные в модуле ADAPTA.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">AGILE LEARNING <span className="text-gray-500 font-normal text-lg">/ Эксперименты</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Научный подбор контрольных групп (Nearest Neighbor Matching) для A/B тестирования.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Setup */}
                <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-6 h-fit">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <LabIcon small /> Настройка эксперимента
                    </h3>
                    
                    <label className="block text-sm text-gray-400 mb-2">Выберите Тестовый Регион (Зона воздействия)</label>
                    <select 
                        className="w-full bg-gray-800 border border-gray-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 mb-6"
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                    >
                        <option value="">-- Выберите регион --</option>
                        {regionMetrics.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                    </select>

                    {selectedRegion && (
                        <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
                            <div className="text-xs text-indigo-300 uppercase font-bold mb-2">Параметры эксперимента</div>
                            <ul className="space-y-2 text-sm text-gray-300">
                                <li className="flex justify-between">
                                    <span>Метрика успеха:</span> <span className="text-white">Прирост продаж (Lift)</span>
                                </li>
                                <li className="flex justify-between">
                                    <span>Min. Detectable Effect (MDE):</span> <span className="text-white">~3.5%</span>
                                </li>
                                <li className="flex justify-between">
                                    <span>Длительность:</span> <span className="text-white">3 Месяца</span>
                                </li>
                                <li className="flex justify-between">
                                    <span>Алгоритм подбора:</span> <span className="text-emerald-400">Euclidean Distance</span>
                                </li>
                            </ul>
                        </div>
                    )}
                </div>

                {/* Candidates */}
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <TargetIcon small /> Рекомендуемые Контрольные Группы
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">
                        Регионы с наивысшим <strong>Score Сходства</strong> (0-100%), рассчитанным на основе объема, доли рынка и исторического роста.
                    </p>

                    {selectedRegion ? (
                        controlCandidates.map((c, idx) => (
                            <div key={c.name} className="bg-gray-800/40 border border-gray-700 p-4 rounded-xl flex justify-between items-center hover:bg-gray-800 transition-colors cursor-pointer group">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded group-hover:bg-indigo-600 group-hover:text-white transition-colors">{idx + 1}</span>
                                        <span className="font-bold text-white">{c.name}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                                        <span>Объем: {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(c.volume)}</span>
                                        <span>Потенциал: {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(c.potential)}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-2xl font-bold ${c.similarity > 90 ? 'text-emerald-400' : c.similarity > 75 ? 'text-indigo-400' : 'text-amber-400'}`}>
                                        {c.similarity.toFixed(1)}%
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase">Сходство</div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-gray-600 border-2 border-dashed border-gray-800 rounded-xl">
                            Выберите тестовый регион слева
                        </div>
                    )}

                    {selectedRegion && controlCandidates.length > 0 && (
                        <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-900/20 mt-4">
                            Сформировать пары и запустить тест
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgileLearning;
