//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma } from "../lib/prisma";
import { updatePreferencesOnSwipe } from "../lib/personalization";
import { VISIT_EXPERIENCES, isVisitExperience, type VisitExperience } from "../lib/ml-recommender";
import { invalidateCFCache } from "../lib/prefHelpers";
import { applyPreferenceUpdate } from "../lib/preferenceStore";
import { requireAuth } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

//CONSTANTS
const router = Router();

//ROUTES

/**
 * POST /swipes — record a LIKE or DISLIKE, then update the preference profile.
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

    // Awaited (not fire-and-forget) so a failure here is visible instead of a
    // silently-logged background error, and so the read-modify-write below is
    // safely serialized per user via applyPreferenceUpdate's advisory lock --
    // two swipes fired close together (the normal way this app gets used) no
    // longer race on the same stale counters. Still its own try/catch: the
    // swipe itself is the source of truth and already recorded above: these
    // counters are a derived, self-healing aggregate, so a rare failure here
    // shouldn't fail a swipe that already succeeded.
    try {
      await applyPreferenceUpdate(userId, (current) =>
        updatePreferencesOnSwipe(current, restaurant.cuisine, restaurant.priceLevel, direction)
      );
    } catch (e) {
      console.error("Preference update failed (non-critical):", e);
    }

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

    // Validate against the known set instead of silently dropping anything
    // unrecognized -- "disappointing" in particular actively flips a LIKE
    // into a dislike signal (see visitQualityMultiplier), so a typo like
    // "Great " or "amazing" degrading to a neutral no-op with no error would
    // silently defeat that signal.
    let validatedExperience: VisitExperience | undefined;
    if (experience !== undefined && experience !== null) {
      const trimmed = typeof experience === "string" ? experience.trim() : "";
      if (!isVisitExperience(trimmed))
        return res.status(400).json({ error: `experience must be one of: ${VISIT_EXPERIENCES.join(", ")}` });
      validatedExperience = trimmed;
    }

    const updateData: { visitedAt: Date; experience?: string; notes?: string | null } = {
      visitedAt: new Date(),
    };
    if (validatedExperience) updateData.experience = validatedExperience;
    if (typeof notes === "string") updateData.notes = notes.trim() || null;

    const swipe = await prisma.swipe.update({
      where: { id },
      data:  updateData,
      include: { restaurant: true },
    });

    // When the visit was disappointing, route it through updatePreferencesOnSwipe
    // as a DISLIKE -- same as every other preference mutation path -- so
    // totalDislikes (the counter that gates CF eligibility elsewhere) stays in
    // sync with dislikedCuisines instead of drifting out of lockstep. Previously
    // this hand-built the update and only touched dislikedCuisines.
    if (validatedExperience === "disappointing") {
      try {
        await applyPreferenceUpdate(swipe.userId, (current) =>
          updatePreferencesOnSwipe(current, swipe.restaurant.cuisine, swipe.restaurant.priceLevel, "DISLIKE")
        );
      } catch (e) {
        console.error("Visit quality preference update failed:", e);
      }
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
