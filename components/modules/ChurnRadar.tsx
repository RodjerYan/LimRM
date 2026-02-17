
import React from 'react';
import { ChurnMetric } from '../../types';
import { AlertIcon, InfoIcon, SearchIcon, TrashIcon, CalendarIcon } from '../icons';

interface ChurnRadarProps {
    metrics: ChurnMetric[];
    onClientClick: (clientId: string) => void;
    // Task management
    onDelete?: (item: ChurnMetric) => void;
    onSnooze?: (item: ChurnMetric) => void;
}

const ChurnRadar: React.FC<ChurnRadarProps> = ({ metrics, onClientClick, onDelete, onSnooze }) => {
    if (metrics.length === 0) {
        return (
            <div className="p-10 text-center bg-white rounded-3xl border border-slate-200">
                <div className="text-emerald-500 mb-2 flex justify-center"><InfoIcon /></div>
                <h3 className="text-lg font-bold text-slate-900">Рисков не обнаружено</h3>
                <p className="text-slate-500 text-sm">Алгоритм не нашел клиентов с признаками оттока в текущих данных.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <AlertIcon className="text-red-500" /> Churn Radar
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Клиенты в зоне риска (Silence Trigger & Volume Drop)</p>
                </div>
                <div className="flex gap-2">
                    <div className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold border border-red-200">
                        Critical: {metrics.filter(m => m.riskLevel === 'Critical').length}
                    </div>
                    <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold border border-amber-200">
                        High: {metrics.filter(m => m.riskLevel === 'High').length}
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3">Клиент / Адрес</th>
                            <th className="px-6 py-3">Риск</th>
                            <th className="px-6 py-3 text-right">Дней без заказа</th>
                            <th className="px-6 py-3 text-right">Падение объема</th>
                            <th className="px-6 py-3 text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {metrics.map((m) => (
                            <tr key={m.clientId} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-900 cursor-pointer hover:text-indigo-600" onClick={() => onClientClick(m.clientId)}>{m.clientName}</div>
                                    <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{m.address}</div>
                                    <div className="text-[10px] text-slate-400 mt-1">РМ: {m.rm}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                        m.riskLevel === 'Critical' ? 'bg-red-50 text-red-700 border-red-200' :
                                        m.riskLevel === 'High' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                        'bg-yellow-50 text-yellow-700 border-yellow-200'
                                    }`}>
                                        {m.riskLevel} ({Math.round(m.riskScore)})
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="font-mono text-slate-900 font-bold">{m.daysSinceLastOrder}</div>
                                    <div className="text-[10px] text-slate-400">ср. {m.avgOrderGap}</div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className={`font-mono font-bold ${m.volumeDropPct > 30 ? 'text-red-600' : 'text-slate-600'}`}>
                                        -{m.volumeDropPct}%
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-1">
                                        <button 
                                            onClick={() => onClientClick(m.clientId)}
                                            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-all shadow-sm"
                                            title="Перейти к клиенту"
                                        >
                                            <SearchIcon small />
                                        </button>
                                        {onSnooze && (
                                            <button 
                                                onClick={() => onSnooze(m)}
                                                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all shadow-sm"
                                                title="Отложить напоминание"
                                            >
                                                <CalendarIcon small />
                                            </button>
                                        )}
                                        {onDelete && (
                                            <button 
                                                onClick={() => onDelete(m)}
                                                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 transition-all shadow-sm"
                                                title="Удалить из списка рисков"
                                            >
                                                <TrashIcon small />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ChurnRadar;
