//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { rankUnswipedForUser } from "../lib/prefHelpers";
import { MIN_SWIPES_FOR_CF } from "../lib/ml-recommender";
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
    const { scored, totalInteractions } = await rankUnswipedForUser(userId);

    const ranked = scored.map((r) => ({
      id:         r.id,
      name:       r.name,
      cuisine:    r.cuisine,
      priceLevel: r.priceLevel,
      score:      r.score,
    }));

    return res.json({
      meta: {
        userId,
        totalSwipes:    totalInteractions,
        cfEnabled:      totalInteractions >= MIN_SWIPES_FOR_CF,
        candidateCount: scored.length,
      },
      ranked,
    });
  } catch (err) {
    console.error("GET /recommendations/debug error:", err);
    return res.status(500).json({ error: "Failed to generate debug output" });
  }
});

export default router;
