
import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { useAuth } from './AuthContext';
import { LoaderIcon, CheckIcon, ErrorIcon, InfoIcon } from '../icons';

export const AuthModal: React.FC = () => {
    const { login } = useAuth();
    const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    
    // Captcha
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaQuestion, setCaptchaQuestion] = useState('');
    const [captchaAnswer, setCaptchaAnswer] = useState('');

    const [error, setError] = useState('');
    const [infoMsg, setInfoMsg] = useState('');
    const [loading, setLoading] = useState(false);

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
        setLoading(true); setError(''); setInfoMsg('');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); 

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                signal: controller.signal
            });
            const data = await res.json();
            if (res.ok) {
                login(data.token, data.me);
            } else {
                setError(data.error);
            }
        } catch (e: any) { 
            if (e.name === 'AbortError') setError('Сервер долго не отвечает (Timeout)');
            else setError('Ошибка сети или сервера');
        } finally { 
            clearTimeout(timeoutId);
            setLoading(false); 
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== passwordConfirm) return setError('Пароли не совпадают');
        setLoading(true); setError(''); setInfoMsg('');

        const controller = new AbortController();
        // Slightly longer timeout for email sending
        const timeoutId = setTimeout(() => controller.abort(), 20000); 

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, phone, email, password, password2: passwordConfirm, captchaToken, captchaAnswer }),
                signal: controller.signal
            });
            
            let data;
            try {
                data = await res.json();
            } catch (jsonError) {
                throw new Error('Сервер вернул некорректный ответ. Проверьте консоль сервера.');
            }

            if (res.ok) {
                // Check if email failed but we got a fallback code
                if (data.debugCode) {
                    setVerifyCode(data.debugCode);
                    // Display the specific SMTP error message
                    setError(`Ошибка почты: ${data.mailError || 'Не удалось отправить'}. Код подставлен автоматически.`);
                } else {
                    setError('');
                }
                setMode('verify');
            } else {
                setError(data.error || 'Неизвестная ошибка');
                loadCaptcha(); 
            }
        } catch (e: any) {
            if (e.name === 'AbortError') setError('Превышено время ожидания ответа от сервера (Timeout)');
            else setError(e.message || 'Ошибка сети');
        } finally { 
            clearTimeout(timeoutId);
            setLoading(false); 
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(''); setInfoMsg('');
        try {
            const res = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code: verifyCode })
            });
            const data = await res.json();
            if (res.ok) {
                login(data.token, data.me);
            } else {
                setError(data.error);
            }
        } catch (e) { setError('Ошибка сети'); }
        finally { setLoading(false); }
    };

    const inputClass = "w-full p-3 border border-slate-200 rounded-xl mb-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none";
    const btnClass = "w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50 flex justify-center items-center gap-2";

    return (
        <Modal isOpen={true} onClose={() => {}} title={mode === 'login' ? 'Вход в систему' : mode === 'register' ? 'Регистрация' : 'Подтверждение'} maxWidth="max-w-md" zIndex="z-[10000]">
            <div className="p-2">
                {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4 font-medium flex items-center gap-2 break-words"><ErrorIcon small/> {error}</div>}
                
                {mode === 'login' && (
                    <form onSubmit={handleLogin}>
                        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} required />
                        <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} required />
                        <button type="submit" className={btnClass} disabled={loading}>{loading && <LoaderIcon small />} Войти</button>
                        <div className="mt-4 text-center text-sm text-slate-500">
                            Нет аккаунта? <button type="button" onClick={() => setMode('register')} className="text-indigo-600 font-bold hover:underline">Зарегистрироваться</button>
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
                            Есть аккаунт? <button type="button" onClick={() => setMode('login')} className="text-indigo-600 font-bold hover:underline">Войти</button>
                        </div>
                    </form>
                )}

                {mode === 'verify' && (
                    <form onSubmit={handleVerify}>
                        <p className="text-sm text-slate-600 mb-4">
                            На почту <strong>{email}</strong> отправлен код подтверждения.
                            <br/><span className="text-xs text-slate-400">(Проверьте также папку Спам)</span>
                        </p>
                        <input type="text" placeholder="Код из письма" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} className={inputClass} required />
                        <button type="submit" className={btnClass} disabled={loading}>{loading && <LoaderIcon small />} Подтвердить</button>
                        <div className="mt-4 text-center">
                            <button type="button" onClick={() => setMode('register')} className="text-xs text-slate-400 hover:text-slate-600">Назад к регистрации</button>
                        </div>
                    </form>
                )}
            </div>
        </Modal>
    );
};
