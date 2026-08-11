import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "http";
import { app } from "../app";
import { createAccessToken } from "../lib/auth";

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

// These cover the branches that resolve before any DB call runs (auth check,
// then body validation) -- same constraint as swipes.test.ts: a live
// integration test of the seeding transaction needs a reachable DATABASE_URL,
// which wasn't available in the environment these were written in (CLAUDE.md).
describe("PATCH /onboarding/seed", () => {
  const token = createAccessToken("test-user-id");
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  test("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/onboarding/seed`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuisines: ["asian"], priceLevel: "$$" }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects an empty cuisines array", async () => {
    const res = await fetch(`${baseUrl}/onboarding/seed`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ cuisines: [], priceLevel: "$$" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects a cuisines array over the cap", async () => {
    const res = await fetch(`${baseUrl}/onboarding/seed`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ cuisines: Array(21).fill("asian"), priceLevel: "$$" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects a non-string cuisine element instead of 500ing downstream", async () => {
    const res = await fetch(`${baseUrl}/onboarding/seed`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ cuisines: [{ evil: true }], priceLevel: "$$" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects a cuisine not in the known cluster set", async () => {
    const res = await fetch(`${baseUrl}/onboarding/seed`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ cuisines: ["not-a-real-cuisine"], priceLevel: "$$" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects an invalid priceLevel", async () => {
    const res = await fetch(`${baseUrl}/onboarding/seed`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ cuisines: ["asian"], priceLevel: "expensive" }),
    });
    expect(res.status).toBe(400);
  });
});
