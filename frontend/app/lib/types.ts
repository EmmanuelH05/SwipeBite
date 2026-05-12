/**
 * Shared domain types for SwipeBite.
 * Used by page, API responses, and components.
 */

export type ScoreBreakdown = {
  total: number;
  cuisineScore: number;
  priceScore: number;
  timeScore: number;
  noveltyBonus: number;
  explanation: string;
};

/** Restaurant from API / DB, now with personalization score. */
export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  priceLevel: string;
  address?: string | null;
  phone?: string | null;
  photoNames?: string[];
  openingHours?: string | null;
  createdAt: string;
  score?: ScoreBreakdown;
};

/** A liked restaurant plus swipe metadata and optional visit review. */
export type Match = {
  restaurant: Restaurant;
  swipeId: string;
  visitedAt: string | null;
  experience?: string | null;
  notes?: string | null;
};

/** Current user from auth. */
export type User = {
  id: string;
  email?: string;
  name: string;
  createdAt: string;
};
