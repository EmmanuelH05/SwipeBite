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
- **`yelpId` column stores Google Place IDs** — naming mismatch from original scaffolding. Don't rename without a migration.
- **Cuisine preference keys are cluster-normalized at write time** — `updatePreferencesOnSwipe` calls `normalizeCuisine()`, not a raw lowercase/underscore-strip. Both the DB counters and the decayed-swipe scoring profile now key off the same cluster ids (e.g. `"asian"`), which is what every reader (`computeClusterCuisineScore`, `computeThompsonExploration`) has always looked up by.
- **`personalization.ts`'s `mergeCounts` fills gaps, it does not sum** — the decayed swipe profile and the raw DB counters share a key space (see above), so once real swipe evidence exists for a cluster, the DB counter for that same cluster is intentionally ignored rather than added on top (summing would double-count real swipes). This means an onboarding-seeded cluster's influence fades out the moment the user has a real swipe in that same cluster — a known, accepted tradeoff, not a bug.
- **Refresh-token reuse is treated as theft** — presenting an already-revoked refresh token to `POST /auth/refresh` revokes that user's *entire* active token chain, not just the reused token. Expired (not revoked) rows are purged hourly by an in-process `setInterval` in `index.ts` — no cron infra, single-instance only, same pattern as the rate limiters and CF cache.
- **`TRUST_PROXY_HOPS` defaults to `0`** (fail closed) — this repo's `docker-compose.yml` has no reverse proxy in front of the backend, so trusting even one hop of `X-Forwarded-For` there would trust the client's own spoofed header. Deployments that do sit behind a real proxy must set this explicitly or IP-based rate limiting silently collapses onto the proxy's address. Startup fails fast on a malformed value (`lib/startupChecks.ts`).

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
| 3 | **`yelpId` naming mismatch** | Low urgency — migration required, Prisma may generate destructive DROP+ADD |
| 4 | **Tokens in `localStorage`** | If XSS becomes a concern; requires adding cookie handling to Express |
| 5 | **CF cold-start UX** | Onboarding seeding is more durable now (seeded clusters survive real swipes in *other* clusters — see Key Invariants), but there's still no "still learning your taste" qualifier on the score badge itself for users under the 5-swipe CF threshold |
| 6 | **Per-user score cache** | Once real users exist; see `prefHelpers.ts` for implementation sketch |
| 7 | **Swipe undo/rewind** | Needs a new backend endpoint; not just a UI change |
| 8 | **Two pre-existing `react-hooks/set-state-in-effect` lint errors** (`useAuth.ts`, `useSwipeGesture.ts`) | Doesn't block `next build`. Tried moving `useSwipeGesture`'s reset to render-time (React's documented "reset state on prop change" pattern) — traded 1 error for 3 (`react-hooks/refs`: refs can't be mutated during render either). Both hooks reset refs alongside state, which is exactly why that pattern doesn't apply here; needs a different approach, verified live |
| 9 | **No `@types/bun` in frontend** | Blocks writing real `bun:test` unit tests for frontend logic (e.g. `getOpenStatus`, `apiFetch`) — `tsc` can't typecheck a `bun:test` import without it. Cheap to add; deliberately not added as a side effect of unrelated fixes (see Branch History below) |
| 10 | **Two Prisma migrations not yet applied to any live database** | `20260810000001_remove_redundant_token_index`, `20260810000002_remove_avg_distance` — hand-authored (not generated by `prisma migrate dev`) because `DATABASE_URL` was unreachable when they were written. Run `prisma migrate deploy` once DB access is available and confirm they apply cleanly |

**Test coverage:** `backend/src/lib/*.test.ts` covers `ml-recommender.ts` (the actual differentiator), `personalization.ts`, `prefHelpers.ts`, `auth.ts`, `rateLimit.ts`, `startupChecks.ts`, plus route-level pre-DB-validation branches for `photos.ts`, `swipes.ts`, `onboarding.ts`, `auth.ts`, and `app.ts` (the `/health` and 404/error-handler behavior). Not covered: anything needing a live DB (register/login/refresh flow, the swipe/preference-update transaction, the onboarding-seed transaction, restaurant loading/upserting) — the configured `DATABASE_URL` was unreachable in the environment these were written in ("tenant not found" from Supabase, likely a paused free-tier project); revisit once that's resolved. Frontend has no test script yet — out of scope so far.

---

## Branch History: `refactor/codebase-cleanup` (2026-08-10)

A full-codebase audit + fix pass, pushed to `origin/refactor/codebase-cleanup` (PR not yet opened: https://github.com/EmmanuelH05/SwipeBite/pull/new/refactor/codebase-cleanup). 62 atomic commits, one issue per commit, each verified with `tsc --noEmit` + `bun test` (backend) or `tsc --noEmit` + code review (frontend — no test runner exists yet).

**How it happened:** four parallel review agents (backend code-reviewer, frontend code-reviewer, silent-failure-hunter, type-design-analyzer) audited the whole codebase and surfaced ~74 findings. Fixed in two passes:
1. **Critical + High (21 commits):** things that could actually break — an unbounded rejection-sampling loop that could hang the server, spoofable rate limiters, a frontend token-refresh race that logged users out, silently dropped failed swipes, a scoring bug where onboarding's seeded taste profile vanished after the first real swipe, non-monotonic price scoring, unvalidated `experience`/`cuisines` input, a desynced dislike counter, silent preference-update failures, a Google Places loader that reported partial results as full success, a missing React `key` causing state leakage between swipe cards, and more. An independent review pass on that diff caught two real regressions introduced by the fixes themselves (a double-counting bug in the onboarding-seed merge, and a rate-limiter default that was still bypassable in this repo's own `docker-compose.yml` topology) — both corrected before merge-readiness.
2. **Medium + Low (40 commits):** the rest — duplication, dead code, type-design gaps, a11y issues, stale comments, and the write/read key-space bug described in Key Invariants above.

**Net effect:** ~1,430 lines added, ~640 removed, across 47 files. Two new Prisma migrations (see Remaining Improvements #10, unverified against a live DB). No new runtime dependencies added anywhere. Nothing left in the original audit's list.

**What to do with this branch:** review the commit log (`git log --oneline main..refactor/codebase-cleanup`), open the PR, merge when satisfied. If DB access becomes available before merging, running the two pending migrations and the DB-dependent test suites (register/login/refresh, swipe/preference transactions) would close out the last verification gaps noted above.
