# SwipeBite — CLAUDE.md

Tinder-style restaurant discovery app. Users swipe LIKE/DISLIKE on restaurants, build a taste profile, and get a personalized feed ranked by a hybrid ML engine (content-based + collaborative filtering + Thompson Sampling exploration).

---

## Architecture

**Monorepo** — two independent packages, no shared build tooling at root level.

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, CSS Modules, Tailwind CSS v4 (tokens only) |
| Backend | Express 5, Node.js, TypeScript, Prisma ORM, PostgreSQL (Supabase) |
| Auth | JWT access tokens (15 min) + DB-stored refresh tokens (7 days, hashed with SHA-256, rotated on use) |
| Recommendations | Hybrid score: cuisine cluster match + price affinity + time-of-day + CF (Pearson similarity, ≥5 swipes) + Thompson Sampling exploration |
| Photos | Backend proxy at `/places/photo?name=...` — keeps Google API key server-side |

---

## Dev Setup

```bash
# Backend
cd backend && npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, GOOGLE_API_KEY
npm run db:migrate
npm run dev            # nodemon + tsx, port 4000

# Frontend (separate terminal)
cd frontend && npm install
npm run dev            # Next.js dev server, port 3000

# Backend tests
cd backend && bun test
```

`bun` works as a drop-in for `npm` on all scripts.

### Required env vars (`backend/.env`)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs access tokens — use `openssl rand -hex 32` |
| `GOOGLE_API_KEY` | Google Places API (New) for `/restaurants/load` |
| `FRONTEND_URL` | CORS allowed origin (default: `http://localhost:3000`) |

### Optional backend env vars

| Var | Purpose |
|-----|---------|
| `TRUST_PROXY_HOPS` | Number of reverse-proxy hops Express should trust for resolving the real client IP from `X-Forwarded-For` (default: `0` — trust nothing). The default is safe for this repo's `docker-compose.yml`, which exposes the backend directly with no proxy in front. **Deployments that do put a reverse proxy in front (nginx, an ALB, etc.) must set this to the real hop count**, or every IP-keyed rate limiter (auth brute-force, Google Places load quota, photo proxy quota) will key on the proxy's own address instead of the client's — collapsing everyone behind it into one shared quota. Must be a non-negative integer; startup fails fast otherwise. |

### Frontend env (embedded at build time)

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | Backend base URL (default: `http://localhost:4000`) |

---

## Deployment

### Docker Compose (full stack)

```bash
cp backend/.env.example .env   # fill in all vars at repo root
docker compose up --build
```

### Individual containers

```bash
# Backend
docker build -t swipebite-api ./backend

# Frontend (API URL baked in at build time)
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain.com \
  -t swipebite-web ./frontend
```

---

## API Map

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | — | email + password + name |
| POST | `/auth/login` | — | returns access + refresh tokens |
| POST | `/auth/refresh` | — | rotates refresh token |
| POST | `/auth/logout` | — | revokes refresh token |
| GET | `/auth/me` | ✓ | current user |
| GET | `/restaurants` | ✓ | unswiped restaurants, ranked by ML score |
| POST | `/restaurants/load` | ✓ | upserts from Google Places (additive, no delete) |
| POST | `/swipes` | ✓ | record LIKE / DISLIKE |
| PATCH | `/swipes/:id/visited` | ✓ | mark visited + experience rating |
| GET | `/matches` | ✓ | all LIKEd restaurants with visit data |
| GET | `/recommendations/debug` | ✓ | full ML score breakdown per restaurant |
| GET | `/health` | — | liveness probe |

---

## Key Invariants

