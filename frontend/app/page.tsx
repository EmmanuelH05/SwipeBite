"use client";

import { useState } from "react";
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
import { useAuth } from "./hooks/useAuth";
import { useRestaurantFeed } from "./hooks/useRestaurantFeed";
import { useSwipeGesture } from "./hooks/useSwipeGesture";
import { useVisitModal } from "./hooks/useVisitModal";
import styles from "./page.module.css";

export default function Home() {
  // --- Cross-cutting: shared by auth, feed, and visit-modal actions ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = useAuth({ setLoading, setError });
  const feed = useRestaurantFeed({ userId: auth.userId, setLoading, setError });
  const gesture = useSwipeGesture(feed.restaurants[0], loading, feed.handleSwipe);
  const visit = useVisitModal({ setMatches: feed.setMatches, setError });

  const handleLogout = () => {
    auth.logout();
    feed.resetFeed();
  };

  // --- Render: Auth loading skeleton ---
  if (!auth.userId) {
    if (auth.authLoading) {
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
        mode={auth.authMode}
        email={auth.email}
        password={auth.password}
        name={auth.name}
        loading={loading}
        error={error}
        onEmailChange={auth.setEmail}
        onPasswordChange={auth.setPassword}
        onNameChange={auth.setName}
        onSubmit={auth.authMode === "signup" ? auth.handleSignUp : auth.handleLogin}
        onSwitchMode={auth.switchAuthMode}
      />
    );
  }

  // --- Render: Feed + Matches ---
  return (
    <AppShell>
      {/* Onboarding overlay — shown once for new users, covers the whole shell */}
      <AnimatePresence>
        {auth.userId && auth.user && !auth.user.hasCompletedOnboarding && (
          <TasteSetupFlow
            onComplete={auth.handleOnboardingComplete}
            onSkip={auth.handleOnboardingSkip}
          />
        )}
      </AnimatePresence>

      <Header onLogout={handleLogout} userName={auth.user?.name} />
      <NavTabs view={feed.view} matchesCount={feed.matches.length} onViewChange={feed.setView} />

      {error && (
        <div className={styles.errorBanner} role="alert">
          <p className={styles.errorText}>{error}</p>
        </div>
      )}

      {feed.view === "feed" && (
        <>
          <LoadRestaurantsForm
            location={feed.location}
            loading={feed.loadLoading}
            onLocationChange={feed.setLocation}
            onSubmit={feed.handleLoadRestaurants}
          />
          <section className={styles.feedSection}>
            {loading && feed.restaurants.length === 0 ? (
              <div style={{ aspectRatio: "3/4" }}>
                <div className={`${styles.cardSkeleton} skeleton-pulse`} />
              </div>
            ) : feed.restaurants.length === 0 ? (
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
                  current={feed.restaurants[0]}
                  next={feed.restaurants[1] ?? null}
                  cardRef={gesture.cardRef}
                  swipeCardProps={{
                    photoIndex: gesture.photoIndex,
                    photoScrollRef: gesture.photoScrollRef,
                    onPhotoScroll: gesture.handlePhotoScroll,
                    goToPhoto: gesture.goToPhoto,
                    style: {
                      transform: gesture.swipeExit
                        ? gesture.swipeExit === "LIKE"
                          ? "translateX(120%) rotate(12deg)"
                          : "translateX(-120%) rotate(-12deg)"
                        : `translateX(${gesture.cardDragOffset}px) rotate(${gesture.cardDragOffset * 0.06}deg)`,
                      transition: gesture.swipeExit ? "transform 0.2s ease-out" : "none",
                    },
                    dragOffset: gesture.cardDragOffset,
                    onPass: () => feed.restaurants[0] && feed.handleSwipe(feed.restaurants[0].id, "DISLIKE"),
                    onLike: () => feed.restaurants[0] && feed.handleSwipe(feed.restaurants[0].id, "LIKE"),
                    disabled: loading,
                    onTouchStart: gesture.handleTouchStart,
                    onTouchMove: gesture.handleTouchMove,
                    onTouchEnd: gesture.handleTouchEnd,
                    onMouseDown: gesture.handleMouseDown,
                  }}
                />
                {/* Score reveal overlay — positioned over the card area */}
                <AnimatePresence>
                  {feed.pendingReveal && (
                    <MatchReveal
                      restaurant={feed.pendingReveal.restaurant}
                      score={feed.pendingReveal.score}
                      onDismiss={() => feed.setPendingReveal(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </section>
        </>
      )}

      {feed.view === "matches" && (
        <section className={styles.matchesSection}>
          <MatchList matches={feed.matches} loading={loading} onVisitClick={visit.openVisitModal} />
        </section>
      )}

      <AnimatePresence>
        {visit.visitModal && (
          <VisitModal
            match={visit.visitModal}
            mode={visit.visitModalMode}
            experience={visit.visitExperience}
            notes={visit.visitNotes}
            onExperienceChange={visit.setVisitExperience}
            onNotesChange={visit.setVisitNotes}
            onClose={visit.closeVisitModal}
            onSave={() => {
              const match = visit.visitModal;
              if (match) visit.handleMarkVisited(match.swipeId, visit.visitExperience, visit.visitNotes);
            }}
            onEdit={() => visit.setVisitModalMode("edit")}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}
