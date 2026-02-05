
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Chart from 'chart.js/auto';
import { AggregatedDataRow } from '../../types';
import { ProphetIcon, TrendingUpIcon, WaterfallIcon, CalculatorIcon, InfoIcon, SearchIcon } from '../icons';
import { generateSeasonalitySeries } from '../../utils/analytics';

interface ProphetProps {
    data: AggregatedDataRow[];
}

// --- CONSTANTS ---
// Elasticity: For every 1% price increase, volume drops by 1.2%
const PRICE_ELASTICITY = -1.2; 
// Marketing ROI: For every 10% budget increase, revenue grows by 6%
const MARKETING_ROI = 0.6; 
// Distribution: For every 1% coverage growth, revenue grows by 0.8%
const DISTRIBUTION_FACTOR = 0.8;
// Promo Lift: For every 1% discount, volume grows by 1.5% (short term)
const PROMO_ELASTICITY = 1.5;

// ... (DriverCard and ScopeSelector components remain same) ...
const DriverCard: React.FC<{
    title: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (val: number) => void;
    impact: number;
    formulaDescription: string;
    metricLabel: string;
    colorClass: string;
    tooltip: string;
}> = ({ title, value, min, max, step, onChange, impact, formulaDescription, metricLabel, colorClass, tooltip }) => (
    <div className="bg-gray-800/40 border border-gray-700 p-4 rounded-xl flex flex-col h-full relative overflow-hidden group">
        <div className={`absolute top-0 left-0 w-1 h-full ${colorClass} opacity-50`}></div>
        <div className="flex justify-between items-start mb-3">
            <div>
                <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-200 text-xs uppercase tracking-wide">{title}</h4>
                    <div className="text-gray-500 cursor-help" title={tooltip}>
                        <InfoIcon small />
                    </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight max-w-[150px]">{formulaDescription}</p>
            </div>
            <div className={`text-right font-mono font-bold text-sm ${impact >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {impact > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU', { notation: "compact", maximumFractionDigits: 1 }).format(impact)}
            </div>
        </div>
        <div className="flex-grow flex flex-col justify-center">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{min}{metricLabel}</span>
                <span className="text-white font-bold">{value > 0 ? '+' : ''}{value}{metricLabel}</span>
                <span>{max}{metricLabel}</span>
            </div>
            <input 
                type="range" min={min} max={max} step={step} 
                value={value} onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
        </div>
    </div>
);

const ScopeSelector: React.FC<{
    data: AggregatedDataRow[];
    selectedRMs: Set<string>;
    selectedRegions: Set<string>;
    selectedPackagings: Set<string>;
    onToggleRM: (rm: string) => void;
    onToggleRegion: (region: string) => void;
    onTogglePackaging: (pack: string) => void;
    onReset: () => void;
}> = ({ data, selectedRMs, selectedRegions, selectedPackagings, onToggleRM, onToggleRegion, onTogglePackaging, onReset }) => {
    // Derived Options
    const rms = useMemo(() => Array.from(new Set(data.map(d => d.rm))).sort(), [data]);
    const availableRegions = useMemo(() => {
        return Array.from(new Set(
            data.filter(d => selectedRMs.size === 0 || selectedRMs.has(d.rm))
                .map(d => d.region)
        )).sort();
    }, [data, selectedRMs]);
    const availablePackagings = useMemo(() => {
        return Array.from(new Set(
            data.filter(d => 
                (selectedRMs.size === 0 || selectedRMs.has(d.rm)) &&
                (selectedRegions.size === 0 || selectedRegions.has(d.region))
            ).map(d => `${d.brand} ${d.packaging}`)
        )).sort();
    }, [data, selectedRMs, selectedRegions]);

    return (
        <div className="bg-gray-900/50 border border-gray-700 rounded-2xl p-4 flex flex-col h-[700px]">
            <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-3">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                    <SearchIcon small/> Настройка Контекста
                </h3>
                <button onClick={onReset} className="text-xs text-indigo-400 hover:text-white transition-colors">Сброс</button>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar space-y-6 pr-2">
                <div><h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">Региональные Менеджеры</h4><div className="space-y-1">{rms.map(rm => (<label key={rm} className="flex items-center p-2 rounded hover:bg-gray-800 cursor-pointer transition-colors group"><input type="checkbox" checked={selectedRMs.has(rm)} onChange={() => onToggleRM(rm)} className="rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-offset-0 focus:ring-1 focus:ring-indigo-500" /><span className={`ml-2 text-sm ${selectedRMs.has(rm) ? 'text-white font-medium' : 'text-gray-400 group-hover:text-gray-300'}`}>{rm}</span></label>))}</div></div>
                <div><h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">Регионы ({availableRegions.length})</h4><div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">{availableRegions.map(reg => (<label key={reg} className="flex items-center p-2 rounded hover:bg-gray-800 cursor-pointer transition-colors group"><input type="checkbox" checked={selectedRegions.has(reg)} onChange={() => onToggleRegion(reg)} className="rounded border-gray-600 bg-gray-900 text-emerald-500 focus:ring-offset-0 focus:ring-1 focus:ring-emerald-500" /><span className={`ml-2 text-sm truncate ${selectedRegions.has(reg) ? 'text-white font-medium' : 'text-gray-400 group-hover:text-gray-300'}`}>{reg}</span></label>))}</div></div>
                <div><h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">Фасовки (SKU) ({availablePackagings.length})</h4><div className="space-y-1">{availablePackagings.map(pack => (<label key={pack} className="flex items-center p-2 rounded hover:bg-gray-800 cursor-pointer transition-colors group"><input type="checkbox" checked={selectedPackagings.has(pack)} onChange={() => onTogglePackaging(pack)} className="rounded border-gray-600 bg-gray-900 text-amber-500 focus:ring-offset-0 focus:ring-1 focus:ring-amber-500" /><span className={`ml-2 text-sm ${selectedPackagings.has(pack) ? 'text-white font-medium' : 'text-gray-400 group-hover:text-gray-300'}`}>{pack}</span></label>))}</div></div>
            </div>
        </div>
    );
};

const Prophet: React.FC<ProphetProps> = ({ data }) => {
    // --- State ---
    const [marketingSpend, setMarketingSpend] = useState(0); 
    const [priceChange, setPriceChange] = useState(0); 
    const [distributionGrowth, setDistributionGrowth] = useState(5);
    const [promoDepth, setPromoDepth] = useState(0); // Idea 9

    const [selectedRMs, setSelectedRMs] = useState<Set<string>>(new Set());
    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [selectedPackagings, setSelectedPackagings] = useState<Set<string>>(new Set());

    const waterfallRef = useRef<HTMLCanvasElement>(null);
    const timeSeriesRef = useRef<HTMLCanvasElement>(null);
    const waterfallInstance = useRef<Chart | null>(null);
    const timeSeriesInstance = useRef<Chart | null>(null);

    // --- Calculation Logic ---
    const activeData = useMemo(() => {
        return data.filter(item => {
            const rmOk = selectedRMs.size === 0 || selectedRMs.has(item.rm);
            const regOk = selectedRegions.size === 0 || selectedRegions.has(item.region);
            const itemComposite = `${item.brand} ${item.packaging}`;
            const packOk = selectedPackagings.size === 0 || selectedPackagings.has(itemComposite);
            return rmOk && regOk && packOk;
        });
    }, [data, selectedRMs, selectedRegions, selectedPackagings]);

    const baseRevenue = useMemo(() => activeData.reduce((sum, item) => sum + item.fact, 0), [activeData]);
    const totalCompanyRevenue = useMemo(() => data.reduce((sum, item) => sum + item.fact, 0), [data]);
    const coveragePercent = totalCompanyRevenue > 0 ? (baseRevenue / totalCompanyRevenue) * 100 : 0;

    // 2. Calculate Impacts
    const priceEffectAbs = useMemo(() => {
        const volChangePct = (priceChange / 100) * PRICE_ELASTICITY;
        const newVol = baseRevenue * (1 + volChangePct);
        const newRevenue = newVol * (1 + priceChange / 100);
        return newRevenue - baseRevenue;
    }, [baseRevenue, priceChange]);

    const marketingEffectAbs = useMemo(() => baseRevenue * (marketingSpend / 100) * MARKETING_ROI, [baseRevenue, marketingSpend]);
    const distEffectAbs = useMemo(() => baseRevenue * (distributionGrowth / 100) * DISTRIBUTION_FACTOR, [baseRevenue, distributionGrowth]);
    
    // Idea 9: Promo Lift
    const promoEffectAbs = useMemo(() => baseRevenue * (promoDepth / 100) * PROMO_ELASTICITY, [baseRevenue, promoDepth]);

    const scenarioResult = baseRevenue + priceEffectAbs + marketingEffectAbs + distEffectAbs + promoEffectAbs;
    const absGrowth = scenarioResult - baseRevenue;
    const pctChange = baseRevenue > 0 ? (absGrowth / baseRevenue) * 100 : 0;

    // 3. Generate Time Series
    const historicalData = useMemo(() => generateSeasonalitySeries(baseRevenue, 0), [baseRevenue]);
    const forecastData = useMemo(() => generateSeasonalitySeries(scenarioResult, 0), [scenarioResult]);

    // --- Chart Rendering ---
    useEffect(() => {
        if (!waterfallRef.current) return;
        const ctx = waterfallRef.current.getContext('2d');
        if (!ctx) return;
        if (waterfallInstance.current) waterfallInstance.current.destroy();

        waterfallInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['База', 'Цена', 'Маркетинг', 'Дистриб.', 'Промо', 'Прогноз'],
                datasets: [{
                    data: [baseRevenue, priceEffectAbs, marketingEffectAbs, distEffectAbs, promoEffectAbs, scenarioResult],
                    backgroundColor: (ctx) => {
                        const idx = ctx.dataIndex;
                        if (idx === 0 || idx === 5) return 'rgba(99, 102, 241, 0.8)';
                        return (ctx.raw as number) >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                    },
                    borderRadius: 4,
                }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(17, 24, 39, 0.95)', padding: 10, callbacks: { label: (ctx) => { let val = ctx.raw as number; return `${ctx.label}: ${val > 0 && ctx.dataIndex !==0 && ctx.dataIndex !==5 ? '+' : ''}${new Intl.NumberFormat('ru-RU').format(Math.round(val))}`; } } } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', callback: (v) => new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(Number(v)) } }, y: { grid: { display: false }, ticks: { color: '#e5e7eb', font: { size: 10 } } } } }
        });
        return () => { if (waterfallInstance.current) waterfallInstance.current.destroy(); };
    }, [baseRevenue, priceEffectAbs, marketingEffectAbs, distEffectAbs, promoEffectAbs, scenarioResult]);

    useEffect(() => {
        if (!timeSeriesRef.current) return;
        const ctx = timeSeriesRef.current.getContext('2d');
        if (!ctx) return;
        if (timeSeriesInstance.current) timeSeriesInstance.current.destroy();
        const monthNames = ['Янв', 'Фев', 'Март', 'Апр', 'Май', 'Июнь', 'Июль', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        const labels = [...monthNames, ...monthNames];
        const d1 = [...historicalData, ...Array(12).fill(null)];
        const d2 = [...Array(12).fill(null), ...forecastData];
        timeSeriesInstance.current = new Chart(ctx, { type: 'line', data: { labels, datasets: [ { label: 'Факт 2025', data: d1, borderColor: '#9ca3af', backgroundColor: 'rgba(156, 163, 175, 0.1)', fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 5 }, { label: 'Прогноз 2026', data: d2, borderColor: '#818cf8', backgroundColor: 'rgba(129, 140, 248, 0.1)', fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 5, borderDash: [5, 5] } ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, labels: { color: '#9ca3af', font: { size: 10 } } }, tooltip: { enabled: true, backgroundColor: 'rgba(17, 24, 39, 0.95)', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10, callbacks: { label: (context) => { const val = context.raw as number; if (val === null || val === undefined) return ''; return `${context.dataset.label}: ${new Intl.NumberFormat('ru-RU').format(Math.round(val))}`; } } } }, scales: { y: { display: false }, x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10 }, maxRotation: 0, callback: function(val, index) { return index % 3 === 0 ? this.getLabelForValue(Number(val)) : ''; } } } } } });
        return () => { if (timeSeriesInstance.current) timeSeriesInstance.current.destroy(); };
    }, [historicalData, forecastData]);

    const toggleSet = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => { const newSet = new Set(set); if (newSet.has(val)) newSet.delete(val); else newSet.add(val); setter(newSet); };
    const handleReset = () => { setSelectedRMs(new Set()); setSelectedRegions(new Set()); setSelectedPackagings(new Set()); setPriceChange(0); setMarketingSpend(0); setDistributionGrowth(5); setPromoDepth(0); };

    if (data.length === 0) return <div className="text-center text-gray-500 mt-20">Нет данных для моделирования.</div>;
    const noSelection = selectedRMs.size === 0 && selectedRegions.size === 0 && selectedPackagings.size === 0;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4"><div><h2 className="text-2xl font-bold text-white">PROPHET <span className="text-gray-500 font-normal text-lg">/ Сценарное Моделирование</span></h2><p className="text-gray-400 text-sm mt-1">Инструмент тактического планирования "What-If". Выберите сегмент слева для расчета.</p></div><div className="bg-gray-800 px-3 py-1 rounded-lg text-xs text-gray-400 border border-gray-700">Охват модели: <span className="text-white font-bold">{coveragePercent.toFixed(1)}%</span> от общего объема</div></div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1"><ScopeSelector data={data} selectedRMs={selectedRMs} selectedRegions={selectedRegions} selectedPackagings={selectedPackagings} onToggleRM={(val) => toggleSet(selectedRMs, val, setSelectedRMs)} onToggleRegion={(val) => toggleSet(selectedRegions, val, setSelectedRegions)} onTogglePackaging={(val) => toggleSet(selectedPackagings, val, setSelectedPackagings)} onReset={handleReset} /></div>
                <div className="lg:col-span-3 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-900/50 border border-gray-700 p-4 rounded-2xl"><div className="text-gray-400 text-[10px] font-bold uppercase mb-1">База (Выбранный сегмент)</div><div className="text-2xl font-mono text-gray-200 font-bold">{new Intl.NumberFormat('ru-RU').format(Math.round(baseRevenue))}</div></div>
                        <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-2xl relative overflow-hidden"><div className="text-indigo-300 text-[10px] font-bold uppercase mb-1">Прогноз</div><div className="text-2xl font-mono text-white font-bold">{new Intl.NumberFormat('ru-RU').format(Math.round(scenarioResult))}</div><div className="absolute right-3 top-3 opacity-20"><ProphetIcon /></div></div>
                        <div className="bg-gray-900/50 border border-gray-700 p-4 rounded-2xl flex items-center justify-between"><div><div className="text-gray-400 text-[10px] font-bold uppercase mb-1">Delta</div><div className={`text-2xl font-mono font-bold ${absGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{absGrowth > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU', { notation: "compact" }).format(Math.round(absGrowth))}</div></div><div className={`text-sm font-bold ${pctChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{pctChange > 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}%</div></div>
                    </div>
                    {/* Updated Drivers Layout: 2x2 Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <DriverCard title="Цена" metricLabel="%" min={-20} max={20} step={1} value={priceChange} onChange={setPriceChange} impact={priceEffectAbs} formulaDescription="Эластичность: -1.2" colorClass="bg-amber-500" tooltip="Изменение цены на 1% меняет объем продаж на -1.2% (обратная зависимость)." />
                        <DriverCard title="Маркетинг" metricLabel="%" min={-50} max={50} step={5} value={marketingSpend} onChange={setMarketingSpend} impact={marketingEffectAbs} formulaDescription="ROI: 0.6" colorClass="bg-blue-500" tooltip="Каждые 10% бюджета дают 6% прироста выручки." />
                        <DriverCard title="Дистрибуция" metricLabel="%" min={0} max={20} step={1} value={distributionGrowth} onChange={setDistributionGrowth} impact={distEffectAbs} formulaDescription="Конверсия: 0.8" colorClass="bg-emerald-500" tooltip="Расширение покрытия на 1% дает 0.8% к продажам." />
                        <DriverCard title="Промо Скидка" metricLabel="%" min={0} max={30} step={5} value={promoDepth} onChange={setPromoDepth} impact={promoEffectAbs} formulaDescription="Lift: 1.5" colorClass="bg-purple-500" tooltip="Промо-акции дают краткосрочный прирост (Эластичность 1.5)." />
                    </div>
                    {baseRevenue === 0 && noSelection ? (<div className="bg-gray-800/30 border border-gray-700/50 rounded-2xl p-10 flex flex-col items-center justify-center text-center h-[320px]"><div className="text-indigo-400 mb-2"><InfoIcon /></div><h4 className="text-gray-200 font-bold mb-1">Данные не выбраны</h4><p className="text-gray-500 text-sm max-w-md">Используйте меню слева, чтобы выбрать Регионального Менеджера, Регион или Фасовку для моделирования.</p></div>) : (<div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[320px]"><div className="bg-gray-900/50 border border-gray-700 rounded-2xl p-4 flex flex-col"><h4 className="text-xs font-bold text-gray-300 mb-2 flex gap-2"><WaterfallIcon small /> Факторный анализ</h4><div className="relative w-full flex-grow"><canvas ref={waterfallRef} /></div></div><div className="bg-gray-900/50 border border-gray-700 rounded-2xl p-4 flex flex-col"><h4 className="text-xs font-bold text-gray-300 mb-2 flex gap-2"><TrendingUpIcon small /> Тренд (Сезонность)</h4><div className="relative w-full flex-grow"><canvas ref={timeSeriesRef} /></div></div></div>)}
                    <div className="bg-indigo-900/10 border border-indigo-500/20 p-3 rounded-xl flex items-start gap-3"><div className="mt-0.5 text-indigo-400 w-4 h-4 flex-shrink-0"><InfoIcon /></div><div className="text-[10px] text-indigo-300 leading-relaxed"><strong>Методология:</strong> Расчет ведется только по выбранному сегменту ({selectedRMs.size || 'Все'} РМ, {selectedRegions.size || 'Все'} Регионы). Наведите на значок (i) в карточках управления, чтобы узнать подробности расчета формул.</div></div>
                </div>
            </div>
        </div>
    );
};

export default Prophet;
