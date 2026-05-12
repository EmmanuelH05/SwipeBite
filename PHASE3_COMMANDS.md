# FoodSwipe — Phase 3: Frontend (Next.js)

## Summary

- **User creation** — Enter name, create user, store in localStorage
- **Restaurant feed** — Card with name, cuisine, price
- **Like / Dislike** — Swipe buttons call backend API
- **Matches** — Tab to view liked restaurants

## Run the Frontend

### Prerequisites

- Backend running at http://localhost:4000 (`cd backend && npm run dev`)

### Start frontend

```bash
cd /Users/yungmanny/Desktop/FoodSwipe/frontend

npm run dev
```

Open **http://localhost:3000**

## Flow

1. **Create user** — Enter name, click Start
2. **Feed** — See restaurant card, click Like or Dislike
3. **Matches** — Click Matches tab to see liked restaurants
4. **Logout** — Click Logout to create a new user

## API

Frontend calls backend at `http://localhost:4000`:

- `POST /users` — Create user
- `GET /restaurants?userId=` — Restaurants not yet swiped
- `POST /swipes` — Record like/dislike
- `GET /matches/:userId` — Liked restaurants
