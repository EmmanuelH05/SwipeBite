// Placeholder secrets shipped in .env.example / docs — never valid outside local dev.
export const WEAK_SECRETS = [
  "dev-secret-change-in-prod",
  "change-me-in-production-use-openssl-rand-hex-32",
];

/** Returns the subset of `required` keys missing from `env`. */
export function getMissingRequiredVars(env: NodeJS.ProcessEnv, required: string[]): string[] {
  return required.filter((key) => !env[key]);
}

/**
 * Returns true when the app must refuse to boot because JWT_SECRET is a known
 * placeholder. Fail-closed: only an explicit `NODE_ENV=development` is exempt.
 * Checking for `NODE_ENV === "production"` specifically (the old behavior) fails
 * OPEN whenever NODE_ENV is unset, mistyped, or set to something a deploy platform
 * uses instead of "production" -- silently serving real traffic signed with a
 * secret anyone can read in this repo.
 */
export function isWeakSecretUnsafe(nodeEnv: string | undefined, secret: string | undefined): boolean {
  return nodeEnv !== "development" && !!secret && WEAK_SECRETS.includes(secret);
}
