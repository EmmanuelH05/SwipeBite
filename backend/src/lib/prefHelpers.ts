//LOCAL FILES
import { prisma } from "./prisma";
import type { UserPreferenceData, MLContext } from "./personalization";
import {
  buildUserVectors,
  computeCFScore,
  type SwipeRecord,
  type AllSwipeRecord,
} from "./ml-recommender";

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

  const globalSwipesPromise =
    totalInteractions >= 5
      ? prisma.swipe.findMany({
          take:    3000,
          orderBy: { createdAt: "desc" },
          select:  { userId: true, restaurantId: true, direction: true },
        })
      : Promise.resolve(null);

  const [userSwipesRaw, globalSwipesRaw] = await Promise.all([
    userSwipesPromise,
    globalSwipesPromise,
  ]);

  const userSwipes: SwipeRecord[] = userSwipesRaw.map((s) => ({
    direction:  s.direction as "LIKE" | "DISLIKE",
    restaurant: { cuisine: s.restaurant.cuisine, priceLevel: s.restaurant.priceLevel },
    experience: s.experience,
    createdAt:  s.createdAt,
  }));

  let cfVectors: ReturnType<typeof buildUserVectors> | null = null;
  if (globalSwipesRaw) {
    const records: AllSwipeRecord[] = globalSwipesRaw.map((s) => ({
      userId:       s.userId,
      restaurantId: s.restaurantId,
      direction:    s.direction as "LIKE" | "DISLIKE",
    }));
    cfVectors = buildUserVectors(records);
  }

  const getCFScore = cfVectors
    ? (rid: string) => computeCFScore(userId, rid, cfVectors!)
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
