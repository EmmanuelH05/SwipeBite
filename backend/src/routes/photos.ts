//THIRD-PARTY LIBRARIES
import { Router } from "express";

//CONSTANTS
const router = Router();

//ROUTES

/**
 * GET /places/photo?name= — proxies a Google Places photo.
 * Keeps the API key server-side; caches responses for 24 hours.
 */
router.get("/photo", async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

    const name = req.query.name as string;
    if (!name?.trim()) return res.status(400).json({ error: "name query parameter is required" });

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
