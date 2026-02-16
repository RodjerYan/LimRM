
import jwt from "jsonwebtoken";

// FALLBACK SECRET IS CRITICAL: jwt.sign throws if secret is empty string
const SECRET = process.env.AUTH_JWT_SECRET || "default-dev-secret-do-not-use-in-prod-limrm-geo";

if (!process.env.AUTH_JWT_SECRET) {
  console.warn("[AUTH] AUTH_JWT_SECRET is not set. Using insecure default secret.");
}

export type JwtPayload = {
  email: string;
  role: "admin" | "user";
  lastName: string;
  firstName: string;
};

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
