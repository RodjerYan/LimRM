
import { Router } from "express";
import crypto from "crypto";
import { hashPassword, verifyPassword, hashCode, verifyCode } from "./password";
import { signToken } from "./jwt";
import { sendVerifyCode } from "./mailer";
import {
  createPendingUser,
  getPendingUser,
  getActiveUser,
  activateUser,
  listUsers,
  setRole,
  UserProfile,
  UserSecrets
} from "./authStore";
import { requireAuth, requireAdmin } from "./middleware";

const r = Router();

const ADMIN_EMAIL = "rodjeryan@gmail.com";
const CODE_TTL_MIN = 15;

function normEmail(s: any) { return String(s || "").trim().toLowerCase(); }
function normName(s: any) { return String(s || "").trim(); }

// --- CAPTCHA ---
r.get("/captcha", async (req, res) => {
  const a = 2 + Math.floor(Math.random() * 8); 
  const b = 1 + Math.floor(Math.random() * 9); 
  const answer = String(a + b);

  const secret = process.env.AUTH_JWT_SECRET || "x";
  const exp = Date.now() + 5 * 60 * 1000; 
  const payload = `${a}:${b}:${answer}:${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${sig}`).toString("base64url");

  res.json({ question: `${a} + ${b} = ?`, token });
});

function verifyCaptcha(token: string, answer: string) {
  const secret = process.env.AUTH_JWT_SECRET || "x";
  try {
      const raw = Buffer.from(token, "base64url").toString("utf8");
      const parts = raw.split(":");
      if (parts.length !== 5) return false;
      const [a, b, realAnswer, expStr, sig] = parts;
      const payload = `${a}:${b}:${realAnswer}:${expStr}`;
      const sig2 = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      if (sig2 !== sig) return false;
      if (Date.now() > Number(expStr)) return false;
      return String(answer || "").trim() === String(realAnswer);
  } catch { return false; }
}

// --- REGISTER ---
r.post("/register", async (req, res) => {
  try {
    const firstName = normName(req.body.firstName);
    const lastName = normName(req.body.lastName);
    const phone = normName(req.body.phone);
    const email = normEmail(req.body.email);
    const password = String(req.body.password || "");
    const password2 = String(req.body.password2 || "");
    const captchaToken = String(req.body.captchaToken || "");
    const captchaAnswer = String(req.body.captchaAnswer || "");

    if (!verifyCaptcha(captchaToken, captchaAnswer)) return res.status(400).json({ error: "Неверная капча" });
    if (!firstName || !lastName) return res.status(400).json({ error: "Укажите имя и фамилию" });
    if (!phone) return res.status(400).json({ error: "Укажите телефон" });
    if (!email.includes("@")) return res.status(400).json({ error: "Некорректный email" });
    if (password.length < 6) return res.status(400).json({ error: "Пароль слишком короткий" });
    if (password !== password2) return res.status(400).json({ error: "Пароли не совпадают" });

    const active = await getActiveUser(email);
    if (active) return res.status(409).json({ error: "Пользователь уже зарегистрирован" });

    const role: "admin" | "user" = email === ADMIN_EMAIL ? "admin" : "user";
    const { salt, hash } = hashPassword(password);
    const code = String(100000 + Math.floor(Math.random() * 900000));
    const codeHashed = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString();

    const profile: UserProfile = {
      email,
      firstName,
      lastName,
      phone,
      role,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const secrets: UserSecrets = {
      passwordHash: hash,
      passwordSalt: salt,
      verifyCodeHash: codeHashed.hash,
      verifyCodeSalt: codeHashed.salt,
      verifyCodeExpiresAt: expiresAt,
    };

    // 1. Write to DB
    await createPendingUser(profile, secrets);
    
    // 2. Try send email
    const mailResult = await sendVerifyCode(email, code);

    // 3. Respond
    if (mailResult.success) {
        res.json({ ok: true });
    } else {
        // If mail failed, return fallback code AND the error message for diagnostics
        res.json({ 
            ok: true, 
            debugCode: code, 
            mailError: mailResult.error 
        });
    }

  } catch (e: any) {
    console.error("[AUTH/register] CRITICAL ERROR:", e);
    const msg = String(e?.message || "");
    
    if (msg.includes("GOOGLE_SERVICE_ACCOUNT_KEY")) {
       return res.status(500).json({ error: "Ошибка сервера: Не настроен ключ Google Service Account." });
    }
    
    res.status(500).json({ error: `Ошибка регистрации: ${msg}` });
  }
});

// --- VERIFY ---
r.post("/verify", async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const code = String(req.body.code || "").trim();

    const pending = await getPendingUser(email);
    if (!pending) return res.status(404).json({ error: "Заявка не найдена или уже подтверждена" });

    const s = pending.secrets;
    if (!s.verifyCodeHash || !s.verifyCodeSalt || !s.verifyCodeExpiresAt) {
      return res.status(400).json({ error: "Код не был сгенерирован" });
    }
    if (Date.now() > Date.parse(s.verifyCodeExpiresAt)) {
      return res.status(400).json({ error: "Срок действия кода истек" });
    }
    if (!verifyCode(code, s.verifyCodeSalt, s.verifyCodeHash)) {
      return res.status(400).json({ error: "Неверный код" });
    }

    await activateUser(email);
    const active = await getActiveUser(email);
    if (!active) return res.status(500).json({ error: "Ошибка активации" });

    const token = signToken({
      email: active.profile.email,
      role: active.profile.role,
      lastName: active.profile.lastName,
      firstName: active.profile.firstName,
    });

    res.json({ ok: true, token, me: active.profile });
  } catch (e) {
    console.error("[AUTH/verify]", e);
    res.status(500).json({ error: "Ошибка подтверждения" });
  }
});

// --- LOGIN ---
r.post("/login", async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || "");

    const active = await getActiveUser(email);
    if (!active) return res.status(404).json({ error: "Пользователь не найден" });
    if (active.profile.status !== "active") return res.status(403).json({ error: "Учетная запись не подтверждена" });

    if (!verifyPassword(password, active.secrets.passwordSalt, active.secrets.passwordHash)) {
      return res.status(400).json({ error: "Неверный пароль" });
    }

    const token = signToken({
      email: active.profile.email,
      role: active.profile.role,
      lastName: active.profile.lastName,
      firstName: active.profile.firstName,
    });

    res.json({ ok: true, token, me: active.profile });
  } catch (e) {
    console.error("[AUTH/login]", e);
    res.status(500).json({ error: "Ошибка входа" });
  }
});

// --- ME ---
r.get("/me", requireAuth, async (req, res) => {
  const email = req.user!.email;
  const active = await getActiveUser(email);
  if (!active) return res.status(404).json({ error: "Пользователь не найден" });
  res.json({ ok: true, me: active.profile });
});

// --- ADMIN: LIST USERS ---
r.get("/admin/list", requireAuth, requireAdmin, async (req, res) => {
  const users = await listUsers();
  res.json({ ok: true, users });
});

// --- ADMIN: SET ROLE ---
r.post("/admin/set-role", requireAuth, requireAdmin, async (req, res) => {
  const email = normEmail(req.body.email);
  const role = String(req.body.role || "").toLowerCase();

  if (email === ADMIN_EMAIL && role !== "admin") {
    return res.status(400).json({ error: "Нельзя разжаловать главного администратора" });
  }
  if (role !== "admin" && role !== "user") return res.status(400).json({ error: "Неверная роль" });

  await setRole(email, role as any);
  res.json({ ok: true });
});

export default r;
