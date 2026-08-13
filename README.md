# SwipeBite

Tinder-style restaurant discovery. Swipe LIKE/DISLIKE on nearby restaurants and the feed re-ranks itself using a hybrid recommendation engine — content-based filtering, collaborative filtering, and Thompson Sampling for exploration. No ML libraries, just TypeScript.

**Live demo:** [frontend-livid-ten-37.vercel.app](https://frontend-livid-ten-37.vercel.app) (frontend on Vercel, API + Postgres on Render — register an account, the catalog is pre-seeded so there's stuff to swipe on immediately). Architecture and invariants are documented in [`CLAUDE.md`](./CLAUDE.md).

Built by directing Claude Code and reviewing every diff, not hand-typed line by line — worth knowing going in.

## How the recommendations work

Most swipe-to-discover side projects just sort by one score. This one blends a few signals and leans on whichever ones are actually reliable given how much data exists for that user:

- **Content-based filtering.** Cuisines get grouped into clusters (pizza + italian collapse into one signal), swipes decay exponentially over time (λ = 0.02, roughly a 35-day half-life) so old preferences fade, and an actual visit with a rating carries more weight than a swipe alone — a good visit is a 2.5x signal, a disappointing one becomes an active dislike even if the original swipe was a like.
- **Collaborative filtering.** Builds a sparse user-item matrix, finds similar users via Pearson correlation (mean-centered so it doesn't just match people who like everything), and takes a similarity-weighted vote. Only kicks in once a user has 5+ swipes — not enough signal before that.
- **Thompson Sampling.** Exploration draws from a Beta(likes+1, dislikes+1) posterior per cuisine cluster instead of a fixed UCB bonus, so it stays probabilistic and self-adjusts as evidence comes in.
- Two weight schemes — one with CF, one without — so new users get something useful on swipe one instead of an empty/broken feed while CF has no data yet.

The scoring code is in [`backend/src/lib/ml-recommender.ts`](./backend/src/lib/ml-recommender.ts), with a deterministic unit-test suite (the one random component, Thompson Sampling, gets pinned by stubbing `Math.random` in tests).

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16 (App Router, React 19), TypeScript, CSS Modules, Tailwind v4, Framer Motion |
| Backend | Express 5, TypeScript, Prisma, PostgreSQL |
| Auth | JWT access tokens (15 min) + DB-stored refresh tokens (7 days, rotated on use) |
| Photos | Backend proxy so the Google Places API key never reaches the browser |
| Tests | `bun test` — ML engine, auth, rate limiting, startup checks, plus integration tests against a live DB for register/login/refresh, the swipe transaction, onboarding-seed, and restaurant load/upsert |

Two independent packages, no shared build tooling: [`frontend/`](./frontend) and [`backend/`](./backend).

## Features

- Swipe deck with drag gestures and card transitions
- Each card shows why it was recommended ("you love Italian food & popular with similar users")
- Onboarding flow so new users aren't stuck with a cold-start feed
- Pulls restaurants from Google Places by area — additive shared catalog, so two users loading the same city just merge into the same pool
- Matches list with "mark as visited" + a rating that feeds back into the model
- Refresh-token rotation, fail-fast startup checks if required env vars are missing
- A demo login link (`?at=<accessToken>&rt=<refreshToken>`) for sharing a populated account without handing out a real password — it only accepts tokens that are already valid, so it can't grant anything a stolen token pair couldn't

## Running it locally

Needs Node 20+ and a Postgres database. A Google Places API key is optional — only needed if you want to pull in restaurants beyond the seeded catalog.

```bash
# Backend
cd backend
npm install
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET (openssl rand -hex 32)
npm run db:migrate
npm run db:seed               # 24 restaurants, no API key needed
npm run dev                   # http://localhost:4000

# Frontend, separate terminal
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Full env var reference and the API map live in [`CLAUDE.md`](./CLAUDE.md).

## Tests

```bash
cd backend
bun test           # unit + live-DB integration tests
npx tsc --noEmit

cd ../frontend
bun test            # pure-logic unit tests (apiFetch, getOpenStatus, etc.)
```

The recommendation engine is pure and deterministic, so those tests don't need a database. Anything that touches Postgres — auth, the swipe/onboarding transactions, restaurant upserts — has its own integration test file (`routes/*.integration.test.ts`) that creates its own rows and cleans them up afterward. Frontend coverage right now is just `app/lib/utils.ts` (token refresh/retry logic mainly); components and hooks don't have a test setup yet.

## Deployment

Frontend on Vercel, backend + Postgres on Render (`render.yaml` provisions both in one shot). Docker Compose works too if you'd rather self-host the whole thing.

### 1. Database + backend (Render blueprint)

Push the repo to GitHub, then in Render go to New → Blueprint and point it here. `render.yaml` sets up a free Postgres instance and the API, wires `DATABASE_URL` automatically, and runs migrations + seeds the catalog on build. Set `JWT_SECRET` (`openssl rand -hex 32`) when prompted — that's the only required secret. `GOOGLE_API_KEY` is optional, leave it blank unless you want the load-more-restaurants feature. Copy the resulting service URL.

### 2. Frontend (Vercel)

Import the repo, set Root Directory to `frontend`, add `NEXT_PUBLIC_API_URL` pointing at the Render URL from step 1 (it gets baked in at build time). Deploy, copy the Vercel URL.

### 3. Wire them together

Set `FRONTEND_URL` on the backend (Render) to the Vercel URL so CORS lets the browser through, redeploy the backend.

**Self-hosted:**

```bash
cp backend/.env.example .env   # fill in all vars at repo root
docker compose up --build      # frontend :3000, backend :4000
```

## Project layout

```text
backend/
  prisma/            # schema + migrations + seed script
  src/
    lib/             # ml-recommender (+ tests), personalization, prefHelpers, auth, prisma
    middleware/      # JWT auth guard
    routes/          # auth, restaurants, swipes, matches, recommendations, onboarding, photos
frontend/
  app/
    components/      # feed, auth, matches, onboarding, layout, ui
    hooks/           # useAuth, useRestaurantFeed, useSwipeGesture, useVisitModal
    lib/             # types, constants, utils
CLAUDE.md            # architecture, API map, invariants, ML internals, backlog
render.yaml          # Render blueprint (Postgres + API)
```

See [`CLAUDE.md`](./CLAUDE.md) for the full API map, key invariants, and the ML engine deep-dive.

## Known limitations

- In-memory rate limiting and the CF cache are single-instance — multi-instance deployments would need Redis for both
- Tokens live in `localStorage`, which is XSS-accessible; HttpOnly cookies would be safer but need backend cookie handling
- No pagination on `GET /restaurants` yet — fine until a user's unswiped catalog gets big
- The `yelpId` column actually stores Google Place IDs — Yelp's API is paid and was never wired up, the name is just leftover from an early scaffold. Renaming it needs a migration
- No swipe undo — a mis-swipe is final for now
- New users with under 5 swipes still see a numeric score with no "still learning your taste" indicator
