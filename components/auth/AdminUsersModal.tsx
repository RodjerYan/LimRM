
import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { useAuth, User } from './AuthContext';
import { LoaderIcon, CheckIcon } from '../icons';

interface AdminUsersModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AdminUsersModal: React.FC<AdminUsersModalProps> = ({ isOpen, onClose }) => {
    const { token } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) loadUsers();
    }, [isOpen]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/admin/list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) setUsers(data.users);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const handleSetRole = async (email: string, newRole: string) => {
        setUpdating(email);
        try {
            const res = await fetch('/api/auth/admin/set-role', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ email, role: newRole })
            });
            if (res.ok) {
                setUsers(prev => prev.map(u => u.email === email ? { ...u, role: newRole as any } : u));
            } else {
                alert('Ошибка обновления роли');
            }
        } catch (e) { alert('Ошибка сети'); }
        finally { setUpdating(null); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Управление пользователями" maxWidth="max-w-4xl">
            {loading ? (
                <div className="p-10 flex justify-center text-indigo-500"><LoaderIcon /></div>
            ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-xs sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Фамилия Имя</th>
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Телефон</th>
                                <th className="px-4 py-3">Роль</th>
                                <th className="px-4 py-3">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.map(u => (
                                <tr key={u.email} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">{u.lastName} {u.firstName}</td>
                                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                                    <td className="px-4 py-3 text-slate-500 font-mono">{u.phone}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {u.role.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {updating === u.email ? <LoaderIcon small /> : (
                                            u.email !== 'rodjeryan@gmail.com' && (
                                                <select 
                                                    value={u.role}
                                                    onChange={(e) => handleSetRole(u.email, e.target.value)}
                                                    className="border border-slate-200 rounded px-2 py-1 text-xs cursor-pointer hover:border-indigo-300 outline-none"
                                                >
                                                    <option value="user">User</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                            )
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    );
};
