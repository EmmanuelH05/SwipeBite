# FoodSwipe — Phase 0: Project Structure

## Target Structure

```
FoodSwipe/
├── frontend/          # Next.js (TypeScript)
├── backend/           # Express + Prisma (TypeScript)
├── .gitignore
└── README.md
```

---

## Exact Terminal Commands

Run these from your terminal **from the FoodSwipe root** (`/Users/yungmanny/Desktop/FoodSwipe`):

### Step 1: Create Next.js frontend

```bash
cd /Users/yungmanny/Desktop/FoodSwipe

npx create-next-app@latest frontend --typescript --eslint --app --no-tailwind --no-src-dir --import-alias "@/*"
```

When prompted:
- `Would you like to use Turbopack?` → **No** (or Yes, your choice)
- If asked about other options, accept defaults

### Step 2: Create Express backend

```bash
cd /Users/yungmanny/Desktop/FoodSwipe

mkdir -p backend && cd backend

npm init -y

npm install express cors
npm install -D typescript @types/node @types/express @types/cors ts-node nodemon

npx tsc --init
```

### Step 3: Add Prisma to backend (prep for Phase 1)

```bash
cd /Users/yungmanny/Desktop/FoodSwipe/backend

npm install prisma @prisma/client
npx prisma init
```

---

## Resulting Structure (after running above)

```
FoodSwipe/
├── frontend/
│   ├── app/
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.*
├── backend/
│   ├── node_modules/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
├── .gitignore
└── README.md
```

---

## Quick test (after Phase 0)

**Frontend:**
```bash
cd frontend && npm run dev
# Open http://localhost:3000
```

**Backend:** (will add entry point in Phase 2)

---

**Next:** Once you confirm Phase 0 is done, we proceed to Phase 1 (Prisma schema, tables, seed script).
