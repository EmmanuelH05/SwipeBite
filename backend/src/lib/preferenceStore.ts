//LOCAL FILES
import { prisma } from "./prisma";
import { buildPrefData } from "./prefHelpers";
import type { UserPreferenceData } from "./personalization";

// Callers deliberately catch and swallow applyPreferenceUpdate's errors --
// the swipe/visit that triggered the update already succeeded, and these
// counters are a derived, self-healing aggregate, so a rare failure here
// shouldn't fail a request that already completed. But that means a
// *systemic* failure (e.g. every transaction timing out because the
// per-user advisory lock is queuing under load) would otherwise be
// completely invisible -- nothing but scattered console.error lines. This
// project has no metrics pipeline, so track a simple in-process counter
// here and surface it on /health instead.
let failureCount = 0;
let lastFailure: { message: string; at: string } | null = null;

export function getPreferenceUpdateFailureStats(): { count: number; lastFailure: typeof lastFailure } {
  return { count: failureCount, lastFailure };
}

/**
 * Atomically reads a user's preference row, applies `mutate`, and writes the
 * result back -- inside one DB transaction, serialized per user via a
 * Postgres advisory lock keyed on userId.
 *
 * Without this, two concurrent updates for the same user -- which is the
 * normal way anyone actually uses a swipe app, not an edge case -- can both
 * read the same starting counters before either writes, and the second
 * write silently drops the first's increment. `SELECT ... FOR UPDATE`
 * alone wouldn't cover a user's very first swipe: it can't lock a row that
 * doesn't exist yet. The advisory lock serializes regardless of whether the
 * row already exists.
 */
export async function applyPreferenceUpdate(
  userId: string,
  mutate: (current: UserPreferenceData) => UserPreferenceData
): Promise<UserPreferenceData> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;

      const existing = await tx.userPreference.findUnique({ where: { userId } });
      const current: UserPreferenceData = buildPrefData(existing);

      const updated = mutate(current);

      await tx.userPreference.upsert({
        where:  { userId },
        create: { userId, ...updated },
        update: updated,
      });

      return updated;
    });
  } catch (err) {
    failureCount++;
    lastFailure = { message: err instanceof Error ? err.message : String(err), at: new Date().toISOString() };
    throw err;
  }
}
