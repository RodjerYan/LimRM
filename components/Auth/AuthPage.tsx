
import React, { useState, useEffect } from 'react';
import ReCAPTCHA from "react-google-recaptcha";
import { useAuth } from '../../context/AuthContext';
import { LoaderIcon, ErrorIcon, SuccessIcon } from '../icons';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'; // Standard Test Key

const AuthPage: React.FC = () => {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const { login } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    useEffect(() => {
        // Check if redirected from verify email
        const params = new URLSearchParams(window.location.search);
        if (params.get('verified') === 'true') {
            setSuccessMsg('Email успешно подтвержден! Теперь вы можете войти.');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        setLoading(true);

        try {
            if (mode === 'register') {
                if (formData.password !== formData.confirmPassword) {
                    throw new Error('Пароли не совпадают');
                }
                if (!captchaToken) {
                    throw new Error('Пожалуйста, пройдите проверку капча');
                }

                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...formData, captchaToken })
                });
                
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
                
                setSuccessMsg(data.message);
                // Clear form sensitive data
                setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
                
            } else {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: formData.email, password: formData.password })
                });
                
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Ошибка входа');
                
                login(data.user);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-primary-dark p-4">
            <div className="bg-card-bg/90 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/10 w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Geo-Анализ</h1>
                    <p className="text-text-muted">{mode === 'login' ? 'Вход в систему' : 'Регистрация нового пользователя'}</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm flex items-center gap-2 animate-fade-in">
                        <div className="w-4 h-4 flex-shrink-0"><ErrorIcon/></div> <span>{error}</span>
                    </div>
                )}

                {successMsg && (
                    <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-200 text-sm flex items-center gap-2 animate-fade-in">
                        <div className="w-4 h-4 flex-shrink-0"><SuccessIcon/></div> <span>{successMsg}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'register' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-text-muted mb-1">Имя</label>
                                <input name="firstName" type="text" required placeholder="Иван" className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all" onChange={handleChange} />
                            </div>
                            <div>
                                <label className="block text-xs text-text-muted mb-1">Фамилия</label>
                                <input name="lastName" type="text" required placeholder="Иванов" className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all" onChange={handleChange} />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs text-text-muted mb-1">Email</label>
                        <input name="email" type="email" required placeholder="name@company.com" className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all" onChange={handleChange} />
                    </div>

                    <div>
                        <label className="block text-xs text-text-muted mb-1">Пароль</label>
                        <input name="password" type="password" required placeholder="••••••••" className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all" onChange={handleChange} />
                    </div>

                    {mode === 'register' && (
                        <div>
                            <label className="block text-xs text-text-muted mb-1">Повторите пароль</label>
                            <input name="confirmPassword" type="password" required placeholder="••••••••" className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all" onChange={handleChange} />
                        </div>
                    )}

                    {mode === 'register' && (
                        <div className="flex justify-center py-2">
                            <ReCAPTCHA
                                sitekey={RECAPTCHA_SITE_KEY}
                                onChange={(token) => setCaptchaToken(token)}
                                theme="dark"
                            />
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-accent hover:bg-accent-dark text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-900/20 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading && <LoaderIcon />}
                        {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button 
                        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setSuccessMsg(null); }}
                        className="text-sm text-accent hover:text-white transition-colors underline decoration-1 underline-offset-4"
                    >
                        {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
