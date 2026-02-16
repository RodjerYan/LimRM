
import nodemailer from "nodemailer";

export async function sendVerifyCode(to: string, code: string): Promise<string | null> {
  // Жестко заданные настройки для Gmail (как вы просили, с вашим ключом)
  const SMTP_USER = "rodjeryan@gmail.com";
  // Убираем пробелы из ключа для гарантии
  const SMTP_PASS = "tzkhmargvuowyqon"; 

  // Используем сервис 'gmail' - это автоматически настраивает хост (smtp.gmail.com) и порт (465)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
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
    });
    
    console.log(`[MAILER] Письмо успешно отправлено на ${to}`);
    return null; // Успех
  } catch (e) {
    console.error("[MAILER] Ошибка отправки:", e);
    // В реальном режиме мы выбрасываем ошибку, чтобы пользователь знал, что письмо не ушло
    throw new Error("Не удалось отправить письмо. Проверьте правильность Email.");
  }
}
