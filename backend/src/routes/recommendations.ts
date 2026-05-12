//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma } from "../lib/prisma";
import { buildPrefData, fetchMLData, buildMLContext } from "../lib/prefHelpers";
import { scoreRestaurant } from "../lib/personalization";
import { requireAuth } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

//CONSTANTS
const router = Router();

//ROUTES

/**
 * GET /recommendations/debug — full ML scoring breakdown for every unswiped restaurant.
 * Useful for inspecting why the feed is ordered the way it is.
 * Requires authentication.
 */
router.get("/debug", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const [restaurants, pref] = await Promise.all([
      prisma.restaurant.findMany({ where: { swipes: { none: { userId } } } }),
      prisma.userPreference.findUnique({ where: { userId } }),
    ]);

    const prefData          = buildPrefData(pref);
    const totalInteractions = prefData.totalLikes + prefData.totalDislikes;
    const { userSwipes, getCFScore } = await fetchMLData(userId, totalInteractions);

    const scored = restaurants
      .map((r) => ({
        id:         r.id,
        name:       r.name,
        cuisine:    r.cuisine,
        priceLevel: r.priceLevel,
        score:      scoreRestaurant(r, prefData, buildMLContext(userSwipes, getCFScore(r.id))),
      }))
      .sort((a, b) => b.score.total - a.score.total);

    return res.json({
      meta: {
        userId,
        totalSwipes:    totalInteractions,
        cfEnabled:      totalInteractions >= 5,
        candidateCount: restaurants.length,
      },
      ranked: scored,
    });
  } catch (err) {
    console.error("GET /recommendations/debug error:", err);
    return res.status(500).json({ error: "Failed to generate debug output" });
  }
});

export default router;