- **Restaurant table is a shared additive catalog** — `POST /restaurants/load` upserts (never deletes). Two users loading the same city merge their results. The catalog grows over time; users see only unswiped restaurants. Places with neither a Google `id` nor `name` are skipped outright rather than upserted under a synthetic key — a synthetic key changes every load and used to insert the same place as a new row every time, silently violating this invariant.
- **`NEXT_PUBLIC_API_URL` is embedded at Next.js build time** — changing it requires a rebuild. Set it via `--build-arg` in Docker or as an env var before `npm run build`.
- **Backend startup fails fast** on missing `DATABASE_URL` / `JWT_SECRET`, or on a placeholder JWT secret in any `NODE_ENV` other than `development` — fail-closed, not an allowlist of `NODE_ENV=production` only (`lib/startupChecks.ts`).
- **CORS is locked** to `FRONTEND_URL` — set this env var before deploying or CORS will block all API calls from the frontend.
- **CF vector cache is module-level (in-process)** — 5-minute TTL, invalidated on every swipe. Single-instance only. Multi-instance deployments need Redis.
- **Preference-counter updates (swipes, disappointing-visit bumps, onboarding seed) are atomic per user** — `lib/preferenceStore.ts` wraps the read-modify-write in a DB transaction serialized via a Postgres advisory lock (`pg_advisory_xact_lock`). Two swipes fired close together no longer race on the same stale counters.
- **`/places/photo` has no auth on purpose** — the frontend renders it as a plain `<img src>`, which can't send an Authorization header. Rate-limited per IP instead; don't add `requireAuth` here without checking every consumer first.
- **Tokens are in `localStorage`** — XSS-accessible; HttpOnly cookies would be more secure but require backend cookie handling.
- **Refresh tokens are hashed (SHA-256) before storage** — the DB never holds a usable raw token. Deploying this changed the stored format: any refresh token issued before that deploy no longer matches.
- **Score explanation is rendered** on the swipe card (`SwipeCard.tsx`, the `explanation`/`explanationLabel`/`explanationText` block).
- **`page.tsx` is composition only** — auth, feed, swipe-gesture, and visit-modal state each live in their own hook under `frontend/app/hooks/`.
- **`yelpId` column stores Google Place IDs** — Yelp's API was never integrated (it's paid; Google Places is the only provider actually wired up). The column name is just inherited from an early scaffold that assumed Yelp. Don't rename without a migration.
- **Cuisine preference keys are cluster-normalized at write time** — `updatePreferencesOnSwipe` calls `normalizeCuisine()`, not a raw lowercase/underscore-strip. Both the DB counters and the decayed-swipe scoring profile now key off the same cluster ids (e.g. `"asian"`), which is what every reader (`computeClusterCuisineScore`, `computeThompsonExploration`) has always looked up by.
- **`personalization.ts`'s `mergeCounts` fills gaps, it does not sum** — the decayed swipe profile and the raw DB counters share a key space (see above), so once real swipe evidence exists for a cluster, the DB counter for that same cluster is intentionally ignored rather than added on top (summing would double-count real swipes). This means an onboarding-seeded cluster's influence fades out the moment the user has a real swipe in that same cluster — a known, accepted tradeoff, not a bug.
- **Refresh-token reuse is treated as theft** — presenting an already-revoked refresh token to `POST /auth/refresh` revokes that user's *entire* active token chain, not just the reused token. Expired (not revoked) rows are purged hourly by an in-process `setInterval` in `index.ts` — no cron infra, single-instance only, same pattern as the rate limiters and CF cache.
- **`TRUST_PROXY_HOPS` defaults to `0`** (fail closed) — this repo's `docker-compose.yml` has no reverse proxy in front of the backend, so trusting even one hop of `X-Forwarded-For` there would trust the client's own spoofed header. Deployments that do sit behind a real proxy must set this explicitly or IP-based rate limiting silently collapses onto the proxy's address. Startup fails fast on a malformed value (`lib/startupChecks.ts`).
- **`_prisma_migrations` can drift from the live schema** — `refresh_tokens` existed live (correct columns/indexes, matching `20260511000001_add_refresh_tokens` exactly) but wasn't recorded as applied, likely from an earlier `db push` or manual SQL run before that migration file existed. `prisma migrate deploy` would have tried to re-run the `CREATE TABLE` and failed. Fixed via `prisma migrate resolve --applied <name>` (marks it applied without re-running the SQL) before deploying the real pending migrations. If `migrate status`/`migrate deploy` ever complains a table "already exists," check whether the live schema actually matches the migration before assuming it's safe to just resolve it — diff columns/indexes first.

---

## ML Recommendation Engine

The scoring pipeline lives in `backend/src/lib/`:

```
ml-recommender.ts    — pure scoring math (clustering, decay, CF, Thompson Sampling)
personalization.ts   — bridge: DB types → scorer; also updatePreferencesOnSwipe
prefHelpers.ts       — DB queries + CF vector cache + MLContext assembly
preferenceStore.ts   — atomic (advisory-lock) apply of updatePreferencesOnSwipe to the DB
```

**Score weights:**
- WITH CF: cuisine 32% + price 18% + time 8% + CF 28% + exploration 14%
- WITHOUT CF: cuisine 45% + price 22% + time 10% + exploration 23%

**Exploration:** Thompson Sampling over Beta(liked+1, disliked+1) per cuisine cluster — probabilistic, diverse, naturally calibrated. Replaced UCB1.

**CF similarity:** Pearson correlation (requires ≥3 co-rated restaurants per neighbour pair). Replaced cosine similarity.

**`disappointing` visit:** Actively written to `dislikedClusters` (1.5× weight) regardless of original swipe direction. The previous version only zeroed the like signal without writing a dislike.

