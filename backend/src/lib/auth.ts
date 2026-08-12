//STANDARD LIBRARY
import crypto from "crypto";

//THIRD-PARTY LIBRARIES
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

//TYPES
export type JWTPayload = { userId: string; type: "access" };

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

//CONSTANTS
const JWT_SECRET    = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";
const SALT_ROUNDS   = 12;

// Access tokens expire quickly — if stolen, the window of misuse is small.
// Refresh tokens live longer but are stored in the DB so they can be revoked.
export const ACCESS_TOKEN_EXPIRY_MS  = 15 * 60 * 1000;         // 15 minutes
export const REFRESH_TOKEN_EXPIRY_MS = 7  * 24 * 60 * 60 * 1000; // 7 days

const ACCESS_TOKEN_EXPIRY_JWT  = "15m";
const REFRESH_TOKEN_EXPIRY_JWT = "7d"; // used only as a belt-and-suspenders check

// Only HS256 is ever used to sign tokens in this app. Pinning verify() to it
// explicitly is defense-in-depth against algorithm-confusion attacks -- not
// currently exploitable since no asymmetric keys exist anywhere here, but
// free to close and cheap insurance against a future config change.
const ALLOWED_JWT_ALGORITHMS: jwt.Algorithm[] = ["HS256"];

//HELPERS

/** Hashes a plain-text password using bcrypt. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Fixed bcrypt hash of an arbitrary string, cost factor 12 (matches
// SALT_ROUNDS) -- used only so a login attempt against a nonexistent email
// still runs one bcrypt.compare of the same cost. Never a real password hash.
const DUMMY_PASSWORD_HASH = "$2b$12$LnUY6MYHhBpqll1uSdAbqOxhgcL91YcQm/2KVVSww23rZlYmwloXS";

/**
 * Compares a plain-text password against a stored bcrypt hash, always
 * running one bcrypt.compare of matching cost even when the account doesn't
 * exist (pass hash = null/undefined) -- compares against DUMMY_PASSWORD_HASH
 * instead of short-circuiting.
 *
 * Without this, "email doesn't exist" (skip the compare entirely, ~1ms) and
 * "email exists, password wrong" (~250ms bcrypt cost-12 compare) are
 * trivially distinguishable by response time despite the identical error
 * message -- defeating the anti-enumeration intent of that shared message.
 */
export function verifyPasswordConstantTime(plain: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(plain, hash ?? DUMMY_PASSWORD_HASH);
}

/**
 * Validates password strength before hashing.
 * Returns an error message or null when the password passes.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8)
    return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password))
    return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password))
    return "Password must contain at least one number";
  return null;
}

/**
 * Issues a short-lived JWT access token.
 * Only carries the userId — nothing sensitive.
 */
export function createAccessToken(userId: string): string {
  return jwt.sign({ userId, type: "access" } satisfies JWTPayload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY_JWT,
  });
}

/**
 * Verifies a JWT access token and returns the payload, or null if invalid/expired.
 * Only accepts tokens with type = "access" to prevent refresh tokens being used here.
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ALLOWED_JWT_ALGORITHMS }) as JWTPayload;
    if (payload.type !== "access") return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generates a cryptographically secure random refresh token string.
 * This gets stored in the DB (hashed) and sent to the client as an opaque token.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

/** Returns the Date when a freshly-generated refresh token should expire. */
export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
}

/**
 * Hashes a refresh token for storage/lookup. SHA-256, not bcrypt: the input
 * is already a 64-byte crypto.randomBytes value (128 hex chars), not a
 * human-chosen low-entropy secret -- there's nothing for a slow KDF to
 * protect against here, since brute-forcing the token itself is infeasible
 * regardless of hash speed. A DB leak now exposes hashes an attacker can't
 * turn back into usable tokens, instead of the usable tokens themselves.
 */
export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
