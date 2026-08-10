# SwipeBite

A full-stack restaurant discovery app where users swipe to build a taste profile and get personalized recommendations that improve with every swipe.

---

## Overview

SwipeBite presents a swipeable card feed of nearby restaurants. Each LIKE or DISLIKE updates the user's taste profile in real time, and a hybrid recommendation engine uses that profile to rank the next feed. The engine combines content-based filtering (cuisine clusters, price affinity, time-of-day patterns) with collaborative filtering (Pearson similarity across users) and Thompson Sampling for exploration -- so the feed stays diverse instead of becoming an echo chamber.

The stack is a Next.js 16 frontend talking to an Express 5 REST API backed by PostgreSQL via Prisma. Authentication uses short-lived JWT access tokens paired with rotating refresh tokens stored in the database. Restaurant data comes from the Google Places API (New); photos are proxied through the backend so the API key is never exposed to the client.

---

## Tech Stack

**Frontend**
- Next.js 16 (App Router), React 19, TypeScript
- Framer Motion (swipe gesture animations)
- Tailwind CSS v4 (design tokens), CSS Modules

**Backend**
- Express 5, Node.js, TypeScript
- Prisma ORM with PostgreSQL (Supabase-compatible)
- `bcryptjs` for password hashing, `jsonwebtoken` for token signing
- `nodemon` + `tsx` for development hot reload

**Infrastructure**
- Docker Compose for full-stack local/production deployment
- Google Places API (New) for restaurant catalog

---

## Features

