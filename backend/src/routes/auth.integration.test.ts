import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import type { Server } from "http";
import crypto from "crypto";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { authLimiter, refreshLimiter } from "../lib/rateLimit";
import { hashRefreshToken } from "../lib/auth";

let server: Server;
let baseUrl: string;

const testEmail = `swipebite-test-${crypto.randomUUID()}@example.com`;
const testPassword = "TestPass123";
let createdUserId: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(() => {
  // These limiters are process-wide singletons shared across every test file
  // in one `bun test` process (auth.test.ts's validation-only tests consume
  // against the same 15-min window). Resetting once in beforeAll isn't
  // enough -- Bun's file discovery order isn't alphabetical and isn't
  // guaranteed, so whichever file runs first can eat into the other's quota.
  // Resetting before every test keeps each test's budget independent of
  // both file order and how many tests ran before it in this file.
  authLimiter.reset();
  refreshLimiter.reset();
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Keyed on the known test email rather than the captured user id -- if
  // register 500s after creating the row but before the response assertion
  // runs, createdUserId would never get set and the row would leak.
  // Cascades to refresh_tokens (see schema.prisma onDelete: Cascade).
  await prisma.user
    .deleteMany({ where: { email: testEmail } })
    .catch((e) => console.error("auth.integration.test.ts cleanup failed:", e));
});

function postJson(path: string, body: unknown, token?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

// Full round trip against the live database: register -> login -> refresh
// rotation -> reuse-detection revoking the whole chain -> logout. The
// validation-only branches (missing fields, weak password) are already
// covered in auth.test.ts without a DB; this file is everything past that.
describe("auth flow against a live database", () => {
  test("register creates a persisted user and returns tokens", async () => {
    const res = await postJson("/auth/register", {
      email: testEmail,
      password: testPassword,
      name: "Test User",
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toBe(testEmail);
    createdUserId = body.user.id;

    const dbUser = await prisma.user.findUnique({ where: { id: createdUserId } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.passwordHash).not.toBe(testPassword); // hashed, not plaintext

    const dbToken = await prisma.refreshToken.findFirst({ where: { userId: createdUserId } });
    expect(dbToken).not.toBeNull();
    expect(dbToken?.token).toBe(hashRefreshToken(body.refreshToken)); // stored hashed, not raw
  });

  test("registering the same email again is rejected", async () => {
    const res = await postJson("/auth/register", {
      email: testEmail,
      password: testPassword,
      name: "Duplicate",
    });
    expect(res.status).toBe(409);
  });

  test("login with correct credentials succeeds and issues a new token pair", async () => {
    const res = await postJson("/auth/login", { email: testEmail, password: testPassword });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.id).toBe(createdUserId);
  });

  test("login with the wrong password is rejected with the generic message", async () => {
    const res = await postJson("/auth/login", { email: testEmail, password: "WrongPass123" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });

  test("login with a nonexistent email is rejected with the same generic message", async () => {
    const res = await postJson("/auth/login", {
      email: `nope-${crypto.randomUUID()}@example.com`,
      password: "WhoKnows123",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });

  test("GET /auth/me returns the authenticated user", async () => {
    const login = await postJson("/auth/login", { email: testEmail, password: testPassword });
    const { accessToken } = await login.json();

    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(createdUserId);
    expect(body.email).toBe(testEmail);
  });

  test("refresh rotates the token: old token is revoked, new pair works", async () => {
    const login = await postJson("/auth/login", { email: testEmail, password: testPassword });
    const { refreshToken: firstRefresh } = await login.json();

    const refreshRes = await postJson("/auth/refresh", { refreshToken: firstRefresh });
    expect(refreshRes.status).toBe(200);
    const { accessToken: secondAccess, refreshToken: secondRefresh } = await refreshRes.json();
    expect(secondRefresh).not.toBe(firstRefresh);

    // The new access token should work
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${secondAccess}` },
    });
    expect(meRes.status).toBe(200);

    // The rotated-away first token is now revoked in the DB
    const oldRow = await prisma.refreshToken.findUnique({
      where: { token: hashRefreshToken(firstRefresh) },
    });
    expect(oldRow).not.toBeNull();
    expect(oldRow!.revokedAt).not.toBeNull();

    // Presenting the already-rotated first token again is reuse -- and per
    // CLAUDE.md, reuse revokes the user's ENTIRE active chain, not just this token.
    const reuseRes = await postJson("/auth/refresh", { refreshToken: firstRefresh });
    expect(reuseRes.status).toBe(401);

    // The second (until-now valid) token should now ALSO be revoked as a result
    const secondRefreshAgain = await postJson("/auth/refresh", { refreshToken: secondRefresh });
    expect(secondRefreshAgain.status).toBe(401);
  });

  test("logout revokes the token so a subsequent refresh fails", async () => {
    const login = await postJson("/auth/login", { email: testEmail, password: testPassword });
    const { refreshToken } = await login.json();

    const logoutRes = await postJson("/auth/logout", { refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await postJson("/auth/refresh", { refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });
});
