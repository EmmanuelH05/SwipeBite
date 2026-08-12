import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getAuthHeaders,
  getPhotoUrl,
  formatCuisine,
  getOpenStatus,
  apiFetch,
} from "./utils";
import { API_URL, TOKEN_KEY } from "./constants";

// bun:test runs in a Node-like environment with no window/localStorage by
// default (utils.ts's token helpers all guard on `typeof window`). A minimal
// in-memory polyfill is enough -- these functions only ever call
// localStorage's four basic methods, so pulling in a full DOM library
// (jsdom/happy-dom) for this would be pure overhead. Deleted in afterEach --
// bun:test shares one global object across every file in a run, so leaving
// these defined would leak into any other frontend test file added later.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe("token storage helpers", () => {
  test("setTokens then getAccessToken/getRefreshToken round-trip", () => {
    setTokens("access-1", "refresh-1");
    expect(getAccessToken()).toBe("access-1");
    expect(getRefreshToken()).toBe("refresh-1");
  });

  test("getAccessToken/getRefreshToken return null when nothing is stored", () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  test("clearTokens removes both tokens", () => {
    setTokens("access-1", "refresh-1");
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  test("setTokens overwrites a previously stored pair", () => {
    setTokens("access-1", "refresh-1");
    setTokens("access-2", "refresh-2");
    expect(getAccessToken()).toBe("access-2");
    expect(getRefreshToken()).toBe("refresh-2");
  });

  test("all four helpers are no-ops/null when window is undefined (SSR)", () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(() => setTokens("access-1", "refresh-1")).not.toThrow();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(() => clearTokens()).not.toThrow();
  });
});

describe("getAuthHeaders", () => {
  test("includes Content-Type but no Authorization when no token is stored", () => {
    const headers = getAuthHeaders() as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBeUndefined();
  });

  test("includes a Bearer Authorization header when a token is stored", () => {
    setTokens("access-1", "refresh-1");
    const headers = getAuthHeaders() as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer access-1");
  });
});

describe("getPhotoUrl", () => {
  test("builds the proxy URL with the photo name URL-encoded", () => {
    const url = getPhotoUrl("places/abc123/photos/xyz789");
    expect(url).toBe(`${API_URL}/places/photo?name=places%2Fabc123%2Fphotos%2Fxyz789`);
  });
});

describe("formatCuisine", () => {
  test("replaces underscores with spaces and title-cases each word", () => {
    expect(formatCuisine("italian_restaurant")).toBe("Italian Restaurant");
  });

  test("normalizes an already-uppercase or mixed-case word to title case", () => {
    expect(formatCuisine("BBQ")).toBe("Bbq");
    expect(formatCuisine("mExIcAn")).toBe("Mexican");
  });

  test("handles a single word with no underscores", () => {
    expect(formatCuisine("seafood")).toBe("Seafood");
  });
});

