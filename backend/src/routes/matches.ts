//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

//CONSTANTS
const router = Router();

//ROUTES

/** GET /matches — all restaurants the authenticated user has liked */
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const swipes = await prisma.swipe.findMany({
      where:   { userId, direction: "LIKE" },
      include: { restaurant: true },
      orderBy: { createdAt: "desc" },
    });

    const matches = swipes.map((s) => ({
      restaurant: s.restaurant,
      swipeId:    s.id,
      visitedAt:  s.visitedAt,
      experience: s.experience,
      notes:      s.notes,
    }));

    return res.json(matches);
  } catch (err) {
    console.error("GET /matches error:", err);
    return res.status(500).json({ error: "Failed to fetch matches" });
  }
});

export default router;
