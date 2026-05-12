# SwipeBite (FoodSwipe) — Tailwind CSS Migration Summary

## 1. Tailwind install and config

- **Stack:** Next.js 16 (App Router) + React 19.
- **Tailwind:** v4 with `@tailwindcss/postcss`.
- **Config:**
  - `postcss.config.mjs` — uses `@tailwindcss/postcss`.
  - `app/globals.css` — `@import "tailwindcss"`, minimal base styles, `@keyframes fadeIn` for logo.
- **Design tokens (in prompt):** Background `slate-50`, surfaces `white`, text `slate-900` / `slate-500`, primary accent `indigo-500`, secondary `teal-500`, `rounded-2xl`, `shadow-md` / `hover:shadow-xl`, `transition duration-300 ease-out`.

## 2. Files changed

| File | Change |
|------|--------|
| `package.json` | Added `tailwindcss`, `postcss`, `autoprefixer`, `@tailwindcss/postcss` (devDependencies). |
| `postcss.config.mjs` | **Created** — PostCSS with Tailwind v4 plugin. |
| `app/globals.css` | **Replaced** — Tailwind import, design tokens, resets, `fadeIn` keyframe. |
| `app/layout.tsx` | Unchanged (still imports `globals.css`). |
| `app/page.tsx` | **Refactored** — Removed `page.module.css`; all UI uses Tailwind + UI components. |
| `app/components/Logo.tsx` | **Refactored** — Tailwind only; removed `Logo.module.css`. |
| `app/components/ui/Button.tsx` | **Created** — Reusable button (primary, secondary, outline, ghost). |
| `app/components/ui/Input.tsx` | **Created** — Reusable text input. |
| `app/components/ui/Card.tsx` | **Created** — Reusable card (used via Tailwind on page; component available). |
| `app/components/ui/Badge.tsx` | **Created** — Reusable badge. |
| `app/components/ui/Modal.tsx` | **Created** — Reusable modal (visit modal still inline for form state). |
| `app/page.module.css` | **Deleted** — Replaced by Tailwind. |
| `app/components/Logo.module.css` | **Deleted** — Replaced by Tailwind. |

## 3. Components created

- **`app/components/ui/Button.tsx`** — Variants: `primary` (indigo), `secondary` (teal), `outline`, `ghost`. Rounded, focus ring, disabled state.
- **`app/components/ui/Input.tsx`** — Rounded input, border, focus ring.
- **`app/components/ui/Card.tsx`** — Wrapper with rounded-2xl, shadow, hover.
- **`app/components/ui/Badge.tsx`** — Variants: default, success, outline.
- **`app/components/ui/Modal.tsx`** — Overlay + panel; used for structure reference (visit modal kept inline for logic).

## 4. UI areas updated (logic unchanged)

- **Landing / Auth:** Centered layout, white card, Tailwind form, `Input` + `Button`, auth switch link.
- **Feed:** Segmented nav (Feed / Matches), load form with `Input` + `Button`, card stack (back card + swipeable card), photo strip + dots, card content (name, cuisine, price, address, phone, hours), Pass / Like buttons.
- **Matches:** List of match cards (photo strip, name, cuisine, price, “Been here” / “✓ Been here” as `Button`).
- **Visit modal:** View review (read-only) and Edit (form) with Tailwind styling; same behavior and API calls.
- **Loading / empty / error:** Tailwind text and spacing only.

## 5. Build and responsiveness

- **Build:** `npm run build` completes successfully.
- **Responsive:** Layout uses `max-w-md`, `p-4`/`p-6`, flex and gap; suitable for mobile and small viewports.

## 6. Not changed (as requested)

- App logic, state, and hooks.
- Routing (single page).
- API calls, auth (login/signup, token, logout).
- Database or backend code.
- Swipe/drag behavior, visit modal flow, or match/restaurant data handling.

## 7. How to run

```bash
cd frontend
npm install
npm run dev
```

Open the app and confirm: auth, load restaurants, swipe (mouse/touch), matches, “Been here” and view/edit review. All of that is unchanged; only styling is Tailwind.
