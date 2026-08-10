//STANDARD LIBRARY
import "dotenv/config";

//LOCAL FILES
import { getMissingRequiredVars, isWeakSecretUnsafe } from "./lib/startupChecks";
import { app } from "./app";

//CONSTANTS
const PORT = process.env.PORT ?? 4000;

// Fail fast if required env vars are missing or still set to placeholder values.
// Runs before app.listen() so a bad config never starts accepting connections.
const missing = getMissingRequiredVars(process.env, ["DATABASE_URL", "JWT_SECRET"]);
if (missing.length > 0) {
  console.error(`[startup] Missing required env var(s): ${missing.join(", ")}`);
  process.exit(1);
}
if (isWeakSecretUnsafe(process.env.NODE_ENV, process.env.JWT_SECRET)) {
  console.error("[startup] JWT_SECRET is a placeholder — run: openssl rand -hex 32");
  process.exit(1);
}

//SERVER
app.listen(PORT, () => {
  console.log(`SwipeBite API running at http://localhost:${PORT}`);
});
