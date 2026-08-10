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

//APP
// Configured Express app, no listener attached -- lets tests boot this on an
// ephemeral port (or hit it directly) without the side effects in index.ts
// (env validation, process.exit, binding the real PORT).
export const app = express();

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
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

//GLOBAL ERROR HANDLER
// Catches any unhandled errors thrown inside route handlers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "An unexpected error occurred" });
});
