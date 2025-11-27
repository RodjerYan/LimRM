
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AggregatedDataRow } from '../../types';
import { LabIcon, TargetIcon, TrendingUpIcon, ArrowLeftIcon, LoaderIcon, SearchIcon } from '../icons';
import { calculateSimilarity } from '../../utils/analytics';
import Chart from 'chart.js/auto';

interface AgileLearningProps {
    data: AggregatedDataRow[];
}

interface RegionMetric {
    name: string;
    volume: number;
    growth: number;
    potential: number;
    similarity?: number;
}

// --- Sub-component: Active Experiment Dashboard ---
const ActiveExperimentView: React.FC<{ 
    testRegion: RegionMetric; 
    controlRegion: RegionMetric; 
    onReset: () => void; 
}> = ({ testRegion, controlRegion, onReset }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    // Use the actual growth percentage from the region analysis directly.
    // "Duplicate the value" as requested, removing complex projection formulas.
    const projectedLift = testRegion.growth;

    useEffect(() => {
        if (!chartRef.current) return;
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        if (chartInstance.current) chartInstance.current.destroy();

        const months = ['Мес 1', 'Мес 2', 'Мес 3 (Старт)', 'Мес 4', 'Мес 5', 'Мес 6'];
        
        // Generate baseline seasonality
        const baseSeries = [100, 105, 102, 108, 115, 120]; // Abstract index
        
        // Control follows baseline with noise
        const controlData = baseSeries.map(v => v * (1 + (Math.random() * 0.02 - 0.01)));
        
        // Test follows baseline until month 3, then lifts to match the projectedLift
        const liftFactor = 1 + (projectedLift / 100);
        
        const testData = baseSeries.map((v, i) => {
            if (i < 2) return v * (1 + (Math.random() * 0.02 - 0.01)); // Pre-test noise
            
            // Gradual ramp up of the effect
            // Month 2 (Start): 10% of effect
            // Month 3: 40% of effect
            // Month 4: 80% of effect
            // Month 5: 100% of effect
            const progress = Math.min(1, (i - 1.5) / 3.5); 
            const currentLift = 1 + ((liftFactor - 1) * progress);
            
            return v * currentLift;
        });

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: `Тест: ${testRegion.name}`,
                        data: testData,
                        borderColor: '#818cf8', // Indigo
                        backgroundColor: 'rgba(129, 140, 248, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 4
                    },
                    {
                        label: `Контроль: ${controlRegion.name}`,
                        data: controlData,
                        borderColor: '#9ca3af', // Gray
                        borderDash: [5, 5],
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#cbd5e1' } },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false,
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw ? (ctx.raw as number).toFixed(1) : 0} index`
                        }
                    }
                },
                scales: {
                    y: { 
                        display: false, // Abstract index
                        grid: { color: 'rgba(255,255,255,0.05)' } 
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#9ca3af' }
                    }
                }
            }
        });

        return () => { chartInstance.current?.destroy(); };
    }, [testRegion, controlRegion, projectedLift]);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Status Header */}
            <div className="bg-emerald-900/20 border border-emerald-500/30 p-4 rounded-xl flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 animate-pulse">
                        <LoaderIcon />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Эксперимент запущен</h3>
                        <p className="text-xs text-emerald-300">Сбор данных: Неделя 1 из 12</p>
                    </div>
                </div>
                <button onClick={onReset} className="text-xs text-gray-400 hover:text-white underline">
                    Остановить и сбросить
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Metrics Comparison */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-700">
                        <h4 className="text-gray-400 text-xs uppercase font-bold mb-4">Параметры теста</h4>
                        
                        <div className="mb-4">
                            <div className="text-sm text-indigo-300 font-bold mb-1">Тестовая группа (Impact)</div>
                            <div className="text-xl text-white">{testRegion.name}</div>
                            <div className="text-xs text-gray-500">Объем: {new Intl.NumberFormat('ru-RU').format(testRegion.volume)}</div>
                        </div>

                        <div className="flex justify-center my-2">
                            <div className="bg-gray-800 px-3 py-1 rounded-full text-xs text-gray-400">vs</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-400 font-bold mb-1">Контрольная группа</div>
                            <div className="text-xl text-gray-300">{controlRegion.name}</div>
                            <div className="text-xs text-gray-500">Объем: {new Intl.NumberFormat('ru-RU').format(controlRegion.volume)}</div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-400">Similarity Score</span>
                                <span className="text-emerald-400 font-mono font-bold">
                                    {controlRegion.similarity?.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-indigo-900/20 border border-indigo-500/20 p-5 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUpIcon small />
                            <h4 className="text-indigo-300 font-bold">Цель (План)</h4>
                        </div>
                        <div className="text-3xl font-bold text-white mb-1">+{projectedLift.toFixed(1)}%</div>
                        <p className="text-xs text-indigo-200">
                            Плановый прирост (Lift) к концу периода.
                        </p>
                    </div>
                </div>

                {/* Chart */}
                <div className="lg:col-span-2 bg-gray-900/50 backdrop-blur-xl border border-gray-700 rounded-xl p-6 flex flex-col">
                    <h4 className="font-bold text-white mb-4">Моделирование эффекта (Projection)</h4>
                    <div className="relative w-full flex-grow min-h-[300px]">
                        <canvas ref={chartRef} />
                    </div>
                </div>
            </div>
        </div>
    );
}


const AgileLearning: React.FC<AgileLearningProps> = ({ data }) => {
    const [selectedRegion, setSelectedRegion] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeExperiment, setActiveExperiment] = useState<{ test: RegionMetric, control: RegionMetric } | null>(null);
    
    // Extract unique regions and calculate their metrics for matching
    const regionMetrics = useMemo<RegionMetric[]>(() => {
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
        const result: RegionMetric[] = [];
        metricsMap.forEach((val, key) => {
            // Calculate growth relative to VOLUME (Fact).
            // Formula: (Absolute Growth / Fact) * 100
            const growthPct = val.volume > 0 ? (val.growth / val.volume) * 100 : (val.growth > 0 ? 100 : 0);
            result.push({ name: key, volume: val.volume, growth: growthPct, potential: val.potential });
        });
        
        // Sort by Volume DESC by default for better visibility of important regions
        return result.sort((a, b) => b.volume - a.volume);
    }, [data]);

    const maxVolume = useMemo(() => regionMetrics.length > 0 ? Math.max(...regionMetrics.map(r => r.volume)) : 0, [regionMetrics]);

    const filteredRegions = useMemo(() => {
        return regionMetrics.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [regionMetrics, searchTerm]);

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
            .sort((a, b) => (b.similarity || 0) - (a.similarity || 0)) // Highest score first
            .slice(0, 3);
    }, [selectedRegion, regionMetrics, maxVolume]);

    const handleStartTest = () => {
        if (!selectedRegion || controlCandidates.length === 0) return;
        
        setIsSimulating(true);
        
        // Simulate processing time
        setTimeout(() => {
            const target = regionMetrics.find(r => r.name === selectedRegion);
            if (target) {
                setActiveExperiment({
                    test: target,
                    control: controlCandidates[0] // Pick the best match
                });
            }
            setIsSimulating(false);
        }, 1500);
    };

    if (data.length === 0) {
        return <div className="text-center text-gray-500 mt-20">Пожалуйста, сначала загрузите данные в модуле ADAPTA.</div>;
    }

    // --- RENDER ACTIVE EXPERIMENT VIEW ---
    if (activeExperiment) {
        return (
            <>
                <div className="flex justify-between items-end border-b border-gray-800 pb-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white">AGILE LEARNING <span className="text-gray-500 font-normal text-lg">/ Мониторинг</span></h2>
                    </div>
                    <button 
                        onClick={() => setActiveExperiment(null)} 
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeftIcon /> Назад к настройке
                    </button>
                </div>
                <ActiveExperimentView 
                    testRegion={activeExperiment.test} 
                    controlRegion={activeExperiment.control} 
                    onReset={() => setActiveExperiment(null)}
                />
            </>
        );
    }

    // --- RENDER SETUP VIEW ---
    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">AGILE LEARNING <span className="text-gray-500 font-normal text-lg">/ Эксперименты</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Научный подбор контрольных групп (Nearest Neighbor Matching) для A/B тестирования.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Setup - Full List Selector */}
                <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-6 flex flex-col h-[600px]">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 flex-shrink-0">
                        <LabIcon small /> Выберите Тестовый Регион
                    </h3>
                    
                    <div className="relative mb-4 flex-shrink-0">
                        <input 
                            type="text" 
                            placeholder="Поиск региона..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-white placeholder-gray-500"
                        />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                            <SearchIcon />
                        </div>
                    </div>

                    <div className="flex-grow overflow-y-auto custom-scrollbar border border-gray-700 rounded-xl bg-gray-800/30">
                        {filteredRegions.length > 0 ? (
                            <div className="divide-y divide-gray-700">
                                {filteredRegions.map((r) => (
                                    <div 
                                        key={r.name}
                                        onClick={() => !isSimulating && setSelectedRegion(r.name)}
                                        className={`p-4 cursor-pointer transition-all duration-200 flex justify-between items-center ${
                                            selectedRegion === r.name 
                                                ? 'bg-indigo-600/20 border-l-4 border-indigo-500' 
                                                : 'hover:bg-white/5 border-l-4 border-transparent'
                                        }`}
                                    >
                                        <div>
                                            <div className={`font-medium ${selectedRegion === r.name ? 'text-white' : 'text-gray-300'}`}>{r.name}</div>
                                            <div className="text-xs text-gray-500">Объем: {new Intl.NumberFormat('ru-RU', { notation: "compact", maximumFractionDigits: 1 }).format(r.volume)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-sm font-mono font-bold ${r.growth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {r.growth >= 0 ? '+' : ''}{r.growth.toFixed(1)}%
                                            </div>
                                            <div className="text-[10px] text-gray-600">рост</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 p-4">
                                <p>Ничего не найдено</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-700 flex-shrink-0">
                        <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
                            <div className="text-xs text-indigo-300 uppercase font-bold mb-2">Параметры методики</div>
                            <div className="flex justify-between text-sm text-gray-300 mb-1">
                                <span>Метрика успеха:</span> <span className="text-white">Прирост продаж (Lift)</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-300 mb-1">
                                <span>Min. Detectable Effect:</span> <span className="text-white">~3.5%</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-300">
                                <span>Алгоритм:</span> <span className="text-emerald-400">Euclidean Distance</span>
                            </div>
                        </div>
                    </div>
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
                            <div key={c.name} className={`bg-gray-800/40 border ${idx === 0 ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-gray-700'} p-4 rounded-xl flex justify-between items-center hover:bg-gray-800 transition-colors cursor-pointer group`}>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded transition-colors ${idx === 0 ? 'bg-emerald-500 text-white' : 'bg-gray-700 text-gray-300'}`}>{idx + 1}</span>
                                        <span className="font-bold text-white">{c.name}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                                        <span>Объем: {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(c.volume)}</span>
                                        <span>Потенциал: {new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(c.potential)}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-2xl font-bold ${(c.similarity || 0) > 90 ? 'text-emerald-400' : (c.similarity || 0) > 75 ? 'text-indigo-400' : 'text-amber-400'}`}>
                                        {(c.similarity || 0).toFixed(1)}%
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase">Сходство</div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-gray-600 border-2 border-dashed border-gray-800 rounded-xl h-[200px] flex items-center justify-center">
                            Выберите тестовый регион в списке слева
                        </div>
                    )}

                    {selectedRegion && controlCandidates.length > 0 && (
                        <button 
                            onClick={handleStartTest}
                            disabled={isSimulating}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-gray-400 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-900/20 mt-4 flex items-center justify-center gap-2"
                        >
                            {isSimulating ? (
                                <>
                                    <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                                    Подбор пар...
                                </>
                            ) : (
                                'Сформировать пары и запустить тест'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgileLearning;
