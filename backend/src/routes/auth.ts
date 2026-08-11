//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma } from "../lib/prisma";
import { authLimiter, refreshLimiter } from "../lib/rateLimit";
import { clientIp } from "../lib/clientIp";
import {
  hashPassword,
  verifyPasswordConstantTime,
  validatePasswordStrength,
  createAccessToken,
  generateRefreshToken,
  refreshTokenExpiry,
  hashRefreshToken,
} from "../lib/auth";
import { requireAuth } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

//CONSTANTS
const router = Router();

//HELPERS

/**
 * Persists a new refresh token in the DB (hashed -- a DB leak shouldn't hand
 * over usable sessions) and returns the raw token string for the client.
 */
async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { token: hashRefreshToken(raw), userId, expiresAt: refreshTokenExpiry() },
  });
  return raw;
}

/** Looks up a refresh token row by the raw string the client presented. */
async function findRefreshToken(rawToken: string) {
  return prisma.refreshToken.findUnique({ where: { token: hashRefreshToken(rawToken) } });
}

/** Marks a refresh token as revoked. */
async function revokeRefreshToken(id: string): Promise<void> {
  await prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

//ROUTES

/** POST /auth/register — create account, returns access + refresh tokens */
router.post("/register", async (req: AuthRequest, res) => {
  try {
    const ip = clientIp(req);
    if (!authLimiter.consume(ip))
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
    if (!authLimiter.consume(ip))
      return res.status(429).json({ error: "Too many requests. Please wait a few minutes." });

    const { email, password } = req.body;
    if (!email || typeof email !== "string" || !email.trim())
      return res.status(400).json({ error: "Email is required" });
    if (!password || typeof password !== "string")
      return res.status(400).json({ error: "Password is required" });

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

    // Same error message whether email is wrong or password is wrong — and
    // always run a real bcrypt compare (against a dummy hash when the
    // account doesn't exist) so both cases take the same time. Skipping the
    // compare entirely for a missing account would make "no such email"
    // (~1ms) trivially distinguishable from "wrong password" (~250ms) by
    // response time alone, despite the identical error message.
    const ok = await verifyPasswordConstantTime(password, user?.passwordHash);
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
    if (!refreshLimiter.consume(ip))
      return res.status(429).json({ error: "Too many requests. Please wait a few minutes." });

    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== "string")
      return res.status(400).json({ error: "refreshToken is required" });

    const stored = await findRefreshToken(refreshToken);
    if (!stored)
      return res.status(401).json({ error: "Invalid or expired refresh token" });

    if (stored.revokedAt) {
      // Reuse of an already-rotated token: either a stolen token replayed
      // after the legitimate client already rotated past it, or two clients
      // racing on the same stored token. Either way, this specific token
      // string should never be presented again -- treat it as theft and
      // revoke this user's entire refresh-token chain, not just this one row,
      // so a thief who captured an earlier token in the chain can't keep
      // rotating forward from it after being caught once.
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data:  { revokedAt: new Date() },
      });
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    if (stored.expiresAt < new Date())
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
    await prisma.refreshToken.updateMany({
      where: { token: hashRefreshToken(refreshToken), revokedAt: null },
      data:  { revokedAt: new Date() },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /auth/logout error:", err);
    return res.status(500).json({ error: "Failed to log out" });
  }
});

/** GET /auth/me — returns the authenticated user */
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId! },
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
router.patch("/me/onboarding", requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.user.update({
      where: { id: req.userId! },
      data:  { hasCompletedOnboarding: true },
    });
    return res.json({ hasCompletedOnboarding: true });
  } catch (err) {
    console.error("PATCH /auth/me/onboarding error:", err);
    return res.status(500).json({ error: "Failed to update onboarding status" });
  }
});

export default router;
