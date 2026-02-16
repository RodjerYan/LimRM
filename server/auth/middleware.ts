
import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "./jwt";

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: any, res: any, next: NextFunction) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) {
       res.status(401).json({ error: "NO_TOKEN" });
       return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "BAD_TOKEN" });
  }
}

export function requireAdmin(req: any, res: any, next: NextFunction) {
  if (req.user?.role !== "admin") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
  }
  next();
}
