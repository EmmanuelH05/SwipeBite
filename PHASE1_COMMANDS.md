# FoodSwipe — Phase 1: Database + Prisma

## Prerequisites

1. **PostgreSQL** installed and running locally (or a cloud instance)
2. **DATABASE_URL** in `backend/.env`:
   ```
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/foodswipe"
   ```
   Replace `USER`, `PASSWORD`, and database name as needed.

---

## Phase 1 Summary

- **Prisma schema** with `User`, `Restaurant`, `Swipe` models
- **SwipeDirection** enum: `LIKE` | `DISLIKE`
- **Unique constraint** on `Swipe(userId, restaurantId)` — prevents duplicate swipes
- **Seed script** with 25 sample restaurants

---

## Exact Migration Commands

Run from the **backend** directory:

### Step 1: Create migration

```bash
cd /Users/yungmanny/Desktop/FoodSwipe/backend

npx prisma migrate dev --name init
```

This will:
- Create a new migration
- Apply it to the database
- Run `prisma generate` (generates the Prisma Client)

### Step 2: Seed the database

```bash
cd /Users/yungmanny/Desktop/FoodSwipe/backend

npm run db:seed
```

Or directly:

```bash
npx prisma db seed
```

This inserts 25 sample restaurants.

---

## Verify Phase 1

### Option A: Prisma Studio (GUI)

```bash
cd /Users/yungmanny/Desktop/FoodSwipe/backend

npm run db:studio
```

Opens http://localhost:5555 — browse `restaurants`, `users`, `swipes`.

### Option B: Query from terminal

```bash
cd /Users/yungmanny/Desktop/FoodSwipe/backend

npx prisma studio
# Or: psql -d foodswipe -c "SELECT COUNT(*) FROM restaurants;"
```

Expected: **25** restaurants in the `restaurants` table.

---

## File Structure (Phase 1)

```
backend/
├── prisma/
│   ├── schema.prisma     # User, Restaurant, Swipe models
│   ├── seed.ts           # 25 sample restaurants
│   └── migrations/       # Created by migrate dev
├── .env                  # DATABASE_URL
├── package.json          # db:migrate, db:seed, db:studio scripts
└── prisma.config.ts
```

---

## Next: Phase 2 — Backend API (Express endpoints)
