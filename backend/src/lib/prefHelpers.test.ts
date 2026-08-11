import { describe, test, expect } from "bun:test";
import { buildPrefData, emptyPrefData } from "./prefHelpers";

function rawPref(overrides: Partial<{ likedCuisines: unknown; dislikedCuisines: unknown; priceCounts: unknown }>) {
  return {
    likedCuisines: {}, dislikedCuisines: {}, priceCounts: {},
    totalLikes: 3, totalDislikes: 1,
    morningLikes: 0, afternoonLikes: 0, eveningLikes: 0, lateNightLikes: 0,
    ...overrides,
  };
}

describe("buildPrefData", () => {
  test("returns an empty profile for a null row (new user)", () => {
    expect(buildPrefData(null)).toEqual(emptyPrefData());
  });

  test("passes through well-formed count maps", () => {
    const pref = rawPref({ likedCuisines: { italian: 3 } });
    expect(buildPrefData(pref).likedCuisines).toEqual({ italian: 3 });
  });

  // Prisma's Json columns are typed `unknown` at this boundary -- every
  // current write path produces a plain object, but nothing enforces that.
  // A malformed value here used to flow straight into the scorer's
  // arithmetic instead of degrading safely.
  test.each([
    ["an array", ["not", "a", "map"]],
    ["a string", "not-an-object"],
    ["a number", 42],
    ["null", null],
  ])("degrades %s to an empty map instead of propagating it", (_label, malformed) => {
    const pref = rawPref({ likedCuisines: malformed, dislikedCuisines: malformed, priceCounts: malformed });
    const result = buildPrefData(pref);
    expect(result.likedCuisines).toEqual({});
    expect(result.dislikedCuisines).toEqual({});
    expect(result.priceCounts).toEqual({});
  });
});