**CF cache:** Module-level, 5-minute TTL, invalidated on every swipe (`invalidateCFCache()` in swipes route). Eliminates the O(3000-swipe) rebuild on every feed request.

**Time-of-day signal:** `morningLikes`/`afternoonLikes`/`eveningLikes`/`lateNightLikes` (written on every LIKE) now feed a small, bounded bonus in `timeMlScore` — up to +0.1 on its 0-1 scale when a user's likes historically cluster into the current time slot (needs ≥5 total likes across slots to fire at all; time is only 8-10% of the total score either way). Both the write side (`personalization.ts`'s `getTimeSlot`) and the read side bucket by the *server's* local hour — there's no per-user timezone stored anywhere in the schema, so this can't reflect the swiper's actual local time. Internally consistent (same bucketing on both sides), just not geographically accurate.

**Price scoring is monotonic:** `priceMlScore` is a single continuous curve (`0.3 + ratio * 0.7`) — a three-branch piecewise version used to score a 41%-affinity price band *lower* than a 40%-affinity one.

---

## Remaining Improvements

These are deferred — valid but not deployment-blocking:

| # | Issue | When to fix |
|---|-------|-------------|
| 1 | **No pagination** on `GET /restaurants` | When restaurant count grows large (hundreds per user) |
| 2 | **In-memory rate limiting + CF cache** don't survive restarts, single-instance only | When scaling to multiple instances → swap both for Redis |
| 3 | **`yelpId` naming mismatch** — column holds Google Place IDs; Yelp (paid) was never integrated, name is leftover from an early scaffold | Low urgency — migration required, Prisma may generate destructive DROP+ADD |
| 4 | **Tokens in `localStorage`** | If XSS becomes a concern; requires adding cookie handling to Express |
| 5 | **CF cold-start UX** — **Resolved 2026-08-30**: `hybridScore` now emits `cfEligible` (`totalInteractions >= MIN_SWIPES_FOR_CF`) on `MLScoreBreakdown`, which flows to the frontend through `personalization.ts`'s `ScoreBreakdown` intersection type unchanged. Under the 5-swipe threshold the score badge renders "Still learning" with a dashed border instead of "Match". Covered by a boundary test (one swipe below threshold vs. at threshold) in `ml-recommender.test.ts`; `tsc --noEmit` + `bun test` clean on both packages, `next build` clean. | Done |
| 6 | **Per-user score cache** | Once real users exist; see `prefHelpers.ts` for implementation sketch |
| 7 | **Swipe undo/rewind** | Needs a new backend endpoint; not just a UI change |
| 8 | **Two pre-existing `react-hooks/set-state-in-effect` lint errors** (`useAuth.ts`, `useSwipeGesture.ts`) — **Resolved 2026-08-13**: the earlier attempt traded 1 error for 3 by moving `useSwipeGesture`'s reset to render-time while its refs stayed reset in the effect (`react-hooks/refs`: refs can't be mutated during render either). Fixed by giving the reset a `useState`-tracked key (`resetForCardId`) instead of a ref — React's "adjust state when a prop changes" pattern allows calling `setState` during render for exactly this, so the card-id-keyed state resets (`photoIndex`, `cardDragOffset`, `swipeExit`) now happen in the render body while ref resets stay in the effect. `useAuth.ts`'s `authLoading` is now computed synchronously via a lazy `useState` initializer instead of always starting `true` and flipping to `false` inside the effect body. `tsc --noEmit` clean, `eslint` 0 errors, `next build` clean, 29/29 frontend tests pass. | Done |
| 9 | **No `@types/bun` in frontend** — **Resolved 2026-08-12**: added `@types/bun` + a `test` script (`bun test`) to `frontend/package.json`, and `app/lib/utils.test.ts` covers `apiFetch` (401 → refresh → retry, refresh failure clearing tokens, concurrent-401s sharing one in-flight refresh via `refreshPromise`, the two `mergeHeaders` `HeadersInit` shapes its own code comment warns about), `getOpenStatus` (24h/closed/no-line-for-today/unparseable-line/multi-range-per-day/midnight-spanning-range branches), the token-storage helpers including the SSR (`window === undefined`) guards, `getPhotoUrl`, and `formatCuisine`. A code-reviewer pass on the first version caught real bugs, since fixed: the `getOpenStatus` fixtures originally built ranges as offsets from the *real* current time (`now + 3h`, etc.), which silently wrapped past midnight and made 3 of those tests fail for several hours out of every day — replaced with a mocked `Date` (frozen to fixed literals) so every fixture is deterministic regardless of wall-clock time; the `window`/`localStorage` polyfill wasn't torn down after each test, which would've leaked into any other frontend test file added later — now cleaned up in `afterEach`; and `@types/bun` had no `"types"` scoping in `tsconfig.json`, so Bun's ambient globals (`Bun.env`, `Bun.file`) were typechecking successfully inside regular browser-bound app code — fixed via a dedicated `tsconfig.test.json` that scopes `bun` to `**/*.test.ts` only, with the main config restricted to `"types": ["node"]`. 29 tests, `tsc --noEmit` (both configs) and `next build` all clean. | Done |
| 10 | **RLS disabled on `public` tables** was flagged CRITICAL by Supabase's Advisor — not currently exploitable (nothing in this codebase uses the Supabase client or anon key; Prisma connects directly via `DATABASE_URL`), but a real defense-in-depth gap. **Resolved 2026-08-11**: migration `20260811000001_enable_rls` enables RLS with zero policies (deny-by-default) on all 6 public tables. Doesn't affect the app — Prisma connects as the `postgres` role, which bypasses RLS in Supabase regardless. | Done |

