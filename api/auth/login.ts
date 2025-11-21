import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getUserIndex, getUserCredentials } from '../lib/drive-auth.js';
import { serialize } from 'cookie';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Введите email и пароль.' });
        }

        // 1. Check Index for existence and folder ID
        const { index } = await getUserIndex();
        const userMeta = index[email];

        if (!userMeta) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        // 2. Check Email Verification
        if (!userMeta.isVerified) {
            // Allow admin to bypass verification for testing/setup
            if (email !== 'rodjeryan@gmail.com') {
                return res.status(403).json({ error: 'Email не подтвержден. Проверьте почту.' });
            }
        }

        // 3. Get Credentials from User Folder
        const credentials = await getUserCredentials(userMeta.folderId);

        // 4. Verify Password
        const isValid = await bcrypt.compare(password, credentials.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        // 5. Create Session Token
        const token = jwt.sign(
            { email: credentials.email, role: credentials.role, name: userMeta.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const cookie = serialize('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Secure in Prod
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/',
            sameSite: 'lax',
        });

        res.setHeader('Set-Cookie', cookie);
        res.status(200).json({ 
            success: true, 
            user: { 
                email: credentials.email, 
                name: userMeta.name, 
                role: credentials.role 
            } 
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка авторизации' });
    }
}