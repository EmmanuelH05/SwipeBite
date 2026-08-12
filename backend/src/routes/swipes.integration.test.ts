import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "http";
import crypto from "crypto";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { createAccessToken } from "../lib/auth";

let server: Server;
let baseUrl: string;

let userId: string;
let otherUserId: string;
let concurrentUserId: string;
let restaurantId: string;
let restaurantC: string;
let restaurantD: string;
let restaurantE: string;
let token: string;
let otherToken: string;
let concurrentToken: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  // Created directly via Prisma (not the register route) since these tests
  // only need a row that satisfies the swipes/preferences FK constraints --
  // going through /auth/register would also burn shared authLimiter quota
  // other test files depend on.
  const user = await prisma.user.create({
    data: {
      email: `swipebite-test-${crypto.randomUUID()}@example.com`,
      passwordHash: "unused-in-this-test",
      name: "Swipe Test User",
    },
  });
  userId = user.id;
  token = createAccessToken(userId);

  const other = await prisma.user.create({
    data: {
      email: `swipebite-test-${crypto.randomUUID()}@example.com`,
      passwordHash: "unused-in-this-test",
      name: "Other User",
    },
  });
  otherUserId = other.id;
  otherToken = createAccessToken(otherUserId);

  const concurrent = await prisma.user.create({
    data: {
      email: `swipebite-test-${crypto.randomUUID()}@example.com`,
      passwordHash: "unused-in-this-test",
      name: "Concurrent Test User",
    },
  });
  concurrentUserId = concurrent.id;
  concurrentToken = createAccessToken(concurrentUserId);

  // "chinese_restaurant" normalizes to the "asian" cluster (ml-recommender.ts)
  const restaurant = await prisma.restaurant.create({
    data: {
      yelpId: `test-place-${crypto.randomUUID()}`,
      name: "Test Restaurant",
      cuisine: "chinese_restaurant",
      priceLevel: "$$",
      photoNames: [],
    },
  });
  restaurantId = restaurant.id;

  const [c, d, e] = await Promise.all(
    [
      { name: "Test Restaurant C", cuisine: "italian_restaurant" },
      { name: "Test Restaurant D", cuisine: "mexican_restaurant" },
      { name: "Test Restaurant E", cuisine: "indian_restaurant" },
    ].map((r) =>
      prisma.restaurant.create({
        data: { yelpId: `test-place-${crypto.randomUUID()}`, priceLevel: "$$", photoNames: [], ...r },
      })
    )
  );
  restaurantC = c.id;
  restaurantD = d.id;
  restaurantE = e.id;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Deleting the users cascades their swipes and user_preferences rows
  // (schema.prisma onDelete: Cascade); the restaurants have no remaining FK
  // reference at that point.
  const cleanup = async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.user.delete({ where: { id: otherUserId } });
    await prisma.user.delete({ where: { id: concurrentUserId } });
    await prisma.restaurant.deleteMany({
      where: { id: { in: [restaurantId, restaurantC, restaurantD, restaurantE] } },
    });
  };
  await cleanup().catch((e) => console.error("swipes.integration.test.ts cleanup failed:", e));
});

