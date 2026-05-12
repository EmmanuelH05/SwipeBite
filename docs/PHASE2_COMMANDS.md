# FoodSwipe — Phase 2: Backend API (Express)

## Summary

REST API with Express + Prisma. All endpoints return JSON.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users` | Create user |
| GET | `/restaurants?userId=` | Restaurants user hasn't swiped on |
| POST | `/swipes` | Record a swipe (LIKE or DISLIKE) |
| GET | `/matches/:userId` | Restaurants liked by user |

---

## Run the Backend

### Prerequisites

- Database migrated and seeded (Phase 1)
- `backend/.env` has valid `DATABASE_URL`

### Start dev server

```bash
cd /Users/yungmanny/Desktop/FoodSwipe/backend

npm run dev
```

Server runs at **http://localhost:4000**

---

## Test the API

### 1. Create a user

```bash
curl -X POST http://localhost:4000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alex"}'
```

Response: `{"id":"...","name":"Alex","createdAt":"..."}` — save the `id`.

### 2. Get restaurants (not yet swiped)

```bash
curl "http://localhost:4000/restaurants?userId=YOUR_USER_ID"
```

Replace `YOUR_USER_ID` with the user id from step 1.

### 3. Record a swipe (LIKE)

```bash
curl -X POST http://localhost:4000/swipes \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID","restaurantId":"RESTAURANT_ID","direction":"LIKE"}'
```

Get a `restaurantId` from the GET /restaurants response.

### 4. Get matches (liked restaurants)

```bash
curl "http://localhost:4000/matches/YOUR_USER_ID"
```

---

## Error Handling

- **400** — Invalid/missing body or query params
- **404** — User or restaurant not found
- **409** — Duplicate swipe (user already swiped on this restaurant)
- **500** — Server error

---

## Next: Phase 3 — Frontend (Next.js)
