type LimiterEntry = { count: number; resetAt: number };

/**
 * Creates an in-memory, per-key rate limiter. `consume` does the
 * check-and-increment as a single synchronous call -- no `await` between
 * reading and writing the counter, so concurrent callers on Node's
 * single-threaded event loop can't interleave and both pass a check meant
 * to let only one of them through. Call it as the very first thing in a
 * handler, before any other work, or a burst of concurrent requests can
 * all start that work before any of them are recorded against the quota.
 * Single-instance only; a multi-process deploy needs a shared store (Redis).
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const store = new Map<string, LimiterEntry>();

  return {
    /** Returns true and records the attempt if `key` is within quota. */
    consume(key: string): boolean {
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
  };
}

// Restaurant catalog loads hit the Google Places API -- capped to stay under
// the free tier. Callers must consume() before making any API calls, not
// after -- a burst of concurrent requests that all check first and record
// last would each fire their own round of Google calls before any of them
// counted against the quota.
export const restaurantLoadLimiter = createRateLimiter(10, 60 * 60 * 1000);

// Brute-force protection on auth endpoints: max attempts per IP per window.
export const authLimiter    = createRateLimiter(10, 15 * 60 * 1000);
export const refreshLimiter = createRateLimiter(20, 15 * 60 * 1000);

// Per-user cap on the photo proxy -- prevents a single account from
// draining the Google Places API quota through this endpoint.
export const photoProxyLimiter = createRateLimiter(120, 60 * 60 * 1000);
