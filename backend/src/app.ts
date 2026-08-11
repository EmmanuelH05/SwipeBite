//STANDARD LIBRARY
import "dotenv/config";

//THIRD-PARTY LIBRARIES
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

//LOCAL FILES
import { authMiddleware } from "./middleware/auth";
import authRouter            from "./routes/auth";
import restaurantsRouter     from "./routes/restaurants";
import swipesRouter          from "./routes/swipes";
import matchesRouter         from "./routes/matches";
import photosRouter          from "./routes/photos";
import recommendationsRouter from "./routes/recommendations";
import onboardingRouter      from "./routes/onboarding";
import { getPreferenceUpdateFailureStats } from "./lib/preferenceStore";

//APP
// Configured Express app, no listener attached -- lets tests boot this on an
// ephemeral port (or hit it directly) without the side effects in index.ts
// (env validation, process.exit, binding the real PORT).
export const app = express();

// Trust the first `TRUST_PROXY_HOPS` hops so Express resolves req.ip from
// X-Forwarded-For correctly when a reverse proxy / load balancer sits in
// front of the app. Defaults to 0 (trust nothing, fail closed) because this
// repo's own docker-compose.yml exposes the backend directly with no proxy
// in front -- defaulting to "trust 1 hop" would mean trusting the client's
// own X-Forwarded-For header in that exact deployment, which is the same
// spoofable-rate-limiter bypass this setting exists to close. Deployments
// that do put a reverse proxy in front (nginx, an ALB, etc.) must set
// TRUST_PROXY_HOPS explicitly to the real hop count, or IP-based rate
// limiting will key everything on the proxy's own address instead.
// (A malformed value fails safe -- Number() produces NaN, and Express's
// numeric trust-proxy comparator treats that as "trust nothing" -- but
// index.ts still fails startup loudly on it via isTrustProxyHopsInvalid(),
// consistent with how this project treats every other env misconfiguration.)
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 0));

//MIDDLEWARE
app.use(cors({
  origin: [process.env.FRONTEND_URL ?? "http://localhost:3000"],
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.use(authMiddleware);

//ROUTES
app.use("/auth",            authRouter);
app.use("/restaurants",     restaurantsRouter);
app.use("/swipes",          swipesRouter);
app.use("/matches",         matchesRouter);
app.use("/places",          photosRouter);
app.use("/recommendations", recommendationsRouter);
app.use("/onboarding",      onboardingRouter);

/** GET /health — liveness probe for uptime monitors and load balancers */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    preferenceUpdateFailures: getPreferenceUpdateFailureStats(),
  });
});

//GLOBAL ERROR HANDLER
// Catches any unhandled errors thrown inside route handlers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "An unexpected error occurred" });
});
