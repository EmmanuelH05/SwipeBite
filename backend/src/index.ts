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
import { prisma }            from "./lib/prisma";

//CONSTANTS
const app  = express();
const PORT = process.env.PORT ?? 4000;

//MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(authMiddleware);

//ROUTES
app.use("/auth",            authRouter);
app.use("/restaurants",     restaurantsRouter);
app.use("/swipes",          swipesRouter);
app.use("/matches",         matchesRouter);
app.use("/places",          photosRouter);
app.use("/recommendations", recommendationsRouter);

/** GET /health — liveness probe for uptime monitors and load balancers */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Legacy: name-only user creation kept for backward compatibility
app.post("/users", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim())
      return res.status(400).json({ error: "Name is required" });
    const user = await prisma.user.create({ data: { name: name.trim() } });
    return res.status(201).json(user);
  } catch (err) {
    console.error("POST /users error:", err);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

// Legacy: userId-in-path matches route kept for any old clients
app.get("/matches/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId?.trim()) return res.status(400).json({ error: "userId is required" });
    const swipes = await prisma.swipe.findMany({
      where: { userId, direction: "LIKE" },
      include: { restaurant: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json(swipes.map((s) => ({
      restaurant: s.restaurant, swipeId: s.id,
      visitedAt: s.visitedAt, experience: s.experience, notes: s.notes,
    })));
  } catch (err) {
    console.error("GET /matches/:userId error:", err);
    return res.status(500).json({ error: "Failed to fetch matches" });
  }
});

//GLOBAL ERROR HANDLER
// Catches any unhandled errors thrown inside route handlers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "An unexpected error occurred" });
});

//SERVER
app.listen(PORT, () => {
  console.log(`SwipeBite API running at http://localhost:${PORT}`);
});
