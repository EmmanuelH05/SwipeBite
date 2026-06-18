/**
 * ml-recommender.test.ts
 *
 * Unit tests for the pure scoring functions in ml-recommender.ts.
 *
 * Closes deferred improvement #1 from CLAUDE.md ("Zero tests — start with
 * ml-recommender.ts (pure functions)"). Everything here is deterministic: the
 * only stochastic function (Thompson Sampling via betaSample) is pinned by
 * stubbing Math.random, so the suite is reproducible and CI-safe — no DB,
 * no network, no Google key required.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCuisine,
  temporalDecayWeight,
  visitQualityMultiplier,
  buildWeightedProfile,
  buildUserVectors,
  computeCFScore,
  computeThompsonExploration,
  computeClusterCuisineScore,
  hybridScore,
  type SwipeRecord,
  type AllSwipeRecord,
  type WeightedProfile,
} from "./ml-recommender";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const emptyProfile = (): WeightedProfile => ({
  likedClusters: {},
  dislikedClusters: {},
  priceCounts: {},
  totalWeightedLikes: 0,
  totalWeightedDislikes: 0,
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — normalizeCuisine
// ─────────────────────────────────────────────────────────────────────────────
describe("normalizeCuisine", () => {
  it("maps related cuisines into the same cluster", () => {
    expect(normalizeCuisine("pizza_restaurant")).toBe("italian");
    expect(normalizeCuisine("italian")).toBe("italian");
    expect(normalizeCuisine("ramen")).toBe("asian");
    expect(normalizeCuisine("taco")).toBe("mexican");
  });

  it("is case-insensitive and normalizes underscores to spaces", () => {
    expect(normalizeCuisine("Korean_Restaurant")).toBe("asian");
    expect(normalizeCuisine("BBQ")).toBe("american");
  });

  it("falls back to the normalized raw string when nothing matches", () => {
    expect(normalizeCuisine("ethiopian_restaurant")).toBe("ethiopian restaurant");
  });

  it("resolves overlapping terms by cluster declaration order (asian before seafood)", () => {
    // "sushi" appears in both `asian` and `seafood`; asian is declared first.
    expect(normalizeCuisine("sushi")).toBe("asian");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — temporalDecayWeight
// ─────────────────────────────────────────────────────────────────────────────
describe("temporalDecayWeight", () => {
  it("is ~1.0 for a swipe right now", () => {
    expect(temporalDecayWeight(new Date())).toBeCloseTo(1, 2);
  });

  it("has a half-life of ~35 days (λ = 0.02)", () => {
    expect(temporalDecayWeight(daysAgo(35))).toBeCloseTo(0.5, 1);
  });

  it("decreases monotonically as a swipe gets older", () => {
    const recent = temporalDecayWeight(daysAgo(1));
    const mid = temporalDecayWeight(daysAgo(30));
    const old = temporalDecayWeight(daysAgo(120));
    expect(recent).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — visitQualityMultiplier
// ─────────────────────────────────────────────────────────────────────────────
describe("visitQualityMultiplier", () => {
  it("scales by rating quality", () => {
    expect(visitQualityMultiplier("great")).toBe(2.5);
    expect(visitQualityMultiplier("good")).toBe(1.75);
    expect(visitQualityMultiplier("okay")).toBe(1.0);
    expect(visitQualityMultiplier("disappointing")).toBe(0.0);
  });

  it("is case-insensitive", () => {
    expect(visitQualityMultiplier("GREAT")).toBe(2.5);
  });

  it("treats null / undefined / unknown as neutral (1.0)", () => {
    expect(visitQualityMultiplier(null)).toBe(1.0);
    expect(visitQualityMultiplier(undefined)).toBe(1.0);
    expect(visitQualityMultiplier("")).toBe(1.0);
    expect(visitQualityMultiplier("mediocre")).toBe(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — buildWeightedProfile
// ─────────────────────────────────────────────────────────────────────────────
describe("buildWeightedProfile", () => {
  const swipe = (o: {
    direction?: "LIKE" | "DISLIKE";
    cuisine: string;
    priceLevel?: string;
    experience?: string | null;
    createdAt?: Date;
  }): SwipeRecord => ({
    direction: o.direction ?? "LIKE",
    restaurant: { cuisine: o.cuisine, priceLevel: o.priceLevel ?? "$$" },
    experience: o.experience ?? null,
    createdAt: o.createdAt ?? new Date(),
  });

  it("accumulates LIKE swipes into liked clusters and price counts", () => {
    const p = buildWeightedProfile([
      swipe({ cuisine: "pizza", priceLevel: "$$" }),
      swipe({ cuisine: "italian", priceLevel: "$$" }),
    ]);
    expect(p.likedClusters.italian).toBeCloseTo(2, 5); // both normalize to "italian"
    expect(p.priceCounts["$$"]).toBeCloseTo(2, 5);
    expect(p.dislikedClusters).toEqual({});
    expect(p.totalWeightedLikes).toBeCloseTo(2, 5);
    expect(p.totalWeightedDislikes).toBe(0);
  });

  it("accumulates DISLIKE swipes into disliked clusters only", () => {
    const p = buildWeightedProfile([
      swipe({ direction: "DISLIKE", cuisine: "sushi", priceLevel: "$$$" }),
    ]);
    expect(p.dislikedClusters.asian).toBeCloseTo(1, 5);
    expect(p.likedClusters).toEqual({});
    expect(p.priceCounts).toEqual({}); // dislikes never touch price affinity
  });

  it("flips a 'disappointing' LIKE-visit into a 1.5x dislike signal, not a like", () => {
    const p = buildWeightedProfile([
      swipe({
        direction: "LIKE",
        cuisine: "italian",
        experience: "disappointing",
        priceLevel: "$$",
      }),
    ]);
    expect(p.likedClusters.italian).toBeUndefined();
    expect(p.dislikedClusters.italian).toBeCloseTo(1.5, 5); // timeW(~1) * 1.5
    expect(p.priceCounts).toEqual({}); // not counted toward price affinity
  });

  it("amplifies a 'disappointing' DISLIKE-visit by 2x", () => {
    const p = buildWeightedProfile([
      swipe({
        direction: "DISLIKE",
        cuisine: "mexican",
        experience: "disappointing",
        priceLevel: "$",
      }),
    ]);
    expect(p.dislikedClusters.mexican).toBeCloseTo(2.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Collaborative filtering
// ─────────────────────────────────────────────────────────────────────────────
describe("buildUserVectors", () => {
  it("maps LIKE -> +1 and DISLIKE -> -1 per user", () => {
    const all: AllSwipeRecord[] = [
      { userId: "u1", restaurantId: "r1", direction: "LIKE" },
      { userId: "u1", restaurantId: "r2", direction: "DISLIKE" },
      { userId: "u2", restaurantId: "r1", direction: "LIKE" },
    ];
    const v = buildUserVectors(all);
    expect(v.get("u1")).toEqual({ r1: 1, r2: -1 });
    expect(v.get("u2")).toEqual({ r1: 1 });
  });
});

describe("computeCFScore", () => {
  // Target user with enough swipes and real variance so Pearson is well-defined.
  const target: AllSwipeRecord[] = [
    { userId: "u0", restaurantId: "r1", direction: "LIKE" },
    { userId: "u0", restaurantId: "r2", direction: "LIKE" },
    { userId: "u0", restaurantId: "r3", direction: "DISLIKE" },
    { userId: "u0", restaurantId: "r4", direction: "LIKE" },
    { userId: "u0", restaurantId: "r5", direction: "DISLIKE" },
  ];

  it("returns null when the user has fewer than 5 swipes", () => {
    const vectors = buildUserVectors(target.slice(0, 3));
    expect(computeCFScore("u0", "r6", vectors)).toBeNull();
  });

  it("returns null when no neighbour has rated the target restaurant", () => {
    const vectors = buildUserVectors(target);
    expect(computeCFScore("u0", "r999", vectors)).toBeNull();
  });

  it("returns ~1.0 when a perfectly-correlated neighbour liked the restaurant", () => {
    const neighbour: AllSwipeRecord[] = [
      { userId: "u1", restaurantId: "r1", direction: "LIKE" },
      { userId: "u1", restaurantId: "r2", direction: "LIKE" },
      { userId: "u1", restaurantId: "r3", direction: "DISLIKE" }, // 3 co-rated, identical pattern
      { userId: "u1", restaurantId: "r6", direction: "LIKE" }, // rated the target restaurant
    ];
    const vectors = buildUserVectors([...target, ...neighbour]);
    const score = computeCFScore("u0", "r6", vectors);
    expect(score).not.toBeNull();
    expect(score!).toBeCloseTo(1.0, 5); // (+1 scaled from [-1,1] to [0,1])
  });

  it("ignores neighbours below the 3 co-rated minimum", () => {
    const thinOverlap: AllSwipeRecord[] = [
      { userId: "u2", restaurantId: "r1", direction: "LIKE" }, // only 1 shared restaurant
      { userId: "u2", restaurantId: "r6", direction: "LIKE" },
    ];
    const vectors = buildUserVectors([...target, ...thinOverlap]);
    expect(computeCFScore("u0", "r6", vectors)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Thompson Sampling exploration
// ─────────────────────────────────────────────────────────────────────────────
describe("computeThompsonExploration", () => {
  it("always returns a probability in (0, 1)", () => {
    for (let i = 0; i < 500; i++) {
      const x = computeThompsonExploration("italian", { italian: 4 }, { italian: 1 });
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("returns 0.5 for an unseen cluster when the RNG is pinned (Beta(1,1) symmetric draw)", () => {
    // betaSample(1,1) with Math.random=0.25: x=0.25, y=0.25 -> x/(x+y)=0.5
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    expect(computeThompsonExploration("italian", {}, {})).toBeCloseTo(0.5, 10);
  });

  it("skews high for a strongly-liked cluster on average", () => {
    const samples = Array.from({ length: 2000 }, () =>
      computeThompsonExploration("italian", { italian: 50 }, { italian: 1 })
    );
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.8); // Beta(51, 2) concentrates near ~0.96
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Cluster-aware cuisine score
// ─────────────────────────────────────────────────────────────────────────────
describe("computeClusterCuisineScore", () => {
  it("returns a neutral 0.5 with no reason when there is no data for the cluster", () => {
    expect(computeClusterCuisineScore("italian", {}, {})).toEqual({ score: 0.5, reason: null });
  });

  it("rewards a well-liked cluster and surfaces a reason past the 0.65 threshold", () => {
    const res = computeClusterCuisineScore("italian", { italian: 10 }, {});
    expect(res.score).toBeGreaterThan(0.65);
    expect(res.reason).toBe("you love Italian food");
  });

  it("penalizes a disliked cluster below neutral", () => {
    const res = computeClusterCuisineScore("italian", { italian: 1 }, { italian: 9 });
    expect(res.score).toBeLessThan(0.5);
    expect(res.reason).toBeNull();
  });

  it("stays near neutral when confidence is low (few interactions)", () => {
    // 1 like, 0 dislike -> ratio 1 but confidence = 1/5 -> 0.5 + 0.5*0.2 = 0.6
    expect(computeClusterCuisineScore("italian", { italian: 1 }, {}).score).toBeCloseTo(0.6, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — hybridScore composition
// ─────────────────────────────────────────────────────────────────────────────
describe("hybridScore", () => {
  const restaurant = { id: "r1", cuisine: "italian", priceLevel: "$$", openingHours: null };

  it("composes the no-CF weights (45/22/10/23) exactly when RNG is pinned", () => {
    // Empty profile -> cuisine 0.5, price 0.5, exploration Beta(1,1)=0.5 (random 0.25).
    // currentHour 18 -> dinner -> time 0.7.
    // 0.5*0.45 + 0.5*0.22 + 0.7*0.10 + 0.5*0.23 = 0.52 -> 52.0
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const out = hybridScore({
      restaurant,
      weightedProfile: emptyProfile(),
      cfScore: null,
      totalInteractions: 3,
      currentHour: 18,
    });
    expect(out.total).toBeCloseTo(52.0, 5);
    expect(out.cfScore).toBe(-1); // sentinel for "no CF"
    expect(out.signals).toContain("cf:n/a");
  });

  it("composes the CF weights (32/18/8/28/14) exactly when RNG is pinned", () => {
    // Same components + cfScore 0.8:
    // 0.5*0.32 + 0.5*0.18 + 0.7*0.08 + 0.8*0.28 + 0.5*0.14 = 0.60 -> 60.0
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const out = hybridScore({
      restaurant,
      weightedProfile: emptyProfile(),
      cfScore: 0.8,
      totalInteractions: 10,
      currentHour: 18,
    });
    expect(out.total).toBeCloseTo(60.0, 5);
    expect(out.cfScore).toBe(80);
    expect(out.signals).toContain("cf:80");
    expect(out.explanation).toContain("popular with similar users");
  });

  it("clamps the total to the 0–100 range", () => {
    const loaded: WeightedProfile = {
      likedClusters: { italian: 100 },
      dislikedClusters: {},
      priceCounts: { "$$": 100 },
      totalWeightedLikes: 100,
      totalWeightedDislikes: 0,
    };
    const out = hybridScore({
      restaurant,
      weightedProfile: loaded,
      cfScore: 1,
      totalInteractions: 100,
      currentHour: 18,
    });
    expect(out.total).toBeGreaterThanOrEqual(0);
    expect(out.total).toBeLessThanOrEqual(100);
  });

  it("uses the cold-start explanation when the user has no interactions", () => {
    const out = hybridScore({
      restaurant,
      weightedProfile: emptyProfile(),
      cfScore: null,
      totalInteractions: 0,
    });
    expect(out.explanation).toBe("Swipe to teach me your taste");
  });
});
