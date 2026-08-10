import { describe, test, expect } from "bun:test";
import jwt from "jsonwebtoken";
import { createAccessToken, verifyAccessToken, validatePasswordStrength, hashRefreshToken } from "./auth";

describe("createAccessToken / verifyAccessToken", () => {
  test("round-trips a valid token", () => {
    const token = createAccessToken("user-123");
    const payload = verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("user-123");
    expect(payload?.type).toBe("access");
  });

  test("rejects garbage input", () => {
    expect(verifyAccessToken("not-a-jwt")).toBeNull();
  });

  test("rejects a token with the wrong type claim (e.g. a refresh-shaped payload)", () => {
    // createAccessToken always stamps type: "access", so forge one that doesn't
    // to prove the type check actually rejects it, not just accepts everything.
    const secretUsedByAuthModule = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";
    const forged = jwt.sign({ userId: "user-123", type: "refresh" }, secretUsedByAuthModule, {
      algorithm: "HS256",
    });
    expect(verifyAccessToken(forged)).toBeNull();
  });

  test("rejects an unsigned (alg: none) token -- the algorithm pin this fix adds", () => {
    // jsonwebtoken lets you explicitly forge one for testing. Before pinning
    // `algorithms: ["HS256"]` in verify(), this class of attack depends only
    // on the library's own default behavior toward "none" -- pinning removes
    // that dependency entirely regardless of library defaults.
    const unsigned = jwt.sign({ userId: "user-123", type: "access" }, "", {
      algorithm: "none",
    });
    expect(verifyAccessToken(unsigned)).toBeNull();
  });
});

describe("hashRefreshToken", () => {
  test("is deterministic -- the same raw token always hashes the same way", () => {
    const raw = "a-raw-refresh-token-value";
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
  });

  test("never returns the input unchanged", () => {
    const raw = "a-raw-refresh-token-value";
    expect(hashRefreshToken(raw)).not.toBe(raw);
  });

  test("produces a 64-char hex sha256 digest", () => {
    const hash = hashRefreshToken("whatever");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("different tokens hash to different values", () => {
    expect(hashRefreshToken("token-a")).not.toBe(hashRefreshToken("token-b"));
  });
});

describe("validatePasswordStrength", () => {
  test("accepts a password meeting all rules", () => {
    expect(validatePasswordStrength("Abcdefg1")).toBeNull();
  });

  test("rejects short passwords", () => {
    expect(validatePasswordStrength("Ab1")).not.toBeNull();
  });

  test("rejects passwords with no uppercase letter", () => {
    expect(validatePasswordStrength("abcdefg1")).not.toBeNull();
  });

  test("rejects passwords with no number", () => {
    expect(validatePasswordStrength("Abcdefgh")).not.toBeNull();
  });
});
