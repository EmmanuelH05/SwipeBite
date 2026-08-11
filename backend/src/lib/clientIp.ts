import type { Request } from "express";

/**
 * Returns the client's IP for rate-limiting purposes. Relies on Express's
 * `trust proxy` setting (configured in app.ts) to resolve `req.ip` from
 * X-Forwarded-For correctly -- without that setting, X-Forwarded-For is
 * attacker-controlled and every request can claim a fresh IP, defeating
 * every limiter keyed on it.
 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
