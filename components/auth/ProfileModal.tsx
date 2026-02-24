
import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { useAuth } from './AuthContext';
import { LoaderIcon, CheckIcon, ErrorIcon, AlertIcon } from '../icons';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { user, token, refreshProfile } = useAuth();
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
                    phone: formData.phone,
                    password: formData.password || undefined
                })
            });

            if (res.ok) {
                await refreshProfile();
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

    if (!user) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Профиль пользователя"
            maxWidth="max-w-md"
            footer={
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
            }
        >
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
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Email (не редактируется)</label>
                    <input
                        type="email"
                        value={formData.email}
                        disabled
                        className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed outline-none"
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
        </Modal>
    );
};

export default ProfileModal;
