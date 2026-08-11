import { describe, test, expect } from "bun:test";
import { updatePreferencesOnSwipe, scoreRestaurant, type UserPreferenceData, type RestaurantInput } from "./personalization";
import type { SwipeRecord } from "./ml-recommender";

function empty(): UserPreferenceData {
  return {
    likedCuisines: {}, dislikedCuisines: {}, priceCounts: {},
    totalLikes: 0, totalDislikes: 0,
    morningLikes: 0, afternoonLikes: 0, eveningLikes: 0, lateNightLikes: 0,
  };
}

// Mirrors the private getTimeSlot() bucketing so the time-of-day assertion
// is deterministic regardless of when the test suite runs.
function expectedTimeSlot(): "morningLikes" | "afternoonLikes" | "eveningLikes" | "lateNightLikes" {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return "morningLikes";
  if (h >= 11 && h < 17) return "afternoonLikes";
  if (h >= 17 && h < 22) return "eveningLikes";
  return "lateNightLikes";
}

describe("updatePreferencesOnSwipe", () => {
  test("a LIKE increments totalLikes, the cuisine, and the price bucket", () => {
    const updated = updatePreferencesOnSwipe(empty(), "italian_restaurant", "$$", "LIKE");
    expect(updated.totalLikes).toBe(1);
    expect(updated.totalDislikes).toBe(0);
    expect(updated.likedCuisines["italian restaurant"]).toBe(1);
    expect(updated.priceCounts["$$"]).toBe(1);
  });

  test("normalizes cuisine strings the same way regardless of underscores/case", () => {
    const a = updatePreferencesOnSwipe(empty(), "Italian_Restaurant", "$$", "LIKE");
    const b = updatePreferencesOnSwipe(empty(), "italian restaurant", "$$", "LIKE");
    expect(Object.keys(a.likedCuisines)).toEqual(Object.keys(b.likedCuisines));
  });

  test("a LIKE buckets into exactly one time-of-day counter", () => {
    const updated = updatePreferencesOnSwipe(empty(), "cafe", "$", "LIKE");
    const slot = expectedTimeSlot();
    const slots = ["morningLikes", "afternoonLikes", "eveningLikes", "lateNightLikes"] as const;
    for (const s of slots) expect(updated[s]).toBe(s === slot ? 1 : 0);
  });

  test("a DISLIKE increments totalDislikes and the cuisine, not totalLikes or price", () => {
    const updated = updatePreferencesOnSwipe(empty(), "sushi", "$$$", "DISLIKE");
    expect(updated.totalDislikes).toBe(1);
    expect(updated.totalLikes).toBe(0);
    expect(updated.dislikedCuisines["sushi"]).toBe(1);
    expect(updated.priceCounts).toEqual({});
  });

  test("accumulates across repeated swipes instead of overwriting", () => {
    let profile = empty();
    profile = updatePreferencesOnSwipe(profile, "pizza", "$$", "LIKE");
    profile = updatePreferencesOnSwipe(profile, "pizza", "$$", "LIKE");
    profile = updatePreferencesOnSwipe(profile, "tacos", "$", "DISLIKE");
    expect(profile.totalLikes).toBe(2);
    expect(profile.totalDislikes).toBe(1);
    expect(profile.likedCuisines["pizza"]).toBe(2);
    expect(profile.dislikedCuisines["tacos"]).toBe(1);
  });

  test("does not mutate the input profile -- callers rely on this for safe composition", () => {
    const original = empty();
    const originalSnapshot = JSON.parse(JSON.stringify(original));
    updatePreferencesOnSwipe(original, "cafe", "$", "LIKE");
    expect(original).toEqual(originalSnapshot);
  });
});

describe("scoreRestaurant", () => {
  const asianRestaurant: RestaurantInput = { id: "r1", cuisine: "asian", priceLevel: "$$" };

  // A single swipe unrelated to the seeded cuisine -- just enough to give
  // mlCtx.userSwipes a non-empty history, which is exactly the condition that
  // used to make scoreRestaurant discard the seeded profile entirely.
  const oneUnrelatedSwipe: SwipeRecord[] = [
    { direction: "LIKE", restaurant: { cuisine: "italian", priceLevel: "$$" }, createdAt: new Date() },
  ];

  test("onboarding-seeded cuisine affinity still influences scoring after the user's first real swipe", () => {
    const seeded = empty();
    seeded.likedCuisines = { asian: 10 };
    seeded.totalLikes = 10;

    const unseeded = empty();

    const seededScore = scoreRestaurant(asianRestaurant, seeded, { userSwipes: oneUnrelatedSwipe, cfScore: null });
    const unseededScore = scoreRestaurant(asianRestaurant, unseeded, { userSwipes: oneUnrelatedSwipe, cfScore: null });

    expect(seededScore.total).toBeGreaterThan(unseededScore.total);
  });

  test("does not double-count when the DB counters and real swipe history cover the same cluster", () => {
    // normalizeCuisine("cafe") falls back to "cafe" unchanged -- it has no
    // CUISINE_CLUSTERS entry -- so the raw DB key updatePreferencesOnSwipe
    // writes collides exactly with the cluster key buildWeightedProfile
    // derives from the same real swipe. Merging prefs on top of the decayed
    // profile for a key they both already cover would double-count that
    // swipe; the score should be identical to not having prefs data at all.
    const cafeRestaurant: RestaurantInput = { id: "r2", cuisine: "cafe", priceLevel: "$$" };
    const cafeSwipe: SwipeRecord[] = [
      { direction: "LIKE", restaurant: { cuisine: "cafe", priceLevel: "$$" }, createdAt: new Date() },
    ];

    const prefsMirroringTheSwipe = empty();
    prefsMirroringTheSwipe.likedCuisines = { cafe: 1 };
    prefsMirroringTheSwipe.priceCounts = { "$$": 1 };
    prefsMirroringTheSwipe.totalLikes = 1;

    const withPrefs = scoreRestaurant(cafeRestaurant, prefsMirroringTheSwipe, { userSwipes: cafeSwipe, cfScore: null });
    const withoutPrefs = scoreRestaurant(cafeRestaurant, empty(), { userSwipes: cafeSwipe, cfScore: null });

    expect(withPrefs.cuisineScore).toBe(withoutPrefs.cuisineScore);
    expect(withPrefs.priceScore).toBe(withoutPrefs.priceScore);
  });
});
