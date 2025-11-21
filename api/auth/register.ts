import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { registerUserInDrive } from '../lib/drive-auth.js';
import nodemailer from 'nodemailer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { firstName, lastName, email, password, captchaToken } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ error: 'Все поля обязательны.' });
        }

        // --- Captcha Validation ---
        // Only run if RECAPTCHA_SECRET_KEY is set in environment variables
        if (process.env.RECAPTCHA_SECRET_KEY) {
            const captchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${captchaToken}`, { method: 'POST' });
            const captchaData = await captchaRes.json();
            if (!captchaData.success) return res.status(400).json({ error: 'Ошибка проверки капчи' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        // Set admin role for specific email
        const role = email === 'rodjeryan@gmail.com' ? 'admin' : 'user';

        await registerUserInDrive({
            firstName,
            lastName,
            email,
            passwordHash: '', // Hash is passed separately to keep the type clean, but stored in file
            createdAt: new Date().toISOString(),
            role
        }, hashedPassword);

        // --- Email Verification ---
        
        const verificationToken = Buffer.from(email).toString('base64');
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        const verifyLink = `${protocol}://${host}/api/auth/verify?token=${verificationToken}`;

        // Check if SMTP is configured
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 465,
                secure: true, // true for 465, false for other ports
                auth: { 
                    user: process.env.SMTP_USER, 
                    pass: process.env.SMTP_PASS 
                }
            });

            await transporter.sendMail({
                from: '"Geo-Analyzer Security" <rodjeryan@gmail.com>',
                to: email,
                subject: 'Подтверждение регистрации | Geo-Analyzer',
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333;">
                        <h2>Добро пожаловать, ${firstName}!</h2>
                        <p>Благодарим за регистрацию в системе Geo-Анализ.</p>
                        <p>Пожалуйста, подтвердите ваш email, нажав на кнопку ниже:</p>
                        <a href="${verifyLink}" style="background-color: #818cf8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Подтвердить Email</a>
                        <p style="margin-top: 20px; font-size: 12px; color: #777;">Если вы не регистрировались, проигнорируйте это письмо.</p>
                    </div>
                `
            });
            
            res.status(200).json({ success: true, message: 'Регистрация успешна! Письмо с подтверждением отправлено на вашу почту.' });
        } else {
            // Fallback for development if SMTP is missing
            console.log(`[DEV: SMTP MISSING] To: ${email}, Link: ${verifyLink}`);
            res.status(200).json({ 
                success: true, 
                message: 'Регистрация успешна! (Режим разработчика: Ссылка в консоли сервера)',
                debugLink: verifyLink 
            });
        }

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: (error as Error).message || 'Ошибка сервера при регистрации' });
    }
}