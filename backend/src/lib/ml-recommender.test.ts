import { describe, test, expect } from "bun:test";
import {
  normalizeCuisine,
  temporalDecayWeight,
  visitQualityMultiplier,
  buildWeightedProfile,
  buildUserVectors,
  computeCFScore,
  computeThompsonExploration,
  computeClusterCuisineScore,
  priceMlScore,
  hybridScore,
  type SwipeRecord,
  type AllSwipeRecord,
} from "./ml-recommender";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

describe("normalizeCuisine", () => {
  test("groups related raw strings into the same cluster", () => {
    expect(normalizeCuisine("pizza_restaurant")).toBe(normalizeCuisine("italian_restaurant"));
    expect(normalizeCuisine("sushi")).toBe(normalizeCuisine("japanese_restaurant"));
  });

  test("distinguishes unrelated clusters", () => {
    expect(normalizeCuisine("pizza")).not.toBe(normalizeCuisine("taco"));
  });

  test("falls back to the normalized string itself when nothing matches", () => {
    expect(normalizeCuisine("some_made_up_cuisine")).toBe("some made up cuisine");
  });
});

describe("temporalDecayWeight", () => {
  test("a swipe from today weighs close to 1", () => {
    expect(temporalDecayWeight(daysAgo(0))).toBeCloseTo(1, 2);
  });

  test("weight decreases monotonically as the swipe gets older", () => {
    const recent = temporalDecayWeight(daysAgo(5));
    const older = temporalDecayWeight(daysAgo(35));
    const oldest = temporalDecayWeight(daysAgo(90));
    expect(recent).toBeGreaterThan(older);
    expect(older).toBeGreaterThan(oldest);
  });

  test("half-life is roughly 35 days, per the documented lambda", () => {
    expect(temporalDecayWeight(daysAgo(35))).toBeCloseTo(0.5, 1);
  });
});

describe("visitQualityMultiplier", () => {
  test.each([
    ["great", 2.5],
    ["good", 1.75],
    ["okay", 1.0],
    ["disappointing", 0.0],
  ])("%s -> %s", (experience, expected) => {
    expect(visitQualityMultiplier(experience)).toBe(expected);
  });

  test("defaults to neutral for unknown or missing experience", () => {
    expect(visitQualityMultiplier(null)).toBe(1.0);
    expect(visitQualityMultiplier(undefined)).toBe(1.0);
    expect(visitQualityMultiplier("something-unrecognized")).toBe(1.0);
  });
});

describe("buildWeightedProfile", () => {
  test("accumulates LIKEs into likedClusters and price counts", () => {
    const swipes: SwipeRecord[] = [
      { direction: "LIKE", restaurant: { cuisine: "italian", priceLevel: "$$" }, createdAt: daysAgo(0) },
      { direction: "LIKE", restaurant: { cuisine: "pizza", priceLevel: "$$" }, createdAt: daysAgo(0) },
    ];
    const profile = buildWeightedProfile(swipes);
    // pizza normalizes into the same cluster as italian
    expect(profile.likedClusters["italian"]).toBeCloseTo(2, 1);
    expect(profile.priceCounts["$$"]).toBeCloseTo(2, 1);
    expect(profile.totalWeightedDislikes).toBe(0);
  });

  test("accumulates DISLIKEs into dislikedClusters, not priceCounts", () => {
    const swipes: SwipeRecord[] = [
      { direction: "DISLIKE", restaurant: { cuisine: "sushi", priceLevel: "$$$" }, createdAt: daysAgo(0) },
    ];
    const profile = buildWeightedProfile(swipes);
    expect(profile.dislikedClusters["asian"]).toBeCloseTo(1, 1);
    expect(profile.priceCounts).toEqual({});
  });

  test("a disappointing LIKE-then-visit flips to a dislike signal, not a like", () => {
    const swipes: SwipeRecord[] = [
      {
        direction: "LIKE",
        restaurant: { cuisine: "mexican", priceLevel: "$$" },
        experience: "disappointing",
        createdAt: daysAgo(0),
      },
    ];
    const profile = buildWeightedProfile(swipes);
    expect(profile.likedClusters["mexican"]).toBeUndefined();
    expect(profile.dislikedClusters["mexican"]).toBeGreaterThan(0);
    expect(profile.totalWeightedLikes).toBe(0);
    expect(profile.totalWeightedDislikes).toBeGreaterThan(0);
  });

  test("a disappointing DISLIKE-then-visit amplifies the dislike signal (2x)", () => {
    const plain = buildWeightedProfile([
      { direction: "DISLIKE", restaurant: { cuisine: "cafe", priceLevel: "$" }, createdAt: daysAgo(0) },
    ]);
    const disappointing = buildWeightedProfile([
      {
        direction: "DISLIKE",
        restaurant: { cuisine: "cafe", priceLevel: "$" },
        experience: "disappointing",
        createdAt: daysAgo(0),
      },
    ]);
    expect(disappointing.dislikedClusters["cafe"]).toBeCloseTo(plain.dislikedClusters["cafe"] * 2, 1);
  });

  test("older swipes contribute less weight than recent ones for the same cuisine", () => {
    const recent = buildWeightedProfile([
      { direction: "LIKE", restaurant: { cuisine: "thai", priceLevel: "$$" }, createdAt: daysAgo(0) },
    ]);
    const old = buildWeightedProfile([
      { direction: "LIKE", restaurant: { cuisine: "thai", priceLevel: "$$" }, createdAt: daysAgo(200) },
    ]);
    expect(recent.likedClusters["asian"]).toBeGreaterThan(old.likedClusters["asian"]);
  });
});

