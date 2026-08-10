import { describe, test, expect } from "bun:test";
import { updatePreferencesOnSwipe, type UserPreferenceData } from "./personalization";

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
