import { google } from 'googleapis';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { setCookie } from 'nookies';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string;

  if (!code) {
      return res.status(400).send('No code provided');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Сохраняем токены в безопасную Cookie
    setCookie({ res }, 'google_tokens', JSON.stringify(tokens), {
      maxAge: 30 * 24 * 60 * 60, // 30 дней
      path: '/',
      httpOnly: true, // Скрипты на фронте не смогут прочитать это (безопасность)
      secure: process.env.NODE_ENV === 'production',
    });

    // Возвращаем пользователя на главную страницу
    res.redirect('/'); 

  } catch (error) {
    console.error('Error exchanging code for tokens', error);
    res.status(500).send('Authentication failed');
  }
}