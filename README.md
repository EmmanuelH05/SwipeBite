# 🍽️ SwipeBite

**Tinder-style restaurant discovery.** Swipe `LIKE` / `DISLIKE` on nearby restaurants, build a taste profile as you go, and get a feed that re-ranks itself in real time using a hybrid recommendation engine — content-based filtering, user-to-user collaborative filtering, and Thompson Sampling exploration — written from scratch in plain TypeScript.

> **🔗 Live demo:** **[frontend-livid-ten-37.vercel.app](https://frontend-livid-ten-37.vercel.app)** · **Architecture & invariants:** [`CLAUDE.md`](./CLAUDE.md)
>
> Frontend on Vercel · API + Postgres on Render. Register an account and start swiping — the catalog is pre-seeded.

Built end-to-end by directing **Claude Code**, then reviewing and correcting every diff.

---

## Why it's interesting

Most "recommendation" side projects sort by a single score. SwipeBite blends five signals and degrades gracefully as data is gathered:

- **Content-based filtering** — cuisines are grouped into clusters (`pizza` + `italian` → one signal), with **exponential temporal decay** (λ = 0.02, ~35-day half-life) so stale swipes count less, and a **visit-quality amplifier** that turns a real "I went and it was great" into a 2.5× signal — or flips a "disappointing" visit into an active dislike.
- **Collaborative filtering** — builds a sparse user-item matrix and finds neighbours via **Pearson correlation** (mean-centred, so a habitual liker doesn't look similar to everyone), then takes a similarity-weighted vote. Activates only past a 5-swipe threshold to avoid noise.
- **Thompson Sampling exploration** — draws from a `Beta(likes+1, dislikes+1)` posterior per cuisine cluster, giving probabilistic, self-calibrating exploration instead of a mechanical UCB bonus.
- **Hybrid blend** — two weight schemes (with-CF and cold-start) keep new users useful from swipe one and lean harder on CF as it becomes reliable.

The full scoring pipeline lives in [`backend/src/lib/ml-recommender.ts`](./backend/src/lib/ml-recommender.ts) and is covered by a deterministic unit-test suite.

---

## Stack

| Layer | Tech |
|-------|------|
| **Frontend** | Next.js 16 (App Router, React 19), TypeScript, CSS Modules, Tailwind v4 (tokens), Framer Motion |
| **Backend** | Express 5, TypeScript, Prisma ORM, PostgreSQL |
| **Auth** | JWT access tokens (15 min) + DB-stored refresh tokens (7-day, rotated on use) |
| **Recommendations** | Hand-rolled hybrid engine — no ML libraries |
| **Photos** | Backend proxy keeps the Google Places API key server-side |
| **Tests** | `bun test` — unit coverage for the ML engine, auth, rate limiting, startup checks, plus integration tests against a live database for the register/login/refresh flow, the swipe/preference-update transaction, the onboarding-seed transaction, and restaurant load/upsert |

Monorepo with two independent packages: [`frontend/`](./frontend) and [`backend/`](./backend).

---

## Features

- Swipe deck with gesture controls and animated card transitions
- Live, per-restaurant **score explanation** ("Recommended because you love Italian food & popular with similar users")
- Onboarding taste-setup flow to get new users past the CF cold start
- Pull restaurants by area from Google Places (additive shared catalog — two users loading the same city merge results)
- Matches list with "mark as visited" + experience rating that feeds back into the model
- Auth with refresh-token rotation and fail-fast startup checks
- Demo-mode login link (`?at=<accessToken>&rt=<refreshToken>`) for sharing a live, populated account without handing out real credentials — it only accepts already-valid tokens, so it can't grant access a stolen/guessed token pair couldn't already get

---

## Run locally

**Prerequisites:** Node 20+ and a PostgreSQL database. (A Google Places API key is *optional* — only needed to load more restaurants beyond the seeded catalog.)

```bash
# Backend
cd backend
npm install
cp .env.example .env          # fill DATABASE_URL, JWT_SECRET (openssl rand -hex 32)
npm run db:migrate            # apply Prisma migrations
npm run db:seed               # load a starter catalog (24 restaurants, no API key needed)
npm run dev                   # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Full env-var reference and the API map are in [`CLAUDE.md`](./CLAUDE.md).

---

## Tests

```bash
cd backend
bun test           # unit + live-DB integration tests
npx tsc --noEmit    # typecheck

cd ../frontend
bun test            # pure-logic unit tests (apiFetch, getOpenStatus, etc.)
```

The recommendation engine is pure and deterministic, so its unit tests run without a database (the one stochastic function, Thompson Sampling, is pinned by stubbing `Math.random`). Everything that needs a live database — the auth flow, the swipe and onboarding-seed transactions, restaurant upserts — has its own integration test file (`routes/*.integration.test.ts`) that creates and tears down its own rows, verified to leave zero trace in the database. The frontend's tests cover `app/lib/utils.ts`'s pure logic (notably `apiFetch`'s token-refresh/retry behavior) — components and hooks aren't covered yet, that would need a DOM/React testing setup.

---

## Deployment

SwipeBite deploys as **frontend on Vercel** + **backend & Postgres on Render** (a one-file [`render.yaml`](./render.yaml) blueprint provisions both). Docker Compose is also supported for a self-hosted full stack.

### 1. Database + backend — Render (blueprint)

1. Push this repo to GitHub.
2. In Render → **New → Blueprint**, point it at this repo. `render.yaml` provisions a free Postgres instance and the Express API, wires `DATABASE_URL` automatically, and the build **auto-runs migrations and seeds the catalog** — so the app is usable the moment it's live.
3. Set the one required secret Render prompts for: `JWT_SECRET` (use `openssl rand -hex 32`). `GOOGLE_API_KEY` is optional — leave it blank unless you want users to load more restaurants.
4. Copy the service URL, e.g. `https://swipebite-api.onrender.com`.

### 2. Frontend — Vercel

1. In Vercel → **Add New → Project**, import this repo and set the **Root Directory** to `frontend`.
2. Add env var `NEXT_PUBLIC_API_URL` = your Render API URL (baked in at build time).
3. Deploy, then copy the Vercel URL.

### 3. Close the loop

Set the backend's `FRONTEND_URL` env var (on Render) to your Vercel URL so CORS allows the browser calls, and redeploy the backend. Put the live URL at the top of this README.

### Self-hosted (Docker Compose)

```bash
cp backend/.env.example .env   # fill all vars at repo root
docker compose up --build      # frontend :3000, backend :4000
```

---

## Project layout

```
backend/
  prisma/            # schema + migrations + seed script
  src/
    lib/             # ml-recommender (+ tests), personalization, prefHelpers, auth, prisma
    middleware/      # JWT auth guard
    routes/          # auth, restaurants, swipes, matches, recommendations, onboarding, photos
frontend/
  app/
    components/      # feed, auth, matches, onboarding, layout, ui (componentized)
    hooks/           # useAuth, useRestaurantFeed, useSwipeGesture, useVisitModal
    lib/             # types, constants, utils
CLAUDE.md            # architecture, API map, invariants, ML internals, backlog
render.yaml          # Render blueprint (Postgres + API)
```

See [`CLAUDE.md`](./CLAUDE.md) for the API map, key invariants, and the ML engine deep-dive.

---

## Known limitations

- **In-memory rate limiting and CF cache are single-instance** — multi-instance deployments need Redis for both
- **Tokens stored in `localStorage`** — XSS-accessible; HttpOnly cookies would be more secure
- **No pagination** on `GET /restaurants` — relevant once a user's unswiped catalog grows large
- **`yelpId` column stores Google Place IDs** — naming mismatch from original scaffolding; renaming requires a migration
- **No swipe undo/rewind** — a mis-swipe is final; would need a new backend endpoint
- **No cold-start qualifier on the match score** — a new user with 0-4 swipes still sees a numeric score, not a "still learning your taste" indicator
