//STANDARD LIBRARY
import "dotenv/config";

//LOCAL FILES
import { getMissingRequiredVars, isWeakSecretUnsafe, isTrustProxyHopsInvalid } from "./lib/startupChecks";
import { prisma } from "./lib/prisma";
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
if (isTrustProxyHopsInvalid(process.env.TRUST_PROXY_HOPS)) {
  console.error(`[startup] TRUST_PROXY_HOPS must be a non-negative integer, got: ${process.env.TRUST_PROXY_HOPS}`);
  process.exit(1);
}

//SERVER
const server = app.listen(PORT, () => {
  console.log(`SwipeBite API running at http://localhost:${PORT}`);
});

//GRACEFUL SHUTDOWN
// Stop accepting new connections, let in-flight requests finish, then close
// the DB pool -- avoids leaking Prisma connections on every redeploy/restart.
const SHUTDOWN_TIMEOUT_MS = 10_000;

function shutdown(signal: string): void {
  console.log(`[shutdown] ${signal} received, closing server...`);

  // server.close()'s callback only fires once every connection is done --
  // a single lingering keep-alive connection (or a client that never closes
  // its socket) would otherwise let this hang forever and never actually
  // exit on redeploy. Force it after a bounded grace period.
  const forceExit = setTimeout(() => {
    console.error(`[shutdown] Timed out after ${SHUTDOWN_TIMEOUT_MS}ms waiting for connections to close, forcing exit.`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(() => {
    clearTimeout(forceExit);
    prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
