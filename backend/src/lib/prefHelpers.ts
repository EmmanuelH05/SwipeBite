//LOCAL FILES
import { prisma } from "./prisma";
import type { UserPreferenceData, MLContext } from "./personalization";
import {
  buildUserVectors,
  computeCFScore,
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
    direction:    s.direction as "LIKE" | "DISLIKE",
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

/** Shapes a Prisma UserPreference row into the typed object the scorer expects. */
export function buildPrefData(pref: RawPref): UserPreferenceData {
  if (!pref) return emptyPrefData();
  return {
    likedCuisines:    pref.likedCuisines    as Record<string, number>,
    dislikedCuisines: pref.dislikedCuisines as Record<string, number>,
    priceCounts:      pref.priceCounts       as Record<string, number>,
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
  const userSwipesPromise = prisma.swipe.findMany({
    where:   { userId },
    include: { restaurant: { select: { cuisine: true, priceLevel: true } } },
    orderBy: { createdAt: "desc" },
  });

  // CF vectors come from the module-level cache — O(1) on cache hit, O(3000) on miss.
  // Only fetch when the user has enough swipes to produce meaningful neighbours.
  const cfVectorsPromise = totalInteractions >= 5
    ? getGlobalCFVectors()
    : Promise.resolve(null);

  const [userSwipesRaw, cfVectors] = await Promise.all([userSwipesPromise, cfVectorsPromise]);

  const userSwipes: SwipeRecord[] = userSwipesRaw.map((s) => ({
    direction:  s.direction as "LIKE" | "DISLIKE",
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
