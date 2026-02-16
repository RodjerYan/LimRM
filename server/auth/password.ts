
import crypto from "crypto";
import { Buffer } from "buffer";

export function hashPassword(password: string, salt?: string) {
  const realSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, realSalt, 64) as Buffer;
  return { salt: realSalt, hash: derived.toString("hex") };
}

export function verifyPassword(password: string, salt: string, hash: string) {
  if (!password || !salt || !hash) return false;
  try {
      const derived = crypto.scryptSync(password, salt, 64) as Buffer;
      return crypto.timingSafeEqual(Buffer.from(hash, "hex"), derived);
  } catch (e) {
      console.error("verifyPassword internal error:", e);
      return false;
  }
}

export function hashCode(code: string, salt?: string) {
  const realSalt = salt ?? crypto.randomBytes(8).toString("hex");
  const h = crypto.createHash("sha256").update(realSalt + ":" + code).digest("hex");
  return { salt: realSalt, hash: h };
}

export function verifyCode(code: string, salt: string, hash: string) {
  if (!code || !salt || !hash) return false;
  try {
      const h = crypto.createHash("sha256").update(salt + ":" + code).digest("hex");
      return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(h, "hex"));
  } catch (e) {
      return false;
  }
}
