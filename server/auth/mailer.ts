
import nodemailer from "nodemailer";

export async function sendVerifyCode(to: string, code: string): Promise<string | null> {
  const SMTP_USER = "rodjeryan@gmail.com";
  const SMTP_PASS = "tzkhmargvuowyqon"; 

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    // Keep connection timeouts short
    connectionTimeout: 5000, 
    greetingTimeout: 3000,    
    socketTimeout: 5000      
  });

  try {
    console.log(`[MAILER] Попытка отправки письма на ${to}...`);
    
    // Enforce a hard 7-second timeout for the entire operation
    await Promise.race([
        transporter.sendMail({
          from: `"LimRM Geo Analyzer" <${SMTP_USER}>`,
          to,
          subject: "Код подтверждения регистрации LimRM",
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px;">
              <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f3f4f6;">
                 <h2 style="color: #4f46e5; margin: 0;">LimRM Geo Analyzer</h2>
                 <p style="color: #6b7280; font-size: 14px; margin-top: 5px;">Система коммерческой аналитики</p>
              </div>
              <div style="padding: 30px 0; text-align: center;">
                <p style="font-size: 16px; color: #374151; margin-bottom: 10px;">Ваш код для входа:</p>
                <h1 style="font-size: 36px; letter-spacing: 8px; color: #111827; margin: 10px 0; font-family: monospace; background: #f9fafb; display: inline-block; padding: 10px 20px; border-radius: 8px;">${code}</h1>
                <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">Введите этот код в окне приложения.</p>
              </div>
              <div style="border-top: 1px solid #f3f4f6; padding-top: 20px; text-align: center; font-size: 12px; color: #9ca3af;">
                <p>Если вы не запрашивали этот код, просто проигнорируйте это письмо.</p>
              </div>
            </div>
          `,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP Timeout (7s)")), 7000))
    ]);
    
    console.log(`[MAILER] Письмо успешно отправлено на ${to}`);
    return null; // Success, no fallback code needed
  } catch (e: any) {
    console.error("[MAILER] Ошибка отправки (или таймаут):", e.message);
    // Fallback: return the code so the backend can send it to the client
    // This prevents the "infinite load" if SMTP is blocked/slow.
    return code;
  }
}
