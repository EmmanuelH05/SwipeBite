import { useState, useEffect } from "react";
import { API_URL } from "../lib/constants";
import type { User } from "../lib/types";
import { apiFetch, setTokens, clearTokens, getAccessToken, getRefreshToken } from "../lib/utils";

/**
 * Demo mode: a link shaped like `/?at=<accessToken>&rt=<refreshToken>` logs
 * the visitor straight in with a pre-issued token pair, then strips the
 * params from the URL. Meant for sharing a live, already-populated account
 * with recruiters/reviewers without handing out real login credentials.
 * Deliberately not gated behind an env flag: it only accepts tokens that are
 * already valid (same JWT verification as every other request), so it can't
 * grant access to anything a stolen/guessed token pair couldn't already get.
 */
/** Pure read of the URL's demo-token params, with no side effects -- safe to call during render. */
function peekDemoTokensFromUrl(): { at: string; rt: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const at = params.get("at");
  const rt = params.get("rt");
  return at && rt ? { at, rt } : null;
}

function injectDemoTokensFromUrl(): void {
  const demo = peekDemoTokensFromUrl();
  if (!demo) return;
  setTokens(demo.at, demo.rt);
  window.history.replaceState({}, "", "/");
}

type UseAuthParams = {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

/** Owns auth/session state: the current user, sign-up/login forms, and logout. */
export function useAuth({ setLoading, setError }: UseAuthParams) {
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  // Computed synchronously from what's already on hand at mount (stored
  // token or a demo-mode URL param) instead of always starting `true` and
  // synchronously flipping it to `false` in the effect below when there's
  // nothing to check -- avoids a setState call directly in the effect body
  // for that branch. peekDemoTokensFromUrl is a pure read (no setTokens/
  // history mutation), so it's safe to call during render; the actual
  // side-effecting injectDemoTokensFromUrl still runs only in the effect.
  const [authLoading, setAuthLoading] = useState(() => !!getAccessToken() || !!peekDemoTokensFromUrl());

  useEffect(() => {
    injectDemoTokensFromUrl();
    const token = getAccessToken();
    if (!token) return; // authLoading was already initialized to false in this case
    apiFetch(`${API_URL}/auth/me`)
      .then((res) => {
        if (res.ok) return res.json() as Promise<User>;
        clearTokens();
        return null;
      })
      .then((data) => {
        if (data?.id) { setUser(data); setUserId(data.id); }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() }),
      });
      const data = await res.json();
      if (data.accessToken && data.user?.id) {
        setTokens(data.accessToken, data.refreshToken ?? "");
        setUser(data.user);
        setUserId(data.user.id);
        setEmail(""); setPassword(""); setName("");
      } else {
        setError((data as { error?: string }).error || "Failed to create account");
      }
    } catch {
      setError("Failed to create account. Is the backend running?");
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (data.accessToken && data.user?.id) {
        setTokens(data.accessToken, data.refreshToken ?? "");
        setUser(data.user);
        setUserId(data.user.id);
        setEmail(""); setPassword("");
      } else {
        setError((data as { error?: string }).error || "Failed to sign in");
      }
    } catch {
      setError("Failed to sign in. Is the backend running?");
    }
    setLoading(false);
  };

  const switchAuthMode = () => {
    setAuthMode((m) => (m === "signup" ? "login" : "signup"));
    setError(null);
    setEmail(""); setPassword(""); setName("");
  };

  const handleOnboardingComplete = async (cuisines: string[], priceLevel: string) => {
    // Non-critical by design: even if seeding fails, the user still
    // finishes onboarding below rather than getting stuck. But apiFetch
    // only rejects on a network failure -- it resolves normally on a 4xx --
    // so a validation rejection (backend enforces an allowed cuisine/price
    // set) was previously invisible: onboarding would report success with
    // no taste profile actually seeded, and no way to notice or retry since
    // seededAt would stay unset. Logged (not user-facing) since this
    // shouldn't block or alarm the user for what's an edge case today (the
    // frontend's cuisine/price lists already match the backend's allowlist).
    try {
      const res = await apiFetch(`${API_URL}/onboarding/seed`, {
        method: "PATCH",
        body: JSON.stringify({ cuisines, priceLevel }),
      });
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        console.warn("Onboarding seed failed:", body.error ?? res.status);
      }
    } catch { /* non-critical */ }

    // This one is never allowed to throw out of handleOnboardingComplete:
    // TasteSetupFlow awaits onComplete() and only clears its "Saving..."
    // state afterward, so an unhandled rejection here used to leave that UI
    // stuck forever. It also only flips hasCompletedOnboarding locally once
    // the PATCH actually succeeds, instead of claiming completion regardless
    // of whether it persisted.
    try {
      const res = await apiFetch(`${API_URL}/auth/me/onboarding`, { method: "PATCH" });
      if (!res.ok) {
        setError("Couldn't save your preferences. Please try again.");
        return;
      }
      setUser((u) => u ? { ...u, hasCompletedOnboarding: true } : u);
    } catch {
      setError("Couldn't save your preferences. Is the backend running?");
    }
  };

  const handleOnboardingSkip = () => {
    // Skip is optimistic -- the overlay dismisses immediately rather than
    // waiting on a network round trip -- but still persists in the
    // background so the skip sticks across reloads instead of silently
    // reverting to only-local state (which used to re-show onboarding on
    // every subsequent login).
    setUser((u) => u ? { ...u, hasCompletedOnboarding: true } : u);
    apiFetch(`${API_URL}/auth/me/onboarding`, { method: "PATCH" })
      .then((res) => {
        if (!res.ok) setError("Couldn't save that you skipped onboarding -- you may see it again next time.");
      })
      .catch(() => setError("Couldn't save that you skipped onboarding -- you may see it again next time."));
  };

  const logout = () => {
    const rt = getRefreshToken();
    if (rt) {
      fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      }).catch(() => {});
    }
    clearTokens();
    setUserId(null);
    setUser(null);
  };

  return {
    userId,
    user,
    authMode,
    email,
    setEmail,
    password,
    setPassword,
    name,
    setName,
    authLoading,
    handleSignUp,
    handleLogin,
    switchAuthMode,
    handleOnboardingComplete,
    handleOnboardingSkip,
    logout,
  };
}
