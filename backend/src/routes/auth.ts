//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma } from "../lib/prisma";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  createAccessToken,
  generateRefreshToken,
  refreshTokenExpiry,
} from "../lib/auth";
import type { AuthRequest } from "../middleware/auth";

//TYPES
type RefreshTokenRow = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

//CONSTANTS
const router = Router();

// Brute-force protection: max 10 attempts per IP per 15 minutes on sensitive routes
const AUTH_LIMIT     = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const authAttempts   = new Map<string, { count: number; resetAt: number }>();

// Tighter limit for /refresh — legitimate clients call it at most once per access-token
// lifetime (15 min), so 20 requests per 15-min window per IP is generous while still
// blocking automated token-cycling attacks.
const REFRESH_LIMIT     = 20;
const refreshAttempts   = new Map<string, { count: number; resetAt: number }>();

//HELPERS

/** Returns client IP, respecting reverse-proxy forwarding headers. */
function clientIp(req: AuthRequest): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

/** Returns true when the IP is within its attempt quota. */
function checkAuthLimit(ip: string): boolean {
  const entry = authAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) return true;
  return entry.count < AUTH_LIMIT;
}

/** Increments the auth attempt counter for an IP. */
function recordAuthAttempt(ip: string): void {
  const entry = authAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: Date.now() + AUTH_WINDOW_MS });
  } else {
    entry.count++;
  }
}

/** Returns true when the IP is within the refresh-endpoint quota. */
function checkRefreshLimit(ip: string): boolean {
  const entry = refreshAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) return true;
  return entry.count < REFRESH_LIMIT;
}

/** Increments the refresh attempt counter for an IP. */
function recordRefreshAttempt(ip: string): void {
  const entry = refreshAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    refreshAttempts.set(ip, { count: 1, resetAt: Date.now() + AUTH_WINDOW_MS });
  } else {
    entry.count++;
  }
}

/** Persists a new refresh token in the DB and returns the raw token string. */
async function issueRefreshToken(userId: string): Promise<string> {
  const raw    = generateRefreshToken();
  const expiry = refreshTokenExpiry();
  const id     = `rt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await prisma.$executeRaw`
    INSERT INTO "refresh_tokens" ("id", "token", "userId", "expiresAt")
    VALUES (${id}, ${raw}, ${userId}, ${expiry})
  `;

  return raw;
}

/** Fetches a refresh token row by its raw string value. */
async function findRefreshToken(token: string): Promise<RefreshTokenRow | null> {
  const rows = await prisma.$queryRaw<RefreshTokenRow[]>`
    SELECT "id", "token", "userId", "expiresAt", "revokedAt"
    FROM "refresh_tokens"
    WHERE "token" = ${token}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Marks a refresh token as revoked. */
async function revokeRefreshToken(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "refresh_tokens"
    SET "revokedAt" = NOW()
    WHERE "id" = ${id}
  `;
}

//ROUTES

/** POST /auth/register — create account, returns access + refresh tokens */
router.post("/register", async (req: AuthRequest, res) => {
  try {
    const ip = clientIp(req);
    if (!checkAuthLimit(ip))
      return res.status(429).json({ error: "Too many requests. Please wait a few minutes." });

    const { email, password, name } = req.body;

    if (!email || typeof email !== "string" || !email.trim())
      return res.status(400).json({ error: "Email is required" });
    if (!password || typeof password !== "string")
      return res.status(400).json({ error: "Password is required" });
    if (!name || typeof name !== "string" || !name.trim())
      return res.status(400).json({ error: "Name is required" });

    const strengthError = validatePasswordStrength(password);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    recordAuthAttempt(ip);
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email: email.trim().toLowerCase(), passwordHash, name: name.trim() },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const accessToken  = createAccessToken(user.id);
    const refreshToken = await issueRefreshToken(user.id);

    return res.status(201).json({ accessToken, refreshToken, user });
  } catch (err) {
    console.error("POST /auth/register error:", err);
    return res.status(500).json({ error: "Failed to create account" });
  }
});

/** POST /auth/login — sign in, returns access + refresh tokens */
router.post("/login", async (req: AuthRequest, res) => {
  try {
    const ip = clientIp(req);
    if (!checkAuthLimit(ip))
      return res.status(429).json({ error: "Too many requests. Please wait a few minutes." });
    recordAuthAttempt(ip);

    const { email, password } = req.body;
    if (!email || typeof email !== "string" || !email.trim())
      return res.status(400).json({ error: "Email is required" });
    if (!password || typeof password !== "string")
      return res.status(400).json({ error: "Password is required" });

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

    // Same error message whether email is wrong or password is wrong — prevents email enumeration
    const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok)
      return res.status(401).json({ error: "Invalid email or password" });

    const accessToken  = createAccessToken(user.id);
    const refreshToken = await issueRefreshToken(user.id);

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error("POST /auth/login error:", err);
    return res.status(500).json({ error: "Failed to sign in" });
  }
});

/**
 * POST /auth/refresh — exchange a refresh token for a new access + refresh pair.
 * The old token is revoked immediately (token rotation prevents replay attacks).
 * Body: { refreshToken: string }
 */
router.post("/refresh", async (req: AuthRequest, res) => {
  try {
    const ip = clientIp(req);
    if (!checkRefreshLimit(ip))
      return res.status(429).json({ error: "Too many requests. Please wait a few minutes." });
    recordRefreshAttempt(ip);

    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== "string")
      return res.status(400).json({ error: "refreshToken is required" });

    const stored = await findRefreshToken(refreshToken);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date())
      return res.status(401).json({ error: "Invalid or expired refresh token" });

    // Revoke the old token, then issue a fresh pair
    await revokeRefreshToken(stored.id);

    const newAccessToken  = createAccessToken(stored.userId);
    const newRefreshToken = await issueRefreshToken(stored.userId);

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("POST /auth/refresh error:", err);
    return res.status(500).json({ error: "Failed to refresh token" });
  }
});

/**
 * POST /auth/logout — revoke a refresh token.
 * Body: { refreshToken: string }
 * The client should drop the access token from memory/storage as well.
 */
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== "string")
      return res.status(400).json({ error: "refreshToken is required" });

    // Idempotent: no error if token doesn't exist or is already revoked
    await prisma.$executeRaw`
      UPDATE "refresh_tokens"
      SET "revokedAt" = NOW()
      WHERE "token" = ${refreshToken} AND "revokedAt" IS NULL
    `;

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /auth/logout error:", err);
    return res.status(500).json({ error: "Failed to log out" });
  }
});

/** GET /auth/me — returns the authenticated user */
router.get("/me", async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Not authenticated" });

    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { id: true, email: true, name: true, createdAt: true, hasCompletedOnboarding: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json(user);
  } catch (err) {
    console.error("GET /auth/me error:", err);
    return res.status(500).json({ error: "Failed to get user" });
  }
});

/** PATCH /auth/me/onboarding — mark onboarding complete */
router.patch("/me/onboarding", async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Not authenticated" });
    await prisma.user.update({
      where: { id: req.userId },
      data:  { hasCompletedOnboarding: true },
    });
    return res.json({ hasCompletedOnboarding: true });
  } catch (err) {
    console.error("PATCH /auth/me/onboarding error:", err);
    return res.status(500).json({ error: "Failed to update onboarding status" });
  }
});

export default router;
