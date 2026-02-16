
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

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.error("[Mailer] SMTP credentials missing in env.");
    throw new Error("SMTP_NOT_CONFIGURED");
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