describe("computeCFScore", () => {
  test("returns null below the minimum-swipes-for-CF threshold", () => {
    const swipes: AllSwipeRecord[] = [
      { userId: "u1", restaurantId: "r1", direction: "LIKE" },
      { userId: "u1", restaurantId: "r2", direction: "LIKE" },
    ];
    const vectors = buildUserVectors(swipes);
    expect(computeCFScore("u1", "r3", vectors)).toBeNull();
  });

  test("returns null when no neighbour has rated the target restaurant", () => {
    const swipes: AllSwipeRecord[] = Array.from({ length: 6 }, (_, i) => ({
      userId: "u1",
      restaurantId: `r${i}`,
      direction: "LIKE" as const,
    }));
    const vectors = buildUserVectors(swipes);
    expect(computeCFScore("u1", "unrated-restaurant", vectors)).toBeNull();
  });

  test("predicts a high score when a similarly-tasted neighbour liked the target restaurant", () => {
    // Pearson needs variance to be defined -- identical ratings across every
    // co-rated item have zero variance (denominator 0), which the
    // implementation correctly treats as "no signal," not "perfect match."
    // So the co-rated pattern alternates LIKE/DISLIKE, matched between u1 and
    // u2, to produce a genuine high positive correlation.
    const pattern: Array<"LIKE" | "DISLIKE"> = ["LIKE", "DISLIKE", "LIKE", "DISLIKE", "LIKE"];
    const shared: AllSwipeRecord[] = pattern.flatMap((direction, i) => [
      { userId: "u1", restaurantId: `r${i}`, direction },
      { userId: "u2", restaurantId: `r${i}`, direction },
    ]);
    const swipes: AllSwipeRecord[] = [...shared, { userId: "u2", restaurantId: "r99", direction: "LIKE" }];
    const vectors = buildUserVectors(swipes);
    const score = computeCFScore("u1", "r99", vectors);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(0.5);
  });

  test("score is scaled into [0, 1]", () => {
    const pattern: Array<"LIKE" | "DISLIKE"> = ["LIKE", "DISLIKE", "LIKE", "DISLIKE", "LIKE"];
    const shared: AllSwipeRecord[] = pattern.flatMap((direction, i) => [
      { userId: "u1", restaurantId: `r${i}`, direction },
      { userId: "u2", restaurantId: `r${i}`, direction },
    ]);
    const swipes: AllSwipeRecord[] = [...shared, { userId: "u2", restaurantId: "r99", direction: "DISLIKE" }];
    const vectors = buildUserVectors(swipes);
    const score = computeCFScore("u1", "r99", vectors);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(1);
  });
});

