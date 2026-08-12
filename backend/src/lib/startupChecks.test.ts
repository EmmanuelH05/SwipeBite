import { describe, test, expect } from "bun:test";
import { getMissingRequiredVars, isWeakSecretUnsafe, isTrustProxyHopsInvalid, WEAK_SECRETS } from "./startupChecks";

describe("getMissingRequiredVars", () => {
  test("returns keys absent from env", () => {
    const env = { DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv;
    expect(getMissingRequiredVars(env, ["DATABASE_URL", "JWT_SECRET"])).toEqual(["JWT_SECRET"]);
  });

  test("returns empty array when all required keys are present", () => {
    const env = { DATABASE_URL: "x", JWT_SECRET: "y" } as NodeJS.ProcessEnv;
    expect(getMissingRequiredVars(env, ["DATABASE_URL", "JWT_SECRET"])).toEqual([]);
  });
});

describe("isWeakSecretUnsafe", () => {
  test("refuses a placeholder secret when NODE_ENV is production", () => {
    expect(isWeakSecretUnsafe("production", WEAK_SECRETS[0])).toBe(true);
  });

  test("refuses a placeholder secret when NODE_ENV is unset -- the fail-open gap this fixes", () => {
    expect(isWeakSecretUnsafe(undefined, WEAK_SECRETS[0])).toBe(true);
  });

  test("refuses a placeholder secret when NODE_ENV is some other non-development value", () => {
    expect(isWeakSecretUnsafe("staging", WEAK_SECRETS[0])).toBe(true);
  });

  test("allows the placeholder secret only in explicit development", () => {
    expect(isWeakSecretUnsafe("development", WEAK_SECRETS[0])).toBe(false);
  });

  test("allows a real secret in any environment", () => {
    expect(isWeakSecretUnsafe("production", "a-real-random-secret")).toBe(false);
    expect(isWeakSecretUnsafe(undefined, "a-real-random-secret")).toBe(false);
  });

  test("allows an unset secret to pass through here -- caught separately by the required-vars check", () => {
    expect(isWeakSecretUnsafe("production", undefined)).toBe(false);
  });
});

describe("isTrustProxyHopsInvalid", () => {
  test("allows unset -- app.ts defaults it to 0", () => {
    expect(isTrustProxyHopsInvalid(undefined)).toBe(false);
  });

  test.each(["0", "1", "5", "42"])("allows a non-negative integer string: %s", (v) => {
    expect(isTrustProxyHopsInvalid(v)).toBe(false);
  });

  test.each(["-1", "1.5", "abc", "", " ", "1 hop", "NaN"])("rejects: %j", (v) => {
    expect(isTrustProxyHopsInvalid(v)).toBe(true);
  });
});
