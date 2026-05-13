"use client";

import PhotoStrip from "../../restaurant/PhotoStrip/PhotoStrip";
import { formatCuisine } from "../../../lib/utils";
import type { Match } from "../../../lib/types";
import styles from "./MatchListItem.module.css";

type MatchListItemProps = {
  match: Match;
  onVisitClick: () => void;
};

export default function MatchListItem({ match, onVisitClick }: MatchListItemProps) {
  const { restaurant, visitedAt } = match;

  return (
    <div className={`${styles.item} ${visitedAt ? styles.visited : ""}`}>
      <PhotoStrip restaurant={restaurant} maxPhotos={1} />

      <div className={styles.info}>
        <p className={styles.name}>{restaurant.name}</p>
        <span className={styles.meta}>
          {formatCuisine(restaurant.cuisine ?? "Restaurant")} · {restaurant.priceLevel}
        </span>
        {visitedAt && (
          <span className={styles.visitedTag}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Visited
          </span>
        )}
      </div>

      {match.swipeId && (
        visitedAt ? (
          <button type="button" className={styles.reviewBtn} onClick={onVisitClick} aria-label="View your review">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Review
          </button>
        ) : (
          <button type="button" className={styles.beenBtn} onClick={onVisitClick}>
            Been here?
          </button>
        )
      )}
    </div>
  );
}
