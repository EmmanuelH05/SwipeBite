-- avgDistance was scaffolded (defaulted to 0) but never actually
-- implemented -- no code anywhere in the app ever writes a value other
-- than the column default, and nothing reads it. There's no geolocation
-- feature in this app (no lat/lng on Restaurant, no distance calculation
-- anywhere in src/), so every existing row's value is guaranteed to be
-- the unchanged default. Safe to drop with zero data loss.

ALTER TABLE "user_preferences" DROP COLUMN "avgDistance";