describe("getOpenStatus", () => {
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const RealDate = globalThis.Date;

  // getOpenStatus calls `new Date()` internally with no way to inject a
  // clock, and building fixtures as real-time-relative offsets (e.g. "now +
  // 3h") silently wraps past midnight for part of every day, producing a
  // fixture that means something different from what the test intended --
  // this is exactly what broke here originally (an earlier version of this
  // file failed for ~4 hours out of every 24). Freezing `now` to a fixed,
  // known instant makes every fixture in this block deterministic regardless
  // of when the suite actually runs.
  function mockNow(fixed: Date): void {
    class MockDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixed.getTime());
        else super(...(args as ConstructorParameters<typeof Date>));
      }
      static override now(): number {
        return fixed.getTime();
      }
    }
    (globalThis as unknown as { Date: typeof Date }).Date = MockDate as unknown as typeof Date;
  }

  afterEach(() => {
    (globalThis as unknown as { Date: typeof Date }).Date = RealDate;
  });

  function fmt(d: Date): string {
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  /** Builds a 7-line opening-hours string with `todayLine` under the mocked "now"'s weekday and every other day closed. */
  function hoursFor(now: Date, todayLine: string): string {
    const today = DAY_NAMES[now.getDay()];
    return DAY_NAMES.map((d) => `${d}: ${d === today ? todayLine : "Closed"}`).join("\n");
  }

  test("returns an unknown/null status when openingHours is missing", () => {
    expect(getOpenStatus(null)).toEqual({ label: "", open: null });
    expect(getOpenStatus(undefined)).toEqual({ label: "", open: null });
    expect(getOpenStatus("")).toEqual({ label: "", open: null });
  });

  test("returns Open 24h when today's line says 24 hours", () => {
    const now = new RealDate(2026, 5, 15, 14, 30); // Monday, mid-afternoon
    mockNow(now);
    expect(getOpenStatus(hoursFor(now, "Open 24 hours"))).toEqual({ label: "Open 24h", open: true });
  });

  test("returns Closed today when today's line says closed", () => {
    const now = new RealDate(2026, 5, 15, 14, 30);
    mockNow(now);
    expect(getOpenStatus(hoursFor(now, "Closed"))).toEqual({ label: "Closed today", open: false });
  });

  test("returns an unknown/null status when there's no line for today's weekday", () => {
    const now = new RealDate(2026, 5, 15, 14, 30); // Monday
    mockNow(now);
    // No day names at all -- getOpenStatus can't find "today"'s line.
    expect(getOpenStatus("call the restaurant for hours")).toEqual({ label: "", open: null });
  });

  test("returns an unknown/null status when today's line has no parseable time range", () => {
    const now = new RealDate(2026, 5, 15, 14, 30);
    mockNow(now);
    expect(getOpenStatus(hoursFor(now, "call for hours"))).toEqual({ label: "", open: null });
  });

  test("reports open when the current time falls inside today's range", () => {
    const now = new RealDate(2026, 5, 15, 14, 30);
    mockNow(now);
    const start = new RealDate(now.getTime() - 60 * 60 * 1000);
    const end   = new RealDate(now.getTime() + 60 * 60 * 1000);

    const result = getOpenStatus(hoursFor(now, `${fmt(start)} – ${fmt(end)}`));
    expect(result).toEqual({ label: `Open until ${fmt(end)}`, open: true });
  });

  test("reports closed with the next opening time when outside every range today", () => {
    const now = new RealDate(2026, 5, 15, 14, 30);
    mockNow(now);
    const start = new RealDate(now.getTime() + 3 * 60 * 60 * 1000);
    const end   = new RealDate(now.getTime() + 4 * 60 * 60 * 1000);

    const result = getOpenStatus(hoursFor(now, `${fmt(start)} – ${fmt(end)}`));
    expect(result).toEqual({ label: `Opens ${fmt(start)}`, open: false });
  });

  test("reports closed now with no label when every range today has already ended", () => {
    const now = new RealDate(2026, 5, 15, 22, 0); // 10:00 PM
    mockNow(now);
    // A range that ended an hour ago, with nothing later today.
    const start = new RealDate(now.getTime() - 5 * 60 * 60 * 1000); // 5:00 PM
    const end   = new RealDate(now.getTime() - 60 * 60 * 1000);      // 9:00 PM

    const result = getOpenStatus(hoursFor(now, `${fmt(start)} – ${fmt(end)}`));
    expect(result).toEqual({ label: "Closed now", open: false });
  });

  test("finds the active range among multiple split-hours ranges on the same line", () => {
    // Regression case from the code comment: only matching the first range
    // reported "closed" during a restaurant's second seating. The decoy
    // first range is far from "now" so the active match can only come from
    // the second range -- and asserting the label (not just `open`) pins
    // that it's actually finding the second range's close time, not just
    // accidentally passing on `open` alone.
    const now = new RealDate(2026, 5, 15, 18, 0); // 6:00 PM
    mockNow(now);
    const secondStart = new RealDate(now.getTime() - 30 * 60 * 1000);
    const secondEnd   = new RealDate(now.getTime() + 30 * 60 * 1000);

    const result = getOpenStatus(
      hoursFor(now, `11:00 AM – 2:00 PM, ${fmt(secondStart)} – ${fmt(secondEnd)}`)
    );
    expect(result).toEqual({ label: `Open until ${fmt(secondEnd)}`, open: true });
  });

  test("a range spanning midnight (close time earlier than open time) is handled correctly", () => {
    // e.g. "10:00 PM – 2:00 AM" -- a real, common case (bars, late-night
    // spots), distinct from the earlier bug where a *whole* fixture range
    // accidentally landed after midnight. Here the range is written exactly
    // as a restaurant would report it, and "now" falls inside it.
    const now = new RealDate(2026, 5, 15, 23, 30); // 11:30 PM
    mockNow(now);

    const result = getOpenStatus(hoursFor(now, "10:00 PM – 2:00 AM"));
    expect(result).toEqual({ label: "Open until 2:00 AM", open: true });
  });
});

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;
  let calls: Array<{ url: string; method: string; headers: Record<string, string> }>;

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function headersToObject(h: HeadersInit | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    new Headers(h).forEach((v, k) => (out[k] = v));
    return out;
  }

  test("passes through a non-401 response, attaching the stored access token", async () => {
    setTokens("access-1", "refresh-1");
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), method: init?.method ?? "GET", headers: headersToObject(init?.headers) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const res = await apiFetch(`${API_URL}/restaurants`);
    expect(res.status).toBe(200);
    expect(calls.length).toBe(1);
    expect(calls[0].headers["authorization"]).toBe("Bearer access-1");
  });

  test("a caller-supplied Headers instance survives onto the outgoing request alongside auth headers", async () => {
    // Regression coverage for the comment on mergeHeaders(): object-spreading
    // {...init?.headers} silently drops the caller's headers whenever
    // init.headers is a Headers instance or a string[][] tuple list.
    setTokens("access-1", "refresh-1");
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), method: init?.method ?? "GET", headers: headersToObject(init?.headers) });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    await apiFetch(`${API_URL}/restaurants`, { headers: new Headers({ "X-Custom": "from-headers-instance" }) });
    expect(calls[0].headers["x-custom"]).toBe("from-headers-instance");
    expect(calls[0].headers["authorization"]).toBe("Bearer access-1");
  });

  test("a caller-supplied string[][] tuple header list survives onto the outgoing request", async () => {
    setTokens("access-1", "refresh-1");
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), method: init?.method ?? "GET", headers: headersToObject(init?.headers) });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    await apiFetch(`${API_URL}/restaurants`, { headers: [["X-Custom", "from-tuple-list"]] });
    expect(calls[0].headers["x-custom"]).toBe("from-tuple-list");
    expect(calls[0].headers["authorization"]).toBe("Bearer access-1");
  });

  test("a 401 with no refresh token stored clears tokens and returns the 401 without retrying", async () => {
    // An access token with no refresh token alongside it -- e.g. a previous
    // failed refresh already cleared the refresh token specifically. Setting
    // only the access token directly (bypassing setTokens's dual-write) is
    // the simplest way to reach that state.
    localStorage.setItem(TOKEN_KEY, "access-1");

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), method: init?.method ?? "GET", headers: headersToObject(init?.headers) });
      return new Response(null, { status: 401 });
    }) as typeof fetch;

    const res = await apiFetch(`${API_URL}/restaurants`);
    expect(res.status).toBe(401);
    expect(calls.length).toBe(1); // no refresh attempted, no retry
    expect(getAccessToken()).toBeNull(); // cleared
  });

  test("a 401 with a valid refresh token refreshes, stores new tokens, and retries with the new access token", async () => {
    setTokens("access-1", "refresh-1");

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      calls.push({ url, method, headers: headersToObject(init?.headers) });

      if (url === `${API_URL}/auth/refresh`) {
        return Response.json({ accessToken: "access-2", refreshToken: "refresh-2" }, { status: 200 });
      }
      // The original endpoint: 401 on the first call, 200 on the retry
      // (which will carry the new access token).
      const isRetry = calls.filter((c) => c.url === url).length > 1;
      return new Response(isRetry ? JSON.stringify({ ok: true }) : null, { status: isRetry ? 200 : 401 });
    }) as typeof fetch;

    const res = await apiFetch(`${API_URL}/restaurants`);
    expect(res.status).toBe(200);
    expect(getAccessToken()).toBe("access-2");
    expect(getRefreshToken()).toBe("refresh-2");

    const retryCall = calls.find((c) => c.url === `${API_URL}/restaurants` && c.headers["authorization"] === "Bearer access-2");
    expect(retryCall).toBeDefined();
  });

  test("a 401 whose refresh also fails clears tokens and returns the original 401", async () => {
    setTokens("access-1", "refresh-1");

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      calls.push({ url, method: init?.method ?? "GET", headers: headersToObject(init?.headers) });
      if (url === `${API_URL}/auth/refresh`) return new Response(null, { status: 401 });
      return new Response(null, { status: 401 });
    }) as typeof fetch;

    const res = await apiFetch(`${API_URL}/restaurants`);
    expect(res.status).toBe(401);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    // Exactly one original attempt + one refresh attempt -- no retry, since
    // the refresh itself failed.
    expect(calls.filter((c) => c.url === `${API_URL}/restaurants`).length).toBe(1);
    expect(calls.filter((c) => c.url === `${API_URL}/auth/refresh`).length).toBe(1);
  });

  test("a 401 whose refresh succeeds but the retried request 401s again returns that 401 without a second refresh", async () => {
    setTokens("access-1", "refresh-1");
    let refreshCallCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      calls.push({ url, method: init?.method ?? "GET", headers: headersToObject(init?.headers) });
      if (url === `${API_URL}/auth/refresh`) {
        refreshCallCount++;
        return Response.json({ accessToken: "access-2", refreshToken: "refresh-2" }, { status: 200 });
      }
      return new Response(null, { status: 401 }); // original request 401s every time, even after refresh
    }) as typeof fetch;

    const res = await apiFetch(`${API_URL}/restaurants`);
    expect(res.status).toBe(401);
    expect(refreshCallCount).toBe(1); // apiFetch only ever attempts one refresh per call
    expect(getAccessToken()).toBe("access-2"); // the refresh itself still succeeded and was stored
  });

  test("concurrent 401s share a single in-flight refresh call instead of racing two", async () => {
    setTokens("access-1", "refresh-1");
    let refreshCallCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      calls.push({ url, method: init?.method ?? "GET", headers: headersToObject(init?.headers) });

      if (url === `${API_URL}/auth/refresh`) {
        refreshCallCount++;
        return Response.json({ accessToken: "access-2", refreshToken: "refresh-2" }, { status: 200 });
      }
      const isRetry = calls.filter((c) => c.url === url).length > 1;
      return new Response(isRetry ? JSON.stringify({ ok: true }) : null, { status: isRetry ? 200 : 401 });
    }) as typeof fetch;

    const [resA, resB] = await Promise.all([
      apiFetch(`${API_URL}/restaurants`),
      apiFetch(`${API_URL}/matches`),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(refreshCallCount).toBe(1); // the whole point of the shared refreshPromise
    expect(getAccessToken()).toBe("access-2");

    // Both callers' retries must carry the new token, not just resolve 200 --
    // a caller that retried with the stale token would still get 200 from
    // this mock (isRetry doesn't check headers), so this is the assertion
    // that actually catches that failure mode.
    const retryA = calls.find((c) => c.url === `${API_URL}/restaurants` && c.headers["authorization"] === "Bearer access-2");
    const retryB = calls.find((c) => c.url === `${API_URL}/matches` && c.headers["authorization"] === "Bearer access-2");
    expect(retryA).toBeDefined();
    expect(retryB).toBeDefined();
  });
});
