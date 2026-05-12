"use client";

import Button from "../ui/Button";
import PhotoStrip from "../restaurant/PhotoStrip";
import { formatCuisine } from "../../lib/utils";
import type { Match } from "../../lib/types";

type MatchListItemProps = {
  match: Match;
  onVisitClick: () => void;
};

export default function MatchListItem({ match, onVisitClick }: MatchListItemProps) {
  const { restaurant, visitedAt } = match;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all duration-200 ${
        visitedAt
          ? "border-[#34d399]/15 bg-[#34d399]/5"
          : "border-[#2a2a3a] bg-[#141419] hover:border-[#3a3a4a] hover:bg-[#1a1a22]"
      }`}
    >
      <PhotoStrip restaurant={restaurant} maxPhotos={1} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#f0f0f5]">{restaurant.name}</p>
        <p className="mt-0.5 truncate text-xs text-[#55556a]">
          {formatCuisine(restaurant.cuisine)} · {restaurant.priceLevel}
        </p>
        {visitedAt && (
          <p className="mt-0.5 text-[10px] text-[#34d399]/70">
            ✓ Visited
          </p>
        )}
      </div>
      {match.swipeId && (
        visitedAt ? (
          <button
            type="button"
            className="shrink-0 flex items-center gap-1 rounded-lg border border-[#34d399]/20 bg-[#34d399]/8 px-2.5 py-1.5 text-[11px] font-medium text-[#34d399] transition-colors hover:bg-[#34d399]/15"
            onClick={onVisitClick}
            aria-label="View your review"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Review
          </button>
        ) : (
          <button
            type="button"
            className="shrink-0 rounded-lg border border-[#2a2a3a] bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-[#8888a0] transition-all duration-200 hover:text-[#f0f0f5] hover:border-[#4a4a5a] hover:bg-[#141419]"
            onClick={onVisitClick}
          >
            Been here?
          </button>
        )
      )}
    </div>
  );
}
