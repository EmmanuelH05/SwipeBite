//THIRD-PARTY LIBRARIES
import type { Restaurant } from "@prisma/client";

//LOCAL FILES
import { prisma } from "./prisma";
import { scoreRestaurant, type UserPreferenceData, type MLContext, type ScoreBreakdown } from "./personalization";
import {
  buildUserVectors,
  computeCFScore,
  MIN_SWIPES_FOR_CF,
  type SwipeRecord,
  type AllSwipeRecord,
} from "./ml-recommender";

// ─── CF Vector Cache ──────────────────────────────────────────────────────────
// Rebuilding the user-item matrix from 3000 global swipes on every feed request
// is O(swipes) per request. This module-level cache amortizes that cost across
// all requests within a 5-minute window. Single-instance only — if you scale
// to multiple processes, replace with Redis and pub/sub invalidation.

const CF_CACHE_TTL_MS = 5 * 60 * 1000;

type CFCacheEntry = {
  vectors: ReturnType<typeof buildUserVectors>;
  builtAt: number;
};

let cfVectorCache: CFCacheEntry | null = null;

async function getGlobalCFVectors(): Promise<ReturnType<typeof buildUserVectors>> {
  if (cfVectorCache && Date.now() - cfVectorCache.builtAt < CF_CACHE_TTL_MS) {
    return cfVectorCache.vectors;
  }
  const raw = await prisma.swipe.findMany({
    take:    3000,
    orderBy: { createdAt: "desc" },
    select:  { userId: true, restaurantId: true, direction: true },
  });
  const records: AllSwipeRecord[] = raw.map((s) => ({
    userId:       s.userId,
    restaurantId: s.restaurantId,
    direction:    s.direction,
  }));
  const vectors = buildUserVectors(records);
  cfVectorCache = { vectors, builtAt: Date.now() };
  return vectors;
}

/** Invalidate the CF vector cache — call after any swipe is recorded. */
export function invalidateCFCache(): void {
  cfVectorCache = null;
}

//TYPES
type RawPref = {
  likedCuisines:    unknown;
  dislikedCuisines: unknown;
  priceCounts:      unknown;
  totalLikes:       number;
  totalDislikes:    number;
  morningLikes:     number;
  afternoonLikes:   number;
  eveningLikes:     number;
  lateNightLikes:   number;
} | null;

//HELPERS

// Every current write path produces a well-formed plain object in these Json
// columns, but nothing in the type system enforces that -- a future
// migration, admin script, or manual DB edit that leaves a JSON array,
// string, or null in one of these columns would otherwise flow straight into
// the scoring engine's arithmetic (likedClusters[cluster] ?? 0) as `unknown`
// cast directly to a numeric map. Degrade to "no data" instead.
function asCountMap(value: unknown): Record<string, number> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, number>)
    : {};
}

/** Shapes a Prisma UserPreference row into the typed object the scorer expects. */
export function buildPrefData(pref: RawPref): UserPreferenceData {
  if (!pref) return emptyPrefData();
  return {
    likedCuisines:    asCountMap(pref.likedCuisines),
    dislikedCuisines: asCountMap(pref.dislikedCuisines),
    priceCounts:      asCountMap(pref.priceCounts),
    totalLikes:       pref.totalLikes,
    totalDislikes:    pref.totalDislikes,
    morningLikes:     pref.morningLikes,
    afternoonLikes:   pref.afternoonLikes,
    eveningLikes:     pref.eveningLikes,
    lateNightLikes:   pref.lateNightLikes,
  };
}

/** Returns a zeroed-out preference profile for new users. */
export function emptyPrefData(): UserPreferenceData {
  return {
    likedCuisines: {}, dislikedCuisines: {}, priceCounts: {},
    totalLikes: 0, totalDislikes: 0,
    morningLikes: 0, afternoonLikes: 0, eveningLikes: 0, lateNightLikes: 0,
  };
}

/**
 * Loads the ML data needed to build an MLContext for a user.
 * Returns `getCFScore`, a closure over the CF vector map so callers don't need
 * to import ml-recommender directly.
 */
export async function fetchMLData(
  userId: string,
  totalInteractions: number
): Promise<{
  userSwipes:  SwipeRecord[];
  getCFScore:  (restaurantId: string) => number | null;
}> {
  // Bounded like the global CF query below -- decay makes swipes past this
  // near-worthless to the scorer anyway (temporalDecayWeight's half-life is
  // measured in days, not hundreds of interactions), so this trades a
  // negligible amount of long-tail signal for a hard cap on how much a
  // heavy user's history costs to load on every feed request.
  const userSwipesPromise = prisma.swipe.findMany({
    where:   { userId },
    include: { restaurant: { select: { cuisine: true, priceLevel: true } } },
    orderBy: { createdAt: "desc" },
    take:    500,
  });

  // CF vectors come from the module-level cache — O(1) on cache hit, O(3000) on miss.
  // Only fetch when the user has enough swipes to produce meaningful neighbours.
  const cfVectorsPromise = totalInteractions >= MIN_SWIPES_FOR_CF
    ? getGlobalCFVectors()
    : Promise.resolve(null);

  const [userSwipesRaw, cfVectors] = await Promise.all([userSwipesPromise, cfVectorsPromise]);

  const userSwipes: SwipeRecord[] = userSwipesRaw.map((s) => ({
    direction:  s.direction,
    restaurant: { cuisine: s.restaurant.cuisine, priceLevel: s.restaurant.priceLevel },
    experience: s.experience,
    createdAt:  s.createdAt,
  }));

  const getCFScore = cfVectors
    ? (rid: string) => computeCFScore(userId, rid, cfVectors)
    : () => null;

  return { userSwipes, getCFScore };
}

/** Builds the MLContext passed to `scoreRestaurant` for a single restaurant. */
export function buildMLContext(
  userSwipes: SwipeRecord[],
  cfScore: number | null
): MLContext {
  return { userSwipes, cfScore };
}

/**
 * Runs the full feed-ranking pipeline for a user: loads their unswiped
 * restaurant candidates and preference snapshot in parallel, builds their ML
 * context, scores every candidate, and returns them sorted by score
 * descending. Shared by GET /restaurants and GET /recommendations/debug,
 * which previously duplicated this exact pipeline and only differed in what
 * fields of the result they projected into their response.
 */
export async function rankUnswipedForUser(userId: string): Promise<{
  scored: Array<Restaurant & { score: ScoreBreakdown }>;
  totalInteractions: number;
}> {
  const [restaurants, pref] = await Promise.all([
    prisma.restaurant.findMany({ where: { swipes: { none: { userId } } } }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);

  const prefData          = buildPrefData(pref);
  const totalInteractions = prefData.totalLikes + prefData.totalDislikes;
  const { userSwipes, getCFScore } = await fetchMLData(userId, totalInteractions);

  const scored = restaurants
    .map((r) => ({ ...r, score: scoreRestaurant(r, prefData, buildMLContext(userSwipes, getCFScore(r.id))) }))
    .sort((a, b) => b.score.total - a.score.total);

  return { scored, totalInteractions };
}
