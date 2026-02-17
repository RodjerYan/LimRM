
import React, { useState } from 'react';
import { SuggestedAction, ActionType } from '../../types';
import { AlertIcon, TrendingUpIcon, TargetIcon, WarningIcon, CheckIcon, TrashIcon, CalendarIcon } from '../icons';
import Modal from '../Modal';

interface NBAPanelProps {
    actions: SuggestedAction[];
    onActionClick: (action: SuggestedAction) => void;
    // New props for task management
    onDelete?: (action: SuggestedAction) => void;
    onSnooze?: (action: SuggestedAction) => void;
}

const ActionCard: React.FC<{ 
    action: SuggestedAction; 
    onClick: () => void;
    onDelete?: () => void;
    onSnooze?: () => void;
}> = ({ action, onClick, onDelete, onSnooze }) => {
    const config: Record<ActionType, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
        churn: { icon: <AlertIcon small />, color: 'text-red-600', bg: 'bg-red-50 border-red-100', label: 'Риск Оттока' },
        activation: { icon: <TargetIcon small />, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', label: 'Активация' },
        growth: { icon: <TrendingUpIcon small />, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', label: 'Рост' },
        data_fix: { icon: <WarningIcon small />, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', label: 'Данные' }
    };

    const style = config[action.type];

    return (
        <div className={`rounded-2xl border ${style.bg} hover:shadow-md transition-all relative group h-full flex flex-col`}>
            {/* Action Buttons overlay on hover */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {onSnooze && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onSnooze(); }}
                        className="p-1.5 bg-white rounded-lg border border-slate-200 text-indigo-500 hover:text-indigo-700 hover:border-indigo-300 shadow-sm"
                        title="Отложить"
                    >
                        <CalendarIcon small />
                    </button>
                )}
                {onDelete && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="p-1.5 bg-white rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 shadow-sm"
                        title="Удалить / В архив"
                    >
                        <TrashIcon small />
                    </button>
                )}
            </div>

            <div className="p-4 cursor-pointer flex-grow flex flex-col" onClick={onClick}>
                <div className="flex justify-between items-start mb-2">
                    <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${style.color}`}>
                        {style.icon} {style.label}
                    </div>
                    <div className="text-[10px] font-black text-slate-400 bg-white/50 px-2 py-1 rounded-lg">
                        Score: {Math.round(action.priorityScore)}
                    </div>
                </div>
                
                <div className="mb-3 flex-grow">
                    <h4 className="text-sm font-bold text-slate-900 truncate" title={action.clientName}>{action.clientName}</h4>
                    <p className="text-xs text-slate-500 truncate">{action.address}</p>
                    <div className="text-[10px] text-slate-400 mt-0.5">РМ: {action.rm}</div>
                </div>

                <div className="bg-white/60 p-2 rounded-lg text-xs text-slate-700 mb-2">
                    <strong>Причина:</strong> {action.reason}
                </div>
                
                <div className={`text-xs font-bold ${style.color} flex items-center gap-1 group-hover:underline mt-auto`}>
                    Действие: {action.recommendedStep}
                </div>
            </div>
        </div>
    );
};

const NBAPanel: React.FC<NBAPanelProps> = ({ actions, onActionClick, onDelete, onSnooze }) => {
    const [showAll, setShowAll] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-r from-rose-500 to-orange-500 rounded-xl text-white shadow-lg shadow-rose-500/30">
                    <TargetIcon />
                </div>
                <div>
                    <h3 className="text-lg font-black text-slate-900">Next Best Actions</h3>
                    <p className="text-xs text-slate-500">Алгоритмические рекомендации на сегодня</p>
                </div>
                
                <button 
                    onClick={() => setShowAll(true)}
                    disabled={actions.length === 0}
                    className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 px-4 py-1.5 rounded-full transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {actions.length} задач
                    {actions.length > 0 && <span className="text-slate-400">↗</span>}
                </button>
            </div>

            {actions.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="flex justify-center text-emerald-500 mb-2"><CheckIcon /></div>
                    <p className="text-sm font-bold text-slate-700">Отличная работа!</p>
                    <p className="text-xs text-slate-500">Критических задач на сегодня нет.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {actions.slice(0, 6).map(action => (
                        <ActionCard 
                            key={action.clientId + action.type} 
                            action={action} 
                            onClick={() => onActionClick(action)}
                            onDelete={onDelete ? () => onDelete(action) : undefined}
                            onSnooze={onSnooze ? () => onSnooze(action) : undefined}
                        />
                    ))}
                </div>
            )}

            <Modal
                isOpen={showAll}
                onClose={() => setShowAll(false)}
                title={`Все рекомендации (${actions.length})`}
                maxWidth="max-w-7xl"
            >
                <div className="p-4 bg-slate-50/50 min-h-[50vh]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {actions.map((action, idx) => (
                            <ActionCard 
                                key={action.clientId + action.type + idx} 
                                action={action} 
                                onClick={() => {
                                    setShowAll(false);
                                    onActionClick(action);
                                }}
                                onDelete={onDelete ? () => onDelete(action) : undefined}
                                onSnooze={onSnooze ? () => onSnooze(action) : undefined}
                            />
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default NBAPanel;
