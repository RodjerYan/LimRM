
import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import { ProcessedTask } from '../types';
import { TrashIcon, CalendarIcon, RefreshIcon, CheckIcon, LoaderIcon } from './icons';

interface TaskActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'action' | 'history';
    targetItem?: { id: string; name: string }; // Needed for 'action' mode
    onConfirmAction: (type: 'delete' | 'snooze', reason: string, snoozeDate?: string) => void;
    onRestore: (taskId: string) => void;
    history: ProcessedTask[];
}

const TaskActionModal: React.FC<TaskActionModalProps> = ({ 
    isOpen, onClose, mode, targetItem, onConfirmAction, onRestore, history 
}) => {
    const [actionType, setActionType] = useState<'delete' | 'snooze'>('delete');
    const [reason, setReason] = useState('');
    const [snoozeDate, setSnoozeDate] = useState('');
    
    // Calculate default snooze (1 month)
    const defaultSnooze = useMemo(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d.toISOString().split('T')[0];
    }, []);

    // Filter history to show only active (deleted/snoozed) items that can be restored
    const activeHistory = useMemo(() => {
        const now = Date.now();
        return history.filter(h => {
             if (h.type === 'delete') return true; // Deleted items visible until deadline
             if (h.type === 'snooze' && h.snoozeUntil && h.snoozeUntil > now) return true; // Snoozed items visible until wakeup
             return false;
        }).sort((a,b) => b.timestamp - a.timestamp);
    }, [history]);

    const handleSubmit = () => {
        if (!reason.trim()) {
            alert("Пожалуйста, укажите причину.");
            return;
        }
        if (actionType === 'snooze' && !snoozeDate) {
            alert("Выберите дату напоминания.");
            return;
        }
        onConfirmAction(actionType, reason, actionType === 'snooze' ? snoozeDate : undefined);
        onClose();
        setReason('');
    };

    if (mode === 'action' && targetItem) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title={`Действие с задачей: ${targetItem.name}`} maxWidth="max-w-lg">
                <div className="space-y-6">
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                        <button 
                            onClick={() => setActionType('delete')}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${actionType === 'delete' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Удалить (В архив)
                        </button>
                        <button 
                            onClick={() => { setActionType('snooze'); setSnoozeDate(defaultSnooze); }}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${actionType === 'snooze' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Перенести (Snooze)
                        </button>
                    </div>

                    {actionType === 'delete' ? (
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                            <div className="flex items-center gap-2 text-red-700 font-bold mb-2">
                                <TrashIcon small /> Удаление задачи
                            </div>
                            <p className="text-xs text-red-600 mb-4">
                                Карточка будет скрыта. Вы сможете восстановить её в разделе "Отработанные" в течение 30 дней.
                                После этого данные будут удалены автоматически.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                            <div className="flex items-center gap-2 text-indigo-700 font-bold mb-2">
                                <CalendarIcon small /> Перенос напоминания
                            </div>
                            <p className="text-xs text-indigo-600 mb-3">
                                Карточка будет скрыта до указанной даты.
                            </p>
                            <label className="block text-xs font-bold text-indigo-800 mb-1">Напомнить:</label>
                            <input 
                                type="date" 
                                value={snoozeDate} 
                                onChange={(e) => setSnoozeDate(e.target.value)}
                                className="w-full p-2 border border-indigo-200 rounded-lg text-sm bg-white"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                            Причина {actionType === 'delete' ? 'удаления' : 'переноса'} (Обязательно)
                        </label>
                        <textarea 
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={actionType === 'delete' ? "Например: Клиент закрылся / Данные неактуальны..." : "Например: Договорились созвониться через месяц..."}
                            className="w-full p-3 border border-slate-200 rounded-xl text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">Отмена</button>
                        <button 
                            onClick={handleSubmit} 
                            disabled={!reason.trim()}
                            className={`px-6 py-2 text-white rounded-xl font-bold text-sm shadow-lg transition-all ${actionType === 'delete' ? 'bg-red-600 hover:bg-red-500 shadow-red-500/30' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/30'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {actionType === 'delete' ? 'Удалить' : 'Перенести'}
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Отработанные задачи (${activeHistory.length})`} maxWidth="max-w-4xl">
            <div className="flex flex-col h-[70vh]">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex-shrink-0">
                    <p className="text-sm text-slate-600">
                        Здесь находятся удаленные (хранятся 30 дней) и отложенные задачи. Вы можете восстановить их в любой момент.
                    </p>
                </div>
                
                <div className="flex-grow overflow-y-auto custom-scrollbar p-4">
                    {activeHistory.length === 0 ? (
                        <div className="text-center py-10 text-slate-400">Список пуст</div>
                    ) : (
                        <div className="space-y-3">
                            {activeHistory.map(item => {
                                const isDeleted = item.type === 'delete';
                                const timeLeft = isDeleted && item.restoreDeadline 
                                    ? Math.max(0, Math.ceil((item.restoreDeadline - Date.now()) / (1000 * 60 * 60 * 24)))
                                    : null;

                                return (
                                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${isDeleted ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                    {isDeleted ? 'Удалено' : 'Отложено'}
                                                </span>
                                                <h4 className="font-bold text-slate-900 text-sm">{item.targetName}</h4>
                                            </div>
                                            <div className="text-xs text-slate-500 font-medium mb-2">
                                                {new Date(item.timestamp).toLocaleDateString()} • Автор: {item.user || 'Система'}
                                            </div>
                                            <div className="text-sm text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                                                "{item.reason}"
                                            </div>
                                            {isDeleted && timeLeft !== null && (
                                                <div className="text-[10px] text-orange-500 mt-2 font-bold">
                                                    До авто-удаления: {timeLeft} дн.
                                                </div>
                                            )}
                                            {!isDeleted && item.snoozeUntil && (
                                                <div className="text-[10px] text-indigo-500 mt-2 font-bold">
                                                    Напоминание сработает: {new Date(item.snoozeUntil).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center">
                                            <button 
                                                onClick={() => onRestore(item.id)}
                                                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
                                            >
                                                <RefreshIcon small /> Восстановить
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default TaskActionModal;
