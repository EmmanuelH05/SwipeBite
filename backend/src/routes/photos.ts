//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { photoProxyLimiter } from "../lib/rateLimit";

//CONSTANTS
const router = Router();

// Only allow proxying Google's own photo resource paths -- "places/<id>/photos/<id>" --
// not arbitrary strings appended into the upstream URL.
const PHOTO_NAME_PATTERN = /^places\/[\w-]+\/photos\/[\w-]+$/;

//ROUTES

/**
 * GET /places/photo?name= — proxies a Google Places photo.
 * Keeps the API key server-side; caches responses for 24 hours.
 *
 * Deliberately NOT behind requireAuth: the frontend renders this as a plain
 * <img src>, and browsers can't attach an Authorization header to an image
 * request. The photo content itself isn't sensitive (public restaurant
 * photos, identical for every viewer) -- what needs protecting is the
 * shared GOOGLE_API_KEY's quota, which a per-IP rate limit + strict input
 * validation covers without requiring a login this component can't send.
 */
router.get("/photo", async (req, res) => {
  try {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";
    if (!photoProxyLimiter.consume(ip))
      return res.status(429).json({ error: "Too many photo requests. Try again later." });

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

    const name = (req.query.name as string)?.trim();
    if (!name || !PHOTO_NAME_PATTERN.test(name))
      return res.status(400).json({ error: "name must be a valid Google Places photo resource path" });

    const photoUrl = `https://places.googleapis.com/v1/${name}/media?maxHeightPx=400&maxWidthPx=600&key=${apiKey}`;
    const imgRes   = await fetch(photoUrl, { redirect: "follow" });

    if (!imgRes.ok) return res.status(imgRes.status).json({ error: "Failed to fetch photo" });

    res.setHeader("Content-Type", imgRes.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(await imgRes.arrayBuffer()));
  } catch (err) {
    console.error("GET /places/photo error:", err);
    return res.status(500).json({ error: "Failed to fetch photo" });
  }
});

export default router;
