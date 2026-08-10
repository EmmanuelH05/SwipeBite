//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma }                    from "../lib/prisma";
import { updatePreferencesOnSwipe }  from "../lib/personalization";
import { buildPrefData }             from "../lib/prefHelpers";
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

    // Serialized per user via an advisory lock, same as swipes: without it,
    // two concurrent seed submissions (e.g. a double-tap on the CTA) could
    // both pass the seededAt check below before either writes, seeding twice
    // and silently dropping one computation.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;

      const existing = await tx.userPreference.findUnique({ where: { userId } });
      if (existing?.seededAt) return null;

      // Simulate `strength` LIKE swipes per selected cuisine through the real
      // preference function — ensures seeded priors match the same accumulation
      // shape as real swipe history
      let updated = buildPrefData(existing);
      for (const cuisine of cuisines) {
        for (let i = 0; i < strength; i++) {
          updated = updatePreferencesOnSwipe(updated, cuisine, priceLevel, "LIKE");
        }
      }

      await tx.userPreference.upsert({
        where:  { userId },
        create: { userId, ...updated, seededAt: new Date() },
        update: { ...updated, seededAt: new Date() },
      });

      return updated;
    });

    if (!result) return res.status(409).json({ error: "Preferences already seeded" });

    return res.json({
      seededAt:      new Date().toISOString(),
      likedCuisines: result.likedCuisines,
      priceCounts:   result.priceCounts,
      totalLikes:    result.totalLikes,
    });
  } catch (err) {
    console.error("PATCH /onboarding/seed error:", err);
    return res.status(500).json({ error: "Failed to seed preferences" });
  }
});

export default router;
