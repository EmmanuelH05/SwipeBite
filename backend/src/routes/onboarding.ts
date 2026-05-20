//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma }                    from "../lib/prisma";
import { updatePreferencesOnSwipe, type UserPreferenceData } from "../lib/personalization";
import { requireAuth }               from "../middleware/auth";
import type { AuthRequest }          from "../middleware/auth";

//CONSTANTS
const router = Router();

const SEED_STRENGTH_DEFAULT = 3;
const SEED_STRENGTH_MAX     = 10;

/**
 * PATCH /onboarding/seed — bootstrap a new user's taste profile from
 * their cuisine + price selections before they've swiped anything.
 *
 * Calls updatePreferencesOnSwipe() in a loop (seedStrength times per cuisine)
 * so the seeded priors flow through the exact same code path as real swipes.
 * Guards with 409 if the user has already seeded (idempotent first call only).
 */
router.patch("/seed", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { cuisines, priceLevel, seedStrength } = req.body;

    if (!Array.isArray(cuisines) || cuisines.length === 0)
      return res.status(400).json({ error: "cuisines must be a non-empty array" });
    if (!priceLevel || typeof priceLevel !== "string")
      return res.status(400).json({ error: "priceLevel is required" });

    const strength = Math.min(
      typeof seedStrength === "number" && seedStrength > 0 ? seedStrength : SEED_STRENGTH_DEFAULT,
      SEED_STRENGTH_MAX
    );

    const existing = await prisma.userPreference.findUnique({ where: { userId } });
    if (existing?.seededAt)
      return res.status(409).json({ error: "Preferences already seeded" });

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

    // Simulate `strength` LIKE swipes per selected cuisine through the real
    // preference function — ensures seeded priors match the same accumulation
    // shape as real swipe history
    let updated = current;
    for (const cuisine of cuisines) {
      for (let i = 0; i < strength; i++) {
        updated = updatePreferencesOnSwipe(updated, cuisine, priceLevel, "LIKE");
      }
    }

    await prisma.userPreference.upsert({
      where:  { userId },
      create: { userId, ...updated, seededAt: new Date() },
      update: { ...updated, seededAt: new Date() },
    });

    return res.json({
      seededAt:        new Date().toISOString(),
      likedCuisines:   updated.likedCuisines,
      priceCounts:     updated.priceCounts,
      totalLikes:      updated.totalLikes,
    });
  } catch (err) {
    console.error("PATCH /onboarding/seed error:", err);
    return res.status(500).json({ error: "Failed to seed preferences" });
  }
});

export default router;
