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

/** Horizontal translate distance (%) for the swipe-exit animation. */
export const SWIPE_EXIT_DISTANCE_PERCENT = 120;

/** Rotation (deg) applied at full swipe-exit. */
export const SWIPE_EXIT_ROTATION_DEG = 12;

/** Rotation (deg) applied per pixel of horizontal drag while dragging. */
export const DRAG_ROTATION_FACTOR = 0.06;

/** How long the swipe-exit animation plays before the swipe is committed (ms). */
export const SWIPE_EXIT_DURATION_MS = 220;

/** How long the snap-back-to-center transition plays before inline styles are cleared (ms). */
export const SNAP_BACK_DURATION_MS = 260;
