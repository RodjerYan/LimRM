
import nodemailer from "nodemailer";

export async function sendVerifyCode(to: string, code: string) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM
  } = process.env;

  // Fallback: Log to console if SMTP is not configured (Avoids 500 Error)
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn(`\n[MAILER MOCK] ---------------------------------------------------`);
    console.warn(`[MAILER MOCK] SMTP not configured. Verification code for ${to}:`);
    console.warn(`[MAILER MOCK] CODE: ${code}`);
    console.warn(`[MAILER MOCK] ---------------------------------------------------\n`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE) === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject: "Код подтверждения регистрации LimRM",
    text: `Ваш код подтверждения: ${code}\n\nВведите этот код в окне регистрации приложения LimRM.\nЕсли это письмо пришло по ошибке, просто проигнорируйте его.`,
  });
}