function authedFetch(path: string, init: RequestInit, authToken: string) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}`, ...init.headers },
  });
}

describe("POST /swipes against a live database", () => {
  test("recording a LIKE creates the swipe and updates the preference profile", async () => {
    const res = await authedFetch(
      "/swipes",
      { method: "POST", body: JSON.stringify({ restaurantId, direction: "LIKE" }) },
      token
    );
    expect(res.status).toBe(201);
    const swipe = await res.json();
    expect(swipe.userId).toBe(userId);
    expect(swipe.restaurantId).toBe(restaurantId);
    expect(swipe.direction).toBe("LIKE");

    const dbSwipe = await prisma.swipe.findUnique({ where: { id: swipe.id } });
    expect(dbSwipe).not.toBeNull();

    // applyPreferenceUpdate runs synchronously (awaited) inside the route
    // handler, so the counters are already committed by the time the
    // response comes back -- no polling/retry needed here.
    const pref = await prisma.userPreference.findUnique({ where: { userId } });
    expect(pref).not.toBeNull();
    expect(pref?.totalLikes).toBe(1);
    expect((pref?.likedCuisines as Record<string, number>).asian).toBe(1);
  });

  test("swiping the same restaurant twice is rejected as a duplicate", async () => {
    const res = await authedFetch(
      "/swipes",
      { method: "POST", body: JSON.stringify({ restaurantId, direction: "LIKE" }) },
      token
    );
    expect(res.status).toBe(409);
  });

  test("swiping a nonexistent restaurant is rejected", async () => {
    const res = await authedFetch(
      "/swipes",
      { method: "POST", body: JSON.stringify({ restaurantId: "does-not-exist", direction: "LIKE" }) },
      token
    );
    expect(res.status).toBe(404);
  });

  test("a DISLIKE swipe writes to dislikedCuisines / totalDislikes, not the liked counters", async () => {
    const res = await authedFetch(
      "/swipes",
      { method: "POST", body: JSON.stringify({ restaurantId: restaurantE, direction: "DISLIKE" }) },
      concurrentToken
    );
    expect(res.status).toBe(201);

    const pref = await prisma.userPreference.findUnique({ where: { userId: concurrentUserId } });
    expect(pref?.totalDislikes).toBe(1);
    expect(pref?.totalLikes).toBe(0);
    expect((pref?.dislikedCuisines as Record<string, number>).indian).toBe(1);
  });

  test("concurrent swipes for the same user don't lose an update (applyPreferenceUpdate's advisory lock)", async () => {
    // This is the actual reason preferenceStore.ts serializes per-user updates
    // inside a Postgres advisory lock (see CLAUDE.md Key Invariants): two
    // swipes fired close together is the normal way this app gets used, not
    // an edge case. Without the lock, both requests can read the same
    // starting counters before either writes, and the second write silently
    // drops the first's increment -- this test fails with totalLikes === 1
    // if that regresses.
    const before = await prisma.userPreference.findUnique({ where: { userId: concurrentUserId } });
    const totalLikesBefore = before?.totalLikes ?? 0;

    const [resC, resD] = await Promise.all([
      authedFetch(
        "/swipes",
        { method: "POST", body: JSON.stringify({ restaurantId: restaurantC, direction: "LIKE" }) },
        concurrentToken
      ),
      authedFetch(
        "/swipes",
        { method: "POST", body: JSON.stringify({ restaurantId: restaurantD, direction: "LIKE" }) },
        concurrentToken
      ),
    ]);
    expect(resC.status).toBe(201);
    expect(resD.status).toBe(201);

    const after = await prisma.userPreference.findUnique({ where: { userId: concurrentUserId } });
    expect(after?.totalLikes).toBe(totalLikesBefore + 2);
    expect((after?.likedCuisines as Record<string, number>).italian).toBe(1);
    expect((after?.likedCuisines as Record<string, number>).mexican).toBe(1);
  });
});

describe("PATCH /swipes/:id/visited against a live database", () => {
  let swipeId: string;

  beforeAll(async () => {
    // otherUserId likes the same restaurant so this describe block has its
    // own swipe to mark visited, independent of the block above.
    const swipe = await prisma.swipe.create({
      data: { userId: otherUserId, restaurantId, direction: "LIKE" },
    });
    swipeId = swipe.id;
  });

  test("a user cannot mark another user's swipe as visited", async () => {
    const res = await authedFetch(
      `/swipes/${swipeId}/visited`,
      { method: "PATCH", body: JSON.stringify({ experience: "great" }) },
      token // wrong user -- this swipe belongs to otherUserId
    );
    expect(res.status).toBe(403);
  });

  test("marking a swipe visited with experience=disappointing writes a dislike signal", async () => {
    const before = await prisma.userPreference.findUnique({ where: { userId: otherUserId } });
    expect(before).toBeNull(); // otherUserId hasn't swiped/seeded anything yet

    const res = await authedFetch(
      `/swipes/${swipeId}/visited`,
      { method: "PATCH", body: JSON.stringify({ experience: "disappointing" }) },
      otherToken
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.experience).toBe("disappointing");
    expect(body.visitedAt).toBeTruthy();

    // Per CLAUDE.md: disappointing is routed through updatePreferencesOnSwipe
    // as a DISLIKE regardless of the original swipe direction (LIKE here), so
    // totalDislikes and dislikedCuisines both move even though this swipe was
    // never itself a DISLIKE.
    const pref = await prisma.userPreference.findUnique({ where: { userId: otherUserId } });
    expect(pref?.totalDislikes).toBe(1);
    expect((pref?.dislikedCuisines as Record<string, number>).asian).toBe(1);
  });

  test("rejects an invalid experience value", async () => {
    const res = await authedFetch(
      `/swipes/${swipeId}/visited`,
      { method: "PATCH", body: JSON.stringify({ experience: "amazing" }) },
      otherToken
    );
    expect(res.status).toBe(400);
  });
});
