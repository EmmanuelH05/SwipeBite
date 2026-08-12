import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "http";
import { app } from "./app";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /health", () => {
  test("reports the in-process preference-update failure counter", async () => {
    // No metrics pipeline exists in this project, so a systemic failure of
    // applyPreferenceUpdate (e.g. every transaction timing out under
    // advisory-lock contention) needs to be visible somewhere -- this is
    // that somewhere. Starts at zero since nothing has failed yet.
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.preferenceUpdateFailures).toEqual({ count: 0, lastFailureAt: null });
    // No error message field -- this is a public, unauthenticated endpoint,
    // and Prisma error messages can embed the DB host/port.
    expect(body.preferenceUpdateFailures).not.toHaveProperty("message");
    expect(body.preferenceUpdateFailures).not.toHaveProperty("lastFailure");
  });
});

describe("404 handler", () => {
  test("returns JSON, not Express's default HTML error page", async () => {
    const res = await fetch(`${baseUrl}/this-route-does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });
});

describe("global error handler", () => {
  test("reports malformed JSON as 400, not a generic 500", async () => {
    // express.json() throws before any route handler runs, with its own
    // `status` (400 for a parse failure) -- the handler used to discard
    // that and always answer 500 "An unexpected error occurred".
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toBe("An unexpected error occurred");
  });
});
