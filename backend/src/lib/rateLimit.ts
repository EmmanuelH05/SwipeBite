//CONSTANTS
const LIMIT     = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const store     = new Map<string, { count: number; resetAt: number }>();

//HELPERS

/** Returns true when the IP is within its quota. */
export function checkRateLimit(ip: string): boolean {
  const entry = store.get(ip);
  if (!entry || Date.now() > entry.resetAt) return true;
  return entry.count < LIMIT;
}

/** Increments the counter for an IP, resetting if the window has expired. */
export function recordRequest(ip: string): void {
  const entry = store.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count++;
  }
}
