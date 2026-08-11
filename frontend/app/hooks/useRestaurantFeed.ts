import { useState, useEffect } from "react";
import { API_URL } from "../lib/constants";
import type { Restaurant, Match, ScoreBreakdown } from "../lib/types";
import { apiFetch } from "../lib/utils";

type UseRestaurantFeedParams = {
  userId: string | null;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

/** Owns the swipe feed, matches list, and location-load form. */
export function useRestaurantFeed({ userId, setLoading, setError }: UseRestaurantFeedParams) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [view, setView] = useState<"feed" | "matches">("feed");
  const [location, setLocation] = useState("");
  const [loadLoading, setLoadLoading] = useState(false);
  const [pendingReveal, setPendingReveal] = useState<{ restaurant: Restaurant; score: ScoreBreakdown } | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    apiFetch(`${API_URL}/restaurants`)
      .then((res) => res.json())
      .then((data) => { setRestaurants(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError("Failed to load restaurants. Is the backend running?"); setLoading(false); });
  }, [userId, setLoading, setError]);

  useEffect(() => {
    if (!userId || view !== "matches") return;
    setLoading(true);
    apiFetch(`${API_URL}/matches`)
      .then((res) => res.json())
      .then((data: Match[] | Restaurant[]) => {
        const m = Array.isArray(data) ? data : [];
        setMatches(
          m.map((item) =>
            "restaurant" in item
              ? (item as Match)
              : { restaurant: item as Restaurant, swipeId: "", visitedAt: null, experience: null, notes: null }
          )
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId, view, setLoading]);

  const handleSwipe = async (restaurantId: string, direction: "LIKE" | "DISLIKE") => {
    if (!userId) return;
    const restaurant = restaurants.find((r) => r.id === restaurantId);
    try {
      const res = await apiFetch(`${API_URL}/swipes`, {
        method: "POST",
        body: JSON.stringify({ restaurantId, direction }),
      });
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        setError(body.error ?? `Failed to record swipe (${res.status})`);
        return;
      }
      const created = await res.json();
      setRestaurants((prev) => prev.filter((r) => r.id !== restaurantId));
      if (direction === "LIKE" && restaurant && created?.id) {
        setMatches((prev) => [
          ...prev,
          { restaurant, swipeId: created.id, visitedAt: created.visitedAt ?? null },
        ]);
        // Show score reveal if the restaurant has a meaningful score
        if (restaurant.score && restaurant.score.total > 0) {
          setPendingReveal({ restaurant, score: restaurant.score });
        }
      }
    } catch {
      setError("Failed to record swipe");
    }
  };

  const handleLoadRestaurants = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) return;
    setLoadLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/restaurants/load`, {
        method: "POST",
        body: JSON.stringify({ location: location.trim() }),
      });
      const text = await res.text();
      let data: { error?: string; loaded?: number } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(res.ok ? "Backend returned invalid JSON." : `Request failed (${res.status}). Restart the backend and run: npx prisma generate`);
        setLoadLoading(false);
        return;
      }
      if (data.error) {
        setError(data.error);
      } else if (res.ok) {
        setLocation("");
        const rRes = await apiFetch(`${API_URL}/restaurants`);
        const rData = await rRes.json();
        setRestaurants(Array.isArray(rData) ? rData : []);
      } else {
        setError(data.error || `Request failed (${res.status})`);
      }
    } catch {
      setError("Can't reach backend. Is it running on http://localhost:4000?");
    }
    setLoadLoading(false);
  };

  const resetFeed = () => {
    setRestaurants([]);
    setMatches([]);
    setView("feed");
  };

  return {
    restaurants,
    matches,
    setMatches,
    view,
    setView,
    location,
    setLocation,
    loadLoading,
    pendingReveal,
    setPendingReveal,
    handleSwipe,
    handleLoadRestaurants,
    resetFeed,
  };
}
