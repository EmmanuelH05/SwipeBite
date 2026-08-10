//LOCAL FILES
import { prisma } from "./prisma";
import { buildPrefData } from "./prefHelpers";
import type { UserPreferenceData } from "./personalization";

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
  return prisma.$transaction(async (tx) => {
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
}
