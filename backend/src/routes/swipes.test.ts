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
// then body validation) -- the parts reachable without a live database.
// The DB-dependent branches (restaurant lookup, swipe creation, the
// preferenceStore transaction) are exercised by ml-recommender.test.ts and
// personalization.test.ts at the pure-logic level; a live integration test
// of the full route needs a reachable DATABASE_URL, which wasn't available
// in the environment these were written in (see CLAUDE.md).
describe("POST /swipes", () => {
  test("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/swipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: "r1", direction: "LIKE" }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects a missing restaurantId", async () => {
    const token = createAccessToken("test-user-id");
    const res = await fetch(`${baseUrl}/swipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ direction: "LIKE" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects a direction that isn't LIKE or DISLIKE", async () => {
    const token = createAccessToken("test-user-id");
    const res = await fetch(`${baseUrl}/swipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ restaurantId: "r1", direction: "MAYBE" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /swipes/:id/visited", () => {
  test("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/swipes/some-id/visited`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experience: "great" }),
    });
    expect(res.status).toBe(401);
  });
});