describe("computeThompsonExploration", () => {
  test("always returns a value in [0, 1]", () => {
    for (let i = 0; i < 200; i++) {
      const v = computeThompsonExploration("italian", { italian: 3 }, { italian: 1 });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("a heavily-liked cluster samples higher on average than a heavily-disliked one", () => {
    const N = 500;
    const likedAvg =
      Array.from({ length: N }, () => computeThompsonExploration("italian", { italian: 40 }, { italian: 1 }))
        .reduce((a, b) => a + b, 0) / N;
    const dislikedAvg =
      Array.from({ length: N }, () => computeThompsonExploration("italian", { italian: 1 }, { italian: 40 }))
        .reduce((a, b) => a + b, 0) / N;
    expect(likedAvg).toBeGreaterThan(dislikedAvg);
  });

  test("stays fast and correct for a heavily-engaged user (high alpha/beta)", () => {
    // A user with ~14 weighted likes and ~14 weighted dislikes in one cluster
    // used to make the old rejection-sampling betaSample spin for seconds-to-
    // forever, since its acceptance probability collapses as alpha/beta grow.
    const start = performance.now();
    const N = 500;
    const samples = Array.from({ length: N }, () =>
      computeThompsonExploration("italian", { italian: 14 }, { italian: 14 })
    );
    expect(performance.now() - start).toBeLessThan(200);

    for (const v of samples) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / N;
    // Beta(15, 15) has mean exactly 0.5
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });
});

describe("computeClusterCuisineScore", () => {
  test("returns neutral 0.5 with no reason when there's no data yet", () => {
    const { score, reason } = computeClusterCuisineScore("italian", {}, {});
    expect(score).toBe(0.5);
    expect(reason).toBeNull();
  });

  test("score rises above 0.5 as likes accumulate, confidence ramping with volume", () => {
    const low = computeClusterCuisineScore("italian", { italian: 1 }, {});
    const high = computeClusterCuisineScore("italian", { italian: 10 }, {});
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.score).toBeGreaterThan(0.5);
  });

  test("surfaces a reason once the score clears the 0.65 threshold", () => {
    const { score, reason } = computeClusterCuisineScore("italian", { italian: 10 }, {});
    expect(score).toBeGreaterThan(0.65);
    expect(reason).toContain("Italian");
  });

  test("score falls below 0.5 when dislikes dominate", () => {
    const { score } = computeClusterCuisineScore("italian", {}, { italian: 10 });
    expect(score).toBeLessThan(0.5);
  });
});

describe("priceMlScore", () => {
  test("is monotonically non-decreasing in ratio across the full [0, 1] range", () => {
    // Regression test: the old three-branch formula crossed over at its
    // 0.2/0.4 boundaries (e.g. ratio 0.40 scored 0.900 but ratio 0.41 scored
    // 0.823), so liking a price band *more* could score it *lower*.
    let prevScore = -Infinity;
    for (let pct = 0; pct <= 100; pct++) {
      const ratio = pct / 100;
      const { score } = priceMlScore("$$", { "$$": ratio, other: 1 - ratio });
      expect(score).toBeGreaterThanOrEqual(prevScore);
      prevScore = score;
    }
  });

  test("returns neutral 0.5 with no reason when there's no price data yet", () => {
    const { score, reason } = priceMlScore("$$", {});
    expect(score).toBe(0.5);
    expect(reason).toBeNull();
  });

  test("surfaces a budget-fit reason once ratio clears 0.4", () => {
    const { reason } = priceMlScore("$$", { "$$": 5, other: 1 });
    expect(reason).toContain("$$ fits your budget");
  });
});

describe("hybridScore", () => {
  const restaurant = { id: "r1", cuisine: "italian", priceLevel: "$$", openingHours: null };
  const emptyProfile = { likedClusters: {}, dislikedClusters: {}, priceCounts: {}, totalWeightedLikes: 0, totalWeightedDislikes: 0 };

  test("new user with zero interactions gets the cold-start explanation", () => {
    const result = hybridScore({ restaurant, weightedProfile: emptyProfile, cfScore: null, totalInteractions: 0 });
    expect(result.explanation).toBe("Swipe to teach me your taste");
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  test("without CF, cfScore is reported as -1 and CF doesn't factor into the total", () => {
    const result = hybridScore({ restaurant, weightedProfile: emptyProfile, cfScore: null, totalInteractions: 3 });
    expect(result.cfScore).toBe(-1);
  });

  test("with CF available, a high CF score pushes the total up relative to without it", () => {
    const withoutCf = hybridScore({ restaurant, weightedProfile: emptyProfile, cfScore: null, totalInteractions: 6 });
    const withCf = hybridScore({ restaurant, weightedProfile: emptyProfile, cfScore: 0.95, totalInteractions: 6 });
    expect(withCf.total).toBeGreaterThan(withoutCf.total);
    expect(withCf.cfScore).toBe(95);
  });

  test("a restaurant matching a strong cuisine preference scores higher than a neutral one", () => {
    const profile = { ...emptyProfile, likedClusters: { italian: 20 }, totalWeightedLikes: 20 };
    const preferred = hybridScore({ restaurant, weightedProfile: profile, cfScore: null, totalInteractions: 20 });
    const neutral = hybridScore({ restaurant, weightedProfile: emptyProfile, cfScore: null, totalInteractions: 20 });
    expect(preferred.total).toBeGreaterThan(neutral.total);
    expect(preferred.explanation).toContain("Italian");
  });

  test("total is always clamped to [0, 100]", () => {
    const profile = { ...emptyProfile, likedClusters: { italian: 1000 }, priceCounts: { "$$": 1000 }, totalWeightedLikes: 1000 };
    const result = hybridScore({ restaurant, weightedProfile: profile, cfScore: 1, totalInteractions: 1000 });
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});
