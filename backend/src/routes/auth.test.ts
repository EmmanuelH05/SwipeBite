import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "http";
import { app } from "../app";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function postJson(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Covers the validation branches every auth route resolves BEFORE touching
// the database (rate limit, then body shape/strength checks) -- reachable
// without a live DATABASE_URL. The DB-dependent branches (duplicate email,
// password verification, token issuance/rotation) need a live database; see
// CLAUDE.md for why that wasn't available when this was written, and
// lib/auth.test.ts for the token-hashing/JWT logic that IS covered.
describe("POST /auth/register", () => {
  test("rejects a missing email", async () => {
    const res = await postJson("/auth/register", { password: "TestPass123", name: "Test" });
    expect(res.status).toBe(400);
  });

  test("rejects a missing password", async () => {
    const res = await postJson("/auth/register", { email: "a@b.com", name: "Test" });
    expect(res.status).toBe(400);
  });

  test("rejects a missing name", async () => {
    const res = await postJson("/auth/register", { email: "a@b.com", password: "TestPass123" });
    expect(res.status).toBe(400);
  });

  test("rejects a weak password before ever querying the database", async () => {
    const res = await postJson("/auth/register", { email: "a@b.com", password: "weak", name: "Test" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/password/i);
  });
});

describe("POST /auth/login", () => {
  test("rejects a missing email", async () => {
    const res = await postJson("/auth/login", { password: "TestPass123" });
    expect(res.status).toBe(400);
  });

  test("rejects a missing password", async () => {
    const res = await postJson("/auth/login", { email: "a@b.com" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/refresh", () => {
  test("rejects a missing refreshToken", async () => {
    const res = await postJson("/auth/refresh", {});
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/logout", () => {
  test("rejects a missing refreshToken", async () => {
    const res = await postJson("/auth/logout", {});
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  test("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/auth/me`);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /auth/me/onboarding", () => {
  test("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/auth/me/onboarding`, { method: "PATCH" });
    expect(res.status).toBe(401);
  });
});
