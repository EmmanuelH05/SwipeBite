"use client";

/**
 * Home page: auth gate, feed (swipe), and matches.
 * All API and swipe gesture state lives here; children are presentational or receive callbacks.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { API_URL, TOKEN_KEY, SWIPE_THRESHOLD, GESTURE_LOCK_THRESHOLD } from "./lib/constants";
import type { Restaurant, Match, User } from "./lib/types";
import { getAuthHeaders, apiFetch, setTokens, clearTokens, getRefreshToken } from "./lib/utils";
import AuthScreen from "./components/auth/AuthScreen";
import AppShell from "./components/layout/AppShell";
import Header from "./components/layout/Header";
import NavTabs from "./components/layout/NavTabs";
import LoadRestaurantsForm from "./components/feed/LoadRestaurantsForm";
import CardStack from "./components/feed/CardStack";
import MatchList from "./components/matches/MatchList";
import VisitModal from "./components/modal/VisitModal";

export default function Home() {
  // --- Auth & user ---
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  // --- Feed & matches ---
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [view, setView] = useState<"feed" | "matches">("feed");
  const [location, setLocation] = useState("");
  const [loadLoading, setLoadLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Visit modal (review) ---
  const [visitModal, setVisitModal] = useState<Match | null>(null);
  const [visitModalMode, setVisitModalMode] = useState<"add" | "view" | "edit">("add");
  const [visitExperience, setVisitExperience] = useState("");
  const [visitNotes, setVisitNotes] = useState("");

  // --- Swipe card state ---
  const [photoIndex, setPhotoIndex] = useState(0);
  const [cardDragOffset, setCardDragOffset] = useState(0);
  const [swipeExit, setSwipeExit] = useState<"LIKE" | "DISLIKE" | null>(null);

  const photoScrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const gestureLockRef = useRef<"card" | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchInPhotoAreaRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const cardIdRef = useRef<string | null>(null);

  const applyCardTransform = useCallback((dx: number) => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = "none";
    cardRef.current.style.transform = `translateX(${dx}px) rotate(${dx * 0.06}deg)`;
  }, []);

  // --- Effects: token validation, fetch restaurants, fetch matches ---
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setAuthLoading(false);
      return;
    }
    // apiFetch will silently refresh the access token if it has expired
    apiFetch(`${API_URL}/auth/me`)
      .then((res) => {
        if (res.ok) return res.json() as Promise<User>;
        clearTokens();
        return null;
      })
      .then((data) => {
        if (data?.id) {
          setUser(data);
          setUserId(data.id);
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    apiFetch(`${API_URL}/restaurants`)
      .then((res) => res.json())
      .then((data) => {
        setRestaurants(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load restaurants. Is the backend running?");
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    setPhotoIndex(0);
    setCardDragOffset(0);
    setSwipeExit(null);
    gestureLockRef.current = null;
    touchStartRef.current = null;
    cardIdRef.current = null;
  }, [restaurants[0]?.id]);

  useEffect(() => {
    if (!userId || view !== "matches") return;
    setLoading(true);
    apiFetch(`${API_URL}/matches`)
      .then((res) => res.json())
      .then((data: Match[] | Restaurant[]) => {
        const m = Array.isArray(data) ? data : [];
        setMatches(
          m.map((item) =>
            "restaurant" in item
              ? (item as Match)
              : { restaurant: item as Restaurant, swipeId: "", visitedAt: null, experience: null, notes: null }
          )
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId, view]);

  // --- Auth handlers ---
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
        setEmail("");
        setPassword("");
        setName("");
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
        setEmail("");
        setPassword("");
      } else {
        setError((data as { error?: string }).error || "Failed to sign in");
      }
    } catch {
      setError("Failed to sign in. Is the backend running?");
    }
    setLoading(false);
  };

  // --- Swipe (API) ---
  const handleSwipe = async (restaurantId: string, direction: "LIKE" | "DISLIKE") => {
    if (!userId) return;
    const restaurant = restaurants.find((r) => r.id === restaurantId);
    try {
      const res = await apiFetch(`${API_URL}/swipes`, {
        method: "POST",
        body: JSON.stringify({ restaurantId, direction }),
      });
      const created = await res.json();
      setRestaurants((prev) => prev.filter((r) => r.id !== restaurantId));
      if (direction === "LIKE" && restaurant && created?.id) {
        setMatches((prev) => [
          ...prev,
          { restaurant, swipeId: created.id, visitedAt: created.visitedAt ?? null },
        ]);
      }
    } catch {
      setError("Failed to record swipe");
    }
  };

  // --- Photo strip: scroll index + goTo ---
  const handlePhotoScroll = useCallback(() => {
    const el = photoScrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setPhotoIndex(Math.min(index, (restaurants[0]?.photoNames?.length ?? 1) - 1));
  }, [restaurants[0]?.photoNames?.length]);

  const goToPhoto = useCallback((index: number) => {
    const el = photoScrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
    setPhotoIndex(index);
  }, []);

  const applySwipeResult = useCallback(
    (restaurantId: string, direction: "LIKE" | "DISLIKE") => {
      if (!restaurants[0] || loading) return;
      setSwipeExit(direction);
      setTimeout(() => {
        handleSwipe(restaurantId, direction);
        setSwipeExit(null);
        setCardDragOffset(0);
      }, 220);
    },
    [restaurants[0], loading]
  );

  // --- Touch handlers: lock to card vs. photo scroll, then apply transform or commit ---
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!restaurants[0]) return;
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchInPhotoAreaRef.current = photoScrollRef.current?.contains(e.target as Node) ?? false;
      gestureLockRef.current = null;
    },
    [restaurants[0]]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || !restaurants[0]) return;
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      if (gestureLockRef.current === null) {
        if (Math.abs(dx) > GESTURE_LOCK_THRESHOLD || Math.abs(dy) > GESTURE_LOCK_THRESHOLD) {
          const horizontal = Math.abs(dx) >= Math.abs(dy);
          const inPhoto = touchInPhotoAreaRef.current;
          gestureLockRef.current = horizontal && !inPhoto ? "card" : null;
        }
      }
      if (gestureLockRef.current === "card") {
        e.preventDefault();
        if (!cardIdRef.current && restaurants[0]) cardIdRef.current = restaurants[0].id;
        dragOffsetRef.current = dx;
        setCardDragOffset(dx);
        applyCardTransform(dx);
      }
    },
    [restaurants[0], applyCardTransform]
  );

  const handleTouchEnd = useCallback(() => {
    if (gestureLockRef.current !== "card") {
      touchStartRef.current = null;
      return;
    }
    const offset = dragOffsetRef.current;
    const id = cardIdRef.current;
    dragOffsetRef.current = 0;
    cardIdRef.current = null;
    setCardDragOffset(0);
    touchStartRef.current = null;
    gestureLockRef.current = null;
    if (cardRef.current) {
      if (id && offset >= SWIPE_THRESHOLD) {
        cardRef.current.style.transition = "transform 0.2s ease-out";
        cardRef.current.style.transform = "translateX(120%) rotate(12deg)";
        applySwipeResult(id, "LIKE");
      } else if (id && offset <= -SWIPE_THRESHOLD) {
        cardRef.current.style.transition = "transform 0.2s ease-out";
        cardRef.current.style.transform = "translateX(-120%) rotate(-12deg)";
        applySwipeResult(id, "DISLIKE");
      } else {
        cardRef.current.style.transition = "transform 0.25s ease-out";
        cardRef.current.style.transform = "translateX(0) rotate(0)";
        const el = cardRef.current;
        setTimeout(() => {
          el.style.transform = "";
          el.style.transition = "";
        }, 260);
      }
    } else {
      if (id && offset >= SWIPE_THRESHOLD) applySwipeResult(id, "LIKE");
      else if (id && offset <= -SWIPE_THRESHOLD) applySwipeResult(id, "DISLIKE");
    }
  }, [applySwipeResult]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!restaurants[0] || e.button !== 0) return;
      e.preventDefault();
      touchStartRef.current = { x: e.clientX, y: e.clientY };
      touchInPhotoAreaRef.current = photoScrollRef.current?.contains(e.target as Node) ?? false;
      gestureLockRef.current = null;
    },
    [restaurants[0]]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!touchStartRef.current || !restaurants[0]) return;
      const dx = e.clientX - touchStartRef.current.x;
      const dy = e.clientY - touchStartRef.current.y;
      if (gestureLockRef.current === null) {
        if (Math.abs(dx) > GESTURE_LOCK_THRESHOLD || Math.abs(dy) > GESTURE_LOCK_THRESHOLD) {
          const horizontal = Math.abs(dx) >= Math.abs(dy);
          const inPhoto = touchInPhotoAreaRef.current;
          gestureLockRef.current = horizontal && !inPhoto ? "card" : null;
        }
      }
      if (gestureLockRef.current === "card") {
        if (!cardIdRef.current && restaurants[0]) cardIdRef.current = restaurants[0].id;
        dragOffsetRef.current = dx;
        setCardDragOffset(dx);
        applyCardTransform(dx);
      }
    },
    [restaurants[0], applyCardTransform]
  );

  const handleMouseUp = useCallback(() => {
    if (gestureLockRef.current !== "card") {
      touchStartRef.current = null;
      return;
    }
    const offset = dragOffsetRef.current;
    const id = cardIdRef.current;
    dragOffsetRef.current = 0;
    cardIdRef.current = null;
    setCardDragOffset(0);
    touchStartRef.current = null;
    gestureLockRef.current = null;
    if (cardRef.current) {
      if (id && offset >= SWIPE_THRESHOLD) {
        cardRef.current.style.transition = "transform 0.2s ease-out";
        cardRef.current.style.transform = "translateX(120%) rotate(12deg)";
        applySwipeResult(id, "LIKE");
      } else if (id && offset <= -SWIPE_THRESHOLD) {
        cardRef.current.style.transition = "transform 0.2s ease-out";
        cardRef.current.style.transform = "translateX(-120%) rotate(-12deg)";
        applySwipeResult(id, "DISLIKE");
      } else {
        cardRef.current.style.transition = "transform 0.25s ease-out";
        cardRef.current.style.transform = "translateX(0) rotate(0)";
        const el = cardRef.current;
        setTimeout(() => {
          el.style.transform = "";
          el.style.transition = "";
        }, 260);
      }
    } else {
      if (id && offset >= SWIPE_THRESHOLD) applySwipeResult(id, "LIKE");
      else if (id && offset <= -SWIPE_THRESHOLD) applySwipeResult(id, "DISLIKE");
    }
  }, [applySwipeResult]);

  useEffect(() => {
    if (!restaurants[0]) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [restaurants[0], handleMouseMove, handleMouseUp]);

  // --- Load restaurants ---
  const handleLoadRestaurants = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) return;
    setLoadLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/restaurants/load`, {
        method: "POST",
        body: JSON.stringify({ location: location.trim(), clear: true }),
      });
      const text = await res.text();
      let data: { error?: string; loaded?: number } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(
          res.ok
            ? "Backend returned invalid JSON."
            : `Request failed (${res.status}). Restart the backend and run: npx prisma generate`
        );
        setLoadLoading(false);
        return;
      }
      if (data.error) {
        setError(data.error);
      } else if (res.ok) {
        setLocation("");
        const rRes = await apiFetch(`${API_URL}/restaurants`);
        const rData = await rRes.json();
        setRestaurants(Array.isArray(rData) ? rData : []);
      } else {
        setError(data.error || `Request failed (${res.status})`);
      }
    } catch {
      setError("Can't reach backend. Is it running on http://localhost:4000?");
    }
    setLoadLoading(false);
  };

  // --- Visit modal ---
  const openVisitModal = (m: Match) => {
    setVisitModal(m);
    if (m.visitedAt) {
      setVisitModalMode("view");
      setVisitExperience(m.experience ?? "");
      setVisitNotes(m.notes ?? "");
    } else {
      setVisitModalMode("add");
      setVisitExperience("");
      setVisitNotes("");
    }
  };

  const closeVisitModal = () => {
    setVisitModal(null);
    setVisitModalMode("add");
    setVisitExperience("");
    setVisitNotes("");
  };

  const startEditReview = () => {
    setVisitModalMode("edit");
  };

  const handleMarkVisited = async (swipeId: string, experience?: string, notes?: string) => {
    if (!swipeId) return;
    try {
      const res = await apiFetch(`${API_URL}/swipes/${swipeId}/visited`, {
        method: "PATCH",
        body: JSON.stringify({
          experience: experience?.trim() || undefined,
          notes: notes !== undefined ? (notes.trim() || undefined) : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMatches((prev) =>
          prev.map((m) =>
            m.swipeId === swipeId
              ? { ...m, visitedAt: data.visitedAt, experience: data.experience, notes: data.notes }
              : m
          )
        );
        closeVisitModal();
      } else {
        const err = await res.json();
        setError((err as { error?: string }).error || "Failed to mark as visited");
      }
    } catch {
      setError("Failed to mark as visited");
    }
  };

  const handleLogout = () => {
    // Revoke the refresh token on the server so it can't be reused
    const rt = getRefreshToken();
    if (rt) {
      fetch(`${API_URL}/auth/logout`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ refreshToken: rt }),
      }).catch(() => {}); // fire-and-forget; local cleanup happens regardless
    }
    clearTokens();
    setUserId(null);
    setUser(null);
    setRestaurants([]);
    setMatches([]);
    setView("feed");
  };

  // --- Render: Auth ---
  if (!userId) {
    if (authLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#08080d] p-6">
          <div className="w-full max-w-sm">
            <div className="rounded-xl border border-[#2a2a3a] bg-[#0e0e14] p-8 space-y-4">
              <div className="mx-auto h-11 w-40 rounded-lg skeleton-pulse" />
              <div className="h-4 w-48 mx-auto rounded skeleton-pulse" />
              <div className="h-12 w-full rounded-lg skeleton-pulse" />
              <div className="h-12 w-full rounded-lg skeleton-pulse" />
              <div className="h-12 w-full rounded-lg skeleton-pulse" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <AuthScreen
        mode={authMode}
        email={email}
        password={password}
        name={name}
        loading={loading}
        error={error}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onNameChange={setName}
        onSubmit={authMode === "signup" ? handleSignUp : handleLogin}
        onSwitchMode={() => {
          setAuthMode((m) => (m === "signup" ? "login" : "signup"));
          setError(null);
          setEmail("");
          setPassword("");
          setName("");
        }}
      />
    );
  }

  // --- Render: Feed + Matches ---
  return (
    <AppShell>
      <Header onLogout={handleLogout} />
      <NavTabs view={view} matchesCount={matches.length} onViewChange={setView} />

      {error && (
        <div className="mb-4 rounded-lg border border-[#f87171]/20 bg-[#f87171]/5 p-3 animate-fade-in" role="alert">
          <p className="text-sm text-[#f87171]">{error}</p>
        </div>
      )}

      {view === "feed" && (
        <>
          <LoadRestaurantsForm
            location={location}
            loading={loadLoading}
            onLocationChange={setLocation}
            onSubmit={handleLoadRestaurants}
          />
          <section className="min-h-[300px] w-full">
            {loading && restaurants.length === 0 ? (
              <div className="space-y-4 py-4 animate-fade-in">
                <div className="rounded-xl border border-[#1e1e2e] bg-[#141419] overflow-hidden">
                  <div className="aspect-[4/3] skeleton-pulse" />
                  <div className="p-6 space-y-3">
                    <div className="h-5 w-40 rounded skeleton-pulse" />
                    <div className="flex gap-2">
                      <div className="h-6 w-20 rounded-md skeleton-pulse" />
                      <div className="h-6 w-12 rounded-md skeleton-pulse" />
                    </div>
                    <div className="h-4 w-full rounded skeleton-pulse" />
                  </div>
                </div>
              </div>
            ) : restaurants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 animate-fade-in-up">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#141419] border border-[#2a2a3a]">
                  <svg className="h-7 w-7 text-[#33334a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-sm text-[#55556a]">No more restaurants</p>
                <p className="mt-1 text-xs text-[#33334a]">Check your matches or search a new area</p>
              </div>
            ) : (
              <CardStack
                current={restaurants[0]}
                next={restaurants[1] ?? null}
                cardRef={cardRef}
                swipeCardProps={{
                  photoIndex,
                  photoScrollRef,
                  onPhotoScroll: handlePhotoScroll,
                  goToPhoto,
                  style: {
                    transform: swipeExit
                      ? swipeExit === "LIKE"
                        ? "translateX(120%) rotate(12deg)"
                        : "translateX(-120%) rotate(-12deg)"
                      : `translateX(${cardDragOffset}px) rotate(${cardDragOffset * 0.06}deg)`,
                    transition: swipeExit ? "transform 0.2s ease-out" : "none",
                  },
                  dragOffset: cardDragOffset,
                  onPass: () => restaurants[0] && handleSwipe(restaurants[0].id, "DISLIKE"),
                  onLike: () => restaurants[0] && handleSwipe(restaurants[0].id, "LIKE"),
                  disabled: loading,
                  onTouchStart: handleTouchStart,
                  onTouchMove: handleTouchMove,
                  onTouchEnd: handleTouchEnd,
                  onMouseDown: handleMouseDown,
                }}
              />
            )}
          </section>
        </>
      )}

      {view === "matches" && (
        <section className="min-h-[200px] w-full">
          <MatchList matches={matches} loading={loading} onVisitClick={openVisitModal} />
        </section>
      )}

      {visitModal && (
        <VisitModal
          match={visitModal}
          mode={visitModalMode}
          experience={visitExperience}
          notes={visitNotes}
          onExperienceChange={setVisitExperience}
          onNotesChange={setVisitNotes}
          onClose={closeVisitModal}
          onSave={() => handleMarkVisited(visitModal.swipeId, visitExperience, visitNotes)}
          onEdit={startEditReview}
        />
      )}
    </AppShell>
  );
}
