//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma } from "../lib/prisma";
import { updatePreferencesOnSwipe, type UserPreferenceData } from "../lib/personalization";
import { invalidateCFCache } from "../lib/prefHelpers";
import { requireAuth } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

//CONSTANTS
const router = Router();

//ROUTES

/**
 * POST /swipes — record a LIKE or DISLIKE, then async-update the preference profile.
 * Requires authentication. The userId comes from the token — not the request body.
 * Body: { restaurantId: string, direction: "LIKE" | "DISLIKE" }
 */
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { restaurantId, direction } = req.body;

    if (!restaurantId || typeof restaurantId !== "string")
      return res.status(400).json({ error: "restaurantId is required" });
    if (direction !== "LIKE" && direction !== "DISLIKE")
      return res.status(400).json({ error: "direction must be LIKE or DISLIKE" });

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

    const swipe = await prisma.swipe.create({ data: { userId, restaurantId, direction } });

    // Invalidate CF vector cache so the next feed request reflects this swipe
    invalidateCFCache();

    //ASYNC PREFERENCE UPDATE
    // Fire-and-forget — doesn't block the response
    void (async () => {
      try {
        const existing = await prisma.userPreference.findUnique({ where: { userId } });
        const current: UserPreferenceData = existing
          ? {
              likedCuisines:    existing.likedCuisines    as Record<string, number>,
              dislikedCuisines: existing.dislikedCuisines as Record<string, number>,
              priceCounts:      existing.priceCounts       as Record<string, number>,
              totalLikes:       existing.totalLikes,
              totalDislikes:    existing.totalDislikes,
              morningLikes:     existing.morningLikes,
              afternoonLikes:   existing.afternoonLikes,
              eveningLikes:     existing.eveningLikes,
              lateNightLikes:   existing.lateNightLikes,
            }
          : {
              likedCuisines: {}, dislikedCuisines: {}, priceCounts: {},
              totalLikes: 0, totalDislikes: 0,
              morningLikes: 0, afternoonLikes: 0, eveningLikes: 0, lateNightLikes: 0,
            };

        const updated = updatePreferencesOnSwipe(
          current,
          restaurant.cuisine,
          restaurant.priceLevel,
          direction as "LIKE" | "DISLIKE"
        );

        await prisma.userPreference.upsert({
          where:  { userId },
          create: { userId, ...updated },
          update: updated,
        });
      } catch (e) {
        console.error("Preference update failed (non-critical):", e);
      }
    })();

    return res.status(201).json(swipe);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002")
      return res.status(409).json({ error: "Swipe already exists for this user and restaurant" });
    if (code === "P2003")
      return res.status(404).json({ error: "User or restaurant not found" });
    console.error("POST /swipes error:", err);
    return res.status(500).json({ error: "Failed to record swipe" });
  }
});

/**
 * PATCH /swipes/:id/visited — mark a liked restaurant as visited.
 * Requires authentication. Verifies the swipe belongs to the requesting user.
 * Body: { experience?: "great"|"good"|"okay"|"disappointing", notes?: string }
 */
router.patch("/:id/visited", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id ?? "");
    if (!id) return res.status(400).json({ error: "Swipe id is required" });

    // Confirm this swipe belongs to the authenticated user before updating
    const existing = await prisma.swipe.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Swipe not found" });
    if (existing.userId !== req.userId)
      return res.status(403).json({ error: "Not authorized to update this swipe" });

    const { experience, notes } = req.body;
    const updateData: { visitedAt: Date; experience?: string; notes?: string | null } = {
      visitedAt: new Date(),
    };
    if (typeof experience === "string" && experience.trim())
      updateData.experience = experience.trim();
    if (typeof notes === "string") updateData.notes = notes.trim() || null;

    const swipe = await prisma.swipe.update({
      where: { id },
      data:  updateData,
      include: { restaurant: true },
    });

    // When the visit was disappointing, immediately bump the dislike counter
    const swipeUserId       = swipe.userId;
    const swipeCuisine      = swipe.restaurant.cuisine;
    if (experience?.trim() === "disappointing") {
      void (async () => {
        try {
          const pref = await prisma.userPreference.findUnique({ where: { userId: swipeUserId } });
          if (!pref) return;
          const disliked = { ...(pref.dislikedCuisines as Record<string, number>) };
          const key      = swipeCuisine.toLowerCase().replace(/_/g, " ");
          disliked[key]  = (disliked[key] ?? 0) + 1;
          await prisma.userPreference.update({ where: { userId: swipeUserId }, data: { dislikedCuisines: disliked } });
        } catch (e) {
          console.error("Visit quality preference update failed:", e);
        }
      })();
    }

    return res.json(swipe);
  } catch (err) {
    if ((err as { code?: string })?.code === "P2025")
      return res.status(404).json({ error: "Swipe not found" });
    console.error("PATCH /swipes/:id/visited error:", err);
    return res.status(500).json({ error: "Failed to mark as visited" });
  }
});

export default router;
