import { google } from 'googleapis';
import { VercelRequest, VercelResponse } from '@vercel/node';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export default function handler(req: VercelRequest, res: VercelResponse) {
  const scopes = [
    'https://www.googleapis.com/auth/drive.file', // Доступ только к файлам, созданным приложением
    'https://www.googleapis.com/auth/drive.metadata.readonly' // Чтобы искать файлы
  ];

  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Важно для получения refresh_token
    scope: scopes,
    include_granted_scopes: true,
    prompt: 'consent' // Чтобы всегда спрашивал разрешение (полезно при отладке)
  });

  res.redirect(authorizationUrl);
}