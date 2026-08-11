/**
 * ml-recommender.ts
 *
 * This is the heart of the recommendation system. I'm combining a few different
 * techniques I learned about in my ML class: content-based filtering (using
 * the user's own history), collaborative filtering (borrowing from similar users),
 * and a UCB exploration bonus so we don't just keep showing the same stuff forever.
 *
 * The whole thing is written in plain TypeScript — no ML libraries needed. Most of
 * this is just linear algebra and a couple of smart formulas.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Cuisine Clustering
//
// Google Places API returns raw "types" like "chinese_restaurant" or "pizza_restaurant".
// The problem is that if a user likes "pizza_restaurant" and we see "italian_restaurant"
// we should recognize those are related — but exact string matching won't catch that.
//
// So I'm grouping similar cuisines into clusters. This way "pizza" and "italian" both
// contribute to the same preference signal instead of being treated as totally different.
// ─────────────────────────────────────────────────────────────────────────────

export const CUISINE_CLUSTERS: Record<string, string[]> = {
  asian: [
    "chinese", "japanese", "korean", "thai", "vietnamese", "asian",
    "chinese_restaurant", "japanese_restaurant", "korean_restaurant",
    "thai_restaurant", "vietnamese_restaurant", "ramen", "noodle",
    "dim sum", "pho", "sushi", "udon", "tempura", "dumpling",
  ],
  italian: [
    "italian", "pizza", "pasta", "italian_restaurant", "pizza_restaurant",
    "trattoria", "osteria", "ristorante",
  ],
  american: [
    "american", "burger", "burgers", "bbq", "southern", "diner",
    "american_restaurant", "hamburger_restaurant", "barbecue_restaurant",
    "comfort food", "steak", "steakhouse", "grill",
  ],
  mexican: [
    "mexican", "latin", "tex mex", "mexican_restaurant", "taco",
    "tacos", "burrito", "latin_american_restaurant",
  ],
  indian: [
    "indian", "south asian", "indian_restaurant", "curry",
    "pakistani", "bangladeshi", "sri lankan",
  ],
  mediterranean: [
    "mediterranean", "greek", "middle eastern", "lebanese", "turkish",
    "persian", "mediterranean_restaurant", "greek_restaurant",
    "middle_eastern_restaurant", "falafel", "shawarma", "hummus",
    "moroccan", "israeli",
  ],
  seafood: [
    // "sushi" deliberately omitted -- it's listed under "asian" above, and
    // since normalizeCuisine returns on the first cluster match in insertion
    // order, a duplicate entry here would be unreachable dead weight.
    "seafood", "fish", "seafood_restaurant", "oyster",
    "fish and chips",
  ],
  european: [
    "french", "spanish", "german", "european", "french_restaurant",
    "spanish_restaurant", "tapas", "brasserie", "bistro",
  ],
  cafe: [
    "cafe", "coffee shop", "coffee", "brunch", "breakfast",
    "bakery", "coffeehouse", "patisserie",
  ],
  dessert: [
    "ice cream shop", "dessert", "ice cream", "sweets", "donut",
    "frozen yogurt", "gelato",
  ],
  fastfood: [
    "fast food", "fast_food", "sandwich", "sandwiches",
    "sandwich_shop", "sub", "wrap",
  ],
};

// Takes a raw cuisine string and returns the cluster name it belongs to.
// Falls back to the normalized string itself if nothing matches.
export function normalizeCuisine(raw: string): string {
  const lower = raw.toLowerCase().replace(/_/g, " ");
  for (const [cluster, variants] of Object.entries(CUISINE_CLUSTERS)) {
    if (variants.some((v) => lower.includes(v))) return cluster;
  }
  return lower;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Temporal Decay
//
// Not all swipes are equally useful. Something I swiped on 6 months ago might
// not reflect what I want for lunch today — my tastes change over time.
//
// The fix is exponential decay: multiply each swipe's weight by e^(-λ * days_ago).
// With λ = 0.02, the half-life is about 35 days, meaning a swipe from a month ago
// is worth roughly half as much as one from today. This is the same math as
// radioactive decay, which is kind of cool.
// ─────────────────────────────────────────────────────────────────────────────

const DECAY_LAMBDA = 0.02; // half-life ≈ 35 days

export function temporalDecayWeight(swipeDate: Date): number {
  const daysAgo = (Date.now() - swipeDate.getTime()) / 86_400_000;
  return Math.exp(-DECAY_LAMBDA * daysAgo);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Visit Quality Amplifier
//
// When a user actually visits a restaurant and rates it, that's a much stronger
// signal than a casual swipe. If someone went there, loved it, and said "great" —
// that should count way more than just a LIKE swipe while scrolling.
//
// I multiply the base swipe weight by a quality factor based on their rating:
//   "great"         → 2.5× (really strong positive signal)
//   "good"          → 1.75×
//   "okay"          → 1.0× (neutral, doesn't change anything)
//   "disappointing" → 0.0× (zero out the LIKE signal — they regret going)
//
// The "disappointing" case is interesting: the person LIKED it but then went and
// hated it. So we want to actively flip that into a dislike signal elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

// The only values a visit's `experience` may take. Shared with the write
// boundary in routes/swipes.ts so a typo (e.g. "Great " or "amazing") is
// rejected with a 400 instead of silently degrading to the neutral 1.0x
// multiplier below -- "disappointing" in particular is the one value that
// actively flips a LIKE into a dislike signal, so a silently-dropped typo
// defeats that signal with no error.
export const VISIT_EXPERIENCES = ["great", "good", "okay", "disappointing"] as const;
export type VisitExperience = (typeof VISIT_EXPERIENCES)[number];

export function isVisitExperience(value: string): value is VisitExperience {
  return (VISIT_EXPERIENCES as readonly string[]).includes(value);
}

export function visitQualityMultiplier(experience: string | null | undefined): number {
  switch ((experience ?? "").toLowerCase()) {
    case "great":         return 2.5;
    case "good":          return 1.75;
    case "okay":          return 1.0;
    case "disappointing": return 0.0; // this gets treated as a dislike in buildWeightedProfile
    default:              return 1.0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Weighted Preference Profile
//
// Instead of just counting likes per cuisine (which is what the original system did),
// I'm building a "weighted profile" that accounts for BOTH temporal decay AND visit quality.
//
// Each swipe contributes: timeWeight * qualityWeight to the liked or disliked cuisine bucket.
// The result is a floating-point map like { "asian": 3.7, "italian": 1.2 } instead of
// raw integers. This is more nuanced and should capture preferences better.
// ─────────────────────────────────────────────────────────────────────────────

export type SwipeRecord = {
  direction: "LIKE" | "DISLIKE";
  restaurant: { cuisine: string; priceLevel: string };
  experience?: string | null;
  createdAt: Date;
};

export type WeightedProfile = {
  likedClusters: Record<string, number>;
  dislikedClusters: Record<string, number>;
  priceCounts: Record<string, number>;
  totalWeightedLikes: number;
  totalWeightedDislikes: number;
};

export function buildWeightedProfile(swipes: SwipeRecord[]): WeightedProfile {
  const likedClusters: Record<string, number> = {};
  const dislikedClusters: Record<string, number> = {};
  const priceCounts: Record<string, number> = {};
  let totalWeightedLikes = 0;
  let totalWeightedDislikes = 0;

  for (const swipe of swipes) {
    const timeW = temporalDecayWeight(swipe.createdAt);
    const cluster = normalizeCuisine(swipe.restaurant.cuisine);

    if (swipe.direction === "LIKE") {
      if (swipe.experience === "disappointing") {
        // User LIKED it but visited and hated it — flip to active dislike signal
        const w = timeW * 1.5;
        dislikedClusters[cluster] = (dislikedClusters[cluster] ?? 0) + w;
        totalWeightedDislikes += w;
      } else {
        const qualityW = visitQualityMultiplier(swipe.experience);
        const w = timeW * qualityW;
        likedClusters[cluster] = (likedClusters[cluster] ?? 0) + w;
        priceCounts[swipe.restaurant.priceLevel] =
          (priceCounts[swipe.restaurant.priceLevel] ?? 0) + w;
        totalWeightedLikes += w;
      }
    } else {
      // "disappointing" on a DISLIKE visit confirms and amplifies the signal
      const qualityW = swipe.experience === "disappointing" ? 2.0 : 1.0;
      const w = timeW * qualityW;
      dislikedClusters[cluster] = (dislikedClusters[cluster] ?? 0) + w;
      totalWeightedDislikes += w;
    }
  }

  return { likedClusters, dislikedClusters, priceCounts, totalWeightedLikes, totalWeightedDislikes };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Collaborative Filtering (User-Based CF)
//
// This is the part that makes it feel like "Netflix recommendations." The idea:
// find other users who have similar taste to you, then recommend things they liked
// that you haven't tried yet.
//
// Step 1 — Build a user-item matrix. Each user is a vector in restaurant-space.
//   User A: { restaurantX: +1, restaurantY: -1, restaurantZ: +1 }
//   User B: { restaurantX: +1, restaurantY: +1, restaurantZ: +1 }
//
// Step 2 — Compute cosine similarity between User A and every other user.
//   Cosine similarity = dot(A, B) / (|A| * |B|)
//   If angle = 0°, cos = 1 → perfect taste match
//   If angle = 90°, cos = 0 → nothing in common
//   We ignore negative similarity (opposite taste)
//
// Step 3 — For a target restaurant, take a weighted average of what similar
//   users think. Users who are more similar to you get more weight.
//
// One catch: we need at least a few swipes to find meaningful neighbours.
// With only 2-3 swipes, the similarity scores are meaningless, so I set a
// minimum threshold of 5 swipes before CF kicks in.
// ─────────────────────────────────────────────────────────────────────────────

export type AllSwipeRecord = {
  userId: string;
  restaurantId: string;
  direction: "LIKE" | "DISLIKE";
};

type UserVector = Record<string, number>; // restaurantId → +1 or -1

export function buildUserVectors(allSwipes: AllSwipeRecord[]): Map<string, UserVector> {
  const vectors = new Map<string, UserVector>();
  for (const s of allSwipes) {
    if (!vectors.has(s.userId)) vectors.set(s.userId, {});
    vectors.get(s.userId)![s.restaurantId] = s.direction === "LIKE" ? 1 : -1;
  }
  return vectors;
}

// Pearson correlation between two sparse user vectors.
// Requires at least MIN_CO_RATED shared restaurants to avoid noise from tiny overlap.
// Pearson handles sparse binary ratings better than cosine — it centers each user's
// mean so that rating style (mostly LIKE vs. balanced) doesn't pollute similarity.
const MIN_CO_RATED = 3;

function pearsonSimilarity(a: UserVector, b: UserVector): number {
  const keysB = new Set(Object.keys(b));
  const shared = Object.keys(a).filter((k) => keysB.has(k));
  if (shared.length < MIN_CO_RATED) return 0;

  const n = shared.length;
  const meanA = shared.reduce((s, k) => s + a[k], 0) / n;
  const meanB = shared.reduce((s, k) => s + b[k], 0) / n;

  let num = 0, denA = 0, denB = 0;
  for (const k of shared) {
    const da = a[k] - meanA;
    const db = b[k] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return 0;
  return num / Math.sqrt(denA * denB);
}

export const MIN_SWIPES_FOR_CF = 5; // not enough data below this
const CF_TOP_K = 15;          // only use the 15 most similar neighbours

export function computeCFScore(
  targetUserId: string,
  restaurantId: string,
  cfVectors: Map<string, UserVector>
): number | null {
  const targetVec = cfVectors.get(targetUserId);

  // If the user hasn't swiped enough, skip CF entirely
  if (!targetVec || Object.keys(targetVec).length < MIN_SWIPES_FOR_CF) return null;

  // Gather neighbours who have rated this restaurant and share enough overlap with us
  const neighbours: Array<{ similarity: number; rating: number }> = [];
  for (const [uid, vec] of cfVectors) {
    if (uid === targetUserId) continue;
    if (!(restaurantId in vec)) continue;

    const sim = pearsonSimilarity(targetVec, vec);
    if (sim > 0.05) neighbours.push({ similarity: sim, rating: vec[restaurantId] });
  }

  if (neighbours.length === 0) return null;

  // Sort by similarity, keep top K
  neighbours.sort((a, b) => b.similarity - a.similarity);
  const topK = neighbours.slice(0, CF_TOP_K);

  // Weighted average: more similar neighbours have more influence on the final score
  const totalW = topK.reduce((s, n) => s + n.similarity, 0);
  const wSum = topK.reduce((s, n) => s + n.similarity * n.rating, 0);

  // Scale from [-1, 1] (the rating range) to [0, 1] (the score range we use everywhere)
  return (wSum / totalW + 1) / 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Thompson Sampling Exploration
//
// UCB1 is deterministic — given the same state, every user sees the same
// exploration bonus, which causes the feed to feel mechanical. Thompson Sampling
// is probabilistic: it draws a sample from a Beta distribution for each cuisine
// cluster, producing naturally diverse exploration that decays gracefully as
// data accumulates.
//
// For our binary LIKE/DISLIKE case, the Beta distribution is the conjugate prior
// for the Bernoulli likelihood — the math fits perfectly:
//   α = weighted_likes + 1    (successes + prior)
//   β = weighted_dislikes + 1 (failures + prior)
//
// Drawing Beta(α, β) samples what we'd expect the like-probability to be for
// this cuisine cluster. High uncertainty (few data points) → wide distribution
// → high variance → natural exploration. High certainty → narrow distribution
// → score converges to the true preference.
//
// Sampled via the Marsaglia-Tsang gamma method (valid for shape >= 1, which
// always holds here since alpha/beta are counts plus a +1 prior): draw two
// independent Gamma(shape, 1) variates and take their ratio X/(X+Y), which is
// distributed as Beta(alpha, beta). O(1) expected iterations (~98% single-pass
// acceptance) regardless of how large alpha/beta get — unlike rejection
// methods whose acceptance probability collapses as both parameters grow.
// ─────────────────────────────────────────────────────────────────────────────

function standardNormalSample(): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function gammaSample(shape: number): number {
  // Marsaglia-Tsang method: exact for shape >= 1
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = standardNormalSample();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function betaSample(alpha: number, beta: number): number {
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

export function computeThompsonExploration(
  cuisine: string,
  likedClusters: Record<string, number>,
  dislikedClusters: Record<string, number>
): number {
  const cluster = normalizeCuisine(cuisine);
  const alpha = (likedClusters[cluster] ?? 0) + 1; // Beta prior: 1 pseudocount
  const beta  = (dislikedClusters[cluster] ?? 0) + 1;
  return betaSample(alpha, beta);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Cluster-Aware Cuisine Score
//
// This replaces the original exact-string cuisine match with a cluster-based one.
// The math is the same: ratio = likes / (likes + dislikes), then we apply a
// confidence factor that saturates once we have enough data (~5 interactions).
// Below that threshold, we stay close to 0.5 (neutral) because we're uncertain.
// ─────────────────────────────────────────────────────────────────────────────

export function computeClusterCuisineScore(
  cuisine: string,
  likedClusters: Record<string, number>,
  dislikedClusters: Record<string, number>
): { score: number; reason: string | null } {
  const cluster = normalizeCuisine(cuisine);
  const likeW = likedClusters[cluster] ?? 0;
  const dislikeW = dislikedClusters[cluster] ?? 0;
  const total = likeW + dislikeW;

  if (total === 0) return { score: 0.5, reason: null };

  const ratio = likeW / total;
  const confidence = Math.min(total / 5, 1); // confidence ramps up to 1.0 at 5 weighted interactions
  const score = 0.5 + (ratio - 0.5) * confidence;

  const label = cluster.charAt(0).toUpperCase() + cluster.slice(1);
  if (score > 0.65) return { score, reason: `you love ${label} food` };
  return { score, reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: Hybrid Scoring — putting it all together
//
// The final score blends all the signals above. I use different weights depending
// on whether we have CF data or not:
//
//   WITH CF:    cuisine 28% + price 15% + time 10% + CF 30% + exploration 17%
//   WITHOUT CF: cuisine 40% + price 20% + time 13% + exploration 27%
//
// The CF signal gets a big chunk (30%) because "similar users liked this" is
// really strong evidence. When CF isn't available yet (new user, sparse data),
// content-based and exploration fill the gap.
// ─────────────────────────────────────────────────────────────────────────────

export type MLScoreInput = {
  restaurant: {
    id: string;
    cuisine: string;
    priceLevel: string;
    openingHours?: string | null;
  };
  weightedProfile: WeightedProfile;
  cfScore: number | null;
  totalInteractions: number;
  currentHour?: number;
};

export type MLScoreBreakdown = {
  total: number;
  cuisineScore: number;
  priceScore: number;
  timeScore: number;
  explorationScore: number;
  cfScore: number;
  explanation: string;
  signals: string[];
};

export function priceMlScore(
  priceLevel: string,
  priceCounts: Record<string, number>
): { score: number; reason: string | null } {
  const total = Object.values(priceCounts).reduce((s, v) => s + v, 0);
  if (total === 0) return { score: 0.5, reason: null };

  const ratio = (priceCounts[priceLevel] ?? 0) / total;
  // Single continuous, monotonic curve: 0.3 floor at no affinity for this
  // price band up to 1.0 at full affinity. (Previously three piecewise
  // branches that weren't monotonic — e.g. ratio 0.40 scored 0.900 but
  // ratio 0.41 scored 0.823 — so liking a price band *more* could score it
  // *lower*.)
  const score = 0.3 + ratio * 0.7;
  return { score, reason: ratio > 0.4 ? `${priceLevel} fits your budget` : null };
}

function timeMlScore(
  hour: number,
  openingHours: string | null | undefined
): { score: number; reason: string | null } {
  const h = (openingHours ?? "").toLowerCase();
  const isLateNight =
    h.includes("11:00 pm") || h.includes("12:00 am") ||
    h.includes("1:00 am") || h.includes("2:00 am") || h.includes("24 hours");

  if (hour >= 22 || hour < 6) return isLateNight ? { score: 0.9, reason: "open late night" } : { score: 0.4, reason: null };
  if (hour >= 17) return { score: 0.7, reason: "great for dinner" };
  if (hour >= 11) return { score: 0.65, reason: "great for lunch" };
  return { score: 0.55, reason: null };
}

// Signal weights — two sets so we can gracefully handle no-CF case.
// Time weight is low: the timeMlScore is coarse (hour buckets only) and the
// per-user time-of-day counters aren't yet fed into this path.
const W_CF     = { cuisine: 0.32, price: 0.18, time: 0.08, cf: 0.28, exploration: 0.14 };
const W_NO_CF  = { cuisine: 0.45, price: 0.22, time: 0.10, exploration: 0.23 };

export function hybridScore(input: MLScoreInput): MLScoreBreakdown {
  const { restaurant, weightedProfile, cfScore, totalInteractions, currentHour = new Date().getHours() } = input;
  const { likedClusters, dislikedClusters, priceCounts } = weightedProfile;

  const cuisine     = computeClusterCuisineScore(restaurant.cuisine, likedClusters, dislikedClusters);
  const price       = priceMlScore(restaurant.priceLevel, priceCounts);
  const time        = timeMlScore(currentHour, restaurant.openingHours);
  const exploration = computeThompsonExploration(restaurant.cuisine, likedClusters, dislikedClusters);

  let rawTotal: number;
  const reasons: Array<string | null> = [cuisine.reason, price.reason, time.reason];

  if (cfScore !== null) {
    rawTotal =
      cuisine.score    * W_CF.cuisine +
      price.score      * W_CF.price +
      time.score       * W_CF.time +
      cfScore          * W_CF.cf +
      exploration      * W_CF.exploration;
    if (cfScore > 0.65) reasons.push("popular with similar users");
  } else {
    rawTotal =
      cuisine.score    * W_NO_CF.cuisine +
      price.score      * W_NO_CF.price +
      time.score       * W_NO_CF.time +
      exploration      * W_NO_CF.exploration;
    if (exploration > 0.7) reasons.push("something new to try");
  }

  const total = Math.round(Math.min(rawTotal * 100, 100) * 10) / 10;

  const validReasons = reasons.filter((r): r is string => r !== null);
  let explanation: string;
  if (totalInteractions === 0) {
    explanation = "Swipe to teach me your taste";
  } else if (validReasons.length === 0) {
    explanation = "Based on your swipe history";
  } else if (validReasons.length === 1) {
    explanation = `Recommended because ${validReasons[0]}`;
  } else {
    const last = validReasons[validReasons.length - 1];
    explanation = `Recommended because ${validReasons.slice(0, -1).join(", ")} & ${last}`;
  }

  return {
    total,
    cuisineScore:     Math.round(cuisine.score * 100),
    priceScore:       Math.round(price.score * 100),
    timeScore:        Math.round(time.score * 100),
    explorationScore: Math.round(exploration * 100),
    cfScore:          cfScore !== null ? Math.round(cfScore * 100) : -1,
    explanation,
    signals: [
      `cuisine:${Math.round(cuisine.score * 100)}`,
      `price:${Math.round(price.score * 100)}`,
      `time:${Math.round(time.score * 100)}`,
      `exploration:${Math.round(exploration * 100)}`,
      cfScore !== null ? `cf:${Math.round(cfScore * 100)}` : "cf:n/a",
    ],
  };
}
