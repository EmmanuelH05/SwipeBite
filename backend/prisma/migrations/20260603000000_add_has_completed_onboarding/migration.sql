-- Adds the User.hasCompletedOnboarding column.
-- This field existed in schema.prisma but had no backing migration (it had been
-- applied locally via `prisma db push`), which caused a P2022 "column does not
-- exist" error in production on every users query. This migration reconciles the
-- migration history with the schema.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false;
