"use client";

import { forwardRef, useState } from "react";
import { getPhotoUrl, formatCuisine, getOpenStatus } from "../../../lib/utils";
import type { Restaurant } from "../../../lib/types";
import styles from "./SwipeCard.module.css";

export type SwipeCardProps = {
  restaurant: Restaurant;
  photoIndex: number;
  photoScrollRef: React.RefObject<HTMLDivElement | null>;
  onPhotoScroll: () => void;
  goToPhoto: (index: number) => void;
  style?: React.CSSProperties;
  dragOffset?: number;
  onPass: () => void;
  onLike: () => void;
  disabled?: boolean;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
};

const OVERLAY_START = 30;
const OVERLAY_FULL  = 110;

const SwipeCard = forwardRef<HTMLDivElement, SwipeCardProps>(function SwipeCard(
  { restaurant, photoIndex, photoScrollRef, onPhotoScroll, goToPhoto, style, dragOffset = 0, disabled = false, onTouchStart, onTouchMove, onTouchEnd, onMouseDown },
  ref
) {
  const photoNames = restaurant.photoNames ?? [];
  const score      = restaurant.score;
  const openStatus = getOpenStatus(restaurant.openingHours);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const visiblePhotos = photoNames.filter((n) => !failedPhotos.has(n));

  const likeOpacity = dragOffset > OVERLAY_START
    ? Math.min(1, (dragOffset - OVERLAY_START) / (OVERLAY_FULL - OVERLAY_START)) : 0;
  const nopeOpacity = dragOffset < -OVERLAY_START
    ? Math.min(1, (-dragOffset - OVERLAY_START) / (OVERLAY_FULL - OVERLAY_START)) : 0;

  const scoreClass =
    score && score.total >= 70 ? styles.high : score && score.total >= 50 ? styles.mid : styles.low;
  const stillLearning = score ? !score.cfEligible : false;

  return (
    <div
      ref={ref}
      className={styles.card}
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      {/* Photos */}
      {visiblePhotos.length > 0 ? (
        <div ref={photoScrollRef} className={styles.photoStrip} onScroll={onPhotoScroll}>
          {visiblePhotos.map((name, i) => (
            <img
              key={name}
              src={getPhotoUrl(name)}
              alt=""
              className={styles.photo}
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
              onError={() => setFailedPhotos((prev) => new Set([...prev, name]))}
            />
          ))}
        </div>
      ) : (
        <div className={styles.noPhoto}>
          <div className={styles.noPhotoGradient} />
          <svg className={styles.noPhotoIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M3 9l2.45-2.45a2 2 0 012.83 0L10 8.34M10 8.34L14 4.34M10 8.34l4.24 4.24M3 9v11a1 1 0 001 1h16a1 1 0 001-1V9" strokeOpacity="0.3" />
            <path d="M21 15l-5-5-3 3" strokeOpacity="0.25" />
            <circle cx="16" cy="8" r="1.5" strokeOpacity="0.25" />
          </svg>
          <p className={styles.noPhotoName}>{restaurant.name}</p>
          <p className={styles.noPhotoText}>{formatCuisine(restaurant.cuisine)} · {restaurant.priceLevel}</p>
        </div>
      )}

      {/* Nav dots — full width, no other elements at same row */}
      {visiblePhotos.length > 1 && (
        <div className={styles.navDots}>
          {visiblePhotos.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.dot} ${i === photoIndex ? styles.active : ""}`}
              aria-label={`Photo ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); goToPhoto(i); }}
            />
          ))}
        </div>
      )}

      {/* Score badge — corner overlay on the photo, not a chip among chips */}
      {score && score.total > 0 && (
        <div className={`${styles.scoreBadge} ${scoreClass}${stillLearning ? ` ${styles.learning}` : ""}`}>
          <div className={styles.scoreNum}>{Math.round(score.total)}<small>%</small></div>
          <div className={styles.scoreLabel}>{stillLearning ? "Still learning" : "Match"}</div>
        </div>
      )}

      {/* Die-cut seam + info panel */}
      <div className={styles.gradient} />
      <div className={styles.seam} />
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <h2 className={styles.name}>{restaurant.name}</h2>
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className={styles.callBtn}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Call ${restaurant.name}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
              </svg>
              Call
            </a>
          )}
        </div>
        <div className={styles.meta}>
          <span className={styles.chip}>{formatCuisine(restaurant.cuisine)}</span>
          <span className={styles.priceText}>{restaurant.priceLevel}</span>
          {openStatus.label && (
            <span className={`${styles.openStatus} ${openStatus.open === true ? styles.openYes : openStatus.open === false ? styles.openNo : ""}`}>
              <span className={styles.openDot} />
              {openStatus.label}
            </span>
          )}
          {restaurant.address && (
            <span className={styles.address}>{restaurant.address.split(",")[0]}</span>
          )}
        </div>

        {score?.explanation && (
          <div className={styles.explanation}>
            <span className={styles.explanationLabel}>Why this card</span>
            <p className={styles.explanationText}>{score.explanation}</p>
          </div>
        )}
      </div>

      {/* Swipe overlays */}
      {likeOpacity > 0 && (
        <div className={styles.likeOverlay} style={{ opacity: likeOpacity }}>
          <div className={styles.likeLabel}>LIKE</div>
        </div>
      )}
      {nopeOpacity > 0 && (
        <div className={styles.nopeOverlay} style={{ opacity: nopeOpacity }}>
          <div className={styles.nopeLabel}>NOPE</div>
        </div>
      )}

      {disabled && <div className={styles.disabledOverlay} />}
    </div>
  );
});

export default SwipeCard;
