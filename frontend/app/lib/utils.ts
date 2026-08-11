import { API_URL, TOKEN_KEY, REFRESH_TOKEN_KEY } from "./constants";

// ─── Token storage helpers ────────────────────────────────────────────────────

/** Persists both tokens after a successful login or register. */
export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/** Removes both tokens (used on logout or when refresh fails). */
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** Returns the current access token, or null if not present. */
export function getAccessToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

/** Returns the current refresh token, or null if not present. */
export function getRefreshToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;
}

// ─── Auth headers ─────────────────────────────────────────────────────────────

/** Headers for authenticated API requests (JSON + optional Bearer token). */
export function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Auto-refreshing fetch wrapper ───────────────────────────────────────────

// Shared across all concurrent apiFetch() callers so that a burst of 401s
// (e.g. several feed requests firing around the same expiry) triggers exactly
// one POST /auth/refresh. Refresh tokens rotate on use (backend invariant),
// so a second, independent refresh call would be rejected by the server and
// clear the valid token pair the first call just stored, logging the user
// out mid-session. Every concurrent caller instead awaits this single
// in-flight refresh and shares its result.
let refreshPromise: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;

      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ refreshToken }),
      });
      if (!refreshRes.ok) return false;

      const { accessToken, refreshToken: newRefreshToken } = await refreshRes.json() as {
        accessToken: string;
        refreshToken: string;
      };
      setTokens(accessToken, newRefreshToken);
      return true;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Drop-in replacement for fetch() that transparently handles access token expiry.
 *
 * If the API returns 401, it tries POST /auth/refresh once with the stored
 * refresh token. On success the new tokens are saved and the original request
 * is retried with the fresh access token. If the refresh also fails, both
 * tokens are cleared so the user is sent back to the login screen.
 */
export async function apiFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  // First attempt
  const res = await fetch(input, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) },
  });

  if (res.status !== 401) return res;

  // 401 — try to silently refresh the access token
  if (!getRefreshToken()) {
    clearTokens();
    return res; // caller handles 401
  }

  const refreshed = await refreshTokens();
  if (!refreshed) {
    clearTokens(); // refresh token invalid or expired — force re-login
    return res;
  }

  // Retry the original request with the new access token
  return fetch(input, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Build photo URL for the Places API proxy (avoids exposing the API key). */
export function getPhotoUrl(photoName: string): string {
  return `${API_URL}/places/photo?name=${encodeURIComponent(photoName)}`;
}

/** Format raw cuisine string (e.g. "italian_restaurant") to title case. */
export function formatCuisine(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parseHourMinute(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

/** Formats minutes-since-midnight (mod 24h) as "h:mm AM/PM". */
function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const mn = totalMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h > 12 ? h - 12 : h || 12}:${String(mn).padStart(2, "0")} ${ampm}`;
}

/** Parse opening hours string and return open status for right now. */
export function getOpenStatus(openingHours: string | null | undefined): {
  label: string;
  open: boolean | null; // null = unknown
} {
  if (!openingHours) return { label: "", open: null };

  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const today = days[new Date().getDay()];
  const now   = new Date().getHours() * 60 + new Date().getMinutes();

  // Find today's line (e.g. "Monday: 11:00 AM – 10:00 PM")
  const line = openingHours.split("\n").find((l) => l.toLowerCase().startsWith(today));
  if (!line) return { label: "", open: null };

  // Scoped to today's line, not the whole multi-day string -- otherwise a
  // single 24-hour day anywhere in the week made every day report "Open 24h".
  const lowerLine = line.toLowerCase();
  if (lowerLine.includes("24 hours") || lowerLine.includes("open 24")) return { label: "Open 24h", open: true };
  if (lowerLine.includes("closed")) return { label: "Closed today", open: false };

  // Parse every "11:00 AM – 10:00 PM" range on the line, not just the first --
  // Google commonly reports split hours as e.g.
  // "Monday: 11:00 AM – 2:00 PM, 5:00 PM – 9:00 PM", and matching only the
  // first range reported "Closed now" during the second seating.
  const rangeRegex = /(\d{1,2}:\d{2}\s*[AP]M)\s*[–\-]\s*(\d{1,2}:\d{2}\s*[AP]M)/gi;
  const ranges: Array<{ open: number; close: number }> = [];
  for (const m of line.matchAll(rangeRegex)) {
    const open  = parseHourMinute(m[1]);
    let   close = parseHourMinute(m[2]);
    if (close < open) close += 24 * 60; // past midnight
    ranges.push({ open, close });
  }
  if (ranges.length === 0) return { label: "", open: null };

  const activeRange = ranges.find((r) => now >= r.open && now < r.close);
  if (activeRange) return { label: `Open until ${formatMinutes(activeRange.close)}`, open: true };

  const nextRange = ranges.filter((r) => r.open > now).sort((a, b) => a.open - b.open)[0];
  if (nextRange) return { label: `Opens ${formatMinutes(nextRange.open)}`, open: false };

  return { label: "Closed now", open: false };
}
