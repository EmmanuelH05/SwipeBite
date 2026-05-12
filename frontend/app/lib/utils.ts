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
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return res; // caller handles 401
  }

  const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ refreshToken }),
  });

  if (!refreshRes.ok) {
    clearTokens(); // refresh token invalid or expired — force re-login
    return res;
  }

  const { accessToken, refreshToken: newRefreshToken } = await refreshRes.json() as {
    accessToken: string;
    refreshToken: string;
  };
  setTokens(accessToken, newRefreshToken);

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
