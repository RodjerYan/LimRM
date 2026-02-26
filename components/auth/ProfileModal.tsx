
import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { useAuth } from './AuthContext';
import { LoaderIcon, CheckIcon, ErrorIcon, AlertIcon, TrashIcon, CalendarIcon, RefreshIcon } from '../icons';
import { useTaskManager } from '../../hooks/useTaskManager';
import SingleDatePicker from '../SingleDatePicker';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { user, token, refreshProfile, login } = useAuth();
    const { processedTasks, restoreTask, performAction, refreshTasks } = useTaskManager();
    
    const [activeTab, setActiveTab] = useState<'profile' | 'deleted' | 'snoozed'>('profile');

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
    });

    useEffect(() => {
        if (isOpen) {
            refreshTasks();
        }
    }, [isOpen, refreshTasks]);

    useEffect(() => {
        if (user && isOpen) {
            setFormData({
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                email: user.email || '',
                phone: user.phone || '',
                password: '',
                confirmPassword: ''
            });
            setError(null);
            setSuccess(false);
        }
    }, [user, isOpen]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (formData.password && formData.password !== formData.confirmPassword) {
            setError("Пароли не совпадают");
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch('/api/auth/update-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email,
                    phone: formData.phone,
                    password: formData.password || undefined
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.token) {
                    // Email changed, update token
                    login(data.token, data.user);
                } else {
                    await refreshProfile();
                }
                setSuccess(true);
                setTimeout(() => {
                    setSuccess(false);
                    onClose();
                }, 1500);
            } else {
                const data = await res.json();
                setError(data.error || "Ошибка при сохранении");
            }
        } catch (e) {
            setError("Сетевая ошибка");
        } finally {
            setIsSaving(false);
        }
    };

    const deletedTasks = useMemo(() => {
        return processedTasks.filter(t => t.type === 'delete').sort((a,b) => b.timestamp - a.timestamp);
    }, [processedTasks]);

    const snoozedTasks = useMemo(() => {
        return processedTasks.filter(t => t.type === 'snooze').sort((a,b) => b.timestamp - a.timestamp);
    }, [processedTasks]);

    // Snooze Edit State
    const [editingSnoozeId, setEditingSnoozeId] = useState<string | null>(null);
    const [editSnoozeDate, setEditSnoozeDate] = useState('');
    const [editSnoozeReason, setEditSnoozeReason] = useState('');

    const startEditSnooze = (item: any) => {
        setEditingSnoozeId(item.id);
        setEditSnoozeDate(item.snoozeUntil ? new Date(item.snoozeUntil).toISOString().split('T')[0] : '');
        setEditSnoozeReason(item.reason);
    };

    const saveEditSnooze = async (item: any) => {
        if (!editSnoozeDate || !editSnoozeReason.trim()) return;
        await restoreTask(item.id);
        await performAction(item.targetId, item.targetName, 'snooze', editSnoozeReason, item.owner || '', new Date(editSnoozeDate).getTime());
        setEditingSnoozeId(null);
        refreshTasks();
    };

    const handleDeleteSnoozed = async (item: any) => {
        await restoreTask(item.id);
        await performAction(item.targetId, item.targetName, 'delete', item.reason, item.owner || '');
        refreshTasks();
    };

    if (!user) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Профиль пользователя"
            maxWidth="max-w-4xl"
            footer={
                activeTab === 'profile' ? (
                    <div className="flex justify-end gap-3 w-full">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-2xl text-slate-600 hover:bg-slate-100 transition font-medium text-sm"
                        >
                            Отмена
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-2.5 px-8 rounded-2xl transition duration-200 shadow-lg shadow-indigo-200 active:scale-95 text-sm flex items-center gap-2"
                        >
                            {isSaving ? <LoaderIcon small /> : (success ? <CheckIcon small /> : null)}
                            {isSaving ? 'Сохранение...' : (success ? 'Сохранено' : 'Сохранить')}
                        </button>
                    </div>
                ) : undefined
            }
        >
            <div className="flex flex-col md:flex-row gap-6 h-[60vh]">
                {/* Sidebar */}
                <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-2 border-r border-slate-100 pr-4">
                    <button 
                        onClick={() => setActiveTab('profile')}
                        className={`text-left px-4 py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'profile' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        Мой профиль
                    </button>
                    <button 
                        onClick={() => setActiveTab('deleted')}
                        className={`text-left px-4 py-3 rounded-xl text-sm font-bold transition-colors flex justify-between items-center ${activeTab === 'deleted' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <span>Удаленные точки</span>
                        {deletedTasks.length > 0 && <span className="bg-white/50 px-2 py-0.5 rounded-md text-[10px]">{deletedTasks.length}</span>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('snoozed')}
                        className={`text-left px-4 py-3 rounded-xl text-sm font-bold transition-colors flex justify-between items-center ${activeTab === 'snoozed' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <span>Отложенные точки</span>
                        {snoozedTasks.length > 0 && <span className="bg-white/50 px-2 py-0.5 rounded-md text-[10px]">{snoozedTasks.length}</span>}
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
                    {activeTab === 'profile' && (
                        <form onSubmit={handleSave} className="space-y-5">
                            {error && (
                                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2 animate-shake">
                                    <AlertIcon small />
                                    {error}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Имя</label>
                                    <input
                                        type="text"
                                        value={formData.firstName}
                                        onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition"
                                        placeholder="Иван"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Фамилия</label>
                                    <input
                                        type="text"
                                        value={formData.lastName}
                                        onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition"
                                        placeholder="Иванов"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition"
                                    placeholder="example@mail.com"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Телефон</label>
                                <input
                                    type="text"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition"
                                    placeholder="+7 (999) 000-00-00"
                                />
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Смена пароля (оставьте пустым, если не хотите менять)</p>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 ml-1">Новый пароль</label>
                                        <input
                                            type="password"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 ml-1">Подтверждение пароля</label>
                                        <input
                                            type="password"
                                            value={formData.confirmPassword}
                                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>
                            </div>
                        </form>
                    )}

                    {activeTab === 'deleted' && (
                        <div className="space-y-3">
                            {deletedTasks.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">Нет удаленных точек</div>
                            ) : (
                                deletedTasks.map(item => {
                                    const timeLeft = item.restoreDeadline 
                                        ? Math.max(0, Math.ceil((item.restoreDeadline - Date.now()) / (1000 * 60 * 60 * 24)))
                                        : null;
                                    const canRestore = timeLeft !== null && timeLeft > 0;

                                    return (
                                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-600">
                                                        Удалено
                                                    </span>
                                                    <h4 className="font-bold text-slate-900 text-sm">{item.targetName}</h4>
                                                </div>
                                                <div className="text-xs text-slate-500 font-medium mb-2">
                                                    {new Date(item.timestamp).toLocaleDateString()} • Автор: {item.user || 'Система'}
                                                </div>
                                                <div className="text-sm text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                                                    "{item.reason}"
                                                </div>
                                                {canRestore ? (
                                                    <div className="text-[10px] text-orange-500 mt-2 font-bold">
                                                        До авто-удаления: {timeLeft} дн.
                                                    </div>
                                                ) : (
                                                    <div className="text-[10px] text-slate-400 mt-2 font-bold">
                                                        Срок восстановления истек
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center">
                                                {canRestore && (
                                                    <button 
                                                        onClick={() => restoreTask(item.id)}
                                                        className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
                                                    >
                                                        <RefreshIcon small /> Восстановить
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {activeTab === 'snoozed' && (
                        <div className="space-y-3">
                            {snoozedTasks.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">Нет отложенных точек</div>
                            ) : (
                                snoozedTasks.map(item => {
                                    const isEditing = editingSnoozeId === item.id;

                                    return (
                                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-100 text-indigo-600">
                                                            Отложено
                                                        </span>
                                                        <h4 className="font-bold text-slate-900 text-sm">{item.targetName}</h4>
                                                    </div>
                                                    <div className="text-xs text-slate-500 font-medium mb-2">
                                                        {new Date(item.timestamp).toLocaleDateString()} • Автор: {item.user || 'Система'}
                                                    </div>
                                                </div>
                                                {!isEditing && (
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={() => startEditSnooze(item)}
                                                            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold transition-colors"
                                                        >
                                                            Редактировать
                                                        </button>
                                                        <button 
                                                            onClick={() => restoreTask(item.id)}
                                                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                                        >
                                                            <RefreshIcon small /> В работу
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteSnoozed(item)}
                                                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                                        >
                                                            <TrashIcon small /> Удалить
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {isEditing ? (
                                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-bold text-indigo-800 mb-1">Напомнить:</label>
                                                        <SingleDatePicker
                                                            date={editSnoozeDate}
                                                            onChange={setEditSnoozeDate}
                                                            minDate={new Date()}
                                                            className="!border-indigo-200 !bg-white !rounded-lg"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-indigo-800 mb-1">Комментарий:</label>
                                                        <textarea 
                                                            value={editSnoozeReason}
                                                            onChange={(e) => setEditSnoozeReason(e.target.value)}
                                                            className="w-full p-2 border border-indigo-200 rounded-lg text-sm min-h-[60px] outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                                                        />
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <button 
                                                            onClick={() => setEditingSnoozeId(null)} 
                                                            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg font-bold text-xs"
                                                        >
                                                            Отмена
                                                        </button>
                                                        <button 
                                                            onClick={() => saveEditSnooze(item)} 
                                                            disabled={!editSnoozeReason.trim() || !editSnoozeDate}
                                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-sm disabled:opacity-50"
                                                        >
                                                            Сохранить
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="text-sm text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                                                        "{item.reason}"
                                                    </div>
                                                    {item.snoozeUntil && (
                                                        <div className="text-[10px] text-indigo-500 font-bold flex items-center gap-1">
                                                            <CalendarIcon small /> Напоминание сработает: {new Date(item.snoozeUntil).toLocaleDateString()}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ProfileModal;
