//THIRD-PARTY LIBRARIES
import { Router } from "express";

//LOCAL FILES
import { photoProxyLimiter } from "../lib/rateLimit";
import { clientIp } from "../lib/clientIp";

//CONSTANTS
const router = Router();

// Only allow proxying Google's own photo resource paths -- "places/<id>/photos/<id>" --
// not arbitrary strings appended into the upstream URL.
const PHOTO_NAME_PATTERN = /^places\/[\w-]+\/photos\/[\w-]+$/;

// The seeded catalog (prisma/seed.ts) stores plain https:// URLs from this
// host instead of Google Place photo resource names, so the app renders
// photos with no GOOGLE_API_KEY configured. Redirecting to a caller-supplied
// URL with no allowlist would be an open redirect on an unauthenticated
// endpoint (this app's own domain vouching for an arbitrary destination) --
// restricting it to the one host the seed data actually uses closes that off
// without needing a DB round-trip to verify the URL against a restaurant's
// stored photoNames.
const ALLOWED_REDIRECT_HOSTS = new Set(["picsum.photos"]);

//ROUTES

/**
 * GET /places/photo?name= — proxies a restaurant photo.
 *
 * Two modes:
 *  - If `name` is an http(s) URL on an allowlisted host (the seeded
 *    catalog's placeholder images), redirect the browser straight to it.
 *  - Otherwise treat `name` as a Google Places photo resource name and
 *    proxy it, keeping the API key server-side and caching for 24 hours.
 *
 * Deliberately NOT behind requireAuth: the frontend renders this as a plain
 * <img src>, and browsers can't attach an Authorization header to an image
 * request. The photo content itself isn't sensitive (public restaurant
 * photos, identical for every viewer) -- what needs protecting is the
 * shared GOOGLE_API_KEY's quota and the open-redirect surface above, both
 * covered by the rate limit + validation below rather than requiring a
 * login this component can't send.
 */
router.get("/photo", async (req, res) => {
  try {
    const ip = clientIp(req);
    if (!photoProxyLimiter.consume(ip))
      return res.status(429).json({ error: "Too many photo requests. Try again later." });

    const name = (req.query.name as string)?.trim();
    if (!name) return res.status(400).json({ error: "name query parameter is required" });

    if (/^https?:\/\//i.test(name)) {
      let host: string;
      try {
        host = new URL(name).hostname;
      } catch {
        return res.status(400).json({ error: "name must be a valid URL" });
      }
      if (!ALLOWED_REDIRECT_HOSTS.has(host))
        return res.status(400).json({ error: "name is not an allowed photo host" });
      return res.redirect(302, name);
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

    if (!PHOTO_NAME_PATTERN.test(name))
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
