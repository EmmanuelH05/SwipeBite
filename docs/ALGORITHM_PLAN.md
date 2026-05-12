# SwipeBite — Recommendation Algorithm Implementation Plan

This document outlines the steps to implement a **personalized feed algorithm** so the order of restaurants reflects user preferences (from swipes and visits) while keeping discovery and diversity.

---

## Goal

- **Rank** the feed so restaurants the user is more likely to like appear earlier.
- Use **implicit signals**: LIKE / DISLIKE swipes, and (optionally) “Been here” + experience.
- Balance **exploitation** (show more of what they like) with **exploration** (some variety and new options).

---

## Phase 1: Data & signals (backend)

### Step 1.1 — Expose swipe history in the API

- **Where:** Backend `GET /restaurants?userId=...` (or a new endpoint used for the feed).
- **What:** When returning the list of restaurants to show, the backend should already exclude restaurants the user has already swiped on (or optionally include them with a “seen” flag). Confirm this behavior and document it.
- **Optional:** Add a small **preference summary** per user (e.g. counts or ratios of LIKE by `cuisine`, `priceLevel`) either computed on the fly or stored (see Step 2.1).

### Step 1.2 — Define preference signals

- **LIKE** → strong positive signal (user likes this kind of place).
- **DISLIKE** → strong negative signal (avoid similar).
- **Been here + experience** (great / good / okay / disappointing) → optional stronger signal for “similar to places they liked” or “avoid places like ones they disliked”.

Decide which fields to use for “similar” (e.g. `cuisine`, `priceLevel`, and later neighborhood or tags).

---

## Phase 2: Scoring model (backend)

### Step 2.1 — Compute a simple preference profile (optional but recommended)

- **Where:** Backend, on login or when loading feed (or via a background job).
- **What:** From the user’s swipes (and optionally visits), compute:
  - **Cuisine affinity:** e.g. count of LIKE per cuisine, or ratio LIKE/(LIKE+DISLIKE) per cuisine.
  - **Price affinity:** same for `priceLevel` ($ / $$ / $$$).
- **Storage:** Either in-memory for the request, or store in DB (e.g. a `UserPreference` table or a JSON column on `User`) and refresh when they swipe or mark visited.

### Step 2.2 — Score each candidate restaurant

- **Input:** List of restaurants the user hasn’t swiped on yet (and that match the current “load” if you filter by location).
- **For each restaurant**, compute a **score** that combines:
  1. **Cuisine match:** higher if the restaurant’s `cuisine` has high affinity for this user (from Step 2.1).
  2. **Price match:** higher if `priceLevel` matches the user’s preferred price band.
  3. **Optional — visit quality:** if you use “Been here” + experience, boost places similar to ones they rated “great” or “good”, and down-rank ones similar to “disappointing”.

Use simple weights at first, e.g.:

- `score = w1 * cuisineScore + w2 * priceScore + explorationBonus`
- Normalize so scores are in a consistent range (e.g. 0–1).

### Step 2.3 — Add exploration

- **Why:** Avoid filter bubbles and cold start (new users have no history).
- **How:** With probability `ε` (e.g. 10–20%), **ignore** the score and insert a random restaurant from the candidate set (e.g. at a random position in the top N). Or: add a small random perturbation to the score so order isn’t purely deterministic.
- **Alternative:** Reserve the last 1–2 slots of every “page” of the feed for random picks.

---

## Phase 3: Wire the algorithm into the feed

### Step 3.1 — Backend: ordered feed endpoint

- **Option A:** Change `GET /restaurants?userId=...` so that it returns restaurants **ordered by score** (and still excludes already-swiped).
- **Option B:** New endpoint, e.g. `GET /feed?userId=...` or `GET /restaurants/feed?userId=...`, that returns the same thing but with ranking applied.
- **Implementation:** In your service layer:
  1. Load user’s swipe history (and optionally visit history).
  2. Build or load preference profile (Step 2.1).
  3. Load candidate restaurants (e.g. all, or by location if you have it).
  4. Filter out already-swiped.
  5. Score each candidate (Step 2.2).
  6. Apply exploration (Step 2.3).
  7. Sort by score (and exploration).
  8. Return ordered list (optionally paginated).

### Step 3.2 — Frontend

- **Minimal change:** Keep calling the same endpoint (or the new feed endpoint). The list you get back is already ordered; no frontend ranking logic needed.
- **Optional:** If you add “Load more” or infinite scroll, the backend can return the next page of **pre-ranked** results (e.g. next 20 by score).

---

## Phase 4: Iterate and extend

### Step 4.1 — Tune weights and exploration

- Use **analytics** (e.g. LIKE rate, session length) to tune:
  - Weights for cuisine vs price vs exploration.
  - Exploration rate `ε`.
- A/B test different values if you have enough traffic.

### Step 4.2 — Richer signals (later)

- **Location / neighborhood:** Prefer places near ones they liked (if you have coordinates).
- **Time / context:** Lunch vs dinner, weekday vs weekend (if you store time of swipe or visit).
- **Explicit filters:** Let users set “cuisine” or “price” filters; combine with the algorithm (e.g. filter first, then rank within filtered set).

### Step 4.3 — Optional: simple ML

- **Collaborative filtering:** “Users who liked X also liked Y” (would require many users and a similarity matrix or embeddings).
- **Learning to rank:** Use swipe order and LIKE/DISLIKE as labels and train a small model (e.g. gradient-boosted trees or a tiny neural net) to predict score; more work, better long-term if you have data.

---

## Summary checklist

| Step | Description |
|------|-------------|
| 1.1 | Ensure feed only (or mainly) shows unswiped restaurants; document API behavior. |
| 1.2 | Define signals: LIKE, DISLIKE, optional “Been here” + experience. |
| 2.1 | Compute per-user preference profile (cuisine + price affinity). |
| 2.2 | Score each candidate (cuisine + price + optional visit quality). |
| 2.3 | Add exploration (random insertion or score perturbation). |
| 3.1 | Backend: return feed ordered by score (new or updated endpoint). |
| 3.2 | Frontend: consume ordered feed (no ranking logic in UI). |
| 4.1 | Tune weights and exploration using metrics. |
| 4.2+ | Add location, time, filters; optionally ML. |

Starting with **Phase 1 and 2** (signals + simple scoring + exploration) and then **Phase 3** (wire into one feed endpoint) will give you a working personalized feed you can improve over time.
