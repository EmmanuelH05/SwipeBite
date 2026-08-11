/**
 * personalization.ts
 *
 * This file is the bridge between the raw database data and the ML scoring engine.
 * It takes a restaurant + user preference data and returns a score (0-100) along
 * with a human-readable explanation that shows up on the card as "Why this restaurant?"
 *
 * I kept the old `UserPreferenceData` type and `updatePreferencesOnSwipe` function
 * here so the rest of the app doesn't break — the DB stores simple integer counters,
 * and we only build the fancier weighted profile when we're actually scoring.
 *
 * Think of it like: the DB has the raw data, this file shapes it into something the
 * ML engine can work with.
 */

import {
  buildWeightedProfile,
  hybridScore,
  type SwipeRecord,
  type WeightedProfile,
  type MLScoreBreakdown,
} from "./ml-recommender";

// ─────────────────────────────────────────────────────────────────────────────
// Types
//
// UserPreferenceData mirrors what's stored in the `user_preferences` table.
// These are the simple integer/JSON counters that get updated on every swipe.
// The ML engine builds a richer representation on top of these at query time.
// ─────────────────────────────────────────────────────────────────────────────

export type CuisineMap = Record<string, number>;
export type PriceMap   = Record<string, number>;

export type UserPreferenceData = {
  likedCuisines: CuisineMap;
  dislikedCuisines: CuisineMap;
  priceCounts: PriceMap;
  totalLikes: number;
  totalDislikes: number;
  morningLikes: number;
  afternoonLikes: number;
  eveningLikes: number;
  lateNightLikes: number;
};

export type RestaurantInput = {
  id: string;
  cuisine: string;
  priceLevel: string;
  openingHours?: string | null;
};

// ScoreBreakdown extends the ML engine's output.
// The `noveltyBonus` alias is just here so the frontend "% match" badge
// doesn't break — it used to read this field directly.
export type ScoreBreakdown = MLScoreBreakdown & {
  noveltyBonus: number;
};

// MLContext bundles the extra data we pass alongside the legacy preference snapshot.
// userSwipes is the raw history used to build the decay-weighted profile.
// cfScore is the per-restaurant collaborative filtering prediction (or null).
export type MLContext = {
  userSwipes: SwipeRecord[];
  cfScore: number | null;
};

/** Adds `extra`'s counts onto `base`'s, summing values for shared keys. */
function mergeCounts(base: Record<string, number>, extra: Record<string, number>): Record<string, number> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// scoreRestaurant
//
// This is the main function called for every restaurant in the feed.
// It coordinates between the legacy preference data and the ML engine.
//
// If we have the user's raw swipe history (via mlCtx), we build a proper
// decay-weighted profile and merge the DB counters into it as a standing
// prior — onboarding's seeded cuisine picks live in those same counters
// (PATCH /onboarding/seed calls updatePreferencesOnSwipe), and without this
// merge they'd vanish from ranking the instant the user's first real swipe
// gives mlCtx a non-empty history, discarding a deliberate cold-start signal.
// If we have no swipe history at all — like during tests or if something goes
// wrong — we fall back to the plain counters alone.
// ─────────────────────────────────────────────────────────────────────────────

export function scoreRestaurant(
  restaurant: RestaurantInput,
  prefs: UserPreferenceData,
  mlCtx?: MLContext
): ScoreBreakdown {
  const totalInteractions = prefs.totalLikes + prefs.totalDislikes;

  // Build the weighted profile. If we have the raw swipes, use those because
  // they carry temporal decay and visit quality info. Otherwise fall back to
  // the plain counters (treats every swipe as equal weight).
  let weightedProfile: WeightedProfile;

  if (mlCtx && mlCtx.userSwipes.length > 0) {
    const decayed = buildWeightedProfile(mlCtx.userSwipes);
    weightedProfile = {
      likedClusters:         mergeCounts(decayed.likedClusters, prefs.likedCuisines),
      dislikedClusters:      mergeCounts(decayed.dislikedClusters, prefs.dislikedCuisines),
      priceCounts:           mergeCounts(decayed.priceCounts, prefs.priceCounts),
      totalWeightedLikes:    decayed.totalWeightedLikes,
      totalWeightedDislikes: decayed.totalWeightedDislikes,
    };
  } else {
    // Fallback: wrap the DB counters in the WeightedProfile shape
    // This is a lossy approximation — no time decay, no quality signals —
    // but it's better than having no profile at all.
    weightedProfile = {
      likedClusters: prefs.likedCuisines,
      dislikedClusters: prefs.dislikedCuisines,
      priceCounts: prefs.priceCounts,
      totalWeightedLikes: prefs.totalLikes,
      totalWeightedDislikes: prefs.totalDislikes,
    };
  }

  const ml = hybridScore({
    restaurant,
    weightedProfile,
    cfScore: mlCtx?.cfScore ?? null,
    totalInteractions,
  });

  return {
    ...ml,
    noveltyBonus: ml.explorationScore, // keep the old field name for the frontend
  };
}

export function sortByScore(
  restaurants: RestaurantInput[],
  prefs: UserPreferenceData,
  mlCtx?: MLContext
): Array<RestaurantInput & { score: ScoreBreakdown }> {
  return restaurants
    .map((r) => ({ ...r, score: scoreRestaurant(r, prefs, mlCtx) }))
    .sort((a, b) => b.score.total - a.score.total);
}

// ─────────────────────────────────────────────────────────────────────────────
// updatePreferencesOnSwipe
//
// Every time a user swipes, this runs (asynchronously) to update their
// preference profile in the database. These are the simple integer counters —
// not the fancy weighted ones used for scoring.
//
// I'm keeping this because:
// 1. It's fast — just incrementing counters in the DB
// 2. The counters serve as the fallback when raw swipe history isn't loaded
// 3. The `totalLikes + totalDislikes` count is what gates whether CF turns on
//
// The time-of-day bucketing (morning/afternoon/evening/lateNight) is a bonus
// signal that captures context like "I tend to like coffee shops in the morning."
// ─────────────────────────────────────────────────────────────────────────────

function getTimeSlot(): "morning" | "afternoon" | "evening" | "lateNight" {
  const h = new Date().getHours();
  if (h >= 6  && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "lateNight";
}

export function updatePreferencesOnSwipe(
  current: UserPreferenceData,
  cuisine: string,
  priceLevel: string,
  direction: "LIKE" | "DISLIKE"
): UserPreferenceData {
  const normalized = cuisine.toLowerCase().replace(/_/g, " ");
  const slot = getTimeSlot();
  const updated = { ...current };

  if (direction === "LIKE") {
    updated.totalLikes += 1;

    const liked = { ...updated.likedCuisines };
    liked[normalized] = (liked[normalized] ?? 0) + 1;
    updated.likedCuisines = liked;

    const prices = { ...updated.priceCounts };
    prices[priceLevel] = (prices[priceLevel] ?? 0) + 1;
    updated.priceCounts = prices;

    // Bucket the like by time of day so we can learn context preferences
    if (slot === "morning")        updated.morningLikes += 1;
    else if (slot === "afternoon") updated.afternoonLikes += 1;
    else if (slot === "evening")   updated.eveningLikes += 1;
    else                           updated.lateNightLikes += 1;
  } else {
    updated.totalDislikes += 1;

    const disliked = { ...updated.dislikedCuisines };
    disliked[normalized] = (disliked[normalized] ?? 0) + 1;
    updated.dislikedCuisines = disliked;
  }

  return updated;
}
