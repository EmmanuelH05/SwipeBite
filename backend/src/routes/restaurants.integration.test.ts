import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import type { Server } from "http";
import crypto from "crypto";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { createAccessToken } from "../lib/auth";
import { restaurantLoadLimiter } from "../lib/rateLimit";

let server: Server;
let baseUrl: string;
const token = createAccessToken("test-user-id"); // requireAuth only checks JWT validity here

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.GOOGLE_API_KEY;

// Snapshotted before any load call runs, so afterAll can delete every row
// this file created regardless of what key it landed under -- including the
// regression this suite guards against (routes/restaurants.ts's comment on
// the keyless-place filter): a place with no id/name getting a synthetic key
// minted fresh on every load, which a yelpId-prefix filter alone can't catch
// once it happens, and which would otherwise leak into the real (shared,
// additive) restaurant catalog forever. See CLAUDE.md's "Restaurant table is
// a shared additive catalog" invariant.
let existingRestaurantIds: Set<string>;

const testRunId = crypto.randomUUID();
const placeIdA = `test-place-${testRunId}-a`;
const placeIdB = `test-place-${testRunId}-b`;
const placeIdC = `test-place-${testRunId}-c`;

let placesApiCallCount = 0;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  existingRestaurantIds = new Set((await prisma.restaurant.findMany({ select: { id: true } })).map((r) => r.id));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  globalThis.fetch = originalFetch;
  process.env.GOOGLE_API_KEY = originalApiKey;

  const cleanup = async () => {
    const current = await prisma.restaurant.findMany({ select: { id: true } });
    const createdByThisFile = current.filter((r) => !existingRestaurantIds.has(r.id)).map((r) => r.id);
    if (createdByThisFile.length > 0) {
      await prisma.restaurant.deleteMany({ where: { id: { in: createdByThisFile } } });
    }
  };
  await cleanup().catch((e) => console.error("restaurants.integration.test.ts cleanup failed:", e));
});

beforeEach(() => {
  restaurantLoadLimiter.reset();
  placesApiCallCount = 0;
  // Always a dummy key, never the real one from .env -- the mock below never
  // inspects it, so a real key buys nothing, but it means any gap in
  // interception (a future refactor off global fetch, a URL that doesn't
  // match the prefix check) fails loudly against Google instead of silently
  // succeeding and upserting real data into the shared catalog under a key
  // cleanup doesn't know about.
  process.env.GOOGLE_API_KEY = "test-google-api-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function postLoad(location: string) {
  return fetch(`${baseUrl}/restaurants/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ location }),
  });
}

/** Mocks a single-page Google Places response, leaving all other requests (to our own test server) untouched. */
function mockGooglePlaces(places: unknown[], opts: { ok?: boolean; nextPageToken?: string } = {}) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("https://places.googleapis.com")) {
      placesApiCallCount++;
      if (opts.ok === false) {
        return new Response("upstream error", { status: 503 });
      }
      return Response.json({ places, ...(opts.nextPageToken ? { nextPageToken: opts.nextPageToken } : {}) });
    }
    return originalFetch(input as any, init);
  }) as typeof fetch;
}

describe("POST /restaurants/load against a live database", () => {
  let totalAfterFirstLoad: number;

  test("upserts a new place from Google Places into the catalog", async () => {
    mockGooglePlaces([
      {
        id: placeIdA,
        displayName: { text: "Test Dumpling House" },
        formattedAddress: "123 Test St",
        priceLevel: "PRICE_LEVEL_MODERATE",
        types: ["chinese_restaurant", "restaurant", "food", "point_of_interest"],
        photos: [{ name: "places/abc/photos/1" }],
      },
    ]);

    const res = await postLoad("Test City");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.loaded).toBe(1);
    expect(body.partial).toBeUndefined();
    expect(placesApiCallCount).toBeGreaterThan(0); // confirms the mock was actually exercised, not bypassed

    const row = await prisma.restaurant.findUnique({ where: { yelpId: placeIdA } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe("Test Dumpling House");
    expect(row?.cuisine).toBe("chinese_restaurant");
    expect(row?.priceLevel).toBe("$$");
    expect(row?.photoNames).toEqual(["places/abc/photos/1"]);

    totalAfterFirstLoad = await prisma.restaurant.count();
  });

  test("loading the same place again updates the existing row instead of duplicating it (additive catalog invariant)", async () => {
    mockGooglePlaces([
      {
        id: placeIdA,
        displayName: { text: "Test Dumpling House (Renamed)" },
        priceLevel: "PRICE_LEVEL_EXPENSIVE",
        types: ["chinese_restaurant"],
      },
    ]);

    const res = await postLoad("Test City");
    expect(res.status).toBe(200);
    expect((await res.json()).loaded).toBe(1);

    const row = await prisma.restaurant.findUnique({ where: { yelpId: placeIdA } });
    expect(row?.name).toBe("Test Dumpling House (Renamed)");
    expect(row?.priceLevel).toBe("$$$");

    // The real invariant: total catalog size doesn't grow from re-loading a
    // place that already exists. yelpId's DB-level unique constraint alone
    // can't prove this (findUnique can only ever return 0 or 1 row by
    // construction) -- a total-count comparison across the two loads is what
    // actually catches a key-stability regression (e.g. re-deriving a
    // different key for the same place on a second load).
    expect(await prisma.restaurant.count()).toBe(totalAfterFirstLoad);
  });

  test("skips a place with neither id nor name rather than inserting it under a synthetic key", async () => {
    mockGooglePlaces([
      { formattedAddress: "no id or name here", types: ["restaurant"] },
      { id: placeIdB, displayName: { text: "Test Noodle Bar" }, types: ["japanese_restaurant"] },
    ]);

    const res = await postLoad("Test City");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.loaded).toBe(1); // only placeIdB, the keyless one was filtered out

    const row = await prisma.restaurant.findUnique({ where: { yelpId: placeIdB } });
    expect(row).not.toBeNull();

    // Confirms no synthetic-key row snuck in for the keyless place either --
    // total growth from this load is exactly 1, not 2.
    expect(await prisma.restaurant.count()).toBe(totalAfterFirstLoad + 1);
  });

  test("reports partial:true when a later page fails, instead of a clean success", async () => {
    let call = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://places.googleapis.com")) {
        call++;
        placesApiCallCount++;
        if (call === 1) {
          return Response.json({
            places: [{ id: placeIdC, displayName: { text: "Page 1 Place" }, types: ["restaurant"] }],
            nextPageToken: "page-2-token",
          });
        }
        return new Response("upstream error", { status: 503 });
      }
      return originalFetch(input as any, init);
    }) as typeof fetch;

    const res = await postLoad("Test City");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partial).toBe(true);
    expect(body.loaded).toBe(1); // page 1's result was still upserted
    expect(placesApiCallCount).toBe(2); // confirms it actually paginated before failing

    const row = await prisma.restaurant.findUnique({ where: { yelpId: placeIdC } });
    expect(row).not.toBeNull();
  });

  test("returns 502 when the very first page fails", async () => {
    mockGooglePlaces([], { ok: false });
    const res = await postLoad("Test City");
    expect(res.status).toBe(502);
    expect(placesApiCallCount).toBeGreaterThan(0);
  });
});
