
import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { useAuth } from './AuthContext';
import { LoaderIcon, CheckIcon, ErrorIcon } from '../icons';

interface AuthModalProps {
    onCancel?: () => void;
    initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({ onCancel, initialMode = 'login' }) => {
    const { login } = useAuth();
    const [mode, setMode] = useState<'login' | 'register'>(initialMode);
    
    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    
    // Captcha
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaQuestion, setCaptchaQuestion] = useState('');
    const [captchaAnswer, setCaptchaAnswer] = useState('');

    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setMode(initialMode);
        setError('');
        setSuccessMsg('');
    }, [initialMode]);

    useEffect(() => {
        if (mode === 'register') loadCaptcha();
    }, [mode]);

    const loadCaptcha = async () => {
        try {
            const res = await fetch('/api/auth/captcha');
            const data = await res.json();
            setCaptchaToken(data.token);
            setCaptchaQuestion(data.question);
            setCaptchaAnswer('');
        } catch (e) { console.error(e); }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(''); setSuccessMsg('');
        
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (res.ok) {
                login(data.token, data.me, data.totalUsers);
            } else {
                setError(data.error || 'Ошибка входа');
            }
        } catch (e: any) { 
            setError('Ошибка сети или сервера');
        } finally { 
            setLoading(false); 
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== passwordConfirm) return setError('Пароли не совпадают');
        setLoading(true); setError(''); setSuccessMsg('');

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, phone, email, password, password2: passwordConfirm, captchaToken, captchaAnswer }),
            });
            
            let data;
            try { data = await res.json(); } catch(e) {}

            if (res.ok) {
                // Success: Smoothly transition to Login
                setSuccessMsg('Регистрация успешна! Теперь вы можете войти.');
                setMode('login');
                setPassword(''); // Clear password for security
                setPasswordConfirm('');
            } else {
                setError(data?.error || 'Ошибка регистрации');
                loadCaptcha(); 
            }
        } catch (e: any) {
            setError(e.message || 'Ошибка сети');
        } finally { 
            setLoading(false); 
        }
    };

    const inputClass = "w-full p-3 border border-slate-200 rounded-xl mb-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none";
    const btnClass = "w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50 flex justify-center items-center gap-2";

    return (
        <Modal 
            isOpen={true} 
            onClose={() => { if(onCancel) onCancel(); }} 
            title={mode === 'login' ? 'Вход в систему' : 'Регистрация'} 
            maxWidth="max-w-md" 
            zIndex="z-[10000]"
        >
            <div className="p-2">
                {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4 font-medium flex items-center gap-2 break-words"><ErrorIcon small/> {error}</div>}
                {successMsg && <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-sm mb-4 font-medium flex items-center gap-2"><CheckIcon small/> {successMsg}</div>}
                
                {mode === 'login' && (
                    <form onSubmit={handleLogin}>
                        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} required />
                        <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} required />
                        <button type="submit" className={btnClass} disabled={loading}>{loading && <LoaderIcon small />} Войти</button>
                        <div className="mt-4 text-center text-sm text-slate-500">
                            Нет аккаунта? <button type="button" onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }} className="text-indigo-600 font-bold hover:underline">Зарегистрироваться</button>
                        </div>
                    </form>
                )}

                {mode === 'register' && (
                    <form onSubmit={handleRegister}>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="Имя" value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} required />
                            <input type="text" placeholder="Фамилия" value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} required />
                        </div>
                        <input type="tel" placeholder="Телефон" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} required />
                        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} required />
                        <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} required />
                        <input type="password" placeholder="Повторите пароль" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} className={inputClass} required />
                        
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3">
                            <div className="text-xs text-slate-500 mb-1">Решите пример: <span className="font-bold text-slate-800 text-sm">{captchaQuestion}</span></div>
                            <input type="text" placeholder="Ответ" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" required />
                        </div>

                        <button type="submit" className={btnClass} disabled={loading}>{loading && <LoaderIcon small />} Зарегистрироваться</button>
                        <div className="mt-4 text-center text-sm text-slate-500">
                            Есть аккаунт? <button type="button" onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }} className="text-indigo-600 font-bold hover:underline">Войти</button>
                        </div>
                    </form>
                )}
            </div>
        </Modal>
    );
};
