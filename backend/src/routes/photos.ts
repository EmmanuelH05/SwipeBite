//THIRD-PARTY LIBRARIES
import { Router } from "express";

//CONSTANTS
const router = Router();

//ROUTES

/**
 * GET /places/photo?name= — proxies a restaurant photo.
 *
 * Two modes:
 *  - If `name` is already an http(s) URL (e.g. a seeded image), redirect the
 *    browser straight to it. This lets the seeded catalog render photos with
 *    no Google key configured.
 *  - Otherwise treat `name` as a Google Places photo resource name and proxy
 *    it, keeping the API key server-side and caching for 24 hours.
 */
router.get("/photo", async (req, res) => {
  try {
    const name = req.query.name as string;
    if (!name?.trim()) return res.status(400).json({ error: "name query parameter is required" });

    // Seeded / external image URLs: hand the browser a redirect (no key needed).
    if (/^https?:\/\//i.test(name)) {
      return res.redirect(302, name);
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

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
