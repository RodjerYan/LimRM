import { google } from 'googleapis';
import { VercelRequest, VercelResponse } from '@vercel/node';

// Убрали nookies
// import { setCookie } from 'nookies';

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
    
    // Ручная установка куки (Native Node.js approach)
    // Кодируем JSON, чтобы спецсимволы не сломали заголовок
    const cookieVal = encodeURIComponent(JSON.stringify(tokens));
    const maxAge = 30 * 24 * 60 * 60; // 30 дней
    const isProd = process.env.NODE_ENV === 'production';
    
    // Формируем заголовок Set-Cookie вручную
    res.setHeader('Set-Cookie', `google_tokens=${cookieVal}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`);

    // Возвращаем пользователя на главную страницу
    res.redirect('/'); 

  } catch (error) {
    console.error('Error exchanging code for tokens', error);
    res.status(500).send('Authentication failed');
  }
}