"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { API_URL, TOKEN_KEY, SWIPE_THRESHOLD, GESTURE_LOCK_THRESHOLD } from "./lib/constants";
import type { Restaurant, Match, User } from "./lib/types";
import { getAuthHeaders, apiFetch, setTokens, clearTokens, getRefreshToken } from "./lib/utils";
import { AnimatePresence } from "framer-motion";
import AuthScreen from "./components/auth/AuthScreen/AuthScreen";
import AppShell from "./components/layout/AppShell/AppShell";
import Header from "./components/layout/Header/Header";
import NavTabs from "./components/layout/NavTabs/NavTabs";
import LoadRestaurantsForm from "./components/feed/LoadRestaurantsForm/LoadRestaurantsForm";
import CardStack from "./components/feed/CardStack/CardStack";
import MatchList from "./components/matches/MatchList/MatchList";
import VisitModal from "./components/modal/VisitModal/VisitModal";
import TasteSetupFlow from "./components/onboarding/TasteSetupFlow/TasteSetupFlow";
import MatchReveal from "./components/feed/MatchReveal/MatchReveal";
import type { ScoreBreakdown } from "./lib/types";
import styles from "./page.module.css";

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

  // --- Match reveal overlay ---
  const [pendingReveal, setPendingReveal] = useState<{ restaurant: Restaurant; score: ScoreBreakdown } | null>(null);

  // --- Visit modal ---
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

  // --- Effects ---
  useEffect(() => {
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

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    apiFetch(`${API_URL}/restaurants`)
      .then((res) => res.json())
      .then((data) => { setRestaurants(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError("Failed to load restaurants. Is the backend running?"); setLoading(false); });
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

  // --- Swipe ---
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
        // Show score reveal if the restaurant has a meaningful score
        if (restaurant.score && restaurant.score.total > 0) {
          setPendingReveal({ restaurant, score: restaurant.score });
        }
      }
    } catch {
      setError("Failed to record swipe");
    }
  };

  const handlePhotoScroll = useCallback(() => {
    const el = photoScrollRef.current;
    if (!el) return;
    setPhotoIndex(Math.min(Math.round(el.scrollLeft / el.clientWidth), (restaurants[0]?.photoNames?.length ?? 1) - 1));
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
          gestureLockRef.current = horizontal && !touchInPhotoAreaRef.current ? "card" : null;
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
    if (gestureLockRef.current !== "card") { touchStartRef.current = null; return; }
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
        setTimeout(() => { el.style.transform = ""; el.style.transition = ""; }, 260);
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
          gestureLockRef.current = Math.abs(dx) >= Math.abs(dy) && !touchInPhotoAreaRef.current ? "card" : null;
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
    if (gestureLockRef.current !== "card") { touchStartRef.current = null; return; }
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
        setTimeout(() => { el.style.transform = ""; el.style.transition = ""; }, 260);
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
        body: JSON.stringify({ location: location.trim() }),
      });
      const text = await res.text();
      let data: { error?: string; loaded?: number } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(res.ok ? "Backend returned invalid JSON." : `Request failed (${res.status}). Restart the backend and run: npx prisma generate`);
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

  // --- Onboarding ---
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

  const handleLogout = () => {
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
    setRestaurants([]);
    setMatches([]);
    setView("feed");
  };

  // --- Render: Auth loading skeleton ---
  if (!userId) {
    if (authLoading) {
      return (
        <div className={styles.authLoading}>
          <div className={styles.authLoadingSkeleton}>
            <div className={styles.skeletonCard}>
              <div className={`${styles.skeletonLogoRow} skeleton-pulse`} />
              <div className={`${styles.skeletonTagline} skeleton-pulse`} />
              <div className={`${styles.skeletonField} skeleton-pulse`} />
              <div className={`${styles.skeletonField} skeleton-pulse`} />
              <div className={`${styles.skeletonField} skeleton-pulse`} />
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
          setEmail(""); setPassword(""); setName("");
        }}
      />
    );
  }

  // --- Render: Feed + Matches ---
  return (
    <AppShell>
      {/* Onboarding overlay — shown once for new users, covers the whole shell */}
      <AnimatePresence>
        {userId && user && !user.hasCompletedOnboarding && (
          <TasteSetupFlow
            onComplete={handleOnboardingComplete}
            onSkip={handleOnboardingSkip}
          />
        )}
      </AnimatePresence>

      <Header onLogout={handleLogout} userName={user?.name} />
      <NavTabs view={view} matchesCount={matches.length} onViewChange={setView} />

      {error && (
        <div className={styles.errorBanner} role="alert">
          <p className={styles.errorText}>{error}</p>
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
          <section className={styles.feedSection}>
            {loading && restaurants.length === 0 ? (
              <div style={{ aspectRatio: "3/4" }}>
                <div className={`${styles.cardSkeleton} skeleton-pulse`} />
              </div>
            ) : restaurants.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className={styles.emptyTitle}>No more restaurants</p>
                <p className={styles.emptyHint}>Check your saved spots or search a new area</p>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
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
                {/* Score reveal overlay — positioned over the card area */}
                <AnimatePresence>
                  {pendingReveal && (
                    <MatchReveal
                      restaurant={pendingReveal.restaurant}
                      score={pendingReveal.score}
                      onDismiss={() => setPendingReveal(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </section>
        </>
      )}

      {view === "matches" && (
        <section className={styles.matchesSection}>
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
          onEdit={() => setVisitModalMode("edit")}
        />
      )}
    </AppShell>
  );
}