**Test coverage:** `backend/src/lib/*.test.ts` covers `ml-recommender.ts` (the actual differentiator), `personalization.ts`, `prefHelpers.ts`, `auth.ts`, `rateLimit.ts`, `startupChecks.ts`, plus route-level pre-DB-validation branches for `photos.ts`, `swipes.ts`, `onboarding.ts`, `auth.ts`, and `app.ts` (the `/health` and 404/error-handler behavior). **DB-dependent flows are now covered too** (added 2026-08-11, once the Supabase project was reachable again): `routes/*.integration.test.ts` exercises register/login/refresh-rotation/reuse-detection/logout against the live DB, the swipe → `applyPreferenceUpdate` transaction (including the disappointing-visit dislike-signal path), the onboarding-seed transaction (idempotent-guard + seedStrength cap), and `/restaurants/load`'s upsert behavior (additive-catalog invariant, keyless-place skip, partial-page-failure reporting) via a mocked Google Places response. All four clean up every row they create in `afterAll` and were verified against live table counts before/after — zero leftover rows. `authLimiter`/`refreshLimiter`/`restaurantLoadLimiter` are process-wide singletons shared across every test file in one `bun test` run, so integration tests call each limiter's test-only `.reset()` (`lib/rateLimit.ts`) before relying on their own quota. **Frontend now has test coverage too** (see backlog item 9 above): `frontend/app/lib/utils.test.ts`, run via `bun test` from `frontend/`. Nothing else in the frontend (hooks, components) is covered yet — those would need a DOM/React testing setup (Testing Library + a renderer), a bigger lift than the pure-logic `utils.ts` functions this covers.

---

## Branch History: `refactor/codebase-cleanup` (merged 2026-08-11)

A full-codebase audit + fix pass. 62 atomic commits, one issue per commit, each verified with `tsc --noEmit` + `bun test` (backend) or `tsc --noEmit` + code review (frontend — no test runner existed yet at the time). Opened as PR #2 and merged into `main` via merge commit `1632088` on 2026-08-11 — the branch is gone from `origin`, this section is historical record only.

**How it happened:** four parallel review agents (backend code-reviewer, frontend code-reviewer, silent-failure-hunter, type-design-analyzer) audited the whole codebase and surfaced ~74 findings. Fixed in two passes:
1. **Critical + High (21 commits):** things that could actually break — an unbounded rejection-sampling loop that could hang the server, spoofable rate limiters, a frontend token-refresh race that logged users out, silently dropped failed swipes, a scoring bug where onboarding's seeded taste profile vanished after the first real swipe, non-monotonic price scoring, unvalidated `experience`/`cuisines` input, a desynced dislike counter, silent preference-update failures, a Google Places loader that reported partial results as full success, a missing React `key` causing state leakage between swipe cards, and more. An independent review pass on that diff caught two real regressions introduced by the fixes themselves (a double-counting bug in the onboarding-seed merge, and a rate-limiter default that was still bypassable in this repo's own `docker-compose.yml` topology) — both corrected before merge-readiness.
2. **Medium + Low (40 commits):** the rest — duplication, dead code, type-design gaps, a11y issues, stale comments, and the write/read key-space bug described in Key Invariants above.

**Net effect:** ~1,430 lines added, ~640 removed, across 47 files. No new runtime dependencies added anywhere. Nothing left in the original audit's list.

The two Prisma migrations this branch introduced were verified against a live DB the same day (see Remaining Improvements #10), and the DB-dependent test suites (register/login/refresh, swipe/preference transactions, onboarding-seed, restaurant upsert) were added right after — see the Test coverage note above. Both follow-ups this section used to flag as pending are done.
