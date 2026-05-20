/** Backend API base URL (no trailing slash). Set NEXT_PUBLIC_API_URL in production. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** localStorage key for the short-lived access token (JWT, 15 min). */
export const TOKEN_KEY = "swipebite_token";

/** localStorage key for the long-lived refresh token (7 days, stored in DB). */
export const REFRESH_TOKEN_KEY = "swipebite_refresh_token";

/** Horizontal drag distance (px) to commit a like or pass. */
export const SWIPE_THRESHOLD = 80;

/** Movement (px) before we lock to card swipe vs. photo scroll. */
export const GESTURE_LOCK_THRESHOLD = 12;
