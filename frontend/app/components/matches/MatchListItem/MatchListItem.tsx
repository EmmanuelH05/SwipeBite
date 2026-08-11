"use client";

import PhotoStrip from "../../restaurant/PhotoStrip/PhotoStrip";
import { formatCuisine, getOpenStatus } from "../../../lib/utils";
import type { Match } from "../../../lib/types";
import styles from "./MatchListItem.module.css";

type MatchListItemProps = {
  match: Match;
  onVisitClick: () => void;
};

export default function MatchListItem({ match, onVisitClick }: MatchListItemProps) {
  const { restaurant, visitedAt } = match;
  const openStatus = getOpenStatus(restaurant.openingHours);

  return (
    <div className={`${styles.item} ${visitedAt ? styles.visited : ""}`}>
      <PhotoStrip restaurant={restaurant} maxPhotos={1} />

      <div className={styles.info}>
        <p className={styles.name}>{restaurant.name}</p>
        <span className={styles.meta}>
          {formatCuisine(restaurant.cuisine ?? "Restaurant")} · {restaurant.priceLevel}
        </span>

        {restaurant.address && (
          <span className={styles.address}>{restaurant.address.split(",").slice(0, 2).join(",")}</span>
        )}

        <div className={styles.statusRow}>
          {openStatus.label && (
            <span className={`${styles.openBadge} ${openStatus.open === true ? styles.openYes : openStatus.open === false ? styles.openNo : ""}`}>
              {openStatus.label}
            </span>
          )}
          {visitedAt && (
            <span className={styles.visitedTag}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Visited
            </span>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        {restaurant.phone && (
          <a href={`tel:${restaurant.phone}`} className={styles.callBtn} aria-label={`Call ${restaurant.name}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
            </svg>
          </a>
        )}
        {visitedAt ? (
          <button type="button" className={styles.reviewBtn} onClick={onVisitClick} aria-label="View your review">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Review
          </button>
        ) : (
          <button type="button" className={styles.beenBtn} onClick={onVisitClick}>
            Been here?
          </button>
        )}
      </div>
    </div>
  );
}
