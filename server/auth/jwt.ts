
import jwt from "jsonwebtoken";

const SECRET = process.env.AUTH_JWT_SECRET || "";

if (!SECRET) {
  console.warn("[AUTH] AUTH_JWT_SECRET is not set in environment variables!");
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
