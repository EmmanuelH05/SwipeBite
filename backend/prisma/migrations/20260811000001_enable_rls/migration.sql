-- Supabase auto-publishes every table in the public schema as a REST API
-- (PostgREST), gated only by the project's anon/service key. This app never
-- uses that API -- it only connects via Prisma over DATABASE_URL as the
-- postgres role, which bypasses RLS regardless -- so enabling RLS here with
-- zero policies is a deny-by-default guard against the anon key ever being
-- used, without touching this app's actual access path.

ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."restaurants"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."swipes"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."refresh_tokens"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_preferences"   ENABLE ROW LEVEL SECURITY;
