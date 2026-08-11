import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "http";
import crypto from "crypto";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { createAccessToken } from "../lib/auth";

let server: Server;
let baseUrl: string;
let userId: string;
let capUserId: string;
let token: string;
let capToken: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  // Both users are created up front (rather than one mid-test) so cleanup in
  // afterAll doesn't depend on a test's assertions passing first -- if it
  // did, an assertion failure partway through a test would leak that user's
  // row (and its cascaded user_preferences row) into the live DB permanently.
  const [user, capUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `swipebite-test-${crypto.randomUUID()}@example.com`,
        passwordHash: "unused-in-this-test",
        name: "Onboarding Test User",
      },
    }),
    prisma.user.create({
      data: {
        email: `swipebite-test-${crypto.randomUUID()}@example.com`,
        passwordHash: "unused-in-this-test",
        name: "Cap Test User",
      },
    }),
  ]);
  userId = user.id;
  token = createAccessToken(userId);
  capUserId = capUser.id;
  capToken = createAccessToken(capUserId);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // cascades user_preferences (schema.prisma onDelete: Cascade)
  await prisma.user
    .deleteMany({ where: { id: { in: [userId, capUserId] } } })
    .catch((e) => console.error("onboarding.integration.test.ts cleanup failed:", e));
});

function patchJson(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

// The transaction under test (routes/onboarding.ts's PATCH /seed): runs
// updatePreferencesOnSwipe seedStrength times per selected cuisine inside an
// advisory-locked $transaction, then guards against re-seeding via seededAt.
describe("PATCH /onboarding/seed against a live database", () => {
  test("seeds the preference profile with seedStrength LIKEs per cuisine", async () => {
    const res = await patchJson("/onboarding/seed", {
      cuisines: ["asian", "italian"],
      priceLevel: "$$",
      seedStrength: 3,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalLikes).toBe(6); // 2 cuisines * seedStrength 3
    expect(body.likedCuisines.asian).toBe(3);
    expect(body.likedCuisines.italian).toBe(3);

    const pref = await prisma.userPreference.findUnique({ where: { userId } });
    expect(pref).not.toBeNull();
    expect(pref?.seededAt).not.toBeNull();
    expect(pref?.totalLikes).toBe(6);
    expect((pref?.priceCounts as Record<string, number>)["$$"]).toBe(6);
  });

  test("a second seed attempt is rejected as already-seeded (idempotent guard)", async () => {
    const res = await patchJson("/onboarding/seed", {
      cuisines: ["mexican"],
      priceLevel: "$",
      seedStrength: 5,
    });
    expect(res.status).toBe(409);

    // Confirm the guard actually prevented a second write, not just a
    // response-level no-op -- the counters from the first seed are untouched.
    const pref = await prisma.userPreference.findUnique({ where: { userId } });
    expect(pref?.totalLikes).toBe(6);
    expect((pref?.likedCuisines as Record<string, number>).mexican).toBeUndefined();
  });

  test("caps seedStrength at the documented maximum of 10", async () => {
    const res = await fetch(`${baseUrl}/onboarding/seed`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${capToken}` },
      body: JSON.stringify({ cuisines: ["seafood"], priceLevel: "$$$", seedStrength: 999 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.likedCuisines.seafood).toBe(10);
  });
});
