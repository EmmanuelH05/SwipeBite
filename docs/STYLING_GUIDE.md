# SwipeBite Styling Guide

High-end minimalist aesthetic: neutral palette, clean containers with subtle borders, strong typography hierarchy. Use Tailwind classes that match this guide.

---

## 1. Design tokens

| Token           | Usage                | Tailwind / value        |
|-----------------|----------------------|-------------------------|
| Background      | Page, empty areas    | `bg-neutral-50`         |
| Surface         | Cards, modals        | `bg-white`              |
| Primary text    | Headings, names      | `text-black` / `text-neutral-900` |
| Secondary text  | Captions, meta       | `text-neutral-500`      |
| Borders         | Containers, inputs   | `border-neutral-200`    |
| CTAs / primary  | Buttons (Like, Save) | `bg-black` `hover:bg-neutral-800` |
| Ghost / outline | Pass, Cancel         | `border border-black text-black` or `border-neutral-200` |
| Error           | Validation, API      | `text-red-600`          |

**No heavy shadows:** Prefer `border border-neutral-200` for cards and main container.

---

## 2. Container & layout

- **Page background:** `bg-neutral-50`.
- **Main container:** Fixed-width `max-w-md`, `border border-neutral-200` (no box-shadow), `bg-white`, `p-6`.
- **Mobile:** `p-4 sm:p-6` for outer padding.

---

## 3. Navigation (segmented control)

- **Active tab:** `border-b-2 border-black text-black font-semibold`.
- **Inactive tab:** `text-neutral-500` with `border-b-2 border-transparent`; hover `text-neutral-700`.
- Container: `border-b border-neutral-200`, no pill background.

---

## 4. Search & inputs

- **Input:** Full-width `w-full`, `rounded-sm`, `border border-neutral-200`; focus `border-neutral-900 ring-1 ring-neutral-900`.
- **Load restaurants button:** `bg-black text-white hover:bg-neutral-800`, full-width on mobile.

---

## 5. Typography

- **Restaurant name:** `font-bold text-2xl tracking-tight text-black` (full card); `text-lg` for compact.
- **Cuisine / price / address / hours:** `text-sm text-neutral-500` (or `text-xs` for hours label) for clear hierarchy.
- **Section labels:** `text-xs font-semibold text-neutral-500` or `text-sm font-medium text-neutral-700`.

---

## 6. Action buttons (Pass / Like)

- **Pass:** Ghost style — `border border-black text-black` (Button variant `pass`), `py-4` for thumb-friendly tap.
- **Like:** Solid black — `bg-black text-white hover:bg-neutral-800` (Button variant `like`), `py-4`.
- **Spacing:** `gap-3` between buttons; `px-6 pb-6 pt-2` for the action row.

---

## 7. Spacing & breathing room

- **Between image and content:** Dots row has `py-3`; content block has `p-6` and `space-y-4` internally.
- **Between sections:** `mb-6` after nav; `gap-4` in forms; `space-y-2` for match list items.
- **Card content:** Use `space-y-4` (or `space-y-1` in compact mode) so image, titles, and info don’t feel cramped.

---

## 8. Components summary

- **Cards:** `border border-neutral-200 bg-white` (no shadow).
- **Buttons:** `Button` with variants `primary` (black), `outline`, `ghost`, `pass`, `like`. `rounded-sm`, focus ring neutral.
- **Inputs:** `Input`: `rounded-sm`, neutral border and focus.
- **Modals:** Overlay `bg-black/50`; panel `border border-neutral-200 bg-white p-6`.

---

## 9. Comments & structure

- **Files:** One brief JSDoc at the top of each component.
- **Props:** Document non-obvious props.
- **Sections:** `// --- Section name ---` for large blocks (auth, feed, modal).

---

## 10. Accessibility

- **Focus:** `focus-visible:ring-2 outline-neutral-900`.
- **Contrast:** Black / neutral-900 on white; neutral-500 for secondary text.
- **Labels:** `<label>` for form fields; `aria-label` on icon-only or ambiguous buttons; `role="alert"` for error messages.