- **Swipe feed** -- card stack with drag-to-swipe gesture handling and commit threshold; cards animate off-screen on LIKE/DISLIKE
- **Real-time preference updates** -- every swipe immediately updates the user's cuisine, price, and time-of-day preference vectors before the next card loads
- **Hybrid ML recommendations** -- ranked feed combining cuisine cluster matching, price affinity, time-of-day signals, collaborative filtering, and Thompson Sampling exploration (see [How Personalization Works](#how-personalization-works))
- **Score explanation** -- each swipe card shows a breakdown of why that restaurant was recommended
- **Auth** -- JWT access tokens (15 min) with rotating refresh tokens (7 days); secure logout revokes the token in the database
- **Restaurant catalog** -- load restaurants for any location via Google Places; catalog is additive (multiple users loading the same city merge results, never overwrite)
- **Matches list** -- all LIKED restaurants with visit tracking; mark a restaurant visited and rate the experience
- **Onboarding flow** -- `TasteSetupFlow` seeds an initial preference profile so new users get relevant recommendations before reaching the 5-swipe collaborative filtering threshold
- **Photo proxy** -- `/places/photo` route fetches Google Places photos server-side, keeping the API key out of the browser
- **Debug endpoint** -- `GET /recommendations/debug` returns the full ML score breakdown per restaurant for development and tuning

---

## How Personalization Works

The scoring pipeline lives in `backend/src/lib/`:

```
ml-recommender.ts   pure scoring math: cuisine clustering, decay, CF, Thompson Sampling
personalization.ts  bridge between DB types and the scorer; calls updatePreferencesOnSwipe
prefHelpers.ts      DB queries, CF vector cache (5-min TTL), MLContext assembly
```

**Cuisine clustering** -- raw Google Places types (`"pizza_restaurant"`, `"italian_restaurant"`) are normalized into 11 clusters (asian, italian, american, mexican, indian, mediterranean, seafood, european, cafe, dessert, fastfood) so related cuisines share a preference signal instead of being treated as unrelated strings.

**Score weights:**

| Signal | With CF (>= 5 swipes) | Without CF |
|---|---|---|
| Cuisine cluster match | 32% | 45% |
| Price affinity | 18% | 22% |
| Time-of-day match | 8% | 10% |
| Collaborative filtering (Pearson) | 28% | -- |
| Thompson Sampling exploration | 14% | 23% |

**Collaborative filtering** activates after a user has 5+ swipes. It computes Pearson correlation between the current user's swipe vector and all other users' vectors, finds the top neighbors, and borrows their preferences as an additional signal. The CF vector is cached in memory per user with a 5-minute TTL and invalidated on every new swipe.

**Thompson Sampling** draws from a `Beta(liked + 1, disliked + 1)` distribution per cuisine cluster to select an exploration bonus. This naturally calibrates -- clusters the user engages with more get tighter distributions, while unseen clusters stay exploratory.

---

## Getting Started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Supabase free tier works)
- A Google Places API (New) key with the Places API enabled
- Docker and Docker Compose (optional, for containerized setup)

### Local development (no Docker)

**1. Clone and install**

```bash
git clone https://github.com/EmmanuelH05/SwipeBite.git
cd SwipeBite
```

**2. Set up the backend**

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` and fill in the required values (see [Environment Variables](#environment-variables) below).

```bash
npm run db:migrate   # run Prisma migrations against your database
npm run dev          # starts Express on port 4000
```

**3. Set up the frontend (separate terminal)**

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

```bash
npm run dev          # starts Next.js on port 3000
```

Open `http://localhost:3000`.

### Docker Compose (full stack)

```bash
cp backend/.env.example .env   # fill in all required vars at repo root
docker compose up --build
```

The frontend will be at `http://localhost:3000` and the backend at `http://localhost:4000`. The backend must pass its health check before the frontend container starts.

To rebuild after code changes:

```bash
docker compose up --build --force-recreate
```

**Note:** `NEXT_PUBLIC_API_URL` is embedded at Next.js build time. If you change the backend URL after building, pass it as a build arg:

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain.com -t swipebite-web ./frontend
```

---

## Environment Variables

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/db?sslmode=require`) |
| `JWT_SECRET` | Yes | Secret used to sign access tokens -- generate with `openssl rand -hex 32` |
| `GOOGLE_API_KEY` | Yes | Google Places API (New) key for `/restaurants/load` and photo proxy |
| `FRONTEND_URL` | No | CORS allowed origin; defaults to `http://localhost:3000` |
| `PORT` | No | Port the API listens on; defaults to `4000` |
| `NODE_ENV` | No | Set to `production` in deployed environments; triggers weak-secret check on startup |

### `frontend/.env.local` (not committed)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | Backend base URL; defaults to `http://localhost:4000` |

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | | Create account with email, password, name |
| POST | `/auth/login` | | Returns access token + refresh token |
| POST | `/auth/refresh` | | Rotates refresh token, returns new access token |
| POST | `/auth/logout` | | Revokes refresh token |
| GET | `/auth/me` | JWT | Current user profile |
| GET | `/restaurants` | JWT | Unswiped restaurants ranked by ML score |
| POST | `/restaurants/load` | JWT | Upsert restaurants from Google Places for a location |
| POST | `/swipes` | JWT | Record LIKE or DISLIKE, updates preference vector |
| PATCH | `/swipes/:id/visited` | JWT | Mark visited + set experience rating |
| GET | `/matches` | JWT | All LIKED restaurants with visit data |
| GET | `/recommendations/debug` | JWT | Full ML score breakdown per restaurant |
| GET | `/health` | | Liveness probe |

---

## Project Structure

```
SwipeBite/
  backend/
    prisma/
      schema.prisma       data models: User, UserPreference, Restaurant, Swipe, RefreshToken
      migrations/         SQL migration history
    src/
      index.ts            Express app entry point, middleware setup, route registration
      lib/
        ml-recommender.ts cuisine clustering, scoring math, Thompson Sampling, CF
        personalization.ts updatePreferencesOnSwipe; bridges DB types to scorer
        prefHelpers.ts    DB queries, CF vector cache, MLContext assembly
        auth.ts           JWT signing/verification helpers
        prisma.ts         Prisma client singleton
        rateLimit.ts      in-memory rate limiter (single-instance)
      routes/
        auth.ts           /auth/* endpoints
        restaurants.ts    /restaurants/* endpoints
        swipes.ts         /swipes/* endpoints
        matches.ts        /matches endpoint
        recommendations.ts /recommendations/debug endpoint
        photos.ts         /places/photo proxy
        onboarding.ts     onboarding endpoints
      middleware/
        auth.ts           JWT authentication middleware
  frontend/
    app/
      page.tsx            root page (swipe feed, ~580 lines -- refactor deferred)
      layout.tsx          root layout
      lib/
        types.ts          shared TypeScript interfaces
        utils.ts          shared utilities
        constants.ts      shared constants
      components/
        feed/             CardStack, SwipeCard, CardBack, SwipeActions,
                          LoadRestaurantsForm, MatchReveal, TasteSetupFlow
        matches/          MatchList, MatchListItem
        auth/             auth forms and flows
        onboarding/       onboarding screens
        modal/            modal components
        restaurant/       restaurant detail components
        ui/               shared UI primitives
        layout/           layout components
  docs/                   internal planning docs (algorithm plan, phase commands, styling guide)
  docker-compose.yml      full-stack container orchestration
  CLAUDE.md               developer reference (architecture, invariants, ML weights)
```

---

## Screenshots

> Drop real screenshots into `docs/screenshots/` and update the paths below.

![Swipe feed](docs/screenshots/swipe.png)
![Matches list](docs/screenshots/matches.png)
![Score explanation](docs/screenshots/score-debug.png)

---

## Known Limitations

- **No tests** -- the ML scoring functions in `ml-recommender.ts` are pure and the highest-value place to start
- **CF cache is in-process** -- multi-instance deployments need Redis for the 5-minute collaborative filtering cache
- **Tokens stored in `localStorage`** -- XSS-accessible; HttpOnly cookies would be more secure
- **No pagination** on `GET /restaurants` -- relevant once a user's unswiped catalog grows large
- **`yelpId` column stores Google Place IDs** -- naming mismatch from original scaffolding; renaming requires a migration
