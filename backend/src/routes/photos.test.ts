import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "http";
import { app } from "../app";

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

describe("GET /places/photo", () => {
  // No auth required here on purpose: the frontend renders this as a plain
  // <img src>, which can't attach an Authorization header. Confirm that
  // still works (no 401) rather than accidentally re-locking it down.
  test("does not require authentication", async () => {
    const res = await fetch(`${baseUrl}/places/photo?name=${encodeURIComponent("../../etc/passwd")}`);
    expect(res.status).not.toBe(401);
  });

  test("rejects a missing name param", async () => {
    const res = await fetch(`${baseUrl}/places/photo`);
    expect(res.status).toBe(400);
  });

  test("rejects a name that isn't a Google Places photo resource path", async () => {
    const res = await fetch(`${baseUrl}/places/photo?name=${encodeURIComponent("../../etc/passwd")}`);
    expect(res.status).toBe(400);
  });

  test("redirects to an allowlisted host (the seeded catalog's placeholder images)", async () => {
    const url = "https://picsum.photos/seed/swipebite-test/640/480";
    const res = await fetch(`${baseUrl}/places/photo?name=${encodeURIComponent(url)}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(url);
  });

  test("rejects an http(s) URL on a host that isn't allowlisted (open-redirect guard)", async () => {
    const res = await fetch(
      `${baseUrl}/places/photo?name=${encodeURIComponent("https://evil.example.com/phish")}`,
      { redirect: "manual" }
    );
    expect(res.status).toBe(400);
  });

  test("rejects a malformed http(s) URL", async () => {
    const res = await fetch(`${baseUrl}/places/photo?name=${encodeURIComponent("https://")}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(400);
  });
});
