//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { prisma } from "../lib/prisma";
import { restaurantLoadLimiter } from "../lib/rateLimit";
import { clientIp } from "../lib/clientIp";
import { rankUnswipedForUser } from "../lib/prefHelpers";
import { requireAuth } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

//CONSTANTS
const router = Router();

//ROUTES

/**
 * GET /restaurants — unswiped restaurants ranked by hybrid ML score.
 * Requires authentication. Uses the token's userId — not a query param.
 *
 * Pipeline:
 *  1. Core DB reads run in parallel (candidates + preference snapshot)
 *  2. ML data is loaded (user swipes for temporal decay + optional CF vectors)
 *  3. Every candidate is scored; list is returned sorted by score descending
 */
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { scored } = await rankUnswipedForUser(req.userId!);
    return res.json(scored);
  } catch (err) {
    console.error("GET /restaurants error:", err);
    return res.status(500).json({ error: "Failed to fetch restaurants" });
  }
});

/**
 * POST /restaurants/load — pull from Google Places API and upsert into DB.
 * Body: { location: string }
 * Rate-limited to 10 requests/hour per IP to stay under Google's free tier.
 * Requires authentication to protect the Google Places API key quota.
 *
 * Restaurants are upserted (not cleared) — the catalog is a shared additive
 * pool keyed on Google Place ID, which enables collaborative filtering to work
 * across users who see the same restaurant IDs.
 */
router.post("/load", requireAuth, async (req: AuthRequest, res) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

    const ip = clientIp(req);

    if (!restaurantLoadLimiter.consume(ip))
      return res.status(429).json({ error: "Rate limit: max 10 loads per hour. Try again later." });

    const { location } = req.body;
    if (!location || typeof location !== "string" || !location.trim())
      return res.status(400).json({ error: "location is required (e.g. 'San Francisco')" });

    const fieldMask =
      "places.id,places.name,places.displayName,places.formattedAddress," +
      "places.priceLevel,places.types,places.nationalPhoneNumber," +
      "places.photos,places.regularOpeningHours,nextPageToken";

    type Place = {
      id?: string;
      name?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      priceLevel?: string;
      types?: string[];
      nationalPhoneNumber?: string;
      photos?: Array<{ name?: string }>;
      regularOpeningHours?: { weekdayDescriptions?: string[] };
    };

    const allPlaces: Place[] = [];
    let pageToken: string | undefined;
    let partial = false;

    for (let page = 0; page < 10; page++) {
      const body: {
        textQuery: string;
        includedType: string;
        pageSize: number;
        pageToken?: string;
      } = { textQuery: `restaurants in ${location.trim()}`, includedType: "restaurant", pageSize: 20 };
      if (pageToken) body.pageToken = pageToken;

      const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Google Places API error:", resp.status, errText);
        if (page === 0) return res.status(502).json({ error: "Google Places API request failed" });
        // A later page failed (e.g. transient 503/429) -- stop paginating,
        // but don't report this as a clean success: the caller has no other
        // way to know results are incomplete vs. genuinely exhausted.
        partial = true;
        break;
      }

      const data = (await resp.json()) as { places?: Place[]; nextPageToken?: string };
      const places = data.places ?? [];
      allPlaces.push(...places);
      pageToken = data.nextPageToken ?? undefined;
      if (!pageToken || places.length === 0) break;

      await new Promise((r) => setTimeout(r, 200));
    }

    const priceMap: Record<string, string> = {
      PRICE_LEVEL_INEXPENSIVE: "$",
      PRICE_LEVEL_MODERATE:    "$$",
      PRICE_LEVEL_EXPENSIVE:   "$$$",
    };

    // A place with neither `id` nor `name` has no stable key to upsert on --
    // synthesizing one (the old `g_${Date.now()}_${i}` fallback) would mint a
    // fresh key on every load and permanently duplicate the same place in the
    // catalog instead of merging into the existing row, defeating the
    // additive-catalog invariant. Skip it instead.
    const upsertArgs = allPlaces
      .filter((p) => p.id ?? p.name)
      .map((p) => {
        const placeId    = (p.id ?? p.name) as string;
        const name       = p.displayName?.text ?? "Restaurant";
        const cuisine    = p.types?.find((t) => t !== "restaurant" && t !== "food" && t !== "point_of_interest") ?? "Restaurant";
        const priceLevel = priceMap[p.priceLevel ?? ""] ?? "$$";
        const address    = p.formattedAddress ?? null;
        const phone      = p.nationalPhoneNumber ?? null;
        const photoNames = (p.photos ?? []).map((ph) => ph.name).filter((n): n is string => !!n).slice(0, 6);
        const openingHours = p.regularOpeningHours?.weekdayDescriptions?.join("\n") ?? null;

        return {
          where:  { yelpId: placeId },
          create: { yelpId: placeId, name, cuisine, priceLevel, address, phone, photoNames, openingHours },
          update: { name, cuisine, priceLevel, address, phone, photoNames, openingHours },
        };
      });

    // Batched with bounded concurrency instead of either fully sequential
    // (slow -- up to ~200 awaited round trips, one at a time) or fully
    // parallel (risks exhausting the Prisma connection pool on a large load).
    const UPSERT_BATCH_SIZE = 20;
    let created = 0;
    for (let i = 0; i < upsertArgs.length; i += UPSERT_BATCH_SIZE) {
      const batch = upsertArgs.slice(i, i + UPSERT_BATCH_SIZE);
      await Promise.all(batch.map((args) => prisma.restaurant.upsert(args)));
      created += batch.length;
    }

    return res.json({
      loaded: created,
      location: location.trim(),
      ...(partial ? { partial: true } : {}),
    });
  } catch (err) {
    console.error("POST /restaurants/load error:", err);
    return res.status(500).json({ error: "Failed to load restaurants" });
  }
});

export default router;
