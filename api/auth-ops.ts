import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize, parse } from 'cookie';
import nodemailer from 'nodemailer';
import { 
    registerUserInDrive, 
    getUserIndex, 
    getUserCredentials, 
    markUserVerified 
} from '../lib/drive-auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { op } = req.query;

    // --- LOGIN ---
    if (op === 'login' && req.method === 'POST') {
        try {
            const { email, password } = req.body;
            if (!email || !password) return res.status(400).json({ error: 'Введите email и пароль.' });

            const { index } = await getUserIndex();
            const userMeta = index[email];

            if (!userMeta) return res.status(401).json({ error: 'Неверный email или пароль.' });

            if (!userMeta.isVerified && email !== 'rodjeryan@gmail.com') {
                return res.status(403).json({ error: 'Email не подтвержден. Проверьте почту.' });
            }

            const credentials = await getUserCredentials(userMeta.folderId);
            const isValid = await bcrypt.compare(password, credentials.passwordHash);
            
            if (!isValid) return res.status(401).json({ error: 'Неверный email или пароль.' });

            const token = jwt.sign(
                { email: credentials.email, role: credentials.role, name: userMeta.name },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            const cookie = serialize('auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 7,
                path: '/',
                sameSite: 'lax',
            });

            res.setHeader('Set-Cookie', cookie);
            return res.status(200).json({ success: true, user: { email: credentials.email, name: userMeta.name, role: credentials.role } });
        } catch (e) {
            console.error('Login Error:', e);
            return res.status(500).json({ error: 'Ошибка авторизации' });
        }
    }

    // --- REGISTER ---
    if (op === 'register' && req.method === 'POST') {
        try {
            const { firstName, lastName, email, password, captchaToken } = req.body;
            if (!firstName || !lastName || !email || !password) return res.status(400).json({ error: 'Все поля обязательны.' });

            if (process.env.RECAPTCHA_SECRET_KEY) {
                const captchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${captchaToken}`, { method: 'POST' });
                const captchaData = await captchaRes.json();
                if (!captchaData.success) return res.status(400).json({ error: 'Ошибка проверки капчи' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const role = email === 'rodjeryan@gmail.com' ? 'admin' : 'user';

            await registerUserInDrive({
                firstName,
                lastName,
                email,
                passwordHash: '',
                createdAt: new Date().toISOString(),
                role
            }, hashedPassword);

            // Email Verification
            const verificationToken = Buffer.from(email).toString('base64');
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            const verifyLink = `${protocol}://${host}/api/auth/verify?token=${verificationToken}`;

            if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT) || 465,
                    secure: true,
                    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                });

                await transporter.sendMail({
                    from: '"Geo-Analyzer" <rodjeryan@gmail.com>',
                    to: email,
                    subject: 'Подтверждение регистрации',
                    html: `<a href="${verifyLink}">Подтвердить Email</a>`
                });
                return res.status(200).json({ success: true, message: 'Письмо отправлено.' });
            } else {
                return res.status(200).json({ success: true, message: 'Регистрация успешна (Dev: SMTP не настроен)', debugLink: verifyLink });
            }
        } catch (e) {
            console.error('Register Error:', e);
            return res.status(500).json({ error: (e as Error).message });
        }
    }

    // --- VERIFY ---
    if (op === 'verify' && req.method === 'GET') {
        const { token } = req.query;
        if (!token || typeof token !== 'string') return res.status(400).send('Нет токена.');
        try {
            const email = Buffer.from(token, 'base64').toString('utf-8');
            await markUserVerified(email);
            return res.redirect('/?verified=true');
        } catch (e) {
            return res.status(500).send(`Ошибка: ${(e as Error).message}`);
        }
    }

    // --- ME ---
    if (op === 'me' && req.method === 'GET') {
        const cookies = parse(req.headers.cookie || '');
        const token = cookies.auth_token;
        if (!token) return res.status(401).json({ user: null });
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return res.status(200).json({ user: decoded });
        } catch {
            return res.status(401).json({ user: null });
        }
    }

    // --- LOGOUT ---
    if (op === 'logout') {
        const cookie = serialize('auth_token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            expires: new Date(0),
            path: '/',
        });
        res.setHeader('Set-Cookie', cookie);
        return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: 'Unknown auth operation' });
}
