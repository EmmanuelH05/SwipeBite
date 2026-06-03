-- Adds the UserPreference.seededAt column.
-- Like hasCompletedOnboarding, this field existed in schema.prisma but had no
-- backing migration (applied locally via `prisma db push`), causing a P2022
-- "column user_preferences.seededAt does not exist" error whenever the feed
-- read a user's preference row. This reconciles the migration history.

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN "seededAt" TIMESTAMP(3);
