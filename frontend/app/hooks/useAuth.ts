import { useState, useEffect } from "react";
import { API_URL, TOKEN_KEY } from "../lib/constants";
import type { User } from "../lib/types";
import { apiFetch, setTokens, clearTokens, getRefreshToken } from "../lib/utils";

/**
 * Demo mode: a link shaped like `/?at=<accessToken>&rt=<refreshToken>` logs
 * the visitor straight in with a pre-issued token pair, then strips the
 * params from the URL. Meant for sharing a live, already-populated account
 * with recruiters/reviewers without handing out real login credentials.
 * Deliberately not gated behind an env flag: it only accepts tokens that are
 * already valid (same JWT verification as every other request), so it can't
 * grant access to anything a stolen/guessed token pair couldn't already get.
 */
function injectDemoTokensFromUrl(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const at = params.get("at");
  const rt = params.get("rt");
  if (at && rt) {
    setTokens(at, rt);
    window.history.replaceState({}, "", "/");
  }
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
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    injectDemoTokensFromUrl();
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setAuthLoading(false); return; }
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
    try {
      await apiFetch(`${API_URL}/onboarding/seed`, {
        method: "PATCH",
        body: JSON.stringify({ cuisines, priceLevel }),
      });
    } catch { /* non-critical */ }
    await apiFetch(`${API_URL}/auth/me/onboarding`, { method: "PATCH" });
    setUser((u) => u ? { ...u, hasCompletedOnboarding: true } : u);
  };

  const handleOnboardingSkip = () => {
    setUser((u) => u ? { ...u, hasCompletedOnboarding: true } : u);
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
