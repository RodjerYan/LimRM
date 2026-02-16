
import React from 'react';
import { CoverageMetric } from '../../types';
import { DataIcon } from '../icons';

interface CoverageViewProps {
    metrics: CoverageMetric[];
}

const CoverageView: React.FC<CoverageViewProps> = ({ metrics }) => {
    return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-slate-200 bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <DataIcon className="text-indigo-600" /> Покрытие по Регионам (Coverage Gap)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Сравнение активной базы (АКБ) с общей емкостью (ОКБ)</p>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar p-6">
                <div className="grid grid-cols-1 gap-4">
                    {metrics.map((m) => (
                        <div key={m.region} className="relative bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-all">
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <div className="text-sm font-bold text-slate-900">{m.region}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        Активных: <strong>{m.activeCount}</strong> / ОКБ: <strong>{m.okbCount}</strong>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-mono font-black text-slate-900">{m.coveragePct.toFixed(1)}%</div>
                                    <div className="text-[10px] uppercase font-bold text-slate-400">Покрытие</div>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex relative">
                                <div 
                                    className={`h-full ${m.coveragePct > 70 ? 'bg-emerald-500' : m.coveragePct > 40 ? 'bg-amber-400' : 'bg-red-500'}`} 
                                    style={{ width: `${m.coveragePct}%` }}
                                ></div>
                                {/* Gap visualizer */}
                                <div className="h-full bg-indigo-50/50 flex-grow relative">
                                    {m.gap > 0 && (
                                        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-indigo-400 uppercase tracking-wider">
                                            Gap: {m.gap}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CoverageView;
