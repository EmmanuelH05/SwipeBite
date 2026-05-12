//THIRD-PARTY LIBRARIES
import { Request, Response, NextFunction } from "express";

//LOCAL FILES
import { verifyAccessToken } from "../lib/auth";

//TYPES
export interface AuthRequest extends Request {
  userId?: string;
}

//MIDDLEWARE

/** Parses the Authorization header and attaches userId when the access token is valid. */
export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  const auth  = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) req.userId = payload.userId;
  }
  next();
}

/** Express middleware that returns 401 when no valid token is present. */
export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
