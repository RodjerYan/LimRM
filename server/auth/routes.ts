
import { Router } from "express";
import crypto from "crypto";
import { Buffer } from "buffer";
import { hashPassword, verifyPassword } from "./password";
import { signToken } from "./jwt";
import {
  createUser,
  getActiveUser,
  listUsers,
  setRole,
  UserProfile,
  UserSecrets
} from "./authStore";
import { requireAuth, requireAdmin } from "./middleware";

const r = Router();

const ADMIN_EMAIL = "rodjeryan@gmail.com";

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

// --- REGISTER (DIRECT) ---
r.post("/register", async (req, res) => {
  const email = normEmail(req.body.email);
  console.log(`[AUTH] 🟢 Прямая регистрация: ${email}`);

  try {
    const firstName = normName(req.body.firstName);
    const lastName = normName(req.body.lastName);
    const phone = normName(req.body.phone);
    
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

    // Check if user exists
    const active = await getActiveUser(email);
    if (active) {
        return res.status(409).json({ error: "Пользователь уже зарегистрирован" });
    }

    const role: "admin" | "user" = email === ADMIN_EMAIL ? "admin" : "user";
    const { salt, hash } = hashPassword(password);

    const profile: UserProfile = {
      email,
      firstName,
      lastName,
      phone,
      role,
      status: "active", // Immediately active
      createdAt: new Date().toISOString(),
    };

    const secrets: UserSecrets = {
      passwordHash: hash,
      passwordSalt: salt
    };

    // Save directly to DB
    console.log(`[AUTH] Сохранение пользователя в БД...`);
    await createUser(profile, secrets);
    console.log(`[AUTH] Пользователь создан.`);
    
    // Return success immediately, no verification needed
    res.json({ ok: true });

  } catch (e: any) {
    console.error("[AUTH/register] 🔴 ERROR:", e);
    const msg = String(e?.message || "");
    
    if (msg.includes("USER_ALREADY_EXISTS")) {
        return res.status(409).json({ error: "Пользователь уже существует" });
    }
    
    res.status(500).json({ error: `Ошибка регистрации: ${msg}` });
  }
});

// --- LOGIN ---
r.post("/login", async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || "");

    // 1. Find user
    const active = await getActiveUser(email);
    if (!active) return res.status(404).json({ error: "Пользователь не найден" });
    
    // 2. Check password
    if (!verifyPassword(password, active.secrets.passwordSalt, active.secrets.passwordHash)) {
      return res.status(400).json({ error: "Неверный пароль" });
    }

    // 3. Issue Token
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
