import { describe, test, expect } from "bun:test";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  test("allows up to the limit, then rejects", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
  });

  test("tracks keys independently", () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("b")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
    expect(limiter.consume("b")).toBe(false);
  });

  test("resets after the window elapses", async () => {
    const limiter = createRateLimiter(1, 20);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(limiter.consume("a")).toBe(true);
  });

  test("a burst of concurrent callers never exceeds the limit -- the TOCTOU case", async () => {
    // The old check-then-record-later pattern (separate checkX/recordX calls
    // with async work in between) let concurrent callers all pass the check
    // before any of them recorded. consume() is one synchronous call, so
    // firing it many times "concurrently" (same microtask queue, no await
    // between check and write) must still cap at exactly `limit` successes.
    const limiter = createRateLimiter(5, 60_000);
    const results = Array.from({ length: 50 }, () => limiter.consume("burst"));
    const successes = results.filter(Boolean).length;
    expect(successes).toBe(5);
  });

  test("reset() clears all recorded attempts", () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
    limiter.reset();
    expect(limiter.consume("a")).toBe(true);
  });
});
