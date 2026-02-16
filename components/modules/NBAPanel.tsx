
import React, { useState } from 'react';
import { SuggestedAction, ActionType } from '../../types';
import { AlertIcon, TrendingUpIcon, TargetIcon, WarningIcon, CheckIcon } from '../icons';
import Modal from '../Modal';

interface NBAPanelProps {
    actions: SuggestedAction[];
    onActionClick: (action: SuggestedAction) => void;
}

const ActionCard: React.FC<{ action: SuggestedAction; onClick: () => void }> = ({ action, onClick }) => {
    const config: Record<ActionType, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
        churn: { icon: <AlertIcon small />, color: 'text-red-600', bg: 'bg-red-50 border-red-100', label: 'Риск Оттока' },
        activation: { icon: <TargetIcon small />, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', label: 'Активация' },
        growth: { icon: <TrendingUpIcon small />, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', label: 'Рост' },
        data_fix: { icon: <WarningIcon small />, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', label: 'Данные' }
    };

    const style = config[action.type];

    return (
        <div 
            onClick={onClick}
            className={`p-4 rounded-2xl border ${style.bg} hover:shadow-md transition-all cursor-pointer relative group h-full flex flex-col`}
        >
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
    );
};

const NBAPanel: React.FC<NBAPanelProps> = ({ actions, onActionClick }) => {
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
                            />
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default NBAPanel;
